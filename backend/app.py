from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
from pathlib import Path
import secrets
import time
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, JSONResponse

from .config import Settings
from .database import connect, migrate
from .models import InvitationCreate, InvitationUpdate, Login, RsvpPayload
from .security import COOKIE_NAME, DUMMY_PASSWORD_HASH, token_hash, verify_password


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def updated_timestamp(previous: str) -> str:
    """Keep edit versions distinct, including same-tick writes or clock corrections."""
    previous_time = datetime.fromisoformat(previous.replace("Z", "+00:00"))
    timestamp = max(datetime.now(timezone.utc), previous_time + timedelta(microseconds=1))
    return timestamp.isoformat(timespec="microseconds").replace("+00:00", "Z")


def serialized(value: dict) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


INVITATION_SELECT = """SELECT invitations.*, responses.payload AS response_payload
    FROM invitations LEFT JOIN responses ON responses.invitation_id = invitations.id"""


def invitation_json(row, settings: Settings) -> dict:
    return {
        "id": row["id"], "name": row["name"], "events": row["events"],
        "token": row["token"], "active": bool(row["active"]),
        "createdAt": row["created_at"], "updatedAt": row["updated_at"],
        "response": json.loads(row["response_payload"]) if row["response_payload"] else None,
        "needsReview": bool(row["needs_review"]),
        "url": f"{settings.public_origin}/invite/{row['token']}",
    }


def permitted_response(row) -> dict | None:
    payload = json.loads(row["response_payload"]) if row["response_payload"] else None
    if payload and row["events"] == "wedding" and "reception" in payload["events"]:
        return None
    return payload


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        migrate(config.database_path)
        yield

    app = FastAPI(title="Wedding invitation management", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = config

    @app.middleware("http")
    async def privacy_and_origin_guard(request: Request, call_next):
        if request.url.path.startswith("/api/") and request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            if request.headers.get("sec-fetch-site") == "cross-site" or (origin and origin not in config.origins):
                response = JSONResponse({"detail": "This request origin is not allowed."}, status_code=403)
            else:
                body = bytearray()
                async for chunk in request.stream():
                    body.extend(chunk)
                    if len(body) > 65_536:
                        response = JSONResponse({"detail": "The request is too large."}, status_code=413)
                        break
                else:
                    request._body = bytes(body)
                    response = await call_next(request)
        else:
            response = await call_next(request)
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        if request.url.path.startswith(("/api", "/admin", "/invite")):
            response.headers["Cache-Control"] = "no-store"
            response.headers["X-Robots-Tag"] = "noindex, nofollow"
        return response

    def require_admin(request: Request):
        session_token = request.cookies.get(COOKIE_NAME, "")
        if not session_token or len(session_token) > 200:
            raise HTTPException(401, "Please sign in to manage invitations.")
        with connect(config.database_path) as db:
            session = db.execute(
                "SELECT sessions.*, admin.username FROM sessions JOIN admin ON admin.id = sessions.admin_id WHERE token_hash = ? AND expires_at > ?",
                (token_hash(session_token), time.time()),
            ).fetchone()
        if session is None:
            raise HTTPException(401, "Your session has expired. Please sign in again.")
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            csrf = request.headers.get("x-csrf-token", "")
            if not hmac.compare_digest(csrf.encode(), session["csrf_token"].encode()):
                raise HTTPException(403, "The session could not be verified. Please refresh and try again.")
        return dict(session)

    Admin = Annotated[dict, Depends(require_admin)]

    @app.get("/api/health")
    def health():
        with connect(config.database_path) as db:
            db.execute("SELECT 1").fetchone()
        return {"status": "ok"}

    @app.post("/api/admin/login")
    def login(body: Login, request: Request, response: Response):
        now = time.time()
        client_key = request.client.host if request.client else "unknown"
        with connect(config.database_path) as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM login_attempts WHERE attempted_at < ?", (now - config.login_window_seconds,))
            count = db.execute("SELECT COUNT(*) FROM login_attempts WHERE client_key = ?", (client_key,)).fetchone()[0]
            if count >= config.login_limit:
                raise HTTPException(429, "Too many sign-in attempts. Please wait 15 minutes and try again.", headers={"Retry-After": str(config.login_window_seconds)})
            db.execute("INSERT INTO login_attempts(client_key, attempted_at) VALUES (?, ?)", (client_key, now))
            admin = db.execute("SELECT * FROM admin WHERE id = 1").fetchone()
        valid_user = admin is not None and hmac.compare_digest(body.username.encode(), admin["username"].encode())
        valid_password = verify_password(body.password, admin["password_hash"] if valid_user else DUMMY_PASSWORD_HASH)
        if not valid_user or not valid_password:
            raise HTTPException(401, "The username or password is incorrect.")
        token = secrets.token_urlsafe(32)
        csrf = secrets.token_urlsafe(32)
        with connect(config.database_path) as db:
            db.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(request.cookies.get(COOKIE_NAME, "")),))
            db.execute("INSERT INTO sessions(token_hash, admin_id, csrf_token, expires_at) VALUES (?, 1, ?, ?)", (token_hash(token), csrf, now + config.session_hours * 3600))
            db.execute("DELETE FROM login_attempts WHERE client_key = ?", (client_key,))
        response.set_cookie(COOKIE_NAME, token, httponly=True, secure=config.cookie_secure, samesite="strict", max_age=config.session_hours * 3600, path="/api/admin")
        return {"username": admin["username"], "csrfToken": csrf}

    @app.get("/api/admin/session")
    def session(admin: Admin):
        return {"username": admin["username"], "csrfToken": admin["csrf_token"]}

    @app.post("/api/admin/logout", status_code=204)
    def logout(admin: Admin, response: Response):
        with connect(config.database_path) as db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (admin["token_hash"],))
        response.delete_cookie(COOKIE_NAME, path="/api/admin", secure=config.cookie_secure, httponly=True, samesite="strict")

    @app.get("/api/admin/invitations")
    def list_invitations(
        admin: Admin,
        q: Annotated[str, Query(max_length=200)] = "",
        status: Literal["all", "pending", "accepted", "declined", "inactive"] = "all",
        page: Annotated[int, Query(ge=1)] = 1,
        pageSize: Annotated[int, Query(ge=1, le=100)] = 20,
    ):
        conditions, params = [], []
        if q.strip():
            conditions.append("LOWER(invitations.name) LIKE LOWER(?) ESCAPE '\\'")
            escaped = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            params.append(f"%{escaped}%")
        if status == "inactive":
            conditions.append("invitations.active = 0")
        elif status != "all":
            conditions.append("invitations.active = 1")
            conditions.append({"pending": "responses.invitation_id IS NULL", "accepted": "responses.attending = 1", "declined": "responses.attending = 0"}[status])
        where = " WHERE " + " AND ".join(conditions) if conditions else ""
        with connect(config.database_path) as db:
            total = db.execute("SELECT COUNT(*) FROM invitations LEFT JOIN responses ON responses.invitation_id = invitations.id" + where, params).fetchone()[0]
            rows = db.execute(INVITATION_SELECT + where + " ORDER BY invitations.id DESC LIMIT ? OFFSET ?", [*params, pageSize, (page - 1) * pageSize]).fetchall()
            # Sum using Python integers so several individually safe guest counts cannot overflow SQLite.
            counts = db.execute("SELECT i.active, i.needs_review, r.attending, r.guest_count, r.wedding, r.reception FROM invitations i LEFT JOIN responses r ON r.invitation_id = i.id").fetchall()
        summary = {"invitations": len(counts), "pending": 0, "accepted": 0, "declined": 0, "weddingGuests": 0, "receptionGuests": 0}
        for row in counts:
            if not row["active"]:
                continue
            summary["pending" if row["attending"] is None else "accepted" if row["attending"] else "declined"] += 1
            if row["attending"] and not row["needs_review"]:
                summary["weddingGuests"] += row["guest_count"] if row["wedding"] else 0
                summary["receptionGuests"] += row["guest_count"] if row["reception"] else 0
        return {"items": [invitation_json(row, config) for row in rows], "total": total, "page": page, "pageSize": pageSize, "summary": summary}

    @app.post("/api/admin/invitations", status_code=201)
    def create_invitation(body: InvitationCreate, admin: Admin, idempotency_key: Annotated[str | None, Header(min_length=16, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")] = None):
        now = utc_now()
        digest = hashlib.sha256(serialized(body.model_dump()).encode()).hexdigest()
        with connect(config.database_path) as db:
            db.execute("BEGIN IMMEDIATE")
            if idempotency_key:
                existing = db.execute("SELECT * FROM invitation_creations WHERE admin_id = 1 AND idempotency_key = ?", (idempotency_key,)).fetchone()
                if existing:
                    if not hmac.compare_digest(existing["request_digest"], digest):
                        raise HTTPException(409, "This request identifier was already used for a different invitation.")
                    row = db.execute(INVITATION_SELECT + " WHERE invitations.id = ?", (existing["invitation_id"],)).fetchone()
                    return invitation_json(row, config)
            cursor = db.execute("INSERT INTO invitations(name, events, token, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", (body.name, body.events, secrets.token_urlsafe(32), now, now))
            if idempotency_key:
                db.execute("INSERT INTO invitation_creations(admin_id, idempotency_key, request_digest, invitation_id) VALUES (1, ?, ?, ?)", (idempotency_key, digest, cursor.lastrowid))
            row = db.execute(INVITATION_SELECT + " WHERE invitations.id = ?", (cursor.lastrowid,)).fetchone()
        return invitation_json(row, config)

    @app.patch("/api/admin/invitations/{invitation_id}")
    def update_invitation(invitation_id: int, body: InvitationUpdate, admin: Admin):
        with connect(config.database_path) as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(INVITATION_SELECT + " WHERE invitations.id = ?", (invitation_id,)).fetchone()
            if row is None:
                raise HTTPException(404, "Invitation not found.")
            fields = body.model_dump(exclude_unset=True)
            expected_updated_at = fields.pop("expectedUpdatedAt", None)
            if expected_updated_at is not None and expected_updated_at != row["updated_at"]:
                raise HTTPException(409, "This invitation changed since you opened it. Refresh the invitations and try again.")
            changed_events = "events" in fields and fields["events"] != row["events"]
            review = bool(row["needs_review"] or (changed_events and row["response_payload"]))
            db.execute(
                "UPDATE invitations SET name = ?, events = ?, active = ?, needs_review = ?, updated_at = ? WHERE id = ?",
                (fields.get("name", row["name"]), fields.get("events", row["events"]), fields.get("active", row["active"]), review, updated_timestamp(row["updated_at"]), invitation_id),
            )
            updated = db.execute(INVITATION_SELECT + " WHERE invitations.id = ?", (invitation_id,)).fetchone()
        return invitation_json(updated, config)

    @app.get("/api/invitations/{token}")
    def get_invitation(token: str):
        with connect(config.database_path) as db:
            row = db.execute(INVITATION_SELECT + " WHERE invitations.token = ? AND invitations.active = 1", (token,)).fetchone()
        if row is None:
            raise HTTPException(404, "This invitation is unavailable. Please contact the couple for your invitation link.")
        return {"name": row["name"], "events": row["events"], "response": permitted_response(row), "updatedAt": row["updated_at"]}

    @app.post("/api/invitations/{token}/rsvp")
    def save_rsvp(token: str, body: RsvpPayload, idempotency_key: Annotated[str | None, Header()] = None):
        if idempotency_key != body.submissionId:
            raise HTTPException(400, "The Idempotency-Key header must match submissionId.")
        data = body.model_dump()
        digest_data = {key: value for key, value in data.items() if key != "respondedAt"}
        digest = hashlib.sha256(serialized(digest_data).encode()).hexdigest()
        now = utc_now()
        with connect(config.database_path) as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(INVITATION_SELECT + " WHERE invitations.token = ? AND invitations.active = 1", (token,)).fetchone()
            if row is None:
                raise HTTPException(404, "This invitation is unavailable. Please contact the couple.")
            if row["events"] == "wedding" and ("reception" in body.events or body.transportation.reception):
                raise HTTPException(422, "This invitation includes the wedding ceremony only.")
            previous = db.execute("SELECT request_digest FROM rsvp_submissions WHERE invitation_id = ? AND submission_id = ?", (row["id"], body.submissionId)).fetchone()
            if previous:
                if not hmac.compare_digest(previous["request_digest"], digest):
                    raise HTTPException(409, "This submission identifier was already used for different answers. Please submit again with a new identifier.")
                current_response = permitted_response(row)
                if current_response is None:
                    raise HTTPException(409, "Your invitation changed. Please review the celebrations and send a new response.")
                return {"response": current_response}
            data["respondedAt"] = now
            payload = serialized(data)
            db.execute("INSERT INTO rsvp_submissions(invitation_id, submission_id, request_digest, payload, created_at) VALUES (?, ?, ?, ?, ?)", (row["id"], body.submissionId, digest, payload, now))
            db.execute("""INSERT INTO responses(invitation_id, payload, attending, guest_count, wedding, reception, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(invitation_id) DO UPDATE SET
                payload = excluded.payload, attending = excluded.attending, guest_count = excluded.guest_count,
                wedding = excluded.wedding, reception = excluded.reception, updated_at = excluded.updated_at""",
                (row["id"], payload, body.attending, body.guestCount, "wedding" in body.events, "reception" in body.events, now))
            db.execute("UPDATE invitations SET needs_review = 0, updated_at = ? WHERE id = ?", (updated_timestamp(row["updated_at"]), row["id"]))
        return {"response": data}

    @app.get("/{path:path}")
    def frontend(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "API route not found.")
        root = config.dist_path.resolve()
        target = (root / path).resolve()
        if not target.is_relative_to(root):
            raise HTTPException(404, "File not found.")
        if target.is_file():
            return FileResponse(target)
        # Missing assets must not silently return an HTML document.
        if Path(path).suffix or path.startswith("assets/"):
            raise HTTPException(404, "File not found.")
        index = root / "index.html"
        if index.is_file():
            return FileResponse(index, headers={"Cache-Control": "no-cache"})
        raise HTTPException(503, "The frontend has not been built yet. Run npm run build, or use the Vite development server.")

    return app


app = create_app()
