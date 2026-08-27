"""Cloudflare R2 (S3-compatible) object storage.

When R2_* env vars are set, media (audio, video, covers, avatars, receipts)
lives in R2 instead of on local disk, and is served by redirecting clients to
short-lived presigned URLs — so streaming bandwidth never touches this server
(R2 egress is free). Without those env vars every function is inert and the app
keeps serving files from local disk exactly as before.
"""
import os
import time
import threading

_ACCOUNT = os.environ.get('R2_ACCOUNT_ID', '')
_KEY     = os.environ.get('R2_ACCESS_KEY_ID', '')
_SECRET  = os.environ.get('R2_SECRET_ACCESS_KEY', '')
_BUCKET  = os.environ.get('R2_BUCKET', 'egmusic')

_client = None
_client_lock = threading.Lock()


def enabled():
    return bool(_ACCOUNT and _KEY and _SECRET and _BUCKET)


def _s3():
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                import boto3
                from botocore.config import Config
                _client = boto3.client(
                    's3',
                    endpoint_url=f'https://{_ACCOUNT}.r2.cloudflarestorage.com',
                    aws_access_key_id=_KEY,
                    aws_secret_access_key=_SECRET,
                    config=Config(signature_version='s3v4', region_name='auto',
                                  retries={'max_attempts': 3}),
                )
    return _client


def put(key, data, content_type=None):
    kw = {'Bucket': _BUCKET, 'Key': key, 'Body': data}
    if content_type:
        kw['ContentType'] = content_type
    _s3().put_object(**kw)


def put_file(key, path, content_type=None):
    with open(path, 'rb') as f:
        put(key, f.read(), content_type)


def get_bytes(key):
    return _s3().get_object(Bucket=_BUCKET, Key=key)['Body'].read()


def exists(key):
    try:
        _s3().head_object(Bucket=_BUCKET, Key=key)
        return True
    except Exception:
        return False


def delete(key):
    try:
        _s3().delete_object(Bucket=_BUCKET, Key=key)
    except Exception:
        pass


# Presigned GET URLs, cached so repeated requests for the same object return the
# SAME url until it's close to expiry — which lets browsers cache images instead
# of re-fetching a new signed url every render.
_TTL = 6 * 3600
_url_cache = {}
_url_lock = threading.Lock()


def presigned_url(key):
    now = time.time()
    with _url_lock:
        cached = _url_cache.get(key)
        if cached and cached[1] - now > 900:   # still >15 min of validity
            return cached[0]
    url = _s3().generate_presigned_url('get_object',
                                       Params={'Bucket': _BUCKET, 'Key': key},
                                       ExpiresIn=_TTL)
    with _url_lock:
        _url_cache[key] = (url, now + _TTL)
    return url
