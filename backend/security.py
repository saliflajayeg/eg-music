"""Protecciones de EG Music: límites de peticiones, cabeceras de seguridad,
HTTPS, validación de entradas, subidas seguras y cifrado de datos sensibles.

Todo vive en el servidor: el navegador y la app nunca ven claves ni la base de
datos. Este módulo no depende de la base de datos para poder probarse solo.
"""
import base64
import hashlib
import io
import os
import re
import threading
import time
from collections import deque

from fastapi import HTTPException, Request, UploadFile
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import RedirectResponse

# ── IP real del cliente ────────────────────────────────────────────────────────
# Render (y Cloudflare) ponen la IP original en X-Forwarded-For. Solo se usa
# para limitar peticiones, nunca para dar permisos.

def client_ip(request: Request) -> str:
    fwd = request.headers.get('cf-connecting-ip') or request.headers.get('x-forwarded-for', '')
    ip = fwd.split(',')[0].strip() if fwd else ''
    return ip or (request.client.host if request.client else 'desconocida')


# ── Límite de peticiones (ventana deslizante en memoria) ───────────────────────
# Render ejecuta una sola instancia, así que la memoria del proceso basta.

class RateLimiter:
    def __init__(self):
        self._hits = {}
        self._lock = threading.Lock()
        self._last_gc = time.monotonic()

    def hit(self, key: str, limit: int, window: float) -> bool:
        """Apunta un intento. Devuelve False si ya se pasó del límite."""
        now = time.monotonic()
        with self._lock:
            q = self._hits.setdefault(key, deque())
            while q and q[0] <= now - window:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            if now - self._last_gc > 300:      # limpieza de claves viejas
                self._last_gc = now
                for k in [k for k, v in self._hits.items() if not v or v[-1] < now - 3600]:
                    del self._hits[k]
            return True

    def count(self, key: str, window: float) -> int:
        now = time.monotonic()
        with self._lock:
            q = self._hits.get(key)
            if not q:
                return 0
            while q and q[0] <= now - window:
                q.popleft()
            return len(q)

    def reset(self, key: str):
        with self._lock:
            self._hits.pop(key, None)


limiter = RateLimiter()


def rate_limit(request: Request, name: str, limit: int, window: float, extra: str = ''):
    """Lanza 429 si esta IP (y `extra`, p. ej. el usuario) superó `limit` en `window` s."""
    key = f'{name}:{client_ip(request)}:{extra}'
    if not limiter.hit(key, limit, window):
        raise HTTPException(429, 'Demasiados intentos. Espera unos minutos y vuelve a probar.')


# ── Bloqueo de inicio de sesión por fuerza bruta ───────────────────────────────

LOGIN_FAIL_LIMIT = 8          # fallos por cuenta
LOGIN_FAIL_WINDOW = 15 * 60   # en 15 minutos


def login_locked(ident: str) -> bool:
    return limiter.count(f'loginfail:{ident}', LOGIN_FAIL_WINDOW) >= LOGIN_FAIL_LIMIT


def login_failed(ident: str):
    limiter.hit(f'loginfail:{ident}', 10_000, LOGIN_FAIL_WINDOW)


def login_ok(ident: str):
    limiter.reset(f'loginfail:{ident}')


# ── Protección contra bots: campo trampa ───────────────────────────────────────
# Los formularios públicos llevan un campo oculto ("website") que una persona
# nunca rellena. Si llega con algo, es un bot.

def check_honeypot(value):
    if value:
        raise HTTPException(400, 'Solicitud no válida')


# ── Validación de texto ────────────────────────────────────────────────────────

_CTRL = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')
USERNAME_RE = re.compile(r'^[a-z0-9_.]{3,30}$')
EMAIL_RE = re.compile(r'^[^@\s<>"\']{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$')


def clean_text(value, field: str, max_len: int, required: bool = False, multiline: bool = False) -> str:
    """Quita caracteres de control, recorta espacios y limita la longitud."""
    v = '' if value is None else str(value)
    if not multiline:
        v = v.replace('\r', ' ').replace('\n', ' ')
    v = _CTRL.sub('', v).strip()
    if required and not v:
        raise HTTPException(400, f'{field}: no puede estar vacío')
    if len(v) > max_len:
        raise HTTPException(400, f'{field}: máximo {max_len} caracteres')
    return v


def valid_email(email: str) -> str:
    e = (email or '').strip().lower()
    if not EMAIL_RE.match(e):
        raise HTTPException(400, 'Introduce un email válido')
    return e


def valid_password(pw: str) -> str:
    if not pw or len(pw) < 6:
        raise HTTPException(400, 'La contraseña debe tener al menos 6 caracteres')
    if len(pw) > 128:
        raise HTTPException(400, 'La contraseña es demasiado larga (máx. 128)')
    return pw


# ── Subidas de archivos ────────────────────────────────────────────────────────

MB = 1024 * 1024
MAX_IMAGE_BYTES = int(os.environ.get('MAX_IMAGE_MB', '8')) * MB
MAX_AUDIO_BYTES = int(os.environ.get('MAX_AUDIO_MB', '60')) * MB
MAX_VIDEO_BYTES = int(os.environ.get('MAX_VIDEO_MB', '200')) * MB


async def read_limited(upload: UploadFile, max_bytes: int, what: str = 'El archivo') -> bytes:
    """Lee el archivo por trozos y corta si pasa del máximo (no llena la memoria)."""
    buf = bytearray()
    while True:
        chunk = await upload.read(1024 * 1024)
        if not chunk:
            break
        buf.extend(chunk)
        if len(buf) > max_bytes:
            raise HTTPException(413, f'{what} es demasiado grande (máximo {max_bytes // MB} MB)')
    if not buf:
        raise HTTPException(400, f'{what} está vacío')
    return bytes(buf)


_PIL_FORMAT = {'.jpg': 'JPEG', '.jpeg': 'JPEG', '.png': 'PNG', '.webp': 'WEBP'}


def sanitize_image(data: bytes, ext: str, max_side: int = 3000) -> bytes:
    """Comprueba que es una imagen de verdad y la vuelve a guardar limpia: quita
    metadatos (EXIF con GPS, etc.) y cualquier contenido escondido en el archivo."""
    from PIL import Image, ImageOps
    Image.MAX_IMAGE_PIXELS = 40_000_000     # evita "bombas" de descompresión
    fmt = _PIL_FORMAT.get(ext)
    if not fmt:
        raise HTTPException(400, 'Formato de imagen no soportado (usa JPG, PNG o WEBP)')
    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe.verify()
        im = Image.open(io.BytesIO(data))
        im = ImageOps.exif_transpose(im)
        if max(im.size) > max_side:
            im.thumbnail((max_side, max_side))
        if fmt == 'JPEG' and im.mode not in ('RGB', 'L'):
            im = im.convert('RGB')
        out = io.BytesIO()
        save = {'quality': 90, 'optimize': True} if fmt in ('JPEG', 'WEBP') else {'optimize': True}
        im.save(out, fmt, **save)
        return out.getvalue()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, 'La imagen no es válida o está dañada')


def check_media_signature(data: bytes, ext: str):
    """Comprueba por los primeros bytes que el archivo es audio/vídeo del tipo que dice."""
    head = data[:64]
    ok = {
        '.mp3':  head.startswith(b'ID3') or (len(head) > 1 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0),
        '.flac': head.startswith(b'fLaC') or head.startswith(b'ID3'),
        '.wav':  head.startswith(b'RIFF') and head[8:12] == b'WAVE',
        '.ogg':  head.startswith(b'OggS'),
        '.m4a':  head[4:8] == b'ftyp',
        '.aac':  head.startswith(b'ID3') or (len(head) > 1 and head[0] == 0xFF and (head[1] & 0xF6) == 0xF0),
        '.mp4':  head[4:8] == b'ftyp',
        '.mov':  head[4:8] in (b'ftyp', b'moov', b'wide', b'mdat', b'free'),
        '.webm': head.startswith(b'\x1a\x45\xdf\xa3'),
    }.get(ext)
    if not ok:
        raise HTTPException(400, 'El archivo no parece un audio o vídeo válido')


SAFE_FILENAME = re.compile(r'^[A-Za-z0-9_.-]{1,120}$')


def safe_filename(name: str) -> str:
    if not SAFE_FILENAME.match(name or '') or '..' in name:
        raise HTTPException(404)
    return name


# ── Cifrado de datos sensibles (recibos de pago) ───────────────────────────────
# AES (Fernet). La clave sale de DATA_ENCRYPTION_KEY si existe; si no, se deriva
# de la clave secreta del servidor, que nunca sale del servidor.

_ENC_MAGIC = b'EGENC1:'
_fernet = None


def _get_fernet(secret_fallback):
    global _fernet
    if _fernet is None:
        from cryptography.fernet import Fernet
        raw = os.environ.get('DATA_ENCRYPTION_KEY') or secret_fallback()
        key = base64.urlsafe_b64encode(hashlib.sha256(('egmusic-data:' + raw).encode()).digest())
        _fernet = Fernet(key)
    return _fernet


def encrypt_bytes(data: bytes, secret_fallback) -> bytes:
    return _ENC_MAGIC + _get_fernet(secret_fallback).encrypt(data)


def decrypt_bytes(data: bytes, secret_fallback) -> bytes:
    """Descifra; los archivos antiguos (sin cifrar) se devuelven tal cual."""
    if data.startswith(_ENC_MAGIC):
        return _get_fernet(secret_fallback).decrypt(data[len(_ENC_MAGIC):])
    return data


# ── Cabeceras de seguridad y HTTPS ─────────────────────────────────────────────

CSP = '; '.join([
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self' https:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
])

_LOCAL_HOSTS = ('localhost', '127.0.0.1', '0.0.0.0', '[::1]')


class SecurityMiddleware(BaseHTTPMiddleware):
    """Fuerza HTTPS en producción y añade cabeceras de seguridad a cada respuesta."""

    async def dispatch(self, request: Request, call_next):
        host = (request.headers.get('host') or '').split(':')[0]
        proto = request.headers.get('x-forwarded-proto', request.url.scheme)
        is_local = host in _LOCAL_HOSTS or host.endswith('.local') or not host
        if proto == 'http' and not is_local and os.environ.get('FORCE_HTTPS', '1') == '1':
            return RedirectResponse(str(request.url.replace(scheme='https')), status_code=308)

        response = await call_next(request)
        h = response.headers
        h.setdefault('X-Content-Type-Options', 'nosniff')
        h.setdefault('X-Frame-Options', 'DENY')
        h.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
        h.setdefault('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
        h.setdefault('Cross-Origin-Opener-Policy', 'same-origin')
        if proto == 'https':
            h.setdefault('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
        path = request.url.path
        if path.startswith('/api/') and not any(x in path for x in ('/stream', '/cover', '/share-image', '/avatars/')):
            h.setdefault('Cache-Control', 'no-store')   # datos de cuentas: que no se guarden en cachés
        if not path.startswith('/api/'):
            h.setdefault('Content-Security-Policy', CSP)
        return response
