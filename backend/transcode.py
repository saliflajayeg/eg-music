"""Background 360p 'data saver' rendition generator for videos.

Uploads stay fast: the original file is saved and served immediately, while a
single lower-quality 360p copy is produced off the request path by one worker
thread. Transcoding is deliberately serial (one ffmpeg at a time) and, on the
weak shared CPU of the hosting box, runs at low priority so the app stays
responsive.

Works in both storage modes:
  * R2 (production): the original is pulled from R2 to a temp file, encoded,
    and the 360p copy is uploaded back to R2 under tracks/sd_<name>.mp4.
  * local disk (dev): the copy is written next to the original.

The player picks original vs 360p based on the viewer's connection speed
(see connectionPrefersSd() in MediaPlayer.jsx).
"""
import os
import shutil
import subprocess
import tempfile
import threading
import queue
from pathlib import Path

import storage

_q = queue.Queue()
_started = False


def ffmpeg_available():
    return shutil.which('ffmpeg') is not None


def _cmd(src, out):
    base = ['ffmpeg', '-y', '-i', str(src),
            # never upscale: cap height at 360, keep aspect, width divisible by 2
            '-vf', "scale=-2:'min(360,ih)'",
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30',
            '-maxrate', '600k', '-bufsize', '1200k',
            '-c:a', 'aac', '-b:a', '96k',
            '-movflags', '+faststart',      # progressive streaming (moov up front)
            '-f', 'mp4',                    # name the muxer explicitly (temp names vary)
            str(out)]
    # Keep the app responsive on the weak CPU.
    if os.name == 'posix' and shutil.which('nice'):
        base = ['nice', '-n', '19'] + base
    return base


def _encode(src, out):
    """Run ffmpeg; return True only on a clean, non-empty output."""
    proc = subprocess.run(_cmd(src, out),
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return proc.returncode == 0 and out.exists() and out.stat().st_size > 0


def _process_r2(db, track_id, filename, out_name):
    tmpdir = Path(tempfile.mkdtemp(prefix='egtx_'))
    src = tmpdir / filename
    out = tmpdir / out_name
    try:
        storage.download_to(f'tracks/{filename}', str(src))
        if _encode(src, out):
            storage.upload_from(f'tracks/{out_name}', str(out), 'video/mp4')
            db.set_sd_status(track_id, 'ready', sd_file=out_name)
        else:
            db.set_sd_status(track_id, 'failed')
    except Exception:
        db.set_sd_status(track_id, 'failed')
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _process_local(db, tracks_dir, track_id, filename, out_name):
    src = Path(tracks_dir) / filename
    if not src.exists():
        db.set_sd_status(track_id, 'failed')
        return
    out = Path(tracks_dir) / out_name
    tmp = Path(tracks_dir) / (out_name + '.part')
    try:
        if _encode(src, tmp):
            os.replace(tmp, out)
            db.set_sd_status(track_id, 'ready', sd_file=out_name)
        else:
            if tmp.exists():
                tmp.unlink()
            db.set_sd_status(track_id, 'failed')
    except Exception:
        try:
            if tmp.exists():
                tmp.unlink()
        except Exception:
            pass
        db.set_sd_status(track_id, 'failed')


def _process(db, tracks_dir, track_id):
    row = db.get_track_row(track_id)
    if not row or row.get('media_type') != 'video':
        return
    if (row.get('sd_status') or '') == 'ready' and row.get('sd_file'):
        return
    if not ffmpeg_available():
        # Leave it retryable rather than 'failed': ffmpeg may get installed later.
        return

    filename = row['filename']
    out_name = f"sd_{Path(filename).stem}.mp4"
    db.set_sd_status(track_id, 'pending')
    if storage.enabled():
        _process_r2(db, track_id, filename, out_name)
    else:
        _process_local(db, tracks_dir, track_id, filename, out_name)


def _worker(db, tracks_dir):
    while True:
        track_id = _q.get()
        try:
            _process(db, tracks_dir, track_id)
        except Exception:
            pass
        finally:
            _q.task_done()


def enqueue(track_id):
    _q.put(track_id)


def start(db, tracks_dir):
    """Launch the worker and queue every video that still needs a 360p copy
    (new uploads since this feature, plus anything interrupted by a restart)."""
    global _started
    if _started:
        return
    _started = True
    threading.Thread(target=_worker, args=(db, tracks_dir), daemon=True).start()
    try:
        for v in db.get_videos_needing_sd():
            _q.put(v['id'])
    except Exception:
        pass
