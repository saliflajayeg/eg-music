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
    is_curator INTEGER DEFAULT 0,
    account_type TEXT DEFAULT '',
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
CREATE TABLE IF NOT EXISTS account_claims (
    id SERIAL PRIMARY KEY,
    artist_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT DEFAULT '',
    contact TEXT DEFAULT '',
    message TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    reviewed_by INTEGER,
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
    role TEXT DEFAULT '',
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
CREATE TABLE IF NOT EXISTS playlists (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT {_PG_NOW}
);
CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    added_at TEXT DEFAULT {_PG_NOW},
    PRIMARY KEY (playlist_id, track_id)
);
CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks ON playlist_tracks(playlist_id, position);
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
            # In-place migrations for existing Postgres DBs (CREATE IF NOT EXISTS
            # can't add columns to a table that already exists).
            for stmt in ("ALTER TABLE track_artists ADD COLUMN IF NOT EXISTS role TEXT DEFAULT ''",
                         "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_curator INTEGER DEFAULT 0",
                         "ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT ''",
                         "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TEXT DEFAULT ''"):
                try: self.conn.execute(stmt)
                except Exception: pass
            self.conn.commit()
            self._backfill_account_type()
            self._create_royalty_tables()
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
                is_curator   INTEGER DEFAULT 0,
                account_type TEXT DEFAULT '',
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

            CREATE TABLE IF NOT EXISTS account_claims (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                artist_user_id INTEGER NOT NULL,
                email          TEXT DEFAULT '',
                contact        TEXT DEFAULT '',
                message        TEXT DEFAULT '',
                status         TEXT DEFAULT 'pending',
                reviewed_by    INTEGER,
                created_at     TEXT DEFAULT (datetime('now')),
                reviewed_at    TEXT,
                FOREIGN KEY (artist_user_id) REFERENCES users(id) ON DELETE CASCADE
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
                role       TEXT DEFAULT '',          -- credit: Productor, Máster, Mezcla…
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

            -- User-created playlists.
            CREATE TABLE IF NOT EXISTS playlists (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL,
                name       TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS playlist_tracks (
                playlist_id INTEGER NOT NULL,
                track_id    INTEGER NOT NULL,
                position    INTEGER NOT NULL DEFAULT 0,
                added_at    TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (playlist_id, track_id),
                FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
                FOREIGN KEY (track_id)    REFERENCES tracks(id)    ON DELETE CASCADE
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
            CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id);
            CREATE INDEX IF NOT EXISTS idx_playlist_tracks ON playlist_tracks(playlist_id, position);
        ''')
        self._migrate()
        self.conn.commit()

    def _migrate(self):
        user_cols = [r[1] for r in self.conn.execute("PRAGMA table_info(users)").fetchall()]
        if 'plan' not in user_cols:
            self.conn.execute("ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'")
        if 'is_subscriber' in user_cols:
            self.conn.execute("UPDATE users SET plan='pro' WHERE is_subscriber=1 AND (plan IS NULL OR plan='free')")
        # is_curator: cuenta que SOLO puede subir por otros y crear artistas (bot de curación)
        if 'is_curator' not in user_cols:
            self.conn.execute("ALTER TABLE users ADD COLUMN is_curator INTEGER DEFAULT 0")
        # account_type: 'artist' | 'listener'. Se elige al registrarse, gratis.
        if 'account_type' not in user_cols:
            self.conn.execute("ALTER TABLE users ADD COLUMN account_type TEXT DEFAULT ''")
        if 'last_seen_at' not in user_cols:   # última vez que usó la app con sesión
            self.conn.execute("ALTER TABLE users ADD COLUMN last_seen_at TEXT DEFAULT ''")
        self._backfill_account_type()
        self._create_royalty_tables()

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

        ta_cols = [r[1] for r in self.conn.execute("PRAGMA table_info(track_artists)").fetchall()]
        if ta_cols and 'role' not in ta_cols:
            self.conn.execute("ALTER TABLE track_artists ADD COLUMN role TEXT DEFAULT ''")

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

    def _backfill_account_type(self):
        """Cuentas antiguas sin tipo: artista si tiene plan de artista o ha subido algo;
        si no, oyente. Solo toca filas con account_type vacío (idempotente)."""
        self.conn.execute("""UPDATE users SET account_type='artist'
            WHERE (account_type IS NULL OR account_type='')
              AND (plan IN ('pro','premium') OR is_admin=1 OR is_curator=1
                   OR id IN (SELECT user_id FROM tracks))""")
        self.conn.execute("""UPDATE users SET account_type='listener'
            WHERE account_type IS NULL OR account_type=''""")
        self.conn.commit()

    # ── Users ─────────────────────────────────────────────────────────────────

    def create_user(self, username, email, password_hash, display_name=None, account_type='listener'):
        return self._insert_id(
            'INSERT INTO users (username, email, password_hash, display_name, account_type) VALUES (?,?,?,?,?)',
            (username, email, password_hash, display_name or username, account_type)
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
        allowed = {'display_name','bio','avatar','plan','is_admin','is_curator','account_type'}
        fields = {k: v for k, v in kwargs.items() if k in allowed}
        if not fields:
            return
        sets = ', '.join(f'{k}=?' for k in fields)
        self.conn.execute(f'UPDATE users SET {sets} WHERE id=?', (*fields.values(), uid))
        self.conn.commit()

    def admin_all_tracks(self):
        """Every track (incl. private/scheduled) for the admin management list."""
        rows = self.conn.execute('''
            SELECT t.id, t.title, t.artist, t.media_type, t.play_count, t.cover,
                   t.is_public, t.created_at, t.user_id,
                   u.username, u.display_name
            FROM tracks t JOIN users u ON t.user_id = u.id
            ORDER BY t.created_at DESC
        ''').fetchall()
        return [dict(r) for r in rows]

    def update_password(self, uid, password_hash):
        self.conn.execute('UPDATE users SET password_hash=? WHERE id=?', (password_hash, uid))
        self.conn.commit()

    def update_email(self, uid, email):
        self.conn.execute('UPDATE users SET email=? WHERE id=?', (email, uid))
        self.conn.commit()

    def get_all_users(self):
        from datetime import datetime
        month = datetime.utcnow().strftime('%Y-%m')
        rows = self.conn.execute('''
            SELECT u.id, u.username, u.email, u.display_name, u.plan, u.is_admin, u.is_curator,
                   u.created_at, u.account_type, u.last_seen_at,
                   (SELECT COUNT(*) FROM listens l WHERE l.listener_id=u.id AND l.month=?) AS listens_month,
                   (SELECT MAX(played_at) FROM listens l WHERE l.listener_id=u.id) AS last_listen_at
            FROM users u ORDER BY u.created_at DESC
        ''', (month,)).fetchall()
        return [dict(r) for r in rows]

    def touch_last_seen(self, user):
        from datetime import datetime, timedelta
        now = datetime.utcnow()
        last = user.get('last_seen_at') or ''
        if last and last >= (now - timedelta(minutes=5)).strftime('%Y-%m-%d %H:%M:%S'):
            return
        stamp = now.strftime('%Y-%m-%d %H:%M:%S')
        self.conn.execute('UPDATE users SET last_seen_at=? WHERE id=?', (stamp, user['id']))
        self.conn.commit()
        user['last_seen_at'] = stamp

    def user_activity(self, uid, recent_limit=60):
        """Qué escucha una cuenta: totales, canciones y artistas favoritos, e historial."""
        from datetime import datetime
        month = datetime.utcnow().strftime('%Y-%m')
        rows = self.conn.execute(
            'SELECT track_id, played_at, month, listener_plan, source FROM listens WHERE listener_id=? ORDER BY played_at DESC',
            (uid,)).fetchall()
        tracks = self.tracks_brief([r['track_id'] for r in rows])
        shares = self.track_artist_shares() if rows else {}
        artists = self.users_brief([a for r in rows for a, _ in shares.get(r['track_id'], [])])
        def tname(tid): return (tracks.get(tid) or {}).get('title', '(canción borrada)')
        def anames(tid):
            return ', '.join((artists.get(a) or {}).get('display_name') or (artists.get(a) or {}).get('username', '')
                             for a, _ in shares.get(tid, [])) or (tracks.get(tid) or {}).get('artist', '')
        by_track, by_artist, by_month = {}, {}, {}
        for r in rows:
            t = by_track.setdefault(r['track_id'], {'track_id': r['track_id'], 'title': tname(r['track_id']),
                                                    'artists': anames(r['track_id']), 'listens': 0, 'last': r['played_at']})
            t['listens'] += 1
            for a, frac in shares.get(r['track_id'], []):
                x = by_artist.setdefault(a, {'artist_id': a, 'name': (artists.get(a) or {}).get('display_name')
                                             or (artists.get(a) or {}).get('username', ''), 'listens': 0.0})
                x['listens'] += frac
            by_month[r['month']] = by_month.get(r['month'], 0) + 1
        return {
            'listens_total': len(rows),
            'listens_month': by_month.get(month, 0),
            'distinct_tracks': len(by_track),
            'last_listen_at': rows[0]['played_at'] if rows else None,
            'by_month': [{'month': m, 'listens': n} for m, n in sorted(by_month.items(), reverse=True)],
            'top_tracks': sorted(by_track.values(), key=lambda v: -v['listens'])[:15],
            'top_artists': [dict(v, listens=round(v['listens'], 1)) for v in
                            sorted(by_artist.values(), key=lambda v: -v['listens'])[:10]],
            'recent': [{'track_id': r['track_id'], 'title': tname(r['track_id']), 'artists': anames(r['track_id']),
                        'played_at': r['played_at'], 'plan': r['listener_plan'], 'source': r['source']}
                       for r in rows[:recent_limit]],
        }

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

    # ── Escuchas y regalías ───────────────────────────────────────────────────
    #
    # listens: una fila por escucha que cuenta (>= 30 s escuchados). Guarda quién
    # escuchó y con qué plan en ese momento, para poder repartir el dinero de
    # cada oyente de pago entre los artistas que él escuchó (modelo por oyente).
    # Sin claves foráneas a propósito: es el libro de contabilidad y no debe
    # perder filas si se borra una cuenta o una canción.

    def _create_royalty_tables(self):
        pk = 'SERIAL PRIMARY KEY' if self.pg else 'INTEGER PRIMARY KEY AUTOINCREMENT'
        for stmt in (
            f"""CREATE TABLE IF NOT EXISTS listens (
                id              {pk},
                track_id        INTEGER NOT NULL,
                listener_id     INTEGER,
                listener_plan   TEXT DEFAULT '',
                is_self         INTEGER DEFAULT 0,
                source          TEXT DEFAULT 'web',
                client_event_id TEXT UNIQUE,
                played_at       TEXT NOT NULL,
                month           TEXT NOT NULL
            )""",
            "CREATE INDEX IF NOT EXISTS idx_listens_month ON listens(month)",
            "CREATE INDEX IF NOT EXISTS idx_listens_track ON listens(track_id, month)",
            "CREATE INDEX IF NOT EXISTS idx_listens_listener ON listens(listener_id, track_id, played_at)",
            f"""CREATE TABLE IF NOT EXISTS royalty_payouts (
                id         {pk},
                artist_id  INTEGER NOT NULL,
                month      TEXT NOT NULL,
                amount     INTEGER NOT NULL,
                note       TEXT DEFAULT '',
                paid_by    INTEGER,
                paid_at    TEXT NOT NULL,
                UNIQUE (artist_id, month)
            )""",
        ):
            self.conn.execute(stmt)
        self.conn.commit()

    def track_artist_shares(self, track_ids=None):
        """{track_id: [(artist_id, fraction)]} — owner + accepted collaborators.
        Canciones sin filas en track_artists: el dueño se lleva el 100%."""
        shares = {}
        for r in self.conn.execute(
                "SELECT track_id, user_id, percent FROM track_artists WHERE status='accepted'").fetchall():
            shares.setdefault(r['track_id'], []).append((r['user_id'], float(r['percent'] or 0) / 100.0))
        for r in self.conn.execute('SELECT id, user_id FROM tracks').fetchall():
            if not shares.get(r['id']) or sum(f for _, f in shares[r['id']]) <= 0:
                shares[r['id']] = [(r['user_id'], 1.0)]
        return shares

    def record_listen(self, track_id, listener, source='web', client_event_id=None, played_at=None):
        """Guarda una escucha. Devuelve True si se contó. Un mismo oyente no suma
        dos escuchas de la misma canción en menos de 30 segundos."""
        from datetime import datetime, timedelta
        t = self.conn.execute('SELECT id, user_id FROM tracks WHERE id=?', (track_id,)).fetchone()
        if not t:
            return False
        now = datetime.utcnow()
        when = now
        if played_at:   # escuchas sin conexión: la hora en que se escuchó de verdad
            try:
                when = datetime.fromisoformat(str(played_at).replace('Z', '+00:00')).replace(tzinfo=None)
                if when > now or when < now - timedelta(days=120):
                    when = now
            except ValueError:
                when = now
        stamp = when.strftime('%Y-%m-%d %H:%M:%S')
        lid = listener['id'] if listener else None
        if lid:
            since = (when - timedelta(seconds=30)).strftime('%Y-%m-%d %H:%M:%S')
            dup = self.conn.execute(
                'SELECT 1 FROM listens WHERE listener_id=? AND track_id=? AND played_at>=? AND played_at<=?',
                (lid, track_id, since, stamp)).fetchone()
            if dup:
                return False
        is_self = 0
        if lid:
            if t['user_id'] == lid or self.conn.execute(
                    "SELECT 1 FROM track_artists WHERE track_id=? AND user_id=? AND status='accepted'",
                    (track_id, lid)).fetchone():
                is_self = 1
        plan = (listener['plan'] or '') if listener else ''
        cur = self.conn.execute(
            'INSERT OR IGNORE INTO listens (track_id, listener_id, listener_plan, is_self, source, client_event_id, played_at, month) '
            'VALUES (?,?,?,?,?,?,?,?)',
            (track_id, lid, plan, is_self, source, client_event_id or None, stamp, stamp[:7]))
        if not cur.rowcount:      # client_event_id repetido: ya se contó
            self.conn.commit()
            return False
        self.conn.execute('UPDATE tracks SET play_count=play_count+1 WHERE id=?', (track_id,))
        self.conn.commit()
        return True

    def listen_months(self):
        return [r['month'] for r in self.conn.execute(
            'SELECT DISTINCT month FROM listens ORDER BY month DESC').fetchall()]

    def compute_royalties(self, month, price, artist_percent):
        """Reparto por oyente: el {artist_percent}% de lo que paga cada oyente de
        pago (plan Amante) se divide entre los artistas que ESE oyente escuchó en
        el mes, según cuánto los escuchó (y el % de cada artista en la canción).
        No cuentan las escuchas de un artista a sus propias canciones."""
        shares = self.track_artist_shares()
        rows = self.conn.execute(
            'SELECT track_id, listener_id, listener_plan, is_self FROM listens WHERE month=?',
            (month,)).fetchall()
        contribution = price * artist_percent / 100.0
        artists = {}   # artist_id -> stats
        def A(aid):
            return artists.setdefault(aid, {
                'artist_id': aid, 'amount': 0.0, 'paid_listens': 0.0, 'free_listens': 0.0,
                'anon_listens': 0.0, 'paid_listeners': set(), 'listeners': {}, 'tracks': {}})
        per_listener = {}   # listener_id -> {artist_id: weight}
        for r in rows:
            if r['is_self']:
                continue
            tid, lid = r['track_id'], r['listener_id']
            paid = r['listener_plan'] == 'amante' and lid is not None
            for aid, frac in shares.get(tid, []):
                a = A(aid)
                tr = a['tracks'].setdefault(tid, {'track_id': tid, 'paid_listens': 0.0, 'free_listens': 0.0, 'anon_listens': 0.0, 'amount': 0.0})
                if lid is None:
                    a['anon_listens'] += frac; tr['anon_listens'] += frac
                    continue
                li = a['listeners'].setdefault(lid, {'listener_id': lid, 'paid': False, 'listens': 0.0, 'amount': 0.0})
                li['listens'] += frac
                if paid:
                    li['paid'] = True
                    a['paid_listens'] += frac; tr['paid_listens'] += frac
                    a['paid_listeners'].add(lid)
                    w = per_listener.setdefault(lid, {})
                    w[(aid, tid)] = w.get((aid, tid), 0.0) + frac
                else:
                    a['free_listens'] += frac; tr['free_listens'] += frac
        ledger = []
        for lid, weights in per_listener.items():
            total = sum(weights.values())
            if total <= 0:
                continue
            alloc = {}
            for (aid, tid), w in weights.items():
                amt = contribution * w / total
                a = artists[aid]
                a['amount'] += amt
                a['tracks'][tid]['amount'] += amt
                a['listeners'][lid]['amount'] += amt
                x = alloc.setdefault(aid, {'artist_id': aid, 'listens': 0.0, 'amount': 0.0})
                x['listens'] += w; x['amount'] += amt
            ledger.append({'listener_id': lid, 'contribution': contribution,
                           'listens': total, 'allocations': sorted(alloc.values(), key=lambda v: -v['amount'])})
        for a in artists.values():
            a['paid_listeners'] = len(a['paid_listeners'])
        return {
            'month': month, 'price': price, 'artist_percent': artist_percent,
            'contribution_per_listener': contribution,
            'paying_listeners': len(ledger),
            'collected': price * len(ledger),
            'to_artists': sum(l['contribution'] for l in ledger),
            'artists': artists, 'ledger': ledger,
        }

    def get_payouts(self, artist_id=None, month=None):
        q, p = 'SELECT * FROM royalty_payouts WHERE 1=1', []
        if artist_id is not None: q += ' AND artist_id=?'; p.append(artist_id)
        if month is not None:     q += ' AND month=?';     p.append(month)
        return [dict(r) for r in self.conn.execute(q + ' ORDER BY month DESC', tuple(p)).fetchall()]

    def mark_payout(self, artist_id, month, amount, note, admin_id):
        if self.conn.execute('SELECT 1 FROM royalty_payouts WHERE artist_id=? AND month=?', (artist_id, month)).fetchone():
            self.conn.execute(
                "UPDATE royalty_payouts SET amount=?, note=?, paid_by=?, paid_at=datetime('now') WHERE artist_id=? AND month=?",
                (amount, note, admin_id, artist_id, month))
        else:
            self.conn.execute(
                "INSERT INTO royalty_payouts (artist_id, month, amount, note, paid_by, paid_at) VALUES (?,?,?,?,?,datetime('now'))",
                (artist_id, month, amount, note, admin_id))
        self.conn.commit()

    def users_brief(self, ids):
        ids = [i for i in set(ids) if i is not None]
        if not ids:
            return {}
        marks = ','.join('?' * len(ids))
        return {r['id']: dict(r) for r in self.conn.execute(
            f'SELECT id, username, display_name, avatar, plan FROM users WHERE id IN ({marks})', tuple(ids)).fetchall()}

    def tracks_brief(self, ids):
        ids = [i for i in set(ids) if i is not None]
        if not ids:
            return {}
        marks = ','.join('?' * len(ids))
        return {r['id']: dict(r) for r in self.conn.execute(
            f'SELECT id, title, artist, cover, media_type FROM tracks WHERE id IN ({marks})', tuple(ids)).fetchall()}

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

    def set_track_artists(self, track_id, owner_id, owner_percent, collaborators, preserve_status=False):
        """Record who made a track. `collaborators` is [{user_id, percent, role}];
        `role` is a credit like Productor / Máster / Mezcla (empty = artist).
        Each starts pending until that artist accepts. The uploader is stored
        as the owner and is accepted automatically.
        preserve_status=True (used when EDITING a published track) keeps a
        collaborator 'accepted' if they had already accepted, so a title/cover
        edit doesn't force everyone to accept again."""
        prev = {}
        if preserve_status:
            for r in self.conn.execute('SELECT user_id, status FROM track_artists WHERE track_id=?', (track_id,)).fetchall():
                prev[int(r['user_id'])] = r['status']
        self.conn.execute('DELETE FROM track_artists WHERE track_id=?', (track_id,))
        self.conn.execute(
            "INSERT INTO track_artists (track_id, user_id, percent, status, is_owner, role) VALUES (?,?,?,'accepted',1,'')",
            (track_id, owner_id, owner_percent)
        )
        for c in collaborators:
            uid = c.get('user_id')
            if not uid or int(uid) == int(owner_id):
                continue
            status = 'accepted' if prev.get(int(uid)) == 'accepted' else 'pending'
            self.conn.execute(
                "INSERT OR IGNORE INTO track_artists (track_id, user_id, percent, status, is_owner, role) VALUES (?,?,?,?,0,?)",
                (track_id, uid, float(c.get('percent') or 0), status, (c.get('role') or '').strip()[:40])
            )
        self.conn.commit()

    def update_track(self, track_id, title=None, cover=None):
        """Edit a published track's metadata. Only non-None fields change."""
        sets, vals = [], []
        if title is not None: sets.append('title=?');  vals.append(title)
        if cover is not None: sets.append('cover=?');  vals.append(cover)
        if not sets: return
        vals.append(track_id)
        self.conn.execute(f'UPDATE tracks SET {", ".join(sets)} WHERE id=?', tuple(vals))
        self.conn.commit()

    def get_track_artists(self, track_id, include_pending=False):
        q = '''
            SELECT ta.user_id, ta.percent, ta.status, ta.is_owner, ta.role,
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
            SELECT ta.track_id, ta.user_id, ta.percent, ta.is_owner, ta.role,
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

    def accept_track_collabs(self, track_id):
        """Marca aceptados a todos los colaboradores del tema (uso admin/curador)."""
        self.conn.execute(
            "UPDATE track_artists SET status='accepted' WHERE track_id=?", (track_id,))
        self.conn.commit()

    def get_pending_collabs(self, user_id):
        rows = self.conn.execute('''
            SELECT ta.track_id, ta.percent, ta.role, t.title, t.cover, t.media_type,
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
        """Escuchas sin conexión (archivos descargados) que el servidor no vio.
        Idempotente: client_event_id evita contar dos veces un reintento."""
        listener = self.get_user_by_id(user_id)
        applied = 0
        for ev in events:
            cid = (ev.get('client_event_id') or '').strip()
            tid = ev.get('track_id')
            if not cid or not tid:
                continue
            if self.record_listen(tid, listener, source='offline', client_event_id=cid, played_at=ev.get('played_at')):
                applied += 1
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

    # ── Playlists ─────────────────────────────────────────────────────────────

    def create_playlist(self, user_id, name):
        pid = self._insert_id('INSERT INTO playlists (user_id, name) VALUES (?,?)', (user_id, name))
        self.conn.commit()
        return pid

    def get_playlist(self, playlist_id):
        r = self.conn.execute('SELECT * FROM playlists WHERE id=?', (playlist_id,)).fetchone()
        return dict(r) if r else None

    def get_user_playlists(self, user_id):
        rows = self.conn.execute('''
            SELECT p.id, p.name, p.created_at,
                   (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id=p.id) AS track_count,
                   (SELECT pt.track_id FROM playlist_tracks pt WHERE pt.playlist_id=p.id
                      ORDER BY pt.position, pt.added_at LIMIT 1) AS cover_track_id
            FROM playlists p
            WHERE p.user_id=?
            ORDER BY p.created_at DESC
        ''', (user_id,)).fetchall()
        return [dict(r) for r in rows]

    def get_playlist_tracks(self, playlist_id, viewer_id=None):
        rows = self.conn.execute('''
            SELECT t.*, u.username, u.display_name,
                   (SELECT COUNT(*) FROM likes WHERE track_id=t.id) AS like_count,
                   (SELECT COUNT(*) FROM likes WHERE track_id=t.id AND user_id=?) AS liked_by_me
            FROM playlist_tracks pt
            JOIN tracks t ON pt.track_id=t.id
            JOIN users u ON t.user_id=u.id
            WHERE pt.playlist_id=? AND t.is_public=1
              AND (t.publish_at='' OR t.publish_at<=datetime('now') OR t.user_id=?)
            ORDER BY pt.position, pt.added_at
        ''', (viewer_id or 0, playlist_id, viewer_id or 0)).fetchall()
        return self._with_artists(rows)

    def add_to_playlist(self, playlist_id, track_id):
        row = self.conn.execute(
            'SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM playlist_tracks WHERE playlist_id=?',
            (playlist_id,)).fetchone()
        pos = row['pos'] if row else 0
        self.conn.execute(
            'INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?,?,?)',
            (playlist_id, track_id, pos))
        self.conn.commit()

    def remove_from_playlist(self, playlist_id, track_id):
        self.conn.execute('DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id=?', (playlist_id, track_id))
        self.conn.commit()

    def rename_playlist(self, playlist_id, name):
        self.conn.execute('UPDATE playlists SET name=? WHERE id=?', (name, playlist_id))
        self.conn.commit()

    def delete_playlist(self, playlist_id):
        self.conn.execute('DELETE FROM playlists WHERE id=?', (playlist_id,))
        self.conn.commit()

    def playlists_for_track(self, user_id, track_id):
        """The user's playlists, each flagged with whether it holds this track."""
        rows = self.conn.execute('''
            SELECT p.id, p.name,
                   (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id=p.id AND pt.track_id=?) AS has_track
            FROM playlists p
            WHERE p.user_id=?
            ORDER BY p.created_at DESC
        ''', (track_id, user_id)).fetchall()
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
              AND (t.publish_at='' OR t.publish_at<=datetime('now'))
            ORDER BY t.created_at DESC
            LIMIT ?
        ''', (user_id, user_id, limit)).fetchall()
        return self._with_artists(rows)

    # ── Search ────────────────────────────────────────────────────────────────

    def search(self, q, artists_only=False):
        """Tracks + accounts matching `q`. With `artists_only`, listener
        accounts (Gratis / Amante de la música with no music) are left out:
        only artist-plan accounts (pro/premium) or accounts that have published
        or are credited on a track show up."""
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
        artist_filter = '''
              AND (plan IN ('pro', 'premium')
                   OR EXISTS (SELECT 1 FROM tracks t2
                              WHERE t2.user_id = users.id AND t2.is_public = 1)
                   OR EXISTS (SELECT 1 FROM track_artists ta2
                              WHERE ta2.user_id = users.id AND ta2.status = 'accepted'))
        ''' if artists_only else ''
        users = self.conn.execute(f'''
            SELECT id, username, display_name, bio, avatar, plan,
                   (SELECT COUNT(*) FROM tracks WHERE user_id=users.id AND is_public=1) AS track_count
            FROM users
            WHERE (username LIKE ? OR display_name LIKE ?)
            {artist_filter}
            ORDER BY
              -- exact name first, then names that start with the query
              CASE WHEN username LIKE ? OR display_name LIKE ? THEN 0
                   WHEN username LIKE ? OR display_name LIKE ? THEN 1
                   ELSE 2 END,
              track_count DESC
            LIMIT 10
        ''', (like, like, q, q, f'{q}%', f'{q}%')).fetchall()
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
                if req['plan'] in ('pro', 'premium'):
                    self.conn.execute("UPDATE users SET account_type='artist' WHERE id=?", (req['user_id'],))
        self.conn.commit()

    # ── Account claims (an artist claiming a pre-created account) ────────────────
    def search_claimable_artists(self, q):
        """Artist accounts (users who have uploaded tracks) matching a name."""
        like = f'%{q}%'
        rows = self.conn.execute('''
            SELECT u.id, u.username, u.display_name, u.avatar,
                   (SELECT COUNT(*) FROM tracks t WHERE t.user_id=u.id) AS track_count
            FROM users u
            WHERE (u.username LIKE ? OR u.display_name LIKE ?)
              AND EXISTS (SELECT 1 FROM tracks t WHERE t.user_id=u.id)
            ORDER BY track_count DESC
            LIMIT 8
        ''', (like, like)).fetchall()
        return [dict(r) for r in rows]

    def create_account_claim(self, artist_user_id, email, contact, message):
        return self._insert_id(
            'INSERT INTO account_claims (artist_user_id, email, contact, message) VALUES (?,?,?,?)',
            (artist_user_id, email, contact, message)
        )

    def get_account_claim(self, cid):
        r = self.conn.execute('SELECT * FROM account_claims WHERE id=?', (cid,)).fetchone()
        return dict(r) if r else None

    def get_account_claims(self, status=None):
        q = '''
            SELECT c.*, u.username, u.display_name, u.email AS current_email
            FROM account_claims c JOIN users u ON c.artist_user_id=u.id
        '''
        if status:
            q += f" WHERE c.status='{status}'"
        q += ' ORDER BY c.created_at DESC'
        return [dict(r) for r in self.conn.execute(q).fetchall()]

    def review_account_claim(self, cid, admin_id, status):
        self.conn.execute(
            "UPDATE account_claims SET status=?, reviewed_by=?, reviewed_at=datetime('now') WHERE id=?",
            (status, admin_id, cid)
        )
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
        # Las claves que empiezan por '_' son internas (p. ej. la clave de sesión): no se exponen.
        return {r['key']: r['value'] for r in self.conn.execute('SELECT * FROM settings').fetchall()
                if not str(r['key']).startswith('_')}

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
