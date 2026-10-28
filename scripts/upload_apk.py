"""Sube dist-apk/EG-Music.apk a Cloudflare R2 (apk/EG-Music.apk), que es de
donde la web publica (Render) sirve la descarga de la app.
Lee las claves R2_* de backend/.env. Uso: venv\\Scripts\\python scripts\\upload_apk.py"""
import os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
env = ROOT / 'backend' / '.env'
if env.exists():
    for line in env.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

sys.path.insert(0, str(ROOT / 'backend'))
import storage  # noqa: E402

apk = ROOT / 'dist-apk' / 'EG-Music.apk'
if not apk.exists():
    sys.exit(f'No existe {apk}')
if not storage.enabled():
    sys.exit('Faltan las claves R2_* en backend/.env')
storage.put_file('apk/EG-Music.apk', str(apk), 'application/vnd.android.package-archive')
print(f'OK: subido {apk.stat().st_size / 1e6:.1f} MB a R2 (apk/EG-Music.apk)')
