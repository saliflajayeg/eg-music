import os, sys, uuid, threading, time, socket, json
from html import escape
from pathlib import Path
from typing import Optional

from fastapi import (FastAPI, HTTPException, Request, Depends, UploadFile, File, Form)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse, FileResponse, HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field
import uvicorn

from database import Database
import transcode
import storage
from auth import (
    hash_password, verify_password, create_token, _secret,
    get_current_user, require_user, require_uploader, require_admin, require_curator
)
import security as sec
from security import rate_limit, clean_text

# ── Init ───────────────────────────────────────────────────────────────────────

# Sin /docs ni /openapi.json en producción: no damos el mapa de la API a nadie.
_SHOW_DOCS = os.environ.get('SHOW_API_DOCS') == '1'
app = FastAPI(title="EG Music", docs_url='/docs' if _SHOW_DOCS else None,
              redoc_url=None, openapi_url='/openapi.json' if _SHOW_DOCS else None)
db  = Database()

PLANS = ('free', 'amante', 'pro', 'premium')
UPLOADER_PLANS = ('pro', 'premium')   # plans that may upload music/video

def _plan_caps(u):
    """Capabilities + limits for a user's plan. Admins bypass every limit.
    Limit values come from admin-editable settings so they can be tuned live."""
    plan  = u['plan']
    admin = bool(u['is_admin'])

    can_skip   = admin or plan != 'free'          # free = play/pause only
    can_upload = admin or plan in UPLOADER_PLANS

    # Uploads are counted per calendar month.
    if admin:                upload_limit = None   # unlimited
    elif plan == 'pro':      upload_limit = int(db.get_setting('pro_upload_limit') or 8)
    elif plan == 'premium':  upload_limit = int(db.get_setting('premium_upload_limit') or 15)
    else:                    upload_limit = 0
    upload_count = db.count_uploads_this_month(u['id'])

    # Downloads: free = a few total (lifetime); amante/pro = monthly; premium = unlimited.
    if admin or plan == 'premium':
        download_limit, download_period = None, 'unlimited'
    elif plan == 'free':
        download_limit, download_period = int(db.get_setting('free_download_limit') or 3), 'total'
    else:  # amante, pro
        download_limit, download_period = int(db.get_setting('paid_download_limit') or 30), 'month'
    download_count = 0 if download_period == 'unlimited' else db.count_downloads(u['id'], download_period)

    return {
        'can_skip': can_skip, 'can_upload': can_upload,
        'upload_limit': upload_limit, 'upload_count': upload_count,
        'download_limit': download_limit, 'download_count': download_count,
        'download_period': download_period,
    }

BASE_DIR     = Path(__file__).parent
UPLOADS_DIR  = BASE_DIR / "uploads"
TRACKS_DIR   = UPLOADS_DIR / "tracks"
COVERS_DIR   = UPLOADS_DIR / "covers"
AVATARS_DIR  = UPLOADS_DIR / "avatars"
RECEIPTS_DIR = UPLOADS_DIR / "receipts"
SHARE_IMG_DIR = UPLOADS_DIR / "share"   # cached, resized link-preview artwork

for d in (TRACKS_DIR, COVERS_DIR, AVATARS_DIR, RECEIPTS_DIR, SHARE_IMG_DIR):
    d.mkdir(parents=True, exist_ok=True)

# Background 360p rendition generator (adaptive video quality). Starts the
# worker and queues any video that still needs a 'data saver' copy. Works with
# R2 too: the worker pulls the original from R2, encodes, and uploads the copy.
# (No-op until ffmpeg is present, so it's safe even on images without it.)
transcode.start(db, TRACKS_DIR)

# CORS: solo la web de EG Music, la app de Android (Capacitor) y pruebas locales.
# Se pueden añadir dominios con ALLOWED_ORIGINS="https://a.com,https://b.com".
_ORIGINS = [o.strip() for o in os.environ.get('ALLOWED_ORIGINS', '').split(',') if o.strip()] + [
    'https://eg-music.onrender.com', 'https://eg-music.egmusicapp.workers.dev',
    'https://localhost', 'http://localhost', 'capacitor://localhost', 'ionic://localhost',
    'http://localhost:5173', 'http://localhost:8001', 'http://127.0.0.1:8001',
]
app.add_middleware(CORSMiddleware, allow_origins=_ORIGINS,
                   allow_origin_regex=r'https://[a-z0-9-]+\.trycloudflare\.com',
                   allow_methods=['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
                   allow_headers=['Authorization', 'Content-Type', 'Range'])
app.add_middleware(sec.SecurityMiddleware)

AUDIO_MIME = {
    '.mp3':'audio/mpeg', '.flac':'audio/flac', '.wav':'audio/wav',
    '.ogg':'audio/ogg',  '.m4a':'audio/mp4',  '.aac':'audio/aac',
}
VIDEO_MIME = {
    '.mp4':'video/mp4', '.webm':'video/webm', '.mov':'video/quicktime',
}
MEDIA_MIME = {**AUDIO_MIME, **VIDEO_MIME}
IMAGE_MIME = {'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'}

from datetime import datetime, timezone

def _utcnow_str():
    return datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')

def _parse_publish_at(s):
    """ISO del frontend (UTC) -> 'YYYY-MM-DD HH:MM:SS' UTC; '' si vacío o ya pasó."""
    s = (s or '').strip()
    if not s:
        return ''
    try:
        dt = datetime.fromisoformat(s.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        dt = dt.astimezone(timezone.utc)
        if dt <= datetime.now(timezone.utc):
            return ''
        return dt.strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        return ''

def _is_scheduled(t):
    """True si el track está programado a futuro (aún no es público)."""
    pa = (t.get('publish_at') or '').strip()
    return bool(pa) and pa > _utcnow_str()

def _can_manage_track(user, t):
    return bool(user) and (user['id'] == t['user_id'] or user['is_admin'])

def _mime(path, table):
    return table.get(Path(path).suffix.lower(), 'application/octet-stream')

def _visible(t, user):
    """Una canción oculta o programada a futuro solo la ve su dueño o un admin."""
    if not t:
        return False
    if (int(t.get('is_public', 1) or 0) == 1) and not _is_scheduled(t):
        return True
    return _can_manage_track(user, t)

def _parse_collabs(raw, owner_id):
    """Valida la lista de colaboradores [{user_id, percent, role}] que manda el cliente."""
    if raw is None:
        return None
    raw = raw.strip()
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except Exception:
        raise HTTPException(400, "Colaboradores inválidos")
    if not isinstance(parsed, list) or len(parsed) > 10:
        raise HTTPException(400, "Colaboradores inválidos (máximo 10)")
    out, seen, total = [], set(), 0.0
    for c in parsed:
        if not isinstance(c, dict):
            raise HTTPException(400, "Colaboradores inválidos")
        try:
            uid = int(c.get('user_id'))
            p = float(c.get('percent') or 0)
        except (TypeError, ValueError):
            raise HTTPException(400, "Colaborador o porcentaje inválido")
        if uid == owner_id or uid in seen:
            continue
        if not db.get_user_by_id(uid):
            raise HTTPException(400, "Un colaborador no existe")
        if p <= 0 or p >= 100:
            raise HTTPException(400, "Cada porcentaje debe estar entre 1 y 99")
        seen.add(uid); total += p
        out.append({'user_id': uid, 'percent': round(p, 2),
                    'role': clean_text(c.get('role'), 'Rol', 40)})
    if total >= 100:
        raise HTTPException(400, "Los porcentajes de los colaboradores deben sumar menos de 100%")
    return out

async def _read_cover(cover, owner_id):
    """Portada opcional: tamaño máximo, imagen real y sin metadatos. Devuelve el nombre o ''."""
    if not (cover and cover.filename):
        return ''
    cext = Path(cover.filename).suffix.lower()
    if cext not in IMAGE_MIME:
        raise HTTPException(400, "Formato de imagen no soportado (usa JPG, PNG o WEBP)")
    data = sec.sanitize_image(await sec.read_limited(cover, sec.MAX_IMAGE_BYTES, 'La portada'), cext)
    fname = f"cover_{owner_id}_{uuid.uuid4().hex[:8]}{cext}"
    if storage.enabled():
        storage.put(f'covers/{fname}', data, IMAGE_MIME.get(cext))
    else:
        (COVERS_DIR / fname).write_bytes(data)
    return fname

async def _read_media(audio):
    ext = Path(audio.filename or '').suffix.lower()
    if ext in AUDIO_MIME:
        media_type, limit = 'audio', sec.MAX_AUDIO_BYTES
    elif ext in VIDEO_MIME:
        media_type, limit = 'video', sec.MAX_VIDEO_BYTES
    else:
        raise HTTPException(400, f"Formato no soportado: {ext[:10]}")
    data = await sec.read_limited(audio, limit, 'El archivo')
    sec.check_media_signature(data, ext)
    return ext, media_type, data

def _track_texts(title, artist, album, genre, description):
    return (clean_text(title, 'Título', 120, required=True), clean_text(artist, 'Artista', 120, required=True),
            clean_text(album, 'Álbum', 120), clean_text(genre, 'Género', 40),
            clean_text(description, 'Descripción', 2000, multiline=True))

def _stream(path: Path, request: Request, mime: str):
    size = path.stat().st_size
    rng  = request.headers.get('range')

    def gen(start, length):
        with open(path, 'rb') as f:
            f.seek(start)
            rem = length
            while rem > 0:
                chunk = f.read(min(65536, rem))
                if not chunk: break
                rem -= len(chunk)
                yield chunk

    if rng:
        try:
            parts = rng.replace('bytes=','').split('-')
            start = int(parts[0])
            end   = int(parts[1]) if parts[1] else size - 1
        except Exception:
            start, end = 0, size - 1
        end = min(end, size - 1)
        length = end - start + 1
        return StreamingResponse(gen(start, length), status_code=206, media_type=mime, headers={
            'Content-Range': f'bytes {start}-{end}/{size}',
            'Accept-Ranges': 'bytes',
            'Content-Length': str(length),
        })
    return FileResponse(str(path), media_type=mime, headers={'Accept-Ranges':'bytes','Content-Length':str(size)})

# ── Auth ───────────────────────────────────────────────────────────────────────

class RegisterBody(BaseModel):
    username: str
    email: str
    password: str
    display_name: Optional[str] = None
    account_type: str = 'listener'   # 'artist' | 'listener' — se elige gratis al registrarse
    website: Optional[str] = None    # campo trampa para bots (oculto en el formulario)

ACCOUNT_TYPES = ('artist', 'listener')

class LoginBody(BaseModel):
    email: str
    password: str

@app.post("/api/auth/register", status_code=201)
def register(body: RegisterBody, request: Request):
    sec.check_honeypot(body.website)
    rate_limit(request, 'register', 5, 3600)          # 5 cuentas por hora y red
    body.username = body.username.strip().lower()
    body.email    = sec.valid_email(body.email)
    body.display_name = clean_text(body.display_name, 'Nombre', 60) or None
    if not sec.USERNAME_RE.match(body.username):
        raise HTTPException(400, "El usuario debe tener entre 3 y 30 caracteres: letras, números, punto o guion bajo")
    sec.valid_password(body.password)
    if db.get_user_by_username(body.username):
        raise HTTPException(409, "Ese nombre de usuario ya existe")
    if db.get_user_by_email(body.email):
        raise HTTPException(409, "Ese email ya está registrado")
    if len(body.password) < 6:
        raise HTTPException(400, "La contraseña debe tener al menos 6 caracteres")
    if body.account_type not in ACCOUNT_TYPES:
        raise HTTPException(400, "Elige si tu cuenta es de artista o de oyente")
    uid = db.create_user(body.username, body.email, hash_password(body.password),
                         body.display_name, body.account_type)
    # First user becomes admin with the top plan
    if uid == 1:
        db.update_user(uid, is_admin=1, plan='premium', account_type='artist')
    user = db.get_user_by_id(uid)
    return {"token": create_token(uid), "user": _safe_user(user)}

@app.post("/api/auth/login")
def login(body: LoginBody, request: Request):
    # `email` field carries either an email or a username (login accepts both)
    rate_limit(request, 'login', 20, 600)              # 20 intentos / 10 min por red
    ident = body.email.strip().lower()[:200]
    if sec.login_locked(ident):
        raise HTTPException(429, "Demasiados intentos fallidos. Espera 15 minutos o pide ayuda al administrador.")
    user = db.get_user_by_email(ident) or db.get_user_by_username(ident)
    if not user or not verify_password(body.password[:128], user['password_hash']):
        sec.login_failed(ident)
        raise HTTPException(401, "Email/usuario o contraseña incorrectos")
    sec.login_ok(ident)
    db.touch_last_seen(user)
    return {"token": create_token(user['id'], user.get('token_version') or 0), "user": _safe_user(user)}

@app.get("/api/auth/me")
def me(user=Depends(require_user)):
    return _safe_user(user)

class AccountTypeBody(BaseModel):
    account_type: str

@app.post("/api/auth/account-type")
def set_account_type(body: AccountTypeBody, user=Depends(require_user)):
    """Cambiar entre cuenta de artista y de oyente (gratis). Quien tiene un plan
    de artista activo (Pro/Premium) no puede pasar a oyente."""
    if body.account_type not in ACCOUNT_TYPES:
        raise HTTPException(400, "Tipo de cuenta inválido")
    if body.account_type == 'listener' and user['plan'] in UPLOADER_PLANS:
        raise HTTPException(400, "Tienes un plan de artista activo")
    db.update_user(user['id'], account_type=body.account_type)
    return _safe_user(db.get_user_by_id(user['id']))

class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str

@app.post("/api/auth/change-password")
def change_password(body: ChangePasswordBody, request: Request, user=Depends(require_user)):
    rate_limit(request, 'chpw', 10, 600, str(user['id']))
    if not verify_password(body.current_password[:128], user['password_hash']):
        raise HTTPException(401, "La contraseña actual no es correcta")
    sec.valid_password(body.new_password)
    db.update_password(user['id'], hash_password(body.new_password))
    # Las demás sesiones (otros móviles) se cierran; este dispositivo sigue dentro.
    fresh = db.get_user_by_id(user['id'])
    return {"ok": True, "token": create_token(fresh['id'], fresh.get('token_version') or 0)}

class ChangeEmailBody(BaseModel):
    new_email: str
    password: str

@app.post("/api/auth/change-email")
def change_email(body: ChangeEmailBody, request: Request, user=Depends(require_user)):
    rate_limit(request, 'chemail', 10, 600, str(user['id']))
    if not verify_password(body.password[:128], user['password_hash']):
        raise HTTPException(401, "La contraseña no es correcta")
    new_email = sec.valid_email(body.new_email)
    existing = db.get_user_by_email(new_email)
    if existing and existing['id'] != user['id']:
        raise HTTPException(409, "Ese email ya está registrado")
    db.update_email(user['id'], new_email)
    return _safe_user(db.get_user_by_id(user['id']))

def _safe_user(u):
    d = {k: u[k] for k in ('id','username','email','display_name','bio','avatar','plan','is_admin','created_at')}
    d['is_curator'] = int(u['is_curator']) if 'is_curator' in u.keys() else 0
    d['account_type'] = (u.get('account_type') if hasattr(u, 'get') else u['account_type']) or 'listener'
    d.update(_plan_caps(u))
    return d

# ── Users ──────────────────────────────────────────────────────────────────────

class UpdateProfileBody(BaseModel):
    display_name: Optional[str] = None
    bio: Optional[str] = None

@app.get("/api/users/{uid}")
def get_user(uid: int, current=Depends(get_current_user)):
    u = db.get_user_public(uid, viewer_id=current['id'] if current else None)
    if not u: raise HTTPException(404, "Usuario no encontrado")
    return u

@app.patch("/api/users/me")
def update_profile(body: UpdateProfileBody, user=Depends(require_user)):
    kwargs = {}
    if body.display_name is not None: kwargs['display_name'] = clean_text(body.display_name, 'Nombre', 60, required=True)
    if body.bio is not None:          kwargs['bio'] = clean_text(body.bio, 'Biografía', 500, multiline=True)
    db.update_user(user['id'], **kwargs)
    return _safe_user(db.get_user_by_id(user['id']))

@app.post("/api/users/me/avatar")
async def upload_avatar(request: Request, file: UploadFile = File(...), user=Depends(require_user)):
    rate_limit(request, 'avatar', 20, 3600, str(user['id']))
    ext = Path(file.filename or '').suffix.lower()
    if ext not in IMAGE_MIME:
        raise HTTPException(400, "Formato de imagen no soportado")
    fname = f"avatar_{user['id']}_{uuid.uuid4().hex[:8]}{ext}"
    content = sec.sanitize_image(await sec.read_limited(file, sec.MAX_IMAGE_BYTES, 'La foto'), ext, max_side=1024)
    if storage.enabled():
        storage.put(f'avatars/{fname}', content, IMAGE_MIME.get(ext))
    else:
        (AVATARS_DIR / fname).write_bytes(content)
    db.update_user(user['id'], avatar=fname)
    return {"avatar": fname}

@app.get("/api/users/{uid}/tracks")
def get_user_tracks(uid: int, current=Depends(get_current_user)):
    return db.get_user_tracks(uid, viewer_id=current['id'] if current else None)

@app.post("/api/users/{uid}/follow")
def toggle_follow(uid: int, user=Depends(require_user)):
    if uid == user['id']: raise HTTPException(400, "No puedes seguirte a ti mismo")
    following = db.toggle_follow(user['id'], uid)
    return {"following": following}

# ── Tracks ─────────────────────────────────────────────────────────────────────

@app.get("/api/tracks")
def get_feed(offset: int = 0, limit: int = 40, sort: str = 'recent', genre: Optional[str] = None, current=Depends(get_current_user)):
    return db.get_feed(viewer_id=current['id'] if current else None,
                       limit=min(max(limit, 1), 100), offset=offset, sort=sort, genre=genre)

@app.get("/api/tracks/top")
def get_top(limit: int = 10, current=Depends(get_current_user)):
    return db.get_top_tracks(viewer_id=current['id'] if current else None, limit=min(max(limit, 1), 50))

@app.get("/api/tracks/following")
def get_following_feed(user=Depends(require_user)):
    return db.get_following_feed(user['id'])

@app.get("/api/tracks/liked")
def get_liked(user=Depends(require_user)):
    return db.get_liked_tracks(user['id'])

@app.get("/api/tracks/{track_id}")
def get_track(track_id: int, current=Depends(get_current_user)):
    t = db.get_track(track_id, viewer_id=current['id'] if current else None)
    # un tema oculto o programado a futuro solo lo ve su dueño (o un admin)
    if not _visible(t, current):
        raise HTTPException(404)
    return t

class ScheduleBody(BaseModel):
    publish_at: str = ''   # ISO UTC, o '' para publicar ya

@app.patch("/api/tracks/{track_id}/schedule")
def set_track_schedule(track_id: int, body: ScheduleBody, user=Depends(require_user)):
    t = db.get_track(track_id)
    if not t: raise HTTPException(404)
    if t['user_id'] != user['id'] and not user['is_admin']:
        raise HTTPException(403, "No es tu canción")
    db.set_publish_at(track_id, _parse_publish_at(body.publish_at))
    return db.get_track(track_id, viewer_id=user['id'])

@app.post("/api/tracks/{track_id}/edit")
async def edit_track(
    track_id: int,
    title:         str = Form(...),
    collaborators: Optional[str] = Form(None),   # JSON list, or omitted = leave unchanged
    cover:         Optional[UploadFile] = File(None),
    user=Depends(require_user),
):
    """An artist (or admin) edits a published track: title, cover and credited
    collaborators. The audio/video file itself is not replaced here."""
    t = db.get_track(track_id)
    if not t: raise HTTPException(404)
    if t['user_id'] != user['id'] and not user['is_admin']:
        raise HTTPException(403, "No es tu canción")

    title = clean_text(title, 'Título', 120, required=True)
    collabs = _parse_collabs(collaborators, t['user_id'])     # validar antes de tocar nada

    # New cover (optional) — store it like an upload; the old file is left in R2.
    new_cover = (await _read_cover(cover, t['user_id'])) or None

    db.update_track(track_id, title=title, cover=new_cover)

    # Collaborators — only touched when the field is sent. Owner keeps the rest.
    if collabs is not None:
        total = sum(c['percent'] for c in collabs)
        db.set_track_artists(track_id, t['user_id'], round(100.0 - total, 2), collabs, preserve_status=True)

    return db.get_track(track_id, viewer_id=user['id'])

# ── Playlists ────────────────────────────────────────────────────────────────

class PlaylistBody(BaseModel):
    name: str

class PlaylistTrackBody(BaseModel):
    track_id: int

def _own_playlist(pid, user):
    p = db.get_playlist(pid)
    if not p: raise HTTPException(404, "Lista no encontrada")
    if p['user_id'] != user['id'] and not user.get('is_admin'):
        raise HTTPException(403, "No es tu lista")
    return p

@app.get("/api/playlists")
def list_playlists(user=Depends(require_user)):
    return db.get_user_playlists(user['id'])

@app.post("/api/playlists", status_code=201)
def create_playlist(body: PlaylistBody, user=Depends(require_user)):
    name = (body.name or '').strip()
    if not name: raise HTTPException(400, "Pon un nombre a la lista")
    pid = db.create_playlist(user['id'], name[:80])
    return db.get_playlist(pid)

# Defined before /api/playlists/{pid} so "for-track" isn't read as an id.
@app.get("/api/playlists/for-track/{track_id}")
def playlists_for_track(track_id: int, user=Depends(require_user)):
    return db.playlists_for_track(user['id'], track_id)

@app.get("/api/playlists/{pid}")
def get_playlist(pid: int, user=Depends(require_user)):
    p = dict(_own_playlist(pid, user))
    p['tracks'] = db.get_playlist_tracks(pid, viewer_id=user['id'])
    return p

@app.patch("/api/playlists/{pid}")
def rename_playlist(pid: int, body: PlaylistBody, user=Depends(require_user)):
    _own_playlist(pid, user)
    name = (body.name or '').strip()
    if not name: raise HTTPException(400, "Pon un nombre a la lista")
    db.rename_playlist(pid, name[:80])
    return db.get_playlist(pid)

@app.delete("/api/playlists/{pid}", status_code=204)
def delete_playlist(pid: int, user=Depends(require_user)):
    _own_playlist(pid, user)
    db.delete_playlist(pid)

@app.post("/api/playlists/{pid}/tracks", status_code=201)
def add_playlist_track(pid: int, body: PlaylistTrackBody, user=Depends(require_user)):
    _own_playlist(pid, user)
    if not db.get_track(body.track_id): raise HTTPException(404, "Canción no encontrada")
    db.add_to_playlist(pid, body.track_id)
    return {"ok": True}

@app.delete("/api/playlists/{pid}/tracks/{track_id}", status_code=204)
def remove_playlist_track(pid: int, track_id: int, user=Depends(require_user)):
    _own_playlist(pid, user)
    db.remove_from_playlist(pid, track_id)

@app.post("/api/tracks", status_code=201)
async def upload_track(
    title:       str  = Form(...),
    artist:      str  = Form(...),
    album:       str  = Form(''),
    genre:       str  = Form(''),
    description: str  = Form(''),
    collaborators: str = Form(''),   # JSON: [{user_id, percent, role}]
    publish_at:  str  = Form(''),    # ISO UTC futura, o '' para publicar ya
    audio:       UploadFile = File(...),
    cover:       Optional[UploadFile] = File(None),
    request:     Request = None,
    user=Depends(require_uploader),
):
    rate_limit(request, 'upload', 30, 3600, str(user['id']))
    title, artist, album, genre, description = _track_texts(title, artist, album, genre, description)
    collabs = _parse_collabs(collaborators, user['id'])

    if not user['is_admin']:
        caps = _plan_caps(user)
        limit = caps['upload_limit']
        if limit is not None and caps['upload_count'] >= limit:
            nxt = 'Premium' if user['plan'] == 'pro' else 'un plan superior'
            raise HTTPException(403, f"Has alcanzado tu límite de {limit} subidas este mes. Mejora a {nxt} para subir más.")

    ext, media_type, audio_data = await _read_media(audio)
    audio_fname = f"track_{user['id']}_{uuid.uuid4().hex}{ext}"
    # Write locally first (mutagen needs a path); with R2 we upload then remove it.
    (TRACKS_DIR / audio_fname).write_bytes(audio_data)

    # Duration via mutagen (audio only — mutagen doesn't read video containers
    # reliably; the frontend reads video duration client-side from <video>)
    duration = 0.0
    if media_type == 'audio':
        try:
            from mutagen import File as MFile
            m = MFile(str(TRACKS_DIR / audio_fname))
            if m: duration = m.info.length
        except Exception:
            pass

    if storage.enabled():
        storage.put(f'tracks/{audio_fname}', audio_data, _mime(audio_fname, MEDIA_MIME))
        (TRACKS_DIR / audio_fname).unlink(missing_ok=True)

    # Cover
    cover_fname = await _read_cover(cover, user['id'])

    tid = db.create_track(
        user['id'], title, artist, album, genre, description, audio_fname, cover_fname, duration,
        media_type, publish_at=_parse_publish_at(publish_at)
    )

    # Credited artists + revenue split. Each collaborator must accept before
    # appearing publicly, so nobody can credit a well-known artist without permission.
    collabs = collabs or []
    total = sum(c['percent'] for c in collabs)
    db.set_track_artists(tid, user['id'], round(100.0 - total, 2), collabs)

    # Kick off the 360p 'data saver' rendition in the background (videos only).
    if media_type == 'video':
        db.set_sd_status(tid, 'pending')
        transcode.enqueue(tid)

    return db.get_track(tid, viewer_id=user['id'])

@app.post("/api/admin/tracks", status_code=201)
async def admin_upload_track(
    owner_user_id: int = Form(...),   # el artista dueño de la canción
    title:       str  = Form(...),
    artist:      str  = Form(...),
    album:       str  = Form(''),
    genre:       str  = Form(''),
    description: str  = Form(''),
    collaborators: str = Form(''),    # JSON: [{user_id, percent}]
    publish_at:  str  = Form(''),
    duration:    float = Form(0),     # override opcional (SoundCloud m4a / vídeo dan 0)
    audio:       UploadFile = File(...),
    cover:       Optional[UploadFile] = File(None),
    user=Depends(require_curator),
):
    """Sube una canción/vídeo A NOMBRE de otro artista (owner_user_id). Admin o curador:
    para poblar la plataforma sin pedir las credenciales de cada artista. Los
    colaboradores quedan ACEPTADOS directamente (el admin es autoridad)."""
    owner = db.get_user_by_id(owner_user_id)
    if not owner:
        raise HTTPException(404, "El artista (owner_user_id) no existe")
    title, artist, album, genre, description = _track_texts(title, artist, album, genre, description)
    collabs = _parse_collabs(collaborators, owner_user_id) or []
    ext, media_type, audio_data = await _read_media(audio)
    audio_fname = f"track_{owner_user_id}_{uuid.uuid4().hex}{ext}"
    (TRACKS_DIR / audio_fname).write_bytes(audio_data)
    dur = float(duration) if duration and duration > 0 else 0.0
    if not dur and media_type == 'audio':
        try:
            from mutagen import File as MFile
            m = MFile(str(TRACKS_DIR / audio_fname))
            if m: dur = m.info.length
        except Exception:
            pass
    if storage.enabled():
        storage.put(f'tracks/{audio_fname}', audio_data, _mime(audio_fname, MEDIA_MIME))
        (TRACKS_DIR / audio_fname).unlink(missing_ok=True)

    cover_fname = await _read_cover(cover, owner_user_id)

    tid = db.create_track(
        owner_user_id, title, artist, album, genre, description, audio_fname, cover_fname, dur,
        media_type, publish_at=_parse_publish_at(publish_at))

    total = sum(c['percent'] for c in collabs)
    db.set_track_artists(tid, owner_user_id, round(100.0 - total, 2), collabs)
    db.accept_track_collabs(tid)   # admin => colaboradores aceptados directamente

    if media_type == 'video':
        db.set_sd_status(tid, 'pending'); transcode.enqueue(tid)
    return db.get_track(tid, viewer_id=owner_user_id)

@app.get("/api/admin/catalog")
def curator_catalog(user=Depends(require_curator)):
    """Catálogo mínimo de todos los usuarios (id, usuario, nombre) para que el
    bot de curación detecte duplicados y resuelva IDs. No expone email/plan:
    accesible a curadores sin darles el panel de usuarios completo."""
    return [{"id": u["id"], "username": u["username"],
             "display_name": u.get("display_name") or u["username"]}
            for u in db.get_all_users()]

class EnsureArtistBody(BaseModel):
    username: str
    display_name: str = ''
    email: str = ''
    password: str

@app.post("/api/admin/ensure-artist", status_code=200)
def ensure_artist(body: EnsureArtistBody, user=Depends(require_curator)):
    """Crea (o encuentra) una cuenta de artista y la deja en premium, para que
    el curador pueda subir a su nombre sin pedirle credenciales. Devuelve
    {id, created}. Scope de curador: NO puede tocar admin/curador de nadie."""
    username = body.username.strip().lower()
    if not sec.USERNAME_RE.match(username):
        raise HTTPException(400, "Usuario inválido: 3-30 letras, números, punto o guion bajo")
    existing = db.get_user_by_username(username)
    if existing:
        return {"id": existing["id"], "created": False}
    sec.valid_password(body.password)
    email = sec.valid_email(body.email) if body.email.strip() else f"{username}@artist.egmusic"
    body.display_name = clean_text(body.display_name, 'Nombre', 60)
    if db.get_user_by_email(email):
        raise HTTPException(409, "Ese email ya está registrado")
    display = body.display_name.strip() or username
    uid = db.create_user(username, email, hash_password(body.password), display, 'artist')
    db.update_user(uid, plan='premium')   # las 'free' no pueden ser dueñas para subir cómodamente
    return {"id": uid, "created": True}

@app.delete("/api/tracks/{track_id}")
def delete_track(track_id: int, user=Depends(require_user)):
    t = db.get_track(track_id)
    if not t: raise HTTPException(404)
    if t['user_id'] != user['id'] and not user['is_admin']:
        raise HTTPException(403)
    files = db.delete_track(track_id)
    if files:
        if storage.enabled():
            if files.get('filename'): storage.delete(f"tracks/{files['filename']}")
            if files.get('cover'):    storage.delete(f"covers/{files['cover']}")
        for key, folder in [('filename', TRACKS_DIR), ('cover', COVERS_DIR)]:
            if files.get(key):
                try: (folder / files[key]).unlink(missing_ok=True)
                except Exception: pass
    return {"ok": True}

@app.get("/api/tracks/{track_id}/stream")
async def stream_track(track_id: int, request: Request, dl: int = 0, q: str = '', count: int = 1):
    t = db.get_track(track_id)
    # El audio no lleva sesión (lo pide el reproductor del navegador), así que una
    # canción oculta o aún no publicada no se sirve a nadie hasta su estreno.
    if not t or not _visible(t, None): raise HTTPException(404)
    # q=sd -> serve the 360p 'data saver' rendition if it's ready, else original.
    fname = t['filename']
    if q == 'sd' and t.get('sd_status') == 'ready' and t.get('sd_file'):
        fname = t['sd_file']
    # La web y la app nuevas piden siempre count=0: la escucha se cuenta aparte
    # (POST /api/plays) cuando se llevan 30 s escuchados y sabiendo quién escucha.
    # count=1 solo llega de versiones antiguas de la app: se cuenta como anónima.
    if not dl and count and sec.limiter.hit(f'legacy:{sec.client_ip(request)}', 120, 600):
        db.record_listen(track_id, None, source='legacy')
    # R2: hand the client a presigned url and let it stream straight from R2
    # (range requests + zero bandwidth on this server).
    if storage.enabled():
        return RedirectResponse(storage.media_url(f'tracks/{fname}'), status_code=302)
    path = TRACKS_DIR / fname
    if not path.exists(): raise HTTPException(404, "Archivo no encontrado")
    return _stream(path, request, _mime(fname, MEDIA_MIME))

@app.get("/api/tracks/{track_id}/cover")
def track_cover(track_id: int):
    t = db.get_track(track_id)
    if not t or not t.get('cover'): raise HTTPException(404)
    if storage.enabled():
        return RedirectResponse(storage.media_url(f"covers/{t['cover']}"), status_code=302)
    path = COVERS_DIR / t['cover']
    if not path.exists(): raise HTTPException(404)
    return FileResponse(str(path), media_type=_mime(t['cover'], IMAGE_MIME))

@app.get("/api/tracks/{track_id}/share-image")
def track_share_image(track_id: int):
    """Artwork for social link previews. Always returns an image — falls back
    to the app icon — because a preview with no image looks broken.

    Served small so WhatsApp's crawler (which gives up on multi-MB covers over
    the slow tunnel) actually fetches it. Served by this server on purpose —
    crawlers need it inline, and it's tiny."""
    import io
    t = db.get_track(track_id)
    src_bytes = None
    if t and t.get('cover'):
        if storage.enabled():
            try: src_bytes = storage.get_bytes(f"covers/{t['cover']}")
            except Exception: src_bytes = None
        else:
            p = COVERS_DIR / t['cover']
            if p.exists(): src_bytes = p.read_bytes()
    if src_bytes is None:
        icon = BASE_DIR.parent / 'frontend' / 'assets' / 'icon-only.png'
        if not icon.exists(): raise HTTPException(404)
        src_bytes = icon.read_bytes()
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(src_bytes)).convert('RGB')
        im.thumbnail((600, 600), Image.LANCZOS)
        buf = io.BytesIO(); im.save(buf, 'JPEG', quality=82, optimize=True)
        return Response(content=buf.getvalue(), media_type='image/jpeg')
    except Exception:
        return Response(content=src_bytes)   # resizing failed: send the original

@app.post("/api/tracks/{track_id}/like")
def like_track(track_id: int, user=Depends(require_user)):
    liked, count = db.toggle_like(user['id'], track_id)
    if liked:
        t = db.get_track(track_id)
        if t:
            db.add_notification(t['user_id'], user['id'], 'like_track', track_id, None, t['title'])
    return {"liked": liked, "like_count": count}

# ── Comments ─────────────────────────────────────────────────────────────────────

class CommentBody(BaseModel):
    text: str
    parent_id: Optional[int] = None

@app.get("/api/tracks/{track_id}/comments")
def list_comments(track_id: int, current=Depends(get_current_user)):
    return db.get_comments(track_id, viewer_id=current['id'] if current else None)

@app.post("/api/tracks/{track_id}/comments", status_code=201)
def add_comment(track_id: int, body: CommentBody, request: Request, user=Depends(require_user)):
    rate_limit(request, 'comment', 15, 60, str(user['id']))     # anti-spam
    text = clean_text(body.text, 'Comentario', 1000, required=True, multiline=True)
    track = db.get_track(track_id)
    if not _visible(track, user):
        raise HTTPException(404, "Contenido no encontrado")
    if body.parent_id:
        parent = db.get_comment(body.parent_id)
        if not parent or parent['track_id'] != track_id:
            raise HTTPException(400, "Respuesta inválida")

    comment = db.add_comment(track_id, user['id'], text, parent_id=body.parent_id)

    # Notify the right people (never yourself; add_notification guards that).
    if body.parent_id:
        parent = db.get_comment(body.parent_id)
        if parent:
            db.add_notification(parent['user_id'], user['id'], 'reply', track_id, comment['id'], text)
        # Also let the content owner know, unless they're the one being replied to.
        if not parent or parent['user_id'] != track['user_id']:
            db.add_notification(track['user_id'], user['id'], 'comment', track_id, comment['id'], text)
    else:
        db.add_notification(track['user_id'], user['id'], 'comment', track_id, comment['id'], text)

    return comment

@app.delete("/api/comments/{comment_id}", status_code=204)
def delete_comment(comment_id: int, user=Depends(require_user)):
    c = db.get_comment(comment_id)
    if not c:
        raise HTTPException(404)
    # A comment can be removed by its author or an admin.
    if c['user_id'] != user['id'] and not user['is_admin']:
        raise HTTPException(403, "No puedes borrar este comentario")
    db.delete_comment(comment_id)

@app.post("/api/comments/{comment_id}/like")
def like_comment(comment_id: int, user=Depends(require_user)):
    c = db.get_comment(comment_id)
    if not c:
        raise HTTPException(404)
    liked, count = db.toggle_comment_like(user['id'], comment_id)
    if liked:
        db.add_notification(c['user_id'], user['id'], 'like_comment', c['track_id'], comment_id, c['text'])
    return {"liked": liked, "like_count": count}

# ── Notifications ────────────────────────────────────────────────────────────────

@app.get("/api/notifications")
def notifications(user=Depends(require_user)):
    return {
        "items": db.get_notifications(user['id']),
        "unread": db.count_unread_notifications(user['id']),
    }

@app.post("/api/notifications/read", status_code=204)
def notifications_read(user=Depends(require_user)):
    db.mark_notifications_read(user['id'])

# ── Offline play/view sync ──────────────────────────────────────────────────────

class PlayEvent(BaseModel):
    track_id: int
    client_event_id: str = Field(max_length=64)
    played_at: Optional[str] = Field(default=None, max_length=40)

class SyncPlaysBody(BaseModel):
    events: list[PlayEvent] = Field(max_length=500)

@app.post("/api/sync/plays")
def sync_plays(body: SyncPlaysBody, request: Request, user=Depends(require_user)):
    rate_limit(request, 'sync', 30, 600, str(user['id']))
    # Events played offline (from downloaded files) that the server never saw.
    # Idempotent: dedupes on client_event_id so retries don't double-count.
    applied = db.record_play_events(user['id'], [e.model_dump() for e in body.events])
    return {"applied": applied, "received": len(body.events)}

# ── Escuchas (cuentan a partir de 30 segundos) ─────────────────────────────────

class ListenBody(BaseModel):
    track_id: int
    client_event_id: Optional[str] = Field(default=None, max_length=64)

@app.post("/api/plays")
def record_play(body: ListenBody, request: Request, user=Depends(get_current_user)):
    rate_limit(request, 'plays', 120, 600, str(user['id']) if user else '')
    if not _visible(db.get_track(body.track_id), user):
        raise HTTPException(404)
    """El reproductor llama aquí cuando alguien lleva 30 s escuchando una canción.
    Funciona con o sin sesión (sin sesión = escucha anónima, no genera dinero)."""
    counted = db.record_listen(body.track_id, user, source='web', client_event_id=body.client_event_id)
    return {"counted": counted}

# ── Regalías (reparto por oyente) ───────────────────────────────────────────────

import re as _re
from datetime import datetime as _dt

def _amante_price():
    """'2.000 XAF / mes' -> 2000"""
    digits = _re.sub(r'[^0-9]', '', (db.get_setting('amante_price') or '').split('/')[0])
    return int(digits) if digits else 0

def _artist_percent():
    try:
        v = float(db.get_setting('royalty_artist_percent') or 70)
        return v if 0 <= v <= 100 else 70.0
    except ValueError:
        return 70.0

def _month(m):
    if not m:
        return _dt.utcnow().strftime('%Y-%m')
    if not _re.fullmatch(r'\d{4}-\d{2}', m):
        raise HTTPException(400, "Mes inválido (usa AAAA-MM)")
    return m

def _name(u):
    return (u.get('display_name') or u.get('username') or '') if u else ''

def _royalties_live():
    """'1' cuando EG Music empiece a pagar de verdad. Mientras tanto, las regalías
    se muestran como simulación para que los artistas entiendan el sistema."""
    return (db.get_setting('royalties_live') or '0') == '1'

def _royalties(month):
    return db.compute_royalties(month, _amante_price(), _artist_percent())

@app.get("/api/royalties/me")
def my_royalties(month: str = '', user=Depends(require_user)):
    """'Mis regalías' del artista: lo ganado en el mes, quién le escucha y sus pagos."""
    month = _month(month)
    R = _royalties(month)
    a = R['artists'].get(user['id']) or {'amount': 0, 'paid_listens': 0, 'free_listens': 0,
                                         'anon_listens': 0, 'paid_listeners': 0, 'listeners': {}, 'tracks': {}}
    users = db.users_brief(a['listeners'].keys())
    tracks = db.tracks_brief(a['tracks'].keys())
    listeners = sorted(({
        'listener_id': lid, 'name': _name(users.get(lid)), 'username': (users.get(lid) or {}).get('username', ''),
        'avatar': (users.get(lid) or {}).get('avatar', ''), 'paid': v['paid'],
        'listens': round(v['listens'], 2), 'amount': round(v['amount'], 2)}
        for lid, v in a['listeners'].items()), key=lambda x: (-x['amount'], -x['listens']))
    track_rows = sorted(({
        **{k: round(v, 2) if isinstance(v, float) else v for k, v in t.items()},
        'title': (tracks.get(tid) or {}).get('title', '(canción borrada)')}
        for tid, t in a['tracks'].items()), key=lambda x: (-x['amount'], -x['paid_listens']))
    return {
        'month': month, 'months': sorted(set(db.listen_months()) | {month}, reverse=True),
        'live': _royalties_live(),
        'price': R['price'], 'artist_percent': R['artist_percent'],
        'contribution_per_listener': R['contribution_per_listener'],
        'amount': round(a['amount'], 2),
        'paid_listeners': a['paid_listeners'],
        'paid_listens': round(a['paid_listens'], 2),
        'free_listens': round(a['free_listens'], 2),
        'anon_listens': round(a['anon_listens'], 2),
        'listeners': listeners, 'tracks': track_rows,
        'payouts': db.get_payouts(artist_id=user['id']),
    }

@app.get("/api/admin/royalties")
def admin_royalties(month: str = '', user=Depends(require_admin)):
    """Contabilidad completa del mes: cuánto entra, a quién va cada franco."""
    month = _month(month)
    R = _royalties(month)
    ids = list(R['artists'].keys()) + [l['listener_id'] for l in R['ledger']]
    users = db.users_brief(ids)
    paid = {p['artist_id']: p for p in db.get_payouts(month=month)}
    artists = sorted(({
        'artist_id': aid, 'name': _name(users.get(aid)), 'username': (users.get(aid) or {}).get('username', ''),
        'amount': round(a['amount'], 2), 'paid_listeners': a['paid_listeners'],
        'paid_listens': round(a['paid_listens'], 2), 'free_listens': round(a['free_listens'], 2),
        'anon_listens': round(a['anon_listens'], 2), 'payout': paid.get(aid)}
        for aid, a in R['artists'].items()), key=lambda x: (-x['amount'], -x['paid_listens']))
    ledger = sorted(({
        'listener_id': l['listener_id'], 'name': _name(users.get(l['listener_id'])),
        'username': (users.get(l['listener_id']) or {}).get('username', ''),
        'contribution': round(l['contribution'], 2), 'listens': round(l['listens'], 2),
        'allocations': [{'artist_id': x['artist_id'], 'name': _name(users.get(x['artist_id'])),
                         'listens': round(x['listens'], 2), 'amount': round(x['amount'], 2)}
                        for x in l['allocations']]}
        for l in R['ledger']), key=lambda x: x['name'].lower())
    return {
        'month': month, 'months': sorted(set(db.listen_months()) | {month}, reverse=True),
        'price': R['price'], 'artist_percent': R['artist_percent'],
        'contribution_per_listener': R['contribution_per_listener'],
        'paying_listeners': R['paying_listeners'],
        'live': _royalties_live(),
        'collected': R['collected'], 'to_artists': round(R['to_artists'], 2),
        'platform': round(R['collected'] - R['to_artists'], 2),
        'artists': artists, 'ledger': ledger,
    }

class PayoutBody(BaseModel):
    artist_id: int
    month: str
    amount: int
    note: str = ''

@app.post("/api/admin/royalties/payout")
def admin_mark_payout(body: PayoutBody, user=Depends(require_admin)):
    """Apunta que a un artista ya se le pagó un mes (por Muni Dinero, etc.)."""
    month = _month(body.month)
    if body.amount < 0:
        raise HTTPException(400, "Cantidad inválida")
    db.mark_payout(body.artist_id, month, body.amount, clean_text(body.note, 'Nota', 200), user['id'])
    return {"ok": True}

# ── Explore ─────────────────────────────────────────────────────────────────────

@app.get("/api/genres")
def list_genres():
    return db.get_genres()

@app.get("/api/artists")
def list_artists(limit: int = 200):
    return db.get_artists(limit=min(max(limit, 1), 500))

# ── Collaborations ──────────────────────────────────────────────────────────────

@app.get("/api/artists/search")
def artists_search(q: str = '', user=Depends(require_user)):
    """Find artists to credit on a track (the collaborator picker)."""
    q = q.strip()[:60]
    if len(q) < 2:
        return []
    rows = db.search(q)['users']
    return [
        {k: r[k] for k in ('id', 'username', 'display_name', 'avatar', 'plan')}
        for r in rows if r['id'] != user['id']
    ][:8]


# ── Account claim (an artist claiming a pre-created account) ─────────────────────
class ClaimBody(BaseModel):
    artist_user_id: int
    email: str = ''
    contact: str = ''
    message: str = ''
    website: Optional[str] = None   # campo trampa para bots

@app.get("/api/claim/artists")
def claim_search_artists(request: Request, q: str = ''):
    """Public search of artist accounts (uploaders) so someone can claim theirs."""
    rate_limit(request, 'claimsearch', 60, 600)
    q = q.strip()[:60]
    if len(q) < 2:
        return []
    return db.search_claimable_artists(q)

@app.post("/api/claims", status_code=201)
def create_claim(body: ClaimBody, request: Request):
    """Public: an artist requests to take over an existing account. Reviewed by admin."""
    sec.check_honeypot(body.website)
    rate_limit(request, 'claim', 5, 3600)
    artist = db.get_user_by_id(body.artist_user_id)
    if not artist:
        raise HTTPException(404, "Artista no encontrado")
    email = sec.valid_email(body.email) if (body.email or '').strip() else ''
    contact = clean_text(body.contact, 'Contacto', 100)
    if not email and not contact:
        raise HTTPException(400, "Deja un correo o un contacto para poder responderte")
    db.create_account_claim(body.artist_user_id, email, contact, clean_text(body.message, 'Mensaje', 800, multiline=True))
    return {"ok": True}

@app.get("/api/collabs/pending")
def collabs_pending(user=Depends(require_user)):
    """Collaboration invitations waiting for me to accept."""
    return db.get_pending_collabs(user['id'])

class CollabResponse(BaseModel):
    accept: bool

@app.post("/api/collabs/{track_id}/respond")
def collab_respond(track_id: int, body: CollabResponse, user=Depends(require_user)):
    pending = [c for c in db.get_pending_collabs(user['id']) if c['track_id'] == track_id]
    if not pending:
        raise HTTPException(404, "No tienes una invitación pendiente para esta canción")
    db.respond_collab(track_id, user['id'], body.accept)
    return {"ok": True, "status": "accepted" if body.accept else "declined"}

@app.get("/api/tracks/{track_id}/artists")
def track_artists(track_id: int, current=Depends(get_current_user)):
    t = db.get_track(track_id)
    if not t:
        raise HTTPException(404)
    # The uploader (and admins) can also see who hasn't accepted yet.
    owner = current and (current['id'] == t['user_id'] or current['is_admin'])
    return db.get_track_artists(track_id, include_pending=bool(owner))

# ── Downloads (plan-limited) ────────────────────────────────────────────────────

@app.post("/api/downloads/{track_id}")
def register_download(track_id: int, user=Depends(require_user)):
    """Called by the app BEFORE it saves a track offline. Enforces the plan's
    download allowance. Re-downloading a track you already have is free."""
    t = db.get_track(track_id)
    if not t:
        raise HTTPException(404)
    if db.has_downloaded(user['id'], track_id):
        return {"ok": True, "already": True}
    caps = _plan_caps(user)
    limit, period = caps['download_limit'], caps['download_period']
    if limit is not None and caps['download_count'] >= limit:
        if period == 'total':
            msg = (f"Tu plan Gratis permite {limit} descargas. "
                   f"Mejora a Amante de la música para descargar más.")
        else:
            msg = (f"Has alcanzado tu límite de {limit} descargas este mes. "
                   f"Mejora a Premium para descargas ilimitadas.")
        raise HTTPException(403, msg)
    db.record_download(user['id'], track_id)
    return {"ok": True}

# ── Avatars ────────────────────────────────────────────────────────────────────

@app.get("/api/avatars/{fname}")
def get_avatar(fname: str):
    fname = sec.safe_filename(fname)
    if storage.enabled():
        return RedirectResponse(storage.media_url(f'avatars/{fname}'), status_code=302)
    path = AVATARS_DIR / fname
    if not path.exists(): raise HTTPException(404)
    return FileResponse(str(path), media_type=_mime(fname, IMAGE_MIME))

# ── Search ─────────────────────────────────────────────────────────────────────

@app.get("/api/search")
def search(request: Request, q: str = ''):
    rate_limit(request, 'search', 120, 60)
    q = q.strip()[:100]
    if not q: return {'tracks': [], 'users': []}
    # Public search only lists artists, never listener accounts.
    return db.search(q, artists_only=True)

# ── Subscription ───────────────────────────────────────────────────────────────

@app.get("/api/subscription/info")
def sub_info():
    return {
        'instructions':         db.get_setting('payment_instructions'),
        'amante_price':         db.get_setting('amante_price'),
        'pro_price':            db.get_setting('pro_price'),
        'premium_price':        db.get_setting('premium_price'),
        'free_download_limit':  db.get_setting('free_download_limit'),
        'paid_download_limit':  db.get_setting('paid_download_limit'),
        'pro_upload_limit':     db.get_setting('pro_upload_limit'),
        'premium_upload_limit': db.get_setting('premium_upload_limit'),
    }

@app.get("/api/subscription/my-request")
def my_sub_request(user=Depends(require_user)):
    return db.get_my_sub_request(user['id'])

@app.post("/api/subscription/request")
async def request_subscription(
    request: Request,
    plan:    str = Form(...),
    note:    str = Form(''),
    receipt: UploadFile = File(...),
    user=Depends(require_user),
):
    rate_limit(request, 'subreq', 6, 3600, str(user['id']))
    note = clean_text(note, 'Nota', 500, multiline=True)
    if plan not in ('amante', 'pro', 'premium'):
        raise HTTPException(400, "Plan inválido")
    if plan in UPLOADER_PLANS and (user.get('account_type') or 'listener') != 'artist':
        raise HTTPException(400, "Los planes Pro y Premium son para cuentas de artista")
    if user['plan'] == plan:
        raise HTTPException(400, f"Ya tienes el plan {plan}")
    ext = Path(receipt.filename or '').suffix.lower()
    if ext not in IMAGE_MIME:
        raise HTTPException(400, "El recibo debe ser una imagen (JPG, PNG o WEBP)")
    fname = f"receipt_{user['id']}_{uuid.uuid4().hex}{ext}"
    receipt_data = sec.sanitize_image(await sec.read_limited(receipt, sec.MAX_IMAGE_BYTES, 'El recibo'), ext)
    # Los recibos llevan datos de pago: se guardan cifrados (solo el admin los ve).
    receipt_data = sec.encrypt_bytes(receipt_data, _secret)
    if storage.enabled():
        storage.put(f'receipts/{fname}', receipt_data, 'application/octet-stream')
    else:
        (RECEIPTS_DIR / fname).write_bytes(receipt_data)
    rid = db.create_sub_request(user['id'], plan, note, fname)
    return {"id": rid, "status": "pending", "plan": plan}

# ── Admin ──────────────────────────────────────────────────────────────────────

class ReviewBody(BaseModel):
    status: str  # 'approved' | 'rejected'
    note: str = ''

class AdminUserUpdate(BaseModel):
    plan: Optional[str] = None
    is_admin: Optional[int] = None
    is_curator: Optional[int] = None

class SettingsBody(BaseModel):
    payment_instructions: Optional[str] = None
    amante_price: Optional[str] = None
    pro_price: Optional[str] = None
    premium_price: Optional[str] = None
    free_download_limit: Optional[str] = None
    paid_download_limit: Optional[str] = None
    pro_upload_limit: Optional[str] = None
    premium_upload_limit: Optional[str] = None
    site_name: Optional[str] = None
    royalty_artist_percent: Optional[str] = None
    royalties_live: Optional[str] = None

@app.get("/api/admin/stats")
def admin_stats(user=Depends(require_admin)):
    return db.get_stats()

@app.get("/api/admin/users")
def admin_users(user=Depends(require_admin)):
    return db.get_all_users()

@app.get("/api/admin/users/{uid}/activity")
def admin_user_activity(uid: int, user=Depends(require_admin)):
    """Ficha de actividad de una cuenta: última conexión, qué escucha y cuándo."""
    u = db.get_user_by_id(uid)
    if not u:
        raise HTTPException(404, "Usuario no encontrado")
    info = {k: u.get(k) for k in ('id', 'username', 'display_name', 'email', 'plan', 'account_type',
                                  'created_at', 'last_seen_at')}
    return {**info, **db.user_activity(uid)}

@app.get("/api/admin/tracks")
def admin_tracks(user=Depends(require_admin)):
    """All songs & videos, for the admin management/delete list."""
    return db.admin_all_tracks()

@app.get("/api/admin/earnings")
def admin_earnings(user=Depends(require_admin)):
    """Per-artist listening credited by each track's split, so collaborations
    are attributed fairly rather than all counting for the uploader."""
    return db.get_earnings_report()

@app.patch("/api/admin/users/{uid}")
def admin_update_user(uid: int, body: AdminUserUpdate, user=Depends(require_admin)):
    kwargs = {}
    if body.plan is not None:
        if body.plan not in PLANS:
            raise HTTPException(400, "Plan inválido")
        kwargs['plan'] = body.plan
        if body.plan in UPLOADER_PLANS:
            kwargs['account_type'] = 'artist'
    if body.is_admin is not None:
        if body.is_admin not in (0, 1):
            raise HTTPException(400, "Valor inválido")
        if uid == user['id'] and body.is_admin == 0:
            raise HTTPException(400, "No puedes quitarte el admin a ti mismo")
        kwargs['is_admin'] = body.is_admin
    if body.is_curator is not None:
        if body.is_curator not in (0, 1):
            raise HTTPException(400, "Valor inválido")
        kwargs['is_curator'] = body.is_curator
    target = db.get_user_by_id(uid)
    if not target:
        raise HTTPException(404, "Usuario no encontrado")
    db.update_user(uid, **kwargs)
    return _safe_user(db.get_user_by_id(uid))   # nunca devolver el hash de la contraseña

class ResetPasswordBody(BaseModel):
    password: Optional[str] = None   # vacío = generar una contraseña temporal

@app.post("/api/admin/users/{uid}/reset-password")
def admin_reset_password(uid: int, body: ResetPasswordBody, user=Depends(require_admin)):
    """Para usuarios que olvidaron su contraseña: el admin pone una nueva (o se
    genera una temporal) y se la pasa al usuario, que luego puede cambiarla en
    'Mi cuenta'. La contraseña anterior deja de funcionar."""
    target = db.get_user_by_id(uid)
    if not target:
        raise HTTPException(404, "Usuario no encontrado")
    pw = (body.password or '').strip()
    if not pw:
        import secrets as _secrets
        alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'   # sin letras/números que se confunden
        pw = ''.join(_secrets.choice(alphabet) for _ in range(8))
    sec.valid_password(pw)
    db.update_password(uid, hash_password(pw))   # también cierra sus sesiones abiertas
    return {"ok": True, "username": target['username'], "email": target['email'], "password": pw}

@app.get("/api/admin/subscriptions")
def admin_sub_requests(status: str = '', user=Depends(require_admin)):
    return db.get_sub_requests(status or None)

@app.get("/api/admin/subscriptions/{req_id}/receipt")
def admin_sub_receipt(req_id: int, user=Depends(require_admin)):
    req = db.get_sub_request(req_id)
    if not req or not req.get('receipt'):
        raise HTTPException(404, "Esta solicitud no tiene recibo")
    # Proxied (not redirected) so the admin's authenticated blob-fetch keeps
    # working; receipts are tiny and admin-only, so bandwidth is negligible.
    if storage.enabled():
        try:
            data = storage.get_bytes(f"receipts/{req['receipt']}")
        except Exception:
            raise HTTPException(404, "Archivo de recibo no encontrado")
    else:
        path = RECEIPTS_DIR / sec.safe_filename(req['receipt'])
        if not path.exists():
            raise HTTPException(404, "Archivo de recibo no encontrado")
        data = path.read_bytes()
    return Response(content=sec.decrypt_bytes(data, _secret), media_type=_mime(req['receipt'], IMAGE_MIME),
                    headers={'Cache-Control': 'no-store'})

@app.post("/api/admin/subscriptions/{req_id}/review")
def admin_review_sub(req_id: int, body: ReviewBody, user=Depends(require_admin)):
    if body.status not in ('approved', 'rejected'):
        raise HTTPException(400, "Estado inválido")
    db.review_sub_request(req_id, user['id'], body.status, clean_text(body.note, 'Nota', 500, multiline=True))
    return {"ok": True}

@app.get("/api/admin/claims")
def admin_claims(user=Depends(require_admin)):
    return db.get_account_claims()

class ClaimReviewBody(BaseModel):
    action: str   # 'approve' | 'reject'

@app.post("/api/admin/claims/{cid}/review")
def admin_review_claim(cid: int, body: ClaimReviewBody, user=Depends(require_admin)):
    c = db.get_account_claim(cid)
    if not c:
        raise HTTPException(404, "Reclamo no encontrado")
    if body.action == 'approve':
        # Grant the account: set a temp password (and the claimant's email, if
        # free) so the admin can hand over access; the artist then changes both.
        temp = uuid.uuid4().hex[:8]
        db.update_password(c['artist_user_id'], hash_password(temp))
        new_email = (c.get('email') or '').strip()
        email_set = bool(new_email) and not db.get_user_by_email(new_email)
        if email_set:
            db.update_email(c['artist_user_id'], new_email)
        db.review_account_claim(cid, user['id'], 'approved')
        artist = db.get_user_by_id(c['artist_user_id'])
        return {"ok": True, "temp_password": temp,
                "username": artist['username'],
                "email": (new_email if email_set else artist.get('email', '')),
                "email_set": email_set}
    db.review_account_claim(cid, user['id'], 'rejected')
    return {"ok": True}

@app.get("/api/admin/settings")
def admin_get_settings(user=Depends(require_admin)):
    return db.get_all_settings()

@app.patch("/api/admin/settings")
def admin_update_settings(body: SettingsBody, user=Depends(require_admin)):
    for key in ('payment_instructions', 'amante_price', 'pro_price', 'premium_price',
                'free_download_limit', 'paid_download_limit',
                'pro_upload_limit', 'premium_upload_limit', 'site_name',
                'royalty_artist_percent', 'royalties_live'):
        val = getattr(body, key)
        if val is not None:
            db.set_setting(key, clean_text(val, key, 4000, multiline=True))
    return db.get_all_settings()

# ── Android app download ────────────────────────────────────────────────────────

APK_PATH = BASE_DIR.parent / 'dist-apk' / 'EG-Music.apk'

@app.get("/download/eg-music.apk")
def download_apk():
    # With R2, the APK lives there too (so it works on hosts without local disk).
    if storage.enabled() and storage.exists('apk/EG-Music.apk'):
        return RedirectResponse(storage.presigned_url('apk/EG-Music.apk'), status_code=302)
    if not APK_PATH.exists():
        raise HTTPException(404, "APK no disponible")
    return FileResponse(
        str(APK_PATH),
        media_type='application/vnd.android.package-archive',
        filename='EG-Music.apk',
    )

# ── Social link previews ────────────────────────────────────────────────────────
# WhatsApp/Facebook/X crawlers don't run JavaScript, so a shared link to this
# SPA would preview as a generic page. These routes serve the same index.html
# with per-song Open Graph tags injected, which is what makes a shared song show
# its artwork and title in a chat or a status.

SHARE_BASE = "https://eg-music.egmusicapp.workers.dev"   # permanent, survives tunnel rotation
_STATIC = (BASE_DIR.parent / 'frontend' / 'dist').resolve()

def _spa_with_og(track_id: int):
    index = _STATIC / 'index.html'
    if not index.is_file():
        raise HTTPException(404)
    html = index.read_text(encoding='utf-8')
    t = db.get_track(track_id)
    if t and _visible(t, None):
        who   = t.get('display_name') or t.get('username') or t.get('artist') or ''
        kind  = 'video' if t.get('media_type') == 'video' else 'canción'
        title = f"{t['title']} — {who}"
        desc  = f"Escucha esta {kind} en EG Music · Tu música. Tu tierra. Tu orgullo."
        tags = (
            f'<meta property="og:type" content="music.song" />'
            f'<meta property="og:site_name" content="EG Music" />'
            f'<meta property="og:title" content="{escape(title, quote=True)}" />'
            f'<meta property="og:description" content="{escape(desc, quote=True)}" />'
            f'<meta property="og:image" content="{SHARE_BASE}/img/{track_id}" />'
            f'<meta property="og:url" content="{SHARE_BASE}/s/{track_id}" />'
            f'<meta name="twitter:card" content="summary_large_image" />'
            f'<meta name="twitter:title" content="{escape(title, quote=True)}" />'
            f'<meta name="twitter:description" content="{escape(desc, quote=True)}" />'
            f'<meta name="twitter:image" content="{SHARE_BASE}/img/{track_id}" />'
        )
        html = html.replace('</head>', tags + '</head>', 1)
    return HTMLResponse(html, headers={'Cache-Control': 'no-cache'})

@app.get("/track/{track_id}")
def share_page_track(track_id: int):
    return _spa_with_og(track_id)

@app.get("/watch/{track_id}")
def share_page_watch(track_id: int):
    return _spa_with_og(track_id)

# ── PWA: service worker + manifest served from the root with correct types ─────

@app.get("/sw.js")
def service_worker():
    f = _STATIC / "sw.js"
    if not f.is_file():
        raise HTTPException(404)
    return FileResponse(str(f), media_type="text/javascript",
                        headers={"Cache-Control": "no-cache", "Service-Worker-Allowed": "/"})

@app.get("/manifest.webmanifest")
def web_manifest():
    f = _STATIC / "manifest.webmanifest"
    if not f.is_file():
        raise HTTPException(404)
    return FileResponse(str(f), media_type="application/manifest+json",
                        headers={"Cache-Control": "no-cache"})

# ── Static frontend (SPA) ──────────────────────────────────────────────────────

if _STATIC.is_dir():
    @app.get("/{full_path:path}")
    def spa(full_path: str):
        # API routes are matched first; anything unknown under /api is a real 404
        if full_path.startswith("api/"):
            raise HTTPException(404)
        file = (_STATIC / full_path).resolve()
        # Path-traversal guard: never serve anything outside dist/
        if full_path and file.is_file() and file.is_relative_to(_STATIC):
            # Hashed assets never change -> cache forever; everything else revalidates
            cache = 'public, max-age=31536000, immutable' if full_path.startswith('assets/') else 'no-cache'
            return FileResponse(str(file), headers={'Cache-Control': cache})
        # A missing hashed asset means the browser has a stale index.html:
        # fail fast with 404 instead of feeding HTML to the module loader
        if full_path.startswith('assets/'):
            raise HTTPException(404)
        # Any other route (/register, /subscribe, ...) -> the React app
        return FileResponse(str(_STATIC / "index.html"), headers={'Cache-Control': 'no-cache'})

# ── Entry ──────────────────────────────────────────────────────────────────────

def _wait_for_server(host, port, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.3)
    return False

if __name__ == "__main__":
    PORT = 8001
    # pythonw.exe (used by start.bat, no console window) leaves sys.stdout/stderr
    # as None. uvicorn's logging then crashes the moment it tries to log a line,
    # silently killing the server thread before it ever binds the port -> the
    # browser opens to nothing and shows "page not found".
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w")
    t = threading.Thread(target=lambda: uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info"), daemon=True)
    t.start()
    # Wait for the server to actually accept connections (fixed 1.2s sleep was
    # too short on slow first-run startups, e.g. antivirus scanning venv exe),
    # which opened the browser before the server was ready -> "page not found".
    _wait_for_server("127.0.0.1", PORT)
    try:
        import webview
        webview.create_window("EG Music", f"http://127.0.0.1:{PORT}", width=1280, height=840)
        webview.start()
    except ImportError:
        import webbrowser
        webbrowser.open(f"http://127.0.0.1:{PORT}")
        print(f"\n  EG Music corriendo en: http://127.0.0.1:{PORT}\n  En la red local usa: http://[TU-IP]:{PORT}\n")
        try:
            while True: time.sleep(1)
        except KeyboardInterrupt:
            pass
