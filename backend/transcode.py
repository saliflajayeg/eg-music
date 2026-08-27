"""Background 480p 'data saver' rendition generator for videos.

Uploads stay fast: the original file is saved and served immediately, while a
single lower-quality 480p copy is produced off the request path by one worker
thread. The egbox CPU (dual-core Pentium) can only handle one transcode at a
time, so the queue is deliberately serial and ffmpeg runs at low priority.

The player picks original vs 480p based on the viewer's connection speed.
"""
import os
import shutil
import subprocess
import threading
import queue
from pathlib import Path

_q = queue.Queue()
_started = False


def ffmpeg_available():
    return shutil.which('ffmpeg') is not None


def _cmd(src, tmp):
    base = ['ffmpeg', '-y', '-i', str(src),
            # never upscale: cap height at 480, keep aspect, width divisible by 2
            '-vf', "scale=-2:'min(480,ih)'",
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30',
            '-maxrate', '900k', '-bufsize', '1800k',
            '-c:a', 'aac', '-b:a', '96k',
            '-movflags', '+faststart',      # progressive streaming (moov up front)
            '-f', 'mp4',                    # tmp file ends in .part, so name the muxer explicitly
            str(tmp)]
    # Keep the app responsive on the weak CPU.
    if os.name == 'posix' and shutil.which('nice'):
        base = ['nice', '-n', '19'] + base
    return base


def _process(db, tracks_dir, track_id):
    row = db.get_track_row(track_id)
    if not row or row.get('media_type') != 'video':
        return
    if (row.get('sd_status') or '') == 'ready' and row.get('sd_file'):
        return
    src = Path(tracks_dir) / row['filename']
    if not src.exists():
        db.set_sd_status(track_id, 'failed')
        return
    if not ffmpeg_available():
        # Leave it retryable rather than 'failed': ffmpeg may get installed later.
        return

    db.set_sd_status(track_id, 'pending')
    out_name = f"sd_{src.stem}.mp4"
    out_path = Path(tracks_dir) / out_name
    tmp_path = Path(tracks_dir) / (out_name + '.part')
    try:
        proc = subprocess.run(_cmd(src, tmp_path),
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if proc.returncode == 0 and tmp_path.exists() and tmp_path.stat().st_size > 0:
            os.replace(tmp_path, out_path)
            db.set_sd_status(track_id, 'ready', sd_file=out_name)
        else:
            if tmp_path.exists():
                tmp_path.unlink()
            db.set_sd_status(track_id, 'failed')
    except Exception:
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except Exception:
            pass
        db.set_sd_status(track_id, 'failed')


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
    """Launch the worker and queue every video that still needs a 480p copy
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
