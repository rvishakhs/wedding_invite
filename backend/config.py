from dataclasses import dataclass, field
import os
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent.parent


def validate_origin(value: str) -> str:
    origin = value.rstrip("/")
    parsed = urlsplit(origin)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path or parsed.query or parsed.fragment or parsed.username:
        raise ValueError("Origins must be absolute http(s) URLs without a path or credentials.")
    return origin


@dataclass(frozen=True)
class Settings:
    database_path: Path = field(default_factory=lambda: Path(os.getenv("WEDDING_DATABASE", str(ROOT / "backend" / "data" / "wedding.sqlite3"))))
    public_origin: str = field(default_factory=lambda: os.getenv("WEDDING_PUBLIC_ORIGIN", "http://127.0.0.1:5173"))
    cookie_secure: bool = field(default_factory=lambda: os.getenv("WEDDING_COOKIE_SECURE", "false").lower() == "true")
    session_hours: int = 12
    login_limit: int = 8
    login_window_seconds: int = 900
    dist_path: Path = field(default_factory=lambda: ROOT / "dist")
    allowed_origins: tuple[str, ...] = field(default_factory=lambda: tuple(filter(None, (value.strip() for value in os.getenv("WEDDING_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:8000,http://localhost:8000").split(",")))))

    def __post_init__(self):
        object.__setattr__(self, "public_origin", validate_origin(self.public_origin))
        object.__setattr__(self, "allowed_origins", tuple(validate_origin(value) for value in self.allowed_origins))
        object.__setattr__(self, "database_path", Path(self.database_path))
        object.__setattr__(self, "dist_path", Path(self.dist_path))

    @property
    def origins(self) -> set[str]:
        return {self.public_origin, *self.allowed_origins}
