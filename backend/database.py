from contextlib import contextmanager
from pathlib import Path
import sqlite3


SCHEMA_VERSION = 1

# Append future migrations, rather than replacing a live database.
MIGRATION_1 = (
    """CREATE TABLE admin (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL
    )""",
    """CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        admin_id INTEGER NOT NULL REFERENCES admin(id) ON DELETE CASCADE,
        csrf_token TEXT NOT NULL,
        expires_at REAL NOT NULL
    )""",
    "CREATE INDEX sessions_expiry ON sessions(expires_at)",
    """CREATE TABLE login_attempts (
        id INTEGER PRIMARY KEY,
        client_key TEXT NOT NULL,
        attempted_at REAL NOT NULL
    )""",
    "CREATE INDEX login_attempts_client_time ON login_attempts(client_key, attempted_at)",
    """CREATE TABLE invitations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        events TEXT NOT NULL CHECK (events IN ('wedding', 'both')),
        token TEXT NOT NULL UNIQUE,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        needs_review INTEGER NOT NULL DEFAULT 0 CHECK (needs_review IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )""",
    """CREATE TABLE responses (
        invitation_id INTEGER PRIMARY KEY REFERENCES invitations(id) ON DELETE CASCADE,
        payload TEXT NOT NULL,
        attending INTEGER NOT NULL CHECK (attending IN (0, 1)),
        guest_count INTEGER NOT NULL,
        wedding INTEGER NOT NULL,
        reception INTEGER NOT NULL,
        updated_at TEXT NOT NULL
    )""",
    """CREATE TABLE invitation_creations (
        admin_id INTEGER NOT NULL REFERENCES admin(id) ON DELETE CASCADE,
        idempotency_key TEXT NOT NULL,
        request_digest TEXT NOT NULL,
        invitation_id INTEGER NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
        PRIMARY KEY (admin_id, idempotency_key)
    )""",
    """CREATE TABLE rsvp_submissions (
        invitation_id INTEGER NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
        submission_id TEXT NOT NULL,
        request_digest TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (invitation_id, submission_id)
    )""",
)


@contextmanager
def connect(path: Path):
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA busy_timeout = 10000")
    try:
        with db:
            yield db
    finally:
        db.close()


def migrate(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with connect(path) as db:
        db.execute("PRAGMA journal_mode = WAL")
        db.execute("BEGIN IMMEDIATE")
        version = db.execute("PRAGMA user_version").fetchone()[0]
        if version > SCHEMA_VERSION:
            raise RuntimeError("The database is newer than this application; upgrade the service.")
        if version < 1:
            for statement in MIGRATION_1:
                db.execute(statement)
            db.execute("PRAGMA user_version = 1")
