"""Administrative commands: python -m backend.manage create-admin / backup."""
import argparse
from getpass import getpass
import os
from pathlib import Path
import sqlite3

from .config import Settings
from .database import connect, migrate
from .security import hash_password


def create_admin(database_path: Path, username: str, password: str) -> None:
    username = username.strip()
    if not username or len(username) > 100:
        raise ValueError("Choose an administrator username between 1 and 100 characters.")
    password_hash = hash_password(password)
    migrate(database_path)
    with connect(database_path) as db:
        db.execute("INSERT INTO admin(id, username, password_hash) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET username = excluded.username, password_hash = excluded.password_hash", (username, password_hash))
        db.execute("DELETE FROM sessions")


def backup_database(source: Path, destination: Path) -> None:
    if not source.is_file():
        raise ValueError("The source database does not exist.")
    if source.resolve() == destination.resolve() or destination.exists():
        raise ValueError("Choose a new backup filename; existing files are never overwritten.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with connect(source) as db:
        target = sqlite3.connect(destination)
        try:
            db.backup(target)
        finally:
            target.close()


def main():
    parser = argparse.ArgumentParser(description="Manage the wedding invitation backend.")
    commands = parser.add_subparsers(dest="command", required=True)
    admin = commands.add_parser("create-admin", help="Create or reset the single administrator; existing sessions are revoked.")
    admin.add_argument("--username", help="Otherwise read WEDDING_ADMIN_USERNAME or prompt.")
    admin.add_argument("--from-env", action="store_true", help="Read WEDDING_ADMIN_PASSWORD for unattended setup, instead of prompting.")
    backup = commands.add_parser("backup", help="Create a consistent SQLite backup, including committed WAL contents.")
    backup.add_argument("destination", type=Path)
    args = parser.parse_args()
    config = Settings()
    try:
        if args.command == "create-admin":
            username = args.username or os.getenv("WEDDING_ADMIN_USERNAME")
            if args.from_env:
                password = os.getenv("WEDDING_ADMIN_PASSWORD", "")
                if not username or not password:
                    raise ValueError("Set WEDDING_ADMIN_USERNAME and WEDDING_ADMIN_PASSWORD, or pass --username.")
            else:
                username = username or input("Admin username: ")
                password = getpass("Admin password (12+ characters): ")
                if password != getpass("Confirm password: "):
                    raise ValueError("Passwords do not match.")
            create_admin(config.database_path, username, password)
            print("Administrator saved. Existing admin sessions have been signed out.")
        else:
            backup_database(config.database_path, args.destination)
            print(f"Backup created: {args.destination.resolve()}")
    except (ValueError, OSError, sqlite3.Error) as error:
        parser.exit(1, f"Error: {error}\n")


if __name__ == "__main__":
    main()
