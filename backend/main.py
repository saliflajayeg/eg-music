import os, sys, uuid, threading, time, socket
from html import escape
from pathlib import Path
from typing import Optional

from fastapi import (FastAPI, HTTPException, Request, Depends, UploadFile, File, Form)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse, FileResponse, HTMLResponse
from pydantic import BaseModel
import uvicorn

from database import Database
from auth import (
    hash_password, verify_password, create_token,
    get_current_user, require_user, require_uploader, require_admin
)

# ── Init ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="EG Music")
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

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

AUDIO_MIME = {
    '.mp3':'audio/mpeg', '.flac':'audio/flac', '.wav':'audio/wav',
    '.ogg':'audio/ogg',  '.m4a':'audio/mp4',  '.aac':'audio/aac',
}
VIDEO_MIME = {
    '.mp4':'video/mp4', '.webm':'video/webm', '.mov':'video/quicktime',
}
MEDIA_MIME = {**AUDIO_MIME, **VIDEO_MIME}
IMAGE_MIME = {'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'}

def _mime(path, table):
    return table.get(Path(path).suffix.lower(), 'application/octet-stream')

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

class LoginBody(BaseModel):
    email: str
    password: str

@app.post("/api/auth/register", status_code=201)
def register(body: RegisterBody):
    body.username = body.username.strip().lower()
    body.email    = body.email.strip().lower()
    if len(body.username) < 3:
        raise HTTPException(400, "El nombre de usuario debe tener al menos 3 caracteres")
    if db.get_user_by_username(body.username):
        raise HTTPException(409, "Ese nombre de usuario ya existe")
    if db.get_user_by_email(body.email):
        raise HTTPException(409, "Ese email ya está registrado")
    if len(body.password) < 6:
        raise HTTPException(400, "La contraseña debe tener al menos 6 caracteres")
    uid = db.create_user(body.username, body.email, hash_password(body.password), body.display_name)
    # First user becomes admin with the top plan
    if uid == 1:
        db.update_user(uid, is_admin=1, plan='premium')
    user = db.get_user_by_id(uid)
    return {"token": create_token(uid), "user": _safe_user(user)}

@app.post("/api/auth/login")
def login(body: LoginBody):
    user = db.get_user_by_email(body.email.strip().lower())
    if not user or not verify_password(body.password, user['password_hash']):
        raise HTTPException(401, "Email o contraseña incorrectos")
    return {"token": create_token(user['id']), "user": _safe_user(user)}

@app.get("/api/auth/me")
def me(user=Depends(require_user)):
    return _safe_user(user)

class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str

@app.post("/api/auth/change-password")
def change_password(body: ChangePasswordBody, user=Depends(require_user)):
    if not verify_password(body.current_password, user['password_hash']):
        raise HTTPException(401, "La contraseña actual no es correcta")
    if len(body.new_password) < 6:
        raise HTTPException(400, "La nueva contraseña debe tener al menos 6 caracteres")
    db.update_password(user['id'], hash_password(body.new_password))
    return {"ok": True}

def _safe_user(u):
    d = {k: u[k] for k in ('id','username','email','display_name','bio','avatar','plan','is_admin','created_at')}
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
    if body.display_name is not None: kwargs['display_name'] = body.display_name.strip()
    if body.bio is not None:          kwargs['bio'] = body.bio.strip()
    db.update_user(user['id'], **kwargs)
    return _safe_user(db.get_user_by_id(user['id']))

@app.post("/api/users/me/avatar")
async def upload_avatar(file: UploadFile = File(...), user=Depends(require_user)):
    ext = Path(file.filename).suffix.lower()
    if ext not in IMAGE_MIME:
        raise HTTPException(400, "Formato de imagen no soportado")
    fname = f"avatar_{user['id']}_{uuid.uuid4().hex[:8]}{ext}"
    fpath = AVATARS_DIR / fname
    content = await file.read()
    fpath.write_bytes(content)
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
def get_feed(offset: int = 0, limit: int = 40, current=Depends(get_current_user)):
    return db.get_feed(viewer_id=current['id'] if current else None, limit=min(max(limit, 1), 100), offset=offset)

@app.get("/api/tracks/following")
def get_following_feed(user=Depends(require_user)):
    return db.get_following_feed(user['id'])

@app.get("/api/tracks/liked")
def get_liked(user=Depends(require_user)):
    return db.get_liked_tracks(user['id'])

@app.get("/api/tracks/{track_id}")
def get_track(track_id: int, current=Depends(get_current_user)):
    t = db.get_track(track_id, viewer_id=current['id'] if current else None)
    if not t: raise HTTPException(404)
    return t

@app.post("/api/tracks", status_code=201)
async def upload_track(
    title:       str  = Form(...),
    artist:      str  = Form(...),
    album:       str  = Form(''),
    genre:       str  = Form(''),
    description: str  = Form(''),
    audio:       UploadFile = File(...),
    cover:       Optional[UploadFile] = File(None),
    user=Depends(require_uploader),
):
    ext = Path(audio.filename).suffix.lower()
    if ext in AUDIO_MIME:
        media_type = 'audio'
    elif ext in VIDEO_MIME:
        media_type = 'video'
    else:
        raise HTTPException(400, f"Formato no soportado: {ext}")

    if not user['is_admin']:
        caps = _plan_caps(user)
        limit = caps['upload_limit']
        if limit is not None and caps['upload_count'] >= limit:
            nxt = 'Premium' if user['plan'] == 'pro' else 'un plan superior'
            raise HTTPException(403, f"Has alcanzado tu límite de {limit} subidas este mes. Mejora a {nxt} para subir más.")

    audio_fname = f"track_{user['id']}_{uuid.uuid4().hex}{ext}"
    audio_data  = await audio.read()
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

    # Cover
    cover_fname = ''
    if cover and cover.filename:
        cext = Path(cover.filename).suffix.lower()
        if cext in IMAGE_MIME:
            cover_fname = f"cover_{user['id']}_{uuid.uuid4().hex[:8]}{cext}"
            (COVERS_DIR / cover_fname).write_bytes(await cover.read())

    tid = db.create_track(
        user['id'], title.strip(), artist.strip(), album.strip(),
        genre.strip(), description.strip(), audio_fname, cover_fname, duration,
        media_type
    )
    return db.get_track(tid, viewer_id=user['id'])

@app.delete("/api/tracks/{track_id}")
def delete_track(track_id: int, user=Depends(require_user)):
    t = db.get_track(track_id)
    if not t: raise HTTPException(404)
    if t['user_id'] != user['id'] and not user['is_admin']:
        raise HTTPException(403)
    files = db.delete_track(track_id)
    if files:
        for key, folder in [('filename', TRACKS_DIR), ('cover', COVERS_DIR)]:
            if files.get(key):
                try: (folder / files[key]).unlink(missing_ok=True)
                except Exception: pass
    return {"ok": True}

@app.get("/api/tracks/{track_id}/stream")
async def stream_track(track_id: int, request: Request, dl: int = 0):
    t = db.get_track(track_id)
    if not t: raise HTTPException(404)
    path = TRACKS_DIR / t['filename']
    if not path.exists(): raise HTTPException(404, "Archivo no encontrado")
    # dl=1 => saving for offline; don't count that as a play. The play is
    # counted later, when the downloaded file is actually played (via sync).
    if not dl:
        db.increment_plays(track_id)
    return _stream(path, request, _mime(t['filename'], MEDIA_MIME))

@app.get("/api/tracks/{track_id}/cover")
def track_cover(track_id: int):
    t = db.get_track(track_id)
    if not t or not t.get('cover'): raise HTTPException(404)
    path = COVERS_DIR / t['cover']
    if not path.exists(): raise HTTPException(404)
    return FileResponse(str(path), media_type=_mime(t['cover'], IMAGE_MIME))

@app.get("/api/tracks/{track_id}/share-image")
def track_share_image(track_id: int):
    """Artwork for social link previews. Always returns an image — falls back
    to the app icon — because a preview with no image looks broken.

    Served as a small cached JPEG: full-size covers are megabytes, and the
    tunnel is slow enough that WhatsApp's crawler gives up before fetching one,
    which silently kills the preview."""
    t = db.get_track(track_id)
    src = None
    if t and t.get('cover'):
        p = COVERS_DIR / t['cover']
        if p.exists():
            src = p
    if src is None:
        src = BASE_DIR.parent / 'frontend' / 'assets' / 'icon-only.png'
    if not src.exists():
        raise HTTPException(404)

    cache = SHARE_IMG_DIR / f"share_{track_id}.jpg"
    if not cache.exists() or cache.stat().st_mtime < src.stat().st_mtime:
        try:
            from PIL import Image
            im = Image.open(src).convert('RGB')
            im.thumbnail((600, 600), Image.LANCZOS)
            im.save(str(cache), 'JPEG', quality=82, optimize=True)
        except Exception:
            return FileResponse(str(src))   # resizing failed: send the original
    return FileResponse(str(cache), media_type='image/jpeg')

@app.post("/api/tracks/{track_id}/like")
def like_track(track_id: int, user=Depends(require_user)):
    liked, count = db.toggle_like(user['id'], track_id)
    return {"liked": liked, "like_count": count}

# ── Offline play/view sync ──────────────────────────────────────────────────────

class PlayEvent(BaseModel):
    track_id: int
    client_event_id: str
    played_at: Optional[str] = None

class SyncPlaysBody(BaseModel):
    events: list[PlayEvent]

@app.post("/api/sync/plays")
def sync_plays(body: SyncPlaysBody, user=Depends(require_user)):
    # Events played offline (from downloaded files) that the server never saw.
    # Idempotent: dedupes on client_event_id so retries don't double-count.
    applied = db.record_play_events(user['id'], [e.model_dump() for e in body.events])
    return {"applied": applied, "received": len(body.events)}

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
    path = AVATARS_DIR / fname
    if not path.exists(): raise HTTPException(404)
    return FileResponse(str(path), media_type=_mime(fname, IMAGE_MIME))

# ── Search ─────────────────────────────────────────────────────────────────────

@app.get("/api/search")
def search(q: str = ''):
    if not q.strip(): return {'tracks': [], 'users': []}
    return db.search(q.strip())

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
    plan:    str = Form(...),
    note:    str = Form(''),
    receipt: UploadFile = File(...),
    user=Depends(require_user),
):
    if plan not in ('amante', 'pro', 'premium'):
        raise HTTPException(400, "Plan inválido")
    if user['plan'] == plan:
        raise HTTPException(400, f"Ya tienes el plan {plan}")
    ext = Path(receipt.filename or '').suffix.lower()
    if ext not in IMAGE_MIME:
        raise HTTPException(400, "El recibo debe ser una imagen (JPG, PNG o WEBP)")
    fname = f"receipt_{user['id']}_{uuid.uuid4().hex}{ext}"
    (RECEIPTS_DIR / fname).write_bytes(await receipt.read())
    rid = db.create_sub_request(user['id'], plan, note.strip(), fname)
    return {"id": rid, "status": "pending", "plan": plan}

# ── Admin ──────────────────────────────────────────────────────────────────────

class ReviewBody(BaseModel):
    status: str  # 'approved' | 'rejected'
    note: str = ''

class AdminUserUpdate(BaseModel):
    plan: Optional[str] = None
    is_admin: Optional[int] = None

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

@app.get("/api/admin/stats")
def admin_stats(user=Depends(require_admin)):
    return db.get_stats()

@app.get("/api/admin/users")
def admin_users(user=Depends(require_admin)):
    return db.get_all_users()

@app.patch("/api/admin/users/{uid}")
def admin_update_user(uid: int, body: AdminUserUpdate, user=Depends(require_admin)):
    kwargs = {}
    if body.plan is not None:
        if body.plan not in PLANS:
            raise HTTPException(400, "Plan inválido")
        kwargs['plan'] = body.plan
    if body.is_admin is not None: kwargs['is_admin'] = body.is_admin
    db.update_user(uid, **kwargs)
    return db.get_user_by_id(uid)

@app.get("/api/admin/subscriptions")
def admin_sub_requests(status: str = '', user=Depends(require_admin)):
    return db.get_sub_requests(status or None)

@app.get("/api/admin/subscriptions/{req_id}/receipt")
def admin_sub_receipt(req_id: int, user=Depends(require_admin)):
    req = db.get_sub_request(req_id)
    if not req or not req.get('receipt'):
        raise HTTPException(404, "Esta solicitud no tiene recibo")
    path = RECEIPTS_DIR / req['receipt']
    if not path.exists():
        raise HTTPException(404, "Archivo de recibo no encontrado")
    return FileResponse(str(path), media_type=_mime(req['receipt'], IMAGE_MIME))

@app.post("/api/admin/subscriptions/{req_id}/review")
def admin_review_sub(req_id: int, body: ReviewBody, user=Depends(require_admin)):
    if body.status not in ('approved', 'rejected'):
        raise HTTPException(400, "Estado inválido")
    db.review_sub_request(req_id, user['id'], body.status, body.note)
    return {"ok": True}

@app.get("/api/admin/settings")
def admin_get_settings(user=Depends(require_admin)):
    return db.get_all_settings()

@app.patch("/api/admin/settings")
def admin_update_settings(body: SettingsBody, user=Depends(require_admin)):
    for key in ('payment_instructions', 'amante_price', 'pro_price', 'premium_price',
                'free_download_limit', 'paid_download_limit',
                'pro_upload_limit', 'premium_upload_limit', 'site_name'):
        val = getattr(body, key)
        if val is not None:
            db.set_setting(key, val)
    return db.get_all_settings()

# ── Android app download ────────────────────────────────────────────────────────

APK_PATH = BASE_DIR.parent / 'dist-apk' / 'EG-Music.apk'

@app.get("/download/eg-music.apk")
def download_apk():
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

SHARE_BASE = "https://eg-music.xalif-lajay-eg.workers.dev"   # permanent, survives tunnel rotation
_STATIC = (BASE_DIR.parent / 'frontend' / 'dist').resolve()

def _spa_with_og(track_id: int):
    index = _STATIC / 'index.html'
    if not index.is_file():
        raise HTTPException(404)
    html = index.read_text(encoding='utf-8')
    t = db.get_track(track_id)
    if t:
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
