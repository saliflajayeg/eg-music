import os, sys, uuid, threading, time
from pathlib import Path
from typing import Optional

from fastapi import (FastAPI, HTTPException, Request, Depends, UploadFile, File, Form)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse, FileResponse
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

PLANS = ('free', 'pro', 'legend')

BASE_DIR    = Path(__file__).parent
UPLOADS_DIR = BASE_DIR / "uploads"
TRACKS_DIR  = UPLOADS_DIR / "tracks"
COVERS_DIR  = UPLOADS_DIR / "covers"
AVATARS_DIR = UPLOADS_DIR / "avatars"

for d in (TRACKS_DIR, COVERS_DIR, AVATARS_DIR):
    d.mkdir(parents=True, exist_ok=True)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

AUDIO_MIME = {
    '.mp3':'audio/mpeg', '.flac':'audio/flac', '.wav':'audio/wav',
    '.ogg':'audio/ogg',  '.m4a':'audio/mp4',  '.aac':'audio/aac',
}
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
        db.update_user(uid, is_admin=1, plan='legend')
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
    d['upload_count'] = db.count_user_tracks(u['id'])
    d['upload_limit'] = int(db.get_setting('pro_upload_limit') or 15) if u['plan'] == 'pro' else None
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
def get_feed(offset: int = 0, current=Depends(get_current_user)):
    return db.get_feed(viewer_id=current['id'] if current else None, limit=40, offset=offset)

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
    if ext not in AUDIO_MIME:
        raise HTTPException(400, f"Formato de audio no soportado: {ext}")

    if user['plan'] == 'pro' and not user['is_admin']:
        limit = int(db.get_setting('pro_upload_limit') or 15)
        if db.count_user_tracks(user['id']) >= limit:
            raise HTTPException(403, f"Has alcanzado el límite de {limit} canciones de tu plan Pro. Mejora a Legend para subidas ilimitadas.")

    audio_fname = f"track_{user['id']}_{uuid.uuid4().hex}{ext}"
    audio_data  = await audio.read()
    (TRACKS_DIR / audio_fname).write_bytes(audio_data)

    # Duration via mutagen
    duration = 0.0
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
        genre.strip(), description.strip(), audio_fname, cover_fname, duration
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
async def stream_track(track_id: int, request: Request):
    t = db.get_track(track_id)
    if not t: raise HTTPException(404)
    path = TRACKS_DIR / t['filename']
    if not path.exists(): raise HTTPException(404, "Archivo no encontrado")
    db.increment_plays(track_id)
    return _stream(path, request, _mime(t['filename'], AUDIO_MIME))

@app.get("/api/tracks/{track_id}/cover")
def track_cover(track_id: int):
    t = db.get_track(track_id)
    if not t or not t.get('cover'): raise HTTPException(404)
    path = COVERS_DIR / t['cover']
    if not path.exists(): raise HTTPException(404)
    return FileResponse(str(path), media_type=_mime(t['cover'], IMAGE_MIME))

@app.post("/api/tracks/{track_id}/like")
def like_track(track_id: int, user=Depends(require_user)):
    liked, count = db.toggle_like(user['id'], track_id)
    return {"liked": liked, "like_count": count}

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

class SubRequestBody(BaseModel):
    plan: str
    note: str = ''

@app.get("/api/subscription/info")
def sub_info():
    return {
        'instructions':     db.get_setting('payment_instructions'),
        'pro_price':        db.get_setting('pro_price'),
        'legend_price':     db.get_setting('legend_price'),
        'pro_upload_limit': db.get_setting('pro_upload_limit'),
    }

@app.get("/api/subscription/my-request")
def my_sub_request(user=Depends(require_user)):
    return db.get_my_sub_request(user['id'])

@app.post("/api/subscription/request")
def request_subscription(body: SubRequestBody, user=Depends(require_user)):
    if body.plan not in ('pro', 'legend'):
        raise HTTPException(400, "Plan inválido")
    if user['plan'] == body.plan:
        raise HTTPException(400, f"Ya tienes el plan {body.plan}")
    rid = db.create_sub_request(user['id'], body.plan, body.note)
    return {"id": rid, "status": "pending", "plan": body.plan}

# ── Admin ──────────────────────────────────────────────────────────────────────

class ReviewBody(BaseModel):
    status: str  # 'approved' | 'rejected'
    note: str = ''

class AdminUserUpdate(BaseModel):
    plan: Optional[str] = None
    is_admin: Optional[int] = None

class SettingsBody(BaseModel):
    payment_instructions: Optional[str] = None
    pro_price: Optional[str] = None
    legend_price: Optional[str] = None
    pro_upload_limit: Optional[str] = None
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
    if body.payment_instructions is not None:
        db.set_setting('payment_instructions', body.payment_instructions)
    if body.pro_price is not None:
        db.set_setting('pro_price', body.pro_price)
    if body.legend_price is not None:
        db.set_setting('legend_price', body.legend_price)
    if body.pro_upload_limit is not None:
        db.set_setting('pro_upload_limit', body.pro_upload_limit)
    if body.site_name is not None:
        db.set_setting('site_name', body.site_name)
    return db.get_all_settings()

# ── Static frontend (SPA) ──────────────────────────────────────────────────────

_STATIC = (BASE_DIR.parent / 'frontend' / 'dist').resolve()
if _STATIC.is_dir():
    @app.get("/{full_path:path}")
    def spa(full_path: str):
        # API routes are matched first; anything unknown under /api is a real 404
        if full_path.startswith("api/"):
            raise HTTPException(404)
        file = (_STATIC / full_path).resolve()
        # Path-traversal guard: never serve anything outside dist/
        if full_path and file.is_file() and file.is_relative_to(_STATIC):
            return FileResponse(str(file))
        # Any other route (/register, /subscribe, ...) -> the React app
        return FileResponse(str(_STATIC / "index.html"))

# ── Entry ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    PORT = 8001
    t = threading.Thread(target=lambda: uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info"), daemon=True)
    t.start()
    time.sleep(1.2)
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
