from dataclasses import replace
import sqlite3
import time
import uuid

from fastapi.testclient import TestClient
import pytest

from backend.app import create_app, updated_timestamp
from backend.config import Settings
from backend.database import SCHEMA_VERSION, connect, migrate
from backend.manage import backup_database, create_admin
from backend.security import hash_password, verify_password


PASSWORD = "test-only password with spaces"


@pytest.fixture
def settings(tmp_path):
    return Settings(database_path=tmp_path / "data" / "test.sqlite3", public_origin="http://testserver", allowed_origins=(), dist_path=tmp_path / "dist")


@pytest.fixture
def client(settings):
    create_admin(settings.database_path, "owner", PASSWORD)
    with TestClient(create_app(settings)) as browser:
        yield browser


def sign_in(client):
    result = client.post("/api/admin/login", json={"username": "owner", "password": PASSWORD})
    assert result.status_code == 200, result.text
    return {"X-CSRF-Token": result.json()["csrfToken"]}


def invite(client, events="both", name="Guest & Family", headers=None):
    headers = headers or sign_in(client)
    result = client.post("/api/admin/invitations", json={"name": name, "events": events}, headers=headers)
    assert result.status_code == 201, result.text
    return result.json()


def payload(events=None, attending=True):
    return {
        "schemaVersion": 1, "occasion": "visakh-archana-2027-02-11", "submissionId": str(uuid.uuid4()),
        "respondedAt": "2026-10-21T12:00:00.000Z", "fullName": "Guest Family", "contact": "+44 7700 900123",
        "attending": attending, "guestCount": 3 if attending else 0,
        "events": (events if events is not None else ["wedding", "reception"]) if attending else [],
        "transportation": {"wedding": False, "reception": False},
        "accommodation": {"required": False, "rooms": None}, "foodAllergies": "", "message": "See you soon!",
    }


def respond(client, invitation, data):
    return client.post(f"/api/invitations/{invitation['token']}/rsvp", json=data, headers={"Idempotency-Key": data["submissionId"]})


def test_authentication_csrf_cookie_logout_and_privacy(client):
    assert client.get("/api/admin/invitations").status_code == 401
    result = client.post("/api/admin/login", json={"username": "owner", "password": PASSWORD})
    assert result.status_code == 200
    cookie = result.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie and "path=/api/admin" in cookie
    assert result.headers["cache-control"] == "no-store"
    assert result.headers["referrer-policy"] == "no-referrer"
    assert client.get("/api/admin/session").json() == result.json()
    assert client.post("/api/admin/invitations", json={"name": "Person", "events": "both"}).status_code == 403
    assert client.post("/api/admin/logout").status_code == 403
    headers = {"X-CSRF-Token": result.json()["csrfToken"]}
    assert client.post("/api/admin/logout", headers=headers).status_code == 204
    assert client.get("/api/admin/session").status_code == 401


def test_bad_credentials_and_throttling(client, settings):
    for _ in range(settings.login_limit):
        assert client.post("/api/admin/login", json={"username": "unknown", "password": "incorrect"}).status_code == 401
    response = client.post("/api/admin/login", json={"username": "owner", "password": PASSWORD})
    assert response.status_code == 429
    assert response.headers["retry-after"] == str(settings.login_window_seconds)


def test_origin_guard_and_size_limit(client):
    body = {"username": "owner", "password": PASSWORD}
    assert client.post("/api/admin/login", json=body, headers={"Origin": "https://untrusted.example"}).status_code == 403
    assert client.post("/api/admin/login", json=body, headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
    assert client.post("/api/admin/login", json=body, headers={"Origin": "http://testserver"}).status_code == 200
    assert client.post("/api/admin/login", content="x" * 66_000).status_code == 413


def test_create_edit_deactivate_and_public_projection(client):
    headers = sign_in(client)
    invitation = invite(client, "wedding", "  Priya & Family  ", headers)
    assert invitation["name"] == "Priya & Family"
    assert len(invitation["token"]) >= 43
    assert invitation["url"] == f"http://testserver/invite/{invitation['token']}"
    public = client.get(f"/api/invitations/{invitation['token']}").json()
    assert public == {"name": "Priya & Family", "events": "wedding", "response": None, "updatedAt": invitation["updatedAt"]}
    changed = client.patch(f"/api/admin/invitations/{invitation['id']}", json={"name": "Priya", "events": "both", "expectedUpdatedAt": invitation["updatedAt"]}, headers=headers)
    assert changed.status_code == 200
    assert changed.json()["token"] == invitation["token"]
    assert client.patch(f"/api/admin/invitations/{invitation['id']}", json={"name": "Stale", "expectedUpdatedAt": invitation["updatedAt"]}, headers=headers).status_code == 409
    inactive = client.patch(f"/api/admin/invitations/{invitation['id']}", json={"active": False}, headers=headers)
    assert inactive.status_code == 200 and not inactive.json()["active"]
    assert client.get(f"/api/invitations/{invitation['token']}").status_code == 404
    assert respond(client, invitation, payload()).status_code == 404
    assert client.get("/api/invitations/missing").status_code == 404
    assert client.patch("/api/admin/invitations/999", json={"active": True}, headers=headers).status_code == 404


def test_create_idempotency(client):
    headers = {**sign_in(client), "Idempotency-Key": str(uuid.uuid4())}
    body = {"name": "Asha", "events": "both"}
    first = client.post("/api/admin/invitations", json=body, headers=headers)
    second = client.post("/api/admin/invitations", json=body, headers=headers)
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    assert client.post("/api/admin/invitations", json={**body, "name": "Other"}, headers=headers).status_code == 409
    assert client.get("/api/admin/invitations").json()["total"] == 1


@pytest.mark.parametrize("body", [{"name": " ", "events": "both"}, {"name": "Name", "events": "reception"}, {"name": "Name", "events": "both", "guestAllowance": 1}])
def test_invalid_invitation_creation(client, body):
    assert client.post("/api/admin/invitations", json=body, headers=sign_in(client)).status_code == 422


def test_list_filters_pagination_and_totals(client):
    headers = sign_in(client)
    first = invite(client, name="Alice", headers=headers)
    second = invite(client, name="Bob", headers=headers)
    invite(client, name="100% Guest", headers=headers)
    inactive = invite(client, name="Inactive", headers=headers)
    assert respond(client, first, payload()).status_code == 200
    assert respond(client, second, payload(attending=False)).status_code == 200
    client.patch(f"/api/admin/invitations/{inactive['id']}", json={"active": False}, headers=headers)
    summary = client.get("/api/admin/invitations?pageSize=2").json()
    assert summary["total"] == 4 and len(summary["items"]) == 2
    assert summary["summary"] == {"invitations": 4, "pending": 1, "accepted": 1, "declined": 1, "weddingGuests": 3, "receptionGuests": 3}
    assert client.get("/api/admin/invitations?q=%25").json()["total"] == 1
    assert client.get("/api/admin/invitations?q=alice").json()["items"][0]["name"] == "Alice"
    for status in ["pending", "accepted", "declined", "inactive"]:
        assert client.get(f"/api/admin/invitations?status={status}").json()["total"] == 1
    assert client.get("/api/admin/invitations?page=0").status_code == 422


def test_rsvp_persistence_idempotency_updates_and_collision(client, settings):
    invitation = invite(client)
    first = payload()
    result = respond(client, invitation, first)
    assert result.status_code == 200, result.text
    saved = result.json()["response"]
    assert saved["respondedAt"] != first["respondedAt"]
    retried = {**first, "respondedAt": "2026-10-21T13:00:00Z"}
    assert respond(client, invitation, retried).json()["response"] == saved
    changed = {**first, "guestCount": 4}
    assert respond(client, invitation, changed).status_code == 409
    latest = payload(attending=False)
    newest = respond(client, invitation, latest).json()["response"]
    assert respond(client, invitation, first).json()["response"] == newest
    with TestClient(create_app(settings)) as restarted:
        assert restarted.get(f"/api/invitations/{invitation['token']}").json()["response"] == newest
    with connect(settings.database_path) as db:
        assert db.execute("SELECT COUNT(*) FROM responses").fetchone()[0] == 1
        assert db.execute("SELECT COUNT(*) FROM rsvp_submissions").fetchone()[0] == 2


def test_wedding_scope_and_changed_scope_review(client):
    headers = sign_in(client)
    invitation = invite(client, headers=headers)
    assert respond(client, invitation, payload()).status_code == 200
    updated = client.patch(f"/api/admin/invitations/{invitation['id']}", json={"events": "wedding"}, headers=headers).json()
    assert updated["needsReview"] and updated["response"]["events"] == ["wedding", "reception"]
    assert client.get(f"/api/invitations/{invitation['token']}").json()["response"] is None
    assert client.get("/api/admin/invitations").json()["summary"]["weddingGuests"] == 0
    assert respond(client, invitation, payload()).status_code == 422
    assert respond(client, invitation, payload(["reception"])).status_code == 422
    assert respond(client, invitation, payload(["wedding"])).status_code == 200
    current = client.get("/api/admin/invitations").json()
    assert not current["items"][0]["needsReview"]
    assert current["summary"]["weddingGuests"] == 3 and current["summary"]["receptionGuests"] == 0


@pytest.mark.parametrize("changes", [
    {"guestCount": 0}, {"guestCount": -1}, {"guestCount": 1.5}, {"guestCount": True}, {"guestCount": 9_007_199_254_740_992},
    {"attending": "yes"}, {"contact": "not a phone"}, {"contact": "bad@email"}, {"fullName": " "},
    {"events": []}, {"events": ["wedding", "wedding"]}, {"events": ["unexpected"]},
    {"respondedAt": "not a timestamp"}, {"respondedAt": "2026-10-21T12:00:00"},
    {"transportation": {"wedding": False, "reception": "true"}},
    {"accommodation": {"required": False, "rooms": 2}}, {"accommodation": {"required": True, "rooms": 0}},
    {"unexpected": "value"},
])
def test_rsvp_validation(client, changes):
    invitation = invite(client)
    data = {**payload(), **changes}
    assert respond(client, invitation, data).status_code == 422


def test_transport_decline_and_no_guest_allowance(client):
    invitation = invite(client, "wedding")
    data = payload(["wedding"])
    data["transportation"]["reception"] = True
    assert respond(client, invitation, data).status_code == 422
    declined = payload(attending=False)
    declined["accommodation"]["required"] = True
    assert respond(client, invitation, declined).status_code == 422
    data = payload(["wedding"])
    data["guestCount"] = 1000
    data["accommodation"] = {"required": True, "rooms": None}
    assert respond(client, invitation, data).status_code == 200
    assert client.post(f"/api/invitations/{invitation['token']}/rsvp", json=data).status_code == 400


def test_session_expiry_password_reset_and_secure_cookie(client, settings):
    sign_in(client)
    with connect(settings.database_path) as db:
        db.execute("UPDATE sessions SET expires_at = ?", (time.time() - 1,))
    assert client.get("/api/admin/session").status_code == 401
    sign_in(client)
    create_admin(settings.database_path, "owner", "a different secure password")
    assert client.get("/api/admin/session").status_code == 401
    with TestClient(create_app(replace(settings, cookie_secure=True)), base_url="https://testserver") as secure:
        login = secure.post("/api/admin/login", json={"username": "owner", "password": "a different secure password"})
        assert "Secure" in login.headers["set-cookie"]
        assert secure.get("/api/admin/session").status_code == 200


def test_migrations_foreign_keys_backup_and_no_default_account(settings):
    migrate(settings.database_path)
    migrate(settings.database_path)
    with connect(settings.database_path) as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == SCHEMA_VERSION
        assert db.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
        assert db.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        assert db.execute("SELECT COUNT(*) FROM admin").fetchone()[0] == 0
    create_admin(settings.database_path, "owner", PASSWORD)
    backup = settings.database_path.parent / "backup.sqlite3"
    backup_database(settings.database_path, backup)
    with sqlite3.connect(backup) as db:
        assert db.execute("SELECT username FROM admin").fetchone()[0] == "owner"
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    with pytest.raises(ValueError):
        backup_database(settings.database_path, backup)
    with connect(settings.database_path) as db:
        db.execute("PRAGMA user_version = 999")
    with pytest.raises(RuntimeError):
        migrate(settings.database_path)


def test_password_hashing_and_validation():
    encoded = hash_password(PASSWORD)
    assert encoded != hash_password(PASSWORD)
    assert PASSWORD not in encoded
    assert verify_password(PASSWORD, encoded)
    assert not verify_password("wrong", encoded)
    assert not verify_password(PASSWORD, "invalid")
    with pytest.raises(ValueError):
        hash_password("short")


def test_unicode_admin_and_timestamp_versions(client, settings):
    create_admin(settings.database_path, "Visākh", PASSWORD)
    result = client.post("/api/admin/login", json={"username": "Visākh", "password": PASSWORD})
    assert result.status_code == 200
    assert client.post("/api/admin/logout", headers={"X-CSRF-Token": "wrong"}).status_code == 403
    assert updated_timestamp("2099-01-01T00:00:00.000000Z") == "2099-01-01T00:00:00.000001Z"


def test_static_spa_and_api_fallback_boundaries(settings):
    settings.dist_path.mkdir()
    (settings.dist_path / "index.html").write_text("<h1>Invitation</h1>", encoding="utf-8")
    (settings.dist_path / "asset.css").write_text("body {}", encoding="utf-8")
    with TestClient(create_app(settings)) as client:
        for path in ["/", "/admin", "/invite/opaque-token"]:
            result = client.get(path)
            assert result.status_code == 200 and "<h1>Invitation</h1>" in result.text
        assert client.get("/invite/opaque-token").headers["cache-control"] == "no-store"
        assert client.get("/asset.css").status_code == 200
        assert client.get("/missing.js").status_code == 404
        assert client.get("/api/missing").status_code == 404
        assert client.get("/api").status_code == 404
        assert client.get("/..%2Fbackend%2Fconfig.py").status_code == 404
