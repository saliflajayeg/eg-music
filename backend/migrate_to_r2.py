"""One-off: upload existing local uploads/ to Cloudflare R2. Idempotent
(skips objects already present with the same size). Run on egbox with the R2_*
env vars set. Safe to re-run."""
import os
import boto3
from botocore.config import Config
from pathlib import Path

acct = os.environ['R2_ACCOUNT_ID']
s3 = boto3.client('s3',
    endpoint_url=f'https://{acct}.r2.cloudflarestorage.com',
    aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
    aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
    config=Config(signature_version='s3v4', region_name='auto'))
bucket = os.environ.get('R2_BUCKET', 'egmusic')
base = Path(os.environ.get('UPLOADS_DIR', '/srv/soundup/backend/uploads'))

CT = {'.mp3':'audio/mpeg','.m4a':'audio/mp4','.wav':'audio/wav','.ogg':'audio/ogg','.flac':'audio/flac',
      '.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.mkv':'video/x-matroska','.m4v':'video/x-m4v',
      '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'}
FOLDERS = ['tracks', 'covers', 'avatars', 'receipts']   # 'share' is regenerated, skip

total = skipped = done = failed = 0
for folder in FOLDERS:
    d = base / folder
    if not d.exists():
        continue
    for f in sorted(d.iterdir()):
        if not f.is_file():
            continue
        key = f'{folder}/{f.name}'
        total += 1
        size = f.stat().st_size
        try:
            h = s3.head_object(Bucket=bucket, Key=key)
            if h['ContentLength'] == size:
                skipped += 1
                continue
        except Exception:
            pass
        ct = CT.get(f.suffix.lower(), 'application/octet-stream')
        try:
            s3.upload_file(str(f), bucket, key, ExtraArgs={'ContentType': ct})
            done += 1
            print(f'  ↑ {key}  ({size//1024} KB)', flush=True)
        except Exception as e:
            failed += 1
            print(f'  ✗ {key}: {e}', flush=True)

print(f'DONE: uploaded={done}, already_present={skipped}, failed={failed}, total={total}')
