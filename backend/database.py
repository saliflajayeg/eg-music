import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'soundup.db')

class Database:
    def __init__(self):
        self.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self._create_tables()

    def _create_tables(self):
        self.conn.executescript('''
            CREATE TABLE IF NOT EXISTS users (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                username     TEXT UNIQUE NOT NULL,
                email        TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                display_name TEXT,
                bio          TEXT DEFAULT '',
                avatar       TEXT DEFAULT '',
                plan         TEXT DEFAULT 'free',
                is_admin     INTEGER DEFAULT 0,
                created_at   TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS tracks (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id      INTEGER NOT NULL,
                title        TEXT NOT NULL,
                artist       TEXT NOT NULL,
                album        TEXT DEFAULT '',
                genre        TEXT DEFAULT '',
                description  TEXT DEFAULT '',
                filename     TEXT NOT NULL,
                cover        TEXT DEFAULT '',
                media_type   TEXT DEFAULT 'audio',
                duration     REAL DEFAULT 0,
                play_count   INTEGER DEFAULT 0,
                is_public    INTEGER DEFAULT 1,
                created_at   TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS likes (
                user_id  INTEGER,
                track_id INTEGER,
                PRIMARY KEY (user_id, track_id),
                FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS follows (
                follower_id INTEGER,
                followed_id INTEGER,
                created_at  TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (follower_id, followed_id),
                FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (followed_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS subscription_requests (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL,
                plan       TEXT DEFAULT 'pro',
                note       TEXT DEFAULT '',
                receipt    TEXT DEFAULT '',
                status     TEXT DEFAULT 'pending',
                reviewed_by INTEGER,
                review_note TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now')),
                reviewed_at TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS play_events (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id         INTEGER NOT NULL,
                track_id        INTEGER NOT NULL,
                client_event_id TEXT UNIQUE NOT NULL,
                occurred_at     TEXT,
                synced_at       TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS downloads (
                user_id    INTEGER NOT NULL,
                track_id   INTEGER NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (user_id, track_id),
                FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT
            );

            INSERT OR IGNORE INTO settings VALUES
                ('payment_instructions', 'Paga con Muni Dinero 📱\n\n1. Abre Muni Dinero en tu teléfono\n2. Envía el importe de tu plan a:\n     Número: [TU NÚMERO MUNI DINERO]\n     Nombre: [TU NOMBRE]\n3. Guarda una captura o foto del recibo del pago\n4. Sube la foto del recibo aquí abajo y envía tu solicitud\n\nEl administrador confirmará el pago y activará tu plan.'),
                ('pro_price', '3000 XAF / mes'),
                ('legend_price', '7000 XAF / mes'),
                ('pro_upload_limit', '15'),
                ('site_name', 'EG Music');

            CREATE INDEX IF NOT EXISTS idx_tracks_user   ON tracks(user_id);
            CREATE INDEX IF NOT EXISTS idx_tracks_public ON tracks(is_public, created_at);
            CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows(followed_id);
        ''')
        self._migrate()
        self.conn.commit()

    def _migrate(self):
        user_cols = [r[1] for r in self.conn.execute("PRAGMA table_info(users)").fetchall()]
        if 'plan' not in user_cols:
            self.conn.execute("ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'")
        if 'is_subscriber' in user_cols:
            self.conn.execute("UPDATE users SET plan='pro' WHERE is_subscriber=1 AND (plan IS NULL OR plan='free')")

        track_cols = [r[1] for r in self.conn.execute("PRAGMA table_info(tracks)").fetchall()]
        if 'media_type' not in track_cols:
            self.conn.execute("ALTER TABLE tracks ADD COLUMN media_type TEXT DEFAULT 'audio'")

        req_cols = [r[1] for r in self.conn.execute("PRAGMA table_info(subscription_requests)").fetchall()]
        if 'plan' not in req_cols:
            self.conn.execute("ALTER TABLE subscription_requests ADD COLUMN plan TEXT DEFAULT 'pro'")
        if 'receipt' not in req_cols:
            self.conn.execute("ALTER TABLE subscription_requests ADD COLUMN receipt TEXT DEFAULT ''")

        if self.get_setting('site_name') == 'SoundUp':
            self.set_setting('site_name', 'EG Music')
        if self.get_setting('subscription_price') is not None and self.get_setting('pro_price') is None:
            self.set_setting('pro_price', self.get_setting('subscription_price'))

        # ── Plan model v2 (2026-07-15): 4 plans free/amante/pro/premium ──
        # Old model was free/pro/legend. Map the top artist tier legend→premium;
        # pro stays pro; free stays free. Runs once (guarded by a flag) so the
        # admin's later price/limit edits are never stomped.
        if self.get_setting('plan_model_v2') is None:
            self.conn.execute("UPDATE users SET plan='premium' WHERE plan='legend'")
            self.conn.execute("UPDATE subscription_requests SET plan='premium' WHERE plan='legend'")
            self.set_setting('amante_price',   '2.000 XAF / mes')
            self.set_setting('pro_price',      '9.000 XAF / mes')
            self.set_setting('premium_price',  '14.000 XAF / mes')
            self.set_setting('free_download_limit', '3')    # total (lifetime) for Gratis
            self.set_setting('paid_download_limit', '30')   # per month for Amante & Pro
            self.set_setting('pro_upload_limit',     '8')   # per month
            self.set_setting('premium_upload_limit', '15')  # per month
            self.set_setting('plan_model_v2', '1')

    # ── Users ─────────────────────────────────────────────────────────────────

    def create_user(self, username, email, password_hash, display_name=None):
        cur = self.conn.execute(
            'INSERT INTO users (username, email, password_hash, display_name) VALUES (?,?,?,?)',
            (username, email, password_hash, display_name or username)
        )
        self.conn.commit()
        return cur.lastrowid

    def get_user_by_id(self, uid):
        r = self.conn.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone()
        return dict(r) if r else None

    def get_user_by_email(self, email):
        r = self.conn.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
        return dict(r) if r else None

    def get_user_by_username(self, username):
        r = self.conn.execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()
        return dict(r) if r else None

    def update_user(self, uid, **kwargs):
        allowed = {'display_name','bio','avatar','plan','is_admin'}
        fields = {k: v for k, v in kwargs.items() if k in allowed}
        if not fields:
            return
        sets = ', '.join(f'{k}=?' for k in fields)
        self.conn.execute(f'UPDATE users SET {sets} WHERE id=?', (*fields.values(), uid))
        self.conn.commit()

    def update_password(self, uid, password_hash):
        self.conn.execute('UPDATE users SET password_hash=? WHERE id=?', (password_hash, uid))
        self.conn.commit()

    def get_all_users(self):
        rows = self.conn.execute(
            'SELECT id,username,email,display_name,plan,is_admin,created_at FROM users ORDER BY created_at DESC'
        ).fetchall()
        return [dict(r) for r in rows]

    def count_user_tracks(self, user_id):
        return self.conn.execute('SELECT COUNT(*) FROM tracks WHERE user_id=?', (user_id,)).fetchone()[0]

    def count_uploads_this_month(self, user_id):
        return self.conn.execute(
            "SELECT COUNT(*) FROM tracks WHERE user_id=? AND created_at >= strftime('%Y-%m-01 00:00:00','now')",
            (user_id,)
        ).fetchone()[0]

    # ── Downloads (limit tracking) ──────────────────────────────────────────────

    def has_downloaded(self, user_id, track_id):
        return bool(self.conn.execute(
            'SELECT 1 FROM downloads WHERE user_id=? AND track_id=?', (user_id, track_id)
        ).fetchone())

    def count_downloads(self, user_id, period='total'):
        if period == 'month':
            return self.conn.execute(
                "SELECT COUNT(*) FROM downloads WHERE user_id=? AND created_at >= strftime('%Y-%m-01 00:00:00','now')",
                (user_id,)
            ).fetchone()[0]
        return self.conn.execute('SELECT COUNT(*) FROM downloads WHERE user_id=?', (user_id,)).fetchone()[0]

    def record_download(self, user_id, track_id):
        self.conn.execute(
            'INSERT OR IGNORE INTO downloads (user_id, track_id) VALUES (?,?)', (user_id, track_id)
        )
        self.conn.commit()

    def get_user_public(self, uid, viewer_id=None):
        r = self.conn.execute(
            'SELECT id,username,display_name,bio,avatar,plan,created_at FROM users WHERE id=?', (uid,)
        ).fetchone()
        if not r:
            return None
        u = dict(r)
        u['follower_count'] = self.conn.execute(
            'SELECT COUNT(*) FROM follows WHERE followed_id=?', (uid,)
        ).fetchone()[0]
        u['following_count'] = self.conn.execute(
            'SELECT COUNT(*) FROM follows WHERE follower_id=?', (uid,)
        ).fetchone()[0]
        u['track_count'] = self.conn.execute(
            'SELECT COUNT(*) FROM tracks WHERE user_id=? AND is_public=1', (uid,)
        ).fetchone()[0]
        if viewer_id:
            u['is_following'] = bool(self.conn.execute(
                'SELECT 1 FROM follows WHERE follower_id=? AND followed_id=?', (viewer_id, uid)
            ).fetchone())
        else:
            u['is_following'] = False
        return u

    # ── Tracks ────────────────────────────────────────────────────────────────

    def create_track(self, user_id, title, artist, album, genre, description, filename, cover, duration, media_type='audio'):
        cur = self.conn.execute('''
            INSERT INTO tracks (user_id, title, artist, album, genre, description, filename, cover, duration, media_type)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        ''', (user_id, title, artist, album, genre, description, filename, cover, duration, media_type))
        self.conn.commit()
        return cur.lastrowid

    def get_track(self, track_id, viewer_id=None):
        r = self.conn.execute('''
            SELECT t.*, u.username, u.display_name,
                   (SELECT COUNT(*) FROM likes WHERE track_id=t.id) AS like_count,
                   (SELECT COUNT(*) FROM likes WHERE track_id=t.id AND user_id=?) AS liked_by_me
            FROM tracks t JOIN users u ON t.user_id=u.id
            WHERE t.id=?
        ''', (viewer_id or 0, track_id)).fetchone()
        return dict(r) if r else None

    def get_feed(self, viewer_id=None, limit=40, offset=0):
        rows = self.conn.execute('''
            SELECT t.*, u.username, u.display_name,
                   (SELECT COUNT(*) FROM likes WHERE track_id=t.id) AS like_count,
                   (SELECT COUNT(*) FROM likes WHERE track_id=t.id AND user_id=?) AS liked_by_me
            FROM tracks t JOIN users u ON t.user_id=u.id
            WHERE t.is_public=1
            ORDER BY t.created_at DESC
            LIMIT ? OFFSET ?
        ''', (viewer_id or 0, limit, offset)).fetchall()
        return [dict(r) for r in rows]

    def get_user_tracks(self, user_id, viewer_id=None):
        rows = self.conn.execute('''
            SELECT t.*, u.username, u.display_name,
                   (SELECT COUNT(*) FROM likes WHERE track_id=t.id) AS like_count,
                   (SELECT COUNT(*) FROM likes WHERE track_id=t.id AND user_id=?) AS liked_by_me
            FROM tracks t JOIN users u ON t.user_id=u.id
            WHERE t.user_id=? AND t.is_public=1
            ORDER BY t.created_at DESC
        ''', (viewer_id or 0, user_id)).fetchall()
        return [dict(r) for r in rows]

    def delete_track(self, track_id):
        r = self.conn.execute('SELECT filename, cover FROM tracks WHERE id=?', (track_id,)).fetchone()
        self.conn.execute('DELETE FROM tracks WHERE id=?', (track_id,))
        self.conn.commit()
        return dict(r) if r else None

    def increment_plays(self, track_id):
        self.conn.execute('UPDATE tracks SET play_count=play_count+1 WHERE id=?', (track_id,))
        self.conn.commit()

    def record_play_events(self, user_id, events):
        """Apply offline play/view events idempotently. Each event has a
        client-generated client_event_id; duplicates (retried syncs) are
        ignored so play_count is never double-counted. Returns how many were
        newly applied."""
        applied = 0
        for ev in events:
            cid = (ev.get('client_event_id') or '').strip()
            tid = ev.get('track_id')
            if not cid or not tid:
                continue
            # Only count if this track exists and isn't already recorded.
            if not self.conn.execute('SELECT 1 FROM tracks WHERE id=?', (tid,)).fetchone():
                continue
            cur = self.conn.execute(
                'INSERT OR IGNORE INTO play_events (user_id, track_id, client_event_id, occurred_at) VALUES (?,?,?,?)',
                (user_id, tid, cid, ev.get('played_at'))
            )
            if cur.rowcount:  # newly inserted -> count it once
                self.conn.execute('UPDATE tracks SET play_count=play_count+1 WHERE id=?', (tid,))
                applied += 1
        self.conn.commit()
        return applied

    # ── Likes ─────────────────────────────────────────────────────────────────

    def toggle_like(self, user_id, track_id):
        exists = self.conn.execute(
            'SELECT 1 FROM likes WHERE user_id=? AND track_id=?', (user_id, track_id)
        ).fetchone()
        if exists:
            self.conn.execute('DELETE FROM likes WHERE user_id=? AND track_id=?', (user_id, track_id))
            liked = False
        else:
            self.conn.execute('INSERT INTO likes (user_id, track_id) VALUES (?,?)', (user_id, track_id))
            liked = True
        self.conn.commit()
        count = self.conn.execute('SELECT COUNT(*) FROM likes WHERE track_id=?', (track_id,)).fetchone()[0]
        return liked, count

    def get_liked_tracks(self, user_id):
        rows = self.conn.execute('''
            SELECT t.*, u.username, u.display_name,
                   (SELECT COUNT(*) FROM likes WHERE track_id=t.id) AS like_count,
                   1 AS liked_by_me
            FROM likes l
            JOIN tracks t ON l.track_id=t.id
            JOIN users u ON t.user_id=u.id
            WHERE l.user_id=? AND t.is_public=1
            ORDER BY t.created_at DESC
        ''', (user_id,)).fetchall()
        return [dict(r) for r in rows]

    # ── Follows ───────────────────────────────────────────────────────────────

    def toggle_follow(self, follower_id, followed_id):
        exists = self.conn.execute(
            'SELECT 1 FROM follows WHERE follower_id=? AND followed_id=?', (follower_id, followed_id)
        ).fetchone()
        if exists:
            self.conn.execute('DELETE FROM follows WHERE follower_id=? AND followed_id=?', (follower_id, followed_id))
            following = False
        else:
            self.conn.execute('INSERT INTO follows (follower_id, followed_id) VALUES (?,?)', (follower_id, followed_id))
            following = True
        self.conn.commit()
        return following

    def get_following_feed(self, user_id, limit=40):
        rows = self.conn.execute('''
            SELECT t.*, u.username, u.display_name,
                   (SELECT COUNT(*) FROM likes WHERE track_id=t.id) AS like_count,
                   (SELECT COUNT(*) FROM likes WHERE track_id=t.id AND user_id=?) AS liked_by_me
            FROM tracks t
            JOIN users u ON t.user_id=u.id
            JOIN follows f ON f.followed_id=t.user_id
            WHERE f.follower_id=? AND t.is_public=1
            ORDER BY t.created_at DESC
            LIMIT ?
        ''', (user_id, user_id, limit)).fetchall()
        return [dict(r) for r in rows]

    # ── Search ────────────────────────────────────────────────────────────────

    def search(self, q):
        like = f'%{q}%'
        tracks = self.conn.execute('''
            SELECT t.*, u.username, u.display_name,
                   (SELECT COUNT(*) FROM likes WHERE track_id=t.id) AS like_count,
                   0 AS liked_by_me
            FROM tracks t JOIN users u ON t.user_id=u.id
            WHERE t.is_public=1 AND (t.title LIKE ? OR t.artist LIKE ? OR t.genre LIKE ?)
            ORDER BY t.play_count DESC LIMIT 30
        ''', (like, like, like)).fetchall()
        users = self.conn.execute('''
            SELECT id, username, display_name, bio, avatar, plan,
                   (SELECT COUNT(*) FROM tracks WHERE user_id=users.id AND is_public=1) AS track_count
            FROM users WHERE username LIKE ? OR display_name LIKE ?
            LIMIT 10
        ''', (like, like)).fetchall()
        return {'tracks': [dict(r) for r in tracks], 'users': [dict(r) for r in users]}

    # ── Subscription requests ─────────────────────────────────────────────────

    def create_sub_request(self, user_id, plan, note, receipt=''):
        # Cancel any previous pending
        self.conn.execute(
            "UPDATE subscription_requests SET status='cancelled' WHERE user_id=? AND status='pending'",
            (user_id,)
        )
        cur = self.conn.execute(
            'INSERT INTO subscription_requests (user_id, plan, note, receipt) VALUES (?,?,?,?)',
            (user_id, plan, note, receipt)
        )
        self.conn.commit()
        return cur.lastrowid

    def get_sub_request(self, req_id):
        r = self.conn.execute('SELECT * FROM subscription_requests WHERE id=?', (req_id,)).fetchone()
        return dict(r) if r else None

    def get_sub_requests(self, status=None):
        q = '''
            SELECT sr.*, u.username, u.email, u.display_name
            FROM subscription_requests sr JOIN users u ON sr.user_id=u.id
        '''
        if status:
            q += f" WHERE sr.status='{status}'"
        q += ' ORDER BY sr.created_at DESC'
        return [dict(r) for r in self.conn.execute(q).fetchall()]

    def get_my_sub_request(self, user_id):
        r = self.conn.execute(
            "SELECT * FROM subscription_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 1",
            (user_id,)
        ).fetchone()
        return dict(r) if r else None

    def review_sub_request(self, req_id, admin_id, status, note=''):
        self.conn.execute('''
            UPDATE subscription_requests
            SET status=?, reviewed_by=?, review_note=?, reviewed_at=datetime('now')
            WHERE id=?
        ''', (status, admin_id, note, req_id))
        if status == 'approved':
            req = self.conn.execute('SELECT user_id, plan FROM subscription_requests WHERE id=?', (req_id,)).fetchone()
            if req:
                self.conn.execute('UPDATE users SET plan=? WHERE id=?', (req['plan'], req['user_id']))
        self.conn.commit()

    # ── Settings ──────────────────────────────────────────────────────────────

    def get_setting(self, key):
        r = self.conn.execute('SELECT value FROM settings WHERE key=?', (key,)).fetchone()
        return r['value'] if r else None

    def set_setting(self, key, value):
        self.conn.execute('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', (key, value))
        self.conn.commit()

    def get_all_settings(self):
        return {r['key']: r['value'] for r in self.conn.execute('SELECT * FROM settings').fetchall()}

    # ── Stats ─────────────────────────────────────────────────────────────────

    def get_stats(self):
        plan_counts = {r['plan']: r['c'] for r in self.conn.execute(
            "SELECT plan, COUNT(*) c FROM users GROUP BY plan"
        ).fetchall()}
        return {
            'users':   self.conn.execute('SELECT COUNT(*) FROM users').fetchone()[0],
            'tracks':  self.conn.execute('SELECT COUNT(*) FROM tracks WHERE is_public=1').fetchone()[0],
            'plays':   self.conn.execute('SELECT COALESCE(SUM(play_count),0) FROM tracks').fetchone()[0],
            'pending_subscriptions': self.conn.execute(
                "SELECT COUNT(*) FROM subscription_requests WHERE status='pending'"
            ).fetchone()[0],
            'amante_users':  plan_counts.get('amante', 0),
            'pro_users':     plan_counts.get('pro', 0),
            'premium_users': plan_counts.get('premium', 0),
        }
