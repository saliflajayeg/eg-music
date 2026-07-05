import os
import secrets
import bcrypt
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

def _load_secret_key():
    """SECRET_KEY env var wins; otherwise generate a random key once and reuse it.

    Never fall back to a hardcoded default — the code is public, so a known
    default would let anyone forge login tokens.
    """
    key = os.environ.get("SECRET_KEY")
    if key:
        return key
    key_file = Path(__file__).parent / "secret_key.txt"
    if key_file.exists():
        return key_file.read_text().strip()
    key = secrets.token_urlsafe(48)
    key_file.write_text(key)
    return key

SECRET_KEY = _load_secret_key()
ALGORITHM  = "HS256"
TOKEN_EXPIRE_DAYS = 30

bearer = HTTPBearer(auto_error=False)

def hash_password(plain: str) -> str:
    pw = plain.encode("utf-8")[:72]
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8")[:72], hashed.encode("utf-8"))
    except ValueError:
        return False

def create_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(days=TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": str(user_id), "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> Optional[int]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return None

# ── FastAPI dependencies ───────────────────────────────────────────────────────

def _get_db():
    from database import Database
    return Database()

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
):
    if not credentials:
        return None
    uid = decode_token(credentials.credentials)
    if uid is None:
        return None
    db = _get_db()
    return db.get_user_by_id(uid)

def require_user(user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Inicia sesión primero")
    return user

def require_uploader(user=Depends(require_user)):
    if user['plan'] not in ('pro', 'legend') and not user['is_admin']:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Necesitas el plan Pro o Legend para subir música")
    return user

def require_admin(user=Depends(require_user)):
    if not user['is_admin']:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acceso solo para administradores")
    return user
