"""Lets the app's SQLite-shaped data layer talk to Postgres with minimal churn.

`connect(dsn)` returns an object that mimics the sqlite3 connection the code
already uses:
  * .execute(sql, params) accepts '?' placeholders and returns a cursor whose
    .fetchone()/.fetchall() yield rows supporting BOTH r['col'] and r[0] and
    dict(r) — exactly like sqlite3.Row.
  * .executescript(sql) runs multi-statement DDL.
  * .commit()
All access is serialized through one connection + a lock, matching how SQLite
(with check_same_thread=False) behaved.
"""
import threading
import psycopg

_NOW_PG    = "to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS')"
_MONTH_PG  = "to_char(date_trunc('month', now() at time zone 'utc'),'YYYY-MM-DD HH24:MI:SS')"


def translate(sql):
    """Turn the app's SQLite-flavoured SQL into Postgres. Handles the few
    dialect bits used in method queries so the data layer stays unchanged.
    (Schema DDL is written natively per-dialect, not run through here.)"""
    q = sql.replace('?', '%s')
    q = q.replace("datetime('now')", _NOW_PG)
    q = q.replace("strftime('%Y-%m-01 00:00:00','now')", _MONTH_PG)
    q = q.replace(' LIKE ', ' ILIKE ')                     # SQLite LIKE is case-insensitive
    if 'INSERT OR IGNORE' in q:
        q = q.replace('INSERT OR IGNORE', 'INSERT')
        if 'ON CONFLICT' not in q.upper():
            q = q.rstrip().rstrip(';') + ' ON CONFLICT DO NOTHING'
    return q


class Row(dict):
    """A dict (so r['col'] and dict(r) work) that also supports r[0] indexing."""
    __slots__ = ('_vals',)

    def __init__(self, cols, vals):
        super().__init__(zip(cols, vals))
        self._vals = vals

    def __getitem__(self, k):
        if isinstance(k, int):
            return self._vals[k]
        return dict.__getitem__(self, k)


def _row_factory(cursor):
    desc = cursor.description
    cols = [c.name for c in desc] if desc else []
    def make(values):
        return Row(cols, values)
    return make


class PgConnection:
    def __init__(self, dsn):
        self._dsn = dsn
        self._lock = threading.RLock()
        self._conn = None
        self._connect()

    def _connect(self):
        # autocommit so a single long-lived pooled connection never sits "idle in
        # transaction"; the app's explicit .commit() calls then become no-ops.
        self._conn = psycopg.connect(self._dsn, autocommit=True, connect_timeout=15)

    def _ensure(self):
        try:
            if self._conn is None or self._conn.closed:
                self._connect()
        except Exception:
            self._connect()

    def execute(self, sql, params=()):
        q = translate(sql)
        with self._lock:
            self._ensure()
            try:
                cur = self._conn.cursor(row_factory=_row_factory)
                cur.execute(q, tuple(params) if params else None)
                return cur
            except Exception:
                try: self._conn.rollback()
                except Exception: pass
                raise

    def executescript(self, sql):
        with self._lock:
            self._ensure()
            try:
                with self._conn.cursor() as cur:
                    cur.execute(sql)
                self._conn.commit()
            except Exception:
                try: self._conn.rollback()
                except Exception: pass
                raise

    def commit(self):
        with self._lock:
            self._ensure()
            self._conn.commit()

    def close(self):
        try: self._conn.close()
        except Exception: pass


def connect(dsn):
    return PgConnection(dsn)
