import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'soundup.db')

# Complete schema for Postgres (Supabase). Used whenever DATABASE_URL is set;
# otherwise the app runs on the SQLite schema further below. Method queries are
# shared — pgcompat.translate() adapts their dialect at run time.
_PG_NOW = "to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS')"
_PG_SCHEMA = f"""
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    bio TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    plan TEXT DEFAULT 'free',
    is_admin INTEGER DEFAULT 0,
    created_at TEXT DEFAULT {_PG_NOW}
);
CREATE TABLE IF NOT EXISTS tracks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT DEFAULT '',
    genre TEXT DEFAULT '',
    description TEXT DEFAULT '',
    filename TEXT NOT NULL,
    cover TEXT DEFAULT '',
    media_type TEXT DEFAULT 'audio',
    duration REAL DEFAULT 0,
    play_count INTEGER DEFAULT 0,
    is_public INTEGER DEFAULT 1,
    publish_at TEXT DEFAULT '',
    sd_file TEXT DEFAULT '',
    sd_status TEXT DEFAULT '',
    created_at TEXT DEFAULT {_PG_NOW}
);
CREATE TABLE IF NOT EXISTS likes (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, track_id)
);
CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    followed_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT {_PG_NOW},
    PRIMARY KEY (follower_id, followed_id)
);
CREATE TABLE IF NOT EXISTS subscription_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan TEXT DEFAULT 'pro',
    note TEXT DEFAULT '',
    receipt TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    reviewed_by INTEGER,
    review_note TEXT DEFAULT '',
    created_at TEXT DEFAULT {_PG_NOW},
    reviewed_at TEXT
);
CREATE TABLE IF NOT EXISTS play_events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    client_event_id TEXT UNIQUE NOT NULL,
    occurred_at TEXT,
    synced_at TEXT DEFAULT {_PG_NOW}
);
CREATE TABLE IF NOT EXISTS track_artists (
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    percent REAL NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    is_owner INTEGER DEFAULT 0,
    created_at TEXT DEFAULT {_PG_NOW},
    PRIMARY KEY (track_id, user_id)
);
CREATE TABLE IF NOT EXISTS downloads (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT {_PG_NOW},
    PRIMARY KEY (user_id, track_id)
);
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id INTEGER,
    text TEXT NOT NULL,
    created_at TEXT DEFAULT {_PG_NOW}
);
CREATE TABLE IF NOT EXISTS comment_likes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, comment_id)
);
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    track_id INTEGER,
    comment_id INTEGER,
    text TEXT DEFAULT '',
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT {_PG_NOW}
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
CREATE INDEX IF NOT EXISTS idx_tracks_user   ON tracks(user_id);
CREATE INDEX IF NOT EXISTS idx_tracks_public ON tracks(is_public, created_at);
CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows(followed_id);
CREATE INDEX IF NOT EXISTS idx_comments_track ON comments(track_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id, is_read, created_at);
"""


class Database:
    def __init__(self):
        dsn = os.environ.get('DATABASE_URL', '').strip()
        self.pg = bool(dsn)
        if self.pg:
            import pgcompat
            self.conn = pgcompat.connect(dsn)
        else:
            self.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
            self.conn.row_factory = sqlite3.Row
            self.conn.execute("PRAGMA journal_mode=WAL")
            self.conn.execute("PRAGMA foreign_keys=ON")
        self._create_tables()

    def _insert_id(self, sql, params):
        """Run an INSERT and return the new row's id, on either dialect."""
        if self.pg:
            cur = self.conn.execute(sql + ' RETURNING id', params)
            rid = cur.fetchone()[0]
            self.conn.commit()
            return rid
        cur = self.conn.execute(sql, params)
        self.conn.commit()
        return cur.lastrowid

    def _create_tables(self):
        if self.pg:
            self.conn.executescript(_PG_SCHEMA)
            self.conn.commit()
            return
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
                publish_at   TEXT DEFAULT '',
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

            -- Who made a track, and each artist's share. The uploader is
            -- stored here too (is_owner=1, auto-accepted). Collaborators start
            -- 'pending' and only appear publicly once they accept, so nobody
            -- can attach themselves to a well-known artist without permission.
            CREATE TABLE IF NOT EXISTS track_artists (
                track_id   INTEGER NOT NULL,
                user_id    INTEGER NOT NULL,
                percent    REAL NOT NULL DEFAULT 0,
                status     TEXT DEFAULT 'pending',   -- pending | accepted | declined
                is_owner   INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (track_id, user_id),
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS downloads (
                user_id    INTEGER NOT NULL,
                track_id   INTEGER NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (user_id, track_id),
                FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
            );

            -- Social comments on a track/video. parent_id set => it's a reply.
            CREATE TABLE IF NOT EXISTS comments (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id   INTEGER NOT NULL,
                user_id    INTEGER NOT NULL,
                parent_id  INTEGER,
                text       TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS comment_likes (
                user_id    INTEGER NOT NULL,
                comment_id INTEGER NOT NULL,
                PRIMARY KEY (user_id, comment_id),
                FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
                FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
            );

            -- In-app notifications (comment / reply / like on your content).
            CREATE TABLE IF NOT EXISTS notifications (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL,   -- recipient
                actor_id   INTEGER NOT NULL,   -- who triggered it
                type       TEXT NOT NULL,      -- comment | reply | like_track | like_comment
                track_id   INTEGER,
                comment_id INTEGER,
                text       TEXT DEFAULT '',
                is_read    INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE
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
            CREATE INDEX IF NOT EXISTS idx_comments_track ON comments(track_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id, is_read, created_at);
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
        # 480p 'data saver' rendition for videos (adaptive quality).
        # sd_file: filename of the 480p mp4 once ready; sd_status: '' | pending | ready | failed
        if 'sd_file' not in track_cols:
            self.conn.execute("ALTER TABLE tracks ADD COLUMN sd_file TEXT DEFAULT ''")
        if 'sd_status' not in track_cols:
            self.conn.execute("ALTER TABLE tracks ADD COLUMN sd_status TEXT DEFAULT ''")
        # publish_at: '' = público ya; si no, hora UTC ('YYYY-MM-DD HH:MM:SS') a partir
        # de la cual el tema se hace público (programación de publicaciones)
        if 'publish_at' not in track_cols:
            self.conn.execute("ALTER TABLE tracks ADD COLUMN publish_at TEXT DEFAULT ''")

        # Replies: comments made before threading existed lack parent_id.
        comment_cols = [r[1] for r in self.conn.execute("PRAGMA table_info(comments)").fetchall()]
        if comment_cols and 'parent_id' not in comment_cols:
            self.conn.execute("ALTER TABLE comments ADD COLUMN parent_id INTEGER")

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

        # Tracks uploaded before collaborations existed: credit the uploader
        # 100% so every track has a consistent artist list.
        if self.get_setting('collabs_backfilled') is None:
            self.conn.execute('''
                INSERT OR IGNORE INTO track_artists (track_id, user_id, percent, status, is_owner)
                SELECT id, user_id, 100, 'accepted', 1 FROM tracks
            ''')
            self.set_setting('collabs_backfilled', '1')

    # ── Users ─────────────────────────────────────────────────────────────────

    def create_user(self, username, email, password_hash, display_name=None):
        return self._insert_id(
            'INSERT INTO users (username, email, password_hash, display_name) VALUES (?,?,?,?)',
            (username, email, password_hash, display_name or username)
        )

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

    def update_email(self, uid, email):
        self.conn.execute('UPDATE users SET email=? WHERE id=?', (email, uid))
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

    def create_track(self, user_id, title, artist, album, genre, description, filename, cover, duration, media_type='audio', publish_at=''):
        return self._insert_id('''
            INSERT INTO tracks (user_id, title, artist, album, genre, description, filename, cover, duration, media_type, publish_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ''', (user_id, title, artist, album, genre, description, filename, cover, duration, media_type, publish_at))

    def set_publish_at(self, track_id, publish_at):
        self.conn.execute('UPDATE tracks SET publish_at=? WHERE id=?', (publish_at, track_id))
        self.conn.commit()

    def _with_artists(self, rows):
        """Attach each track's credited artists (owner + accepted collaborators)."""
        tracks = [dict(r) for r in rows]
        amap = self.artists_for_tracks([t['id'] for t in tracks])
        for t in tracks:
            t['artists'] = amap.get(t['id'], [])
        return tracks

    def get_track(self, track_id, viewer_id=None):
        r = self.conn.execute('''
            SELECT t.*, u.username, u.display_name,
                   (SELECT COUNT(*) FROM likes WHERE track_id=t.id) AS like_count,
                   (SELECT COUNT(*) FROM likes WHERE track_id=t.id AND user_id=?) AS liked_by_me,
                   (SELECT COUNT(*) FROM comments WHERE track_id=t.id) AS comment_count
            FROM tracks t JOIN users u ON t.user_id=u.id
            WHERE t.id=?
        ''', (viewer_id or 0, track_id)).fetchone()
        return self._with_artists([r])[0] if r else None

    # ── Comments (with replies + likes) ────────────────────────────────────────

    def add_comment(self, track_id, user_id, text, parent_id=None):
        # A reply always hangs off a top-level comment: if someone replies to a
        # reply, re-parent it to the thread root so nesting stays one level deep.
        if parent_id:
            p = self.conn.execute('SELECT parent_id FROM comments WHERE id=?', (parent_id,)).fetchone()
            if p and p['parent_id']:
                parent_id = p['parent_id']
        cid = self._insert_id(
            'INSERT INTO comments (track_id, user_id, parent_id, text) VALUES (?,?,?,?)',
            (track_id, user_id, parent_id, text)
        )
        return self.get_comment(cid, viewer_id=user_id)

    def get_comment(self, comment_id, viewer_id=None):
        r = self.conn.execute('''
            SELECT c.id, c.track_id, c.user_id, c.parent_id, c.text, c.created_at,
                   u.username, u.display_name, u.avatar,
                   (SELECT COUNT(*) FROM comment_likes WHERE comment_id=c.id) AS like_count,
                   (SELECT COUNT(*) FROM comment_likes WHERE comment_id=c.id AND user_id=?) AS liked_by_me
            FROM comments c JOIN users u ON c.user_id=u.id
            WHERE c.id=?
        ''', (viewer_id or 0, comment_id)).fetchone()
        return dict(r) if r else None

    def get_comments(self, track_id, viewer_id=None):
        """Top-level comments (most-liked first), each with its replies (oldest
        first). One query, grouped in Python."""
        rows = [dict(r) for r in self.conn.execute('''
            SELECT c.id, c.track_id, c.user_id, c.parent_id, c.text, c.created_at,
                   u.username, u.display_name, u.avatar,
                   (SELECT COUNT(*) FROM comment_likes WHERE comment_id=c.id) AS like_count,
                   (SELECT COUNT(*) FROM comment_likes WHERE comment_id=c.id AND user_id=?) AS liked_by_me
            FROM comments c JOIN users u ON c.user_id=u.id
            WHERE c.track_id=?
        ''', (viewer_id or 0, track_id)).fetchall()]

        replies = {}
        tops = []
        for c in rows:
            c['liked_by_me'] = bool(c['liked_by_me'])
            if c['parent_id']:
                replies.setdefault(c['parent_id'], []).append(c)
            else:
                tops.append(c)
        for c in tops:
            kids = sorted(replies.get(c['id'], []), key=lambda x: x['created_at'])
            c['replies'] = kids
            c['reply_count'] = len(kids)
        tops.sort(key=lambda x: (x['like_count'], x['created_at']), reverse=True)
        return tops

    def delete_comment(self, comment_id):
        # Remove the comment and any replies hanging off it.
        self.conn.execute('DELETE FROM comments WHERE id=? OR parent_id=?', (comment_id, comment_id))
        self.conn.commit()

    def toggle_comment_like(self, user_id, comment_id):
        exists = self.conn.execute(
            'SELECT 1 FROM comment_likes WHERE user_id=? AND comment_id=?', (user_id, comment_id)
        ).fetchone()
        if exists:
            self.conn.execute('DELETE FROM comment_likes WHERE user_id=? AND comment_id=?', (user_id, comment_id))
            liked = False
        else:
            self.conn.execute('INSERT INTO comment_likes (user_id, comment_id) VALUES (?,?)', (user_id, comment_id))
            liked = True
        self.conn.commit()
        count = self.conn.execute('SELECT COUNT(*) FROM comment_likes WHERE comment_id=?', (comment_id,)).fetchone()[0]
        return liked, count

    # ── Notifications ──────────────────────────────────────────────────────────

    def add_notification(self, user_id, actor_id, ntype, track_id=None, comment_id=None, text=''):
        if not user_id or user_id == actor_id:
            return   # never notify yourself
        self.conn.execute(
            'INSERT INTO notifications (user_id, actor_id, type, track_id, comment_id, text) VALUES (?,?,?,?,?,?)',
            (user_id, actor_id, ntype, track_id, comment_id, (text or '')[:120])
        )
        self.conn.commit()

    def get_notifications(self, user_id, limit=40):
        rows = self.conn.execute('''
            SELECT n.id, n.type, n.track_id, n.comment_id, n.text, n.is_read, n.created_at,
                   a.id AS actor_id, a.username AS actor_username,
                   a.display_name AS actor_display_name, a.avatar AS actor_avatar,
                   t.title AS track_title, t.media_type AS track_media_type
            FROM notifications n
            JOIN users a ON n.actor_id = a.id
            LEFT JOIN tracks t ON n.track_id = t.id
            WHERE n.user_id=?
            ORDER BY n.created_at DESC, n.id DESC
            LIMIT ?
        ''', (user_id, limit)).fetchall()
        return [dict(r) for r in rows]

    def count_unread_notifications(self, user_id):
        return self.conn.execute(
            'SELECT COUNT(*) FROM notifications WHERE user_id=? AND is_read=0', (user_id,)
        ).fetchone()[0]

    def mark_notifications_read(self, user_id):
        self.conn.execute('UPDATE notifications SET is_read=1 WHERE user_id=? AND is_read=0', (user_id,))
        self.conn.commit()

    def get_feed(self, viewer_id=None, limit=40, offset=0, sort='recent', genre=None):
        where  = "WHERE t.is_public=1 AND (t.publish_at='' OR t.publish_at<=datetime('now'))"
        params = [viewer_id or 0]
        if genre:
            where += ' AND LOWER(TRIM(t.genre)) = LOWER(TRIM(?))'
            params.append(genre)
        order = 'RANDOM()' if sort == 'random' else 't.created_at DESC'
        params += [limit, offset]
        rows = self.conn.execute(f'''
            SELECT t.*, u.username, u.display_name,
                   (SELECT COUNT(*) FROM likes WHERE track_id=t.id) AS like_count,
                   (SELECT COUNT(*) FROM likes WHERE track_id=t.id AND user_id=?) AS liked_by_me
            FROM tracks t JOIN users u ON t.user_id=u.id
            {where}
            ORDER BY {order}
            LIMIT ? OFFSET ?
        ''', params).fetchall()
        return self._with_artists(rows)

    def get_top_tracks(self, viewer_id=None, limit=10):
        """Most-played public tracks (the home 'Top 10')."""
        rows = self.conn.execute('''
            SELECT t.*, u.username, u.display_name,
                   (SELECT COUNT(*) FROM likes WHERE track_id=t.id) AS like_count,
                   (SELECT COUNT(*) FROM likes WHERE track_id=t.id AND user_id=?) AS liked_by_me
            FROM tracks t JOIN users u ON t.user_id=u.id
            WHERE t.is_public=1 AND (t.publish_at='' OR t.publish_at<=datetime('now'))
            ORDER BY t.play_count DESC, t.created_at DESC
            LIMIT ?
        ''', (viewer_id or 0, limit)).fetchall()
        return self._with_artists(rows)

    def get_genres(self):
        """Distinct genres in use, with how many public tracks each has."""
        rows = self.conn.execute('''
            SELECT MIN(TRIM(genre)) AS genre, COUNT(*) AS count
            FROM tracks
            WHERE is_public=1 AND (publish_at='' OR publish_at<=datetime('now')) AND TRIM(genre) <> ''
            GROUP BY LOWER(TRIM(genre))
            ORDER BY count DESC, genre ASC
        ''').fetchall()
        return [dict(r) for r in rows]

    def get_artists(self, limit=200):
        """Everyone with at least one public track, for the Explore > Artists tab."""
        rows = self.conn.execute('''
            SELECT u.id, u.username, u.display_name, u.bio, u.avatar, u.plan,
                   COUNT(t.id) AS track_count,
                   COALESCE(SUM(t.play_count), 0) AS total_plays
            FROM users u
            JOIN tracks t ON t.user_id = u.id AND t.is_public=1
                 AND (t.publish_at='' OR t.publish_at<=datetime('now'))
            GROUP BY u.id
            ORDER BY total_plays DESC, track_count DESC, u.display_name ASC
            LIMIT ?
        ''', (limit,)).fetchall()
        return [dict(r) for r in rows]

    def get_user_tracks(self, user_id, viewer_id=None):
        # Includes tracks this artist was credited on by someone else, so a
        # collaboration shows up on every featured artist's profile.
        rows = self.conn.execute('''
            SELECT t.*, u.username, u.display_name,
                   (SELECT COUNT(*) FROM likes WHERE track_id=t.id) AS like_count,
                   (SELECT COUNT(*) FROM likes WHERE track_id=t.id AND user_id=?) AS liked_by_me
            FROM tracks t JOIN users u ON t.user_id=u.id
            WHERE t.is_public=1
              AND (t.publish_at='' OR t.publish_at<=datetime('now') OR t.user_id=?)
              AND (
                t.user_id=? OR t.id IN (
                    SELECT track_id FROM track_artists
                    WHERE user_id=? AND status='accepted'
                )
              )
            ORDER BY t.created_at DESC
        ''', (viewer_id or 0, viewer_id or 0, user_id, user_id)).fetchall()
        return self._with_artists(rows)

    def delete_track(self, track_id):
        r = self.conn.execute('SELECT filename, cover FROM tracks WHERE id=?', (track_id,)).fetchone()
        self.conn.execute('DELETE FROM tracks WHERE id=?', (track_id,))
        self.conn.commit()
        return dict(r) if r else None

    def increment_plays(self, track_id):
        self.conn.execute('UPDATE tracks SET play_count=play_count+1 WHERE id=?', (track_id,))
        self.conn.commit()

    # ── Adaptive video quality (480p 'data saver' rendition) ───────────────────

    def set_sd_status(self, track_id, status, sd_file=None):
        if sd_file is not None:
            self.conn.execute('UPDATE tracks SET sd_status=?, sd_file=? WHERE id=?', (status, sd_file, track_id))
        else:
            self.conn.execute('UPDATE tracks SET sd_status=? WHERE id=?', (status, track_id))
        self.conn.commit()

    def get_videos_needing_sd(self):
        """Videos that still need a 480p rendition (new uploads or ones that
        pre-date this feature). Excludes already-ready and permanently-failed."""
        rows = self.conn.execute('''
            SELECT id, filename FROM tracks
            WHERE media_type='video' AND COALESCE(sd_status,'') NOT IN ('ready','failed')
            ORDER BY created_at DESC
        ''').fetchall()
        return [dict(r) for r in rows]

    def get_track_row(self, track_id):
        r = self.conn.execute('SELECT * FROM tracks WHERE id=?', (track_id,)).fetchone()
        return dict(r) if r else None

    # ── Collaborations (multi-artist tracks + revenue splits) ──────────────────

    def set_track_artists(self, track_id, owner_id, owner_percent, collaborators):
        """Record who made a track. `collaborators` is [{user_id, percent}];
        each starts pending until that artist accepts. The uploader is stored
        as the owner and is accepted automatically."""
        self.conn.execute('DELETE FROM track_artists WHERE track_id=?', (track_id,))
        self.conn.execute(
            "INSERT INTO track_artists (track_id, user_id, percent, status, is_owner) VALUES (?,?,?,'accepted',1)",
            (track_id, owner_id, owner_percent)
        )
        for c in collaborators:
            uid = c.get('user_id')
            if not uid or int(uid) == int(owner_id):
                continue
            self.conn.execute(
                "INSERT OR IGNORE INTO track_artists (track_id, user_id, percent, status, is_owner) VALUES (?,?,?,'pending',0)",
                (track_id, uid, float(c.get('percent') or 0))
            )
        self.conn.commit()

    def get_track_artists(self, track_id, include_pending=False):
        q = '''
            SELECT ta.user_id, ta.percent, ta.status, ta.is_owner,
                   u.username, u.display_name, u.avatar
            FROM track_artists ta JOIN users u ON ta.user_id = u.id
            WHERE ta.track_id = ?
        '''
        if not include_pending:
            q += " AND ta.status = 'accepted'"
        q += ' ORDER BY ta.is_owner DESC, ta.percent DESC'
        return [dict(r) for r in self.conn.execute(q, (track_id,)).fetchall()]

    def artists_for_tracks(self, track_ids):
        """Batch-load accepted artists for many tracks at once (avoids an N+1
        query when building a feed)."""
        if not track_ids:
            return {}
        marks = ','.join('?' * len(track_ids))
        rows = self.conn.execute(f'''
            SELECT ta.track_id, ta.user_id, ta.percent, ta.is_owner,
                   u.username, u.display_name
            FROM track_artists ta JOIN users u ON ta.user_id = u.id
            WHERE ta.track_id IN ({marks}) AND ta.status = 'accepted'
            ORDER BY ta.is_owner DESC, ta.percent DESC
        ''', track_ids).fetchall()
        out = {}
        for r in rows:
            out.setdefault(r['track_id'], []).append(dict(r))
        return out

    def respond_collab(self, track_id, user_id, accept):
        self.conn.execute(
            "UPDATE track_artists SET status=? WHERE track_id=? AND user_id=? AND is_owner=0",
            ('accepted' if accept else 'declined', track_id, user_id)
        )
        self.conn.commit()

    def get_pending_collabs(self, user_id):
        rows = self.conn.execute('''
            SELECT ta.track_id, ta.percent, t.title, t.cover, t.media_type,
                   u.username AS owner_username, u.display_name AS owner_display_name
            FROM track_artists ta
            JOIN tracks t ON ta.track_id = t.id
            JOIN users  u ON t.user_id = u.id
            WHERE ta.user_id=? AND ta.status='pending' AND ta.is_owner=0
            ORDER BY ta.created_at DESC
        ''', (user_id,)).fetchall()
        return [dict(r) for r in rows]

    def get_collab_track_ids(self, user_id):
        """Tracks this user appears on as an accepted collaborator (not owner)."""
        return [r[0] for r in self.conn.execute(
            "SELECT track_id FROM track_artists WHERE user_id=? AND status='accepted' AND is_owner=0",
            (user_id,)
        ).fetchall()]

    def get_earnings_report(self):
        """Per-artist totals based on each track's plays and that artist's share.
        'credited_plays' = sum(play_count * percent/100) — a fair-share view of
        how much listening each artist actually accounts for."""
        rows = self.conn.execute('''
            SELECT u.id AS user_id, u.username, u.display_name, u.plan,
                   COUNT(DISTINCT ta.track_id) AS tracks,
                   COALESCE(SUM(t.play_count), 0) AS total_plays,
                   COALESCE(SUM(t.play_count * ta.percent / 100.0), 0) AS credited_plays
            FROM track_artists ta
            JOIN tracks t ON ta.track_id = t.id
            JOIN users  u ON ta.user_id  = u.id
            WHERE ta.status = 'accepted'
            GROUP BY u.id
            ORDER BY credited_plays DESC
        ''').fetchall()
        return [dict(r) for r in rows]

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
              AND (t.publish_at='' OR t.publish_at<=datetime('now') OR t.user_id=?)
            ORDER BY t.created_at DESC
        ''', (user_id, user_id)).fetchall()
        return self._with_artists(rows)

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
              AND (t.publish_at='' OR t.publish_at<=datetime('now'))
            ORDER BY t.created_at DESC
            LIMIT ?
        ''', (user_id, user_id, limit)).fetchall()
        return self._with_artists(rows)

    # ── Search ────────────────────────────────────────────────────────────────

    def search(self, q):
        like = f'%{q}%'
        # Also matches credited collaborators, so searching an artist finds the
        # songs they're featured on, not only the ones they uploaded.
        tracks = self.conn.execute('''
            SELECT t.*, u.username, u.display_name,
                   (SELECT COUNT(*) FROM likes WHERE track_id=t.id) AS like_count,
                   0 AS liked_by_me
            FROM tracks t JOIN users u ON t.user_id=u.id
            WHERE t.is_public=1 AND (t.publish_at='' OR t.publish_at<=datetime('now')) AND (
                t.title LIKE ? OR t.artist LIKE ? OR t.genre LIKE ?
                OR t.id IN (
                    SELECT ta.track_id FROM track_artists ta
                    JOIN users au ON ta.user_id = au.id
                    WHERE ta.status='accepted'
                      AND (au.username LIKE ? OR au.display_name LIKE ?)
                )
            )
            ORDER BY t.play_count DESC LIMIT 30
        ''', (like, like, like, like, like)).fetchall()
        users = self.conn.execute('''
            SELECT id, username, display_name, bio, avatar, plan,
                   (SELECT COUNT(*) FROM tracks WHERE user_id=users.id AND is_public=1) AS track_count
            FROM users WHERE username LIKE ? OR display_name LIKE ?
            LIMIT 10
        ''', (like, like)).fetchall()
        return {'tracks': self._with_artists(tracks), 'users': [dict(r) for r in users]}

    # ── Subscription requests ─────────────────────────────────────────────────

    def create_sub_request(self, user_id, plan, note, receipt=''):
        # Cancel any previous pending
        self.conn.execute(
            "UPDATE subscription_requests SET status='cancelled' WHERE user_id=? AND status='pending'",
            (user_id,)
        )
        return self._insert_id(
            'INSERT INTO subscription_requests (user_id, plan, note, receipt) VALUES (?,?,?,?)',
            (user_id, plan, note, receipt)
        )

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
        if self.pg:
            self.conn.execute('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', (key, value))
        else:
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
