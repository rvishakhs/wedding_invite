# Invitation API

FastAPI, Pydantic validation and SQLite persistence. Run commands from the repository root. See the [project README](../README.md) for the complete frontend/backend setup and deployment workflow.

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements-dev.txt
backend/.venv/Scripts/python -m backend.manage create-admin
backend/.venv/Scripts/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --no-access-log
```

`create-admin` privately prompts for a password of 12–256 characters. Re-running it resets the single account and revokes all sessions. No default account is created. Automated setup can set `WEDDING_ADMIN_USERNAME` and `WEDDING_ADMIN_PASSWORD`, then run `python -m backend.manage create-admin --from-env`; remove these environment values afterward. Passwords are never accepted as command-line arguments or written to logs.

## HTTP contract

All endpoints are under `/api`. JSON field names match the TypeScript frontend. Validation errors return HTTP 422 with FastAPI's `detail` array; other errors return `{"detail":"message"}`.

| Method / path | Behavior |
|---|---|
| `GET /health` | Database connectivity check |
| `POST /admin/login` | `{username,password}` → `{username,csrfToken}` and session cookie |
| `GET /admin/session` | Current `{username,csrfToken}`, otherwise 401 |
| `POST /admin/logout` | Revoke session; 204 |
| `GET /admin/invitations` | List, search, filter, pagination, global totals |
| `POST /admin/invitations` | `{name,events}` → created invitation; 201 |
| `PATCH /admin/invitations/{id}` | Edit `name`, `events`, `active`; optional `expectedUpdatedAt` |
| `GET /invitations/{token}` | Active invitation's `{name,events,response,updatedAt}` |
| `POST /invitations/{token}/rsvp` | Validated RSVP → `{response}` |

Admin mutations after login require `X-CSRF-Token` from the session response. The `wedding_admin_session` cookie is HTTP-only, SameSite Strict, scoped to `/api/admin`, and expires after 12 hours. Unknown users and wrong passwords share an error; eight failed sign-in attempts per client address within 15 minutes trigger HTTP 429. Origin checks apply to API writes. Development uses Vite's same-origin API proxy, so CORS is unnecessary.

Invitation events are `wedding` or `both`. Returned admin invitation fields are `id`, `name`, `events`, `token`, `active`, `createdAt`, `updatedAt`, `response`, `needsReview`, and absolute `url`. Name/event edits preserve the link; inactive links return 404 publicly.

List query parameters: `q` (literal case-insensitive name search), `status=all|pending|accepted|declined|inactive`, `page` (starting at 1), and `pageSize` (1–100, default 20). Response: `{items,total,page,pageSize,summary}`. `summary` contains `invitations`, `pending`, `accepted`, `declined`, `weddingGuests`, `receptionGuests`. Search/pagination do not change global totals. Inactive invitations are excluded from response and attendance totals. Responses requiring review are excluded from attendance counts.

Invitation creation accepts an optional `Idempotency-Key` of 16–128 URL-safe characters. Identical retries return the original invitation's current details; reusing the key with different creation data returns 409. PATCH can include the last observed `expectedUpdatedAt`; a changed version returns 409 without applying any edit. Versions advance even across same-tick writes or system clock corrections.

## RSVP validation and consistency

The body is the existing `RsvpPayload` from `src/lib/rsvp.ts`, with schema version 1 and occasion `visakh-archana-2027-02-11`. Requests must include `Idempotency-Key` matching `submissionId`. The backend validates contact details, boolean types, celebration membership, transport/attendance consistency, accommodation, lengths and positive safe integer counts. There is **no guest allowance or maximum assigned to an invitation**. Declined RSVPs contain zero guests and no celebration, transport, accommodation or dietary arrangements.

Every saved response gets a server timestamp. The input `respondedAt` must still be a valid timestamp with timezone but is excluded from the idempotency digest so a timestamp rebuilt during retry does not cause a false conflict. A submission ID reused with different answers returns 409. Replaying an older submission after a newer response returns the current saved response without overwriting it. Consumers must use the returned `{response}` as the canonical saved value.

Changing event access flags an existing RSVP for review. Admins can see the original response. A wedding-only public link never receives a previously saved reception response: its public response becomes `null` until the guest submits compatible answers. An old retry cannot clear this flag; a fresh submission is required. Wedding-only invitation requests containing reception attendance or transport are rejected on the server.

## Persistence and extensions

`database.py` owns numbered migrations via SQLite `PRAGMA user_version`. Version 1 creates the single admin, expiring sessions, login-attempt throttle, invitations, current responses and idempotency records. Foreign keys are enabled on each connection, WAL is enabled during initialization, and writes requiring read-modify-write use `BEGIN IMMEDIATE`. No application startup step deletes or resets user data. `create_app(Settings(...))` supports isolated tests without a live database.

Use SQLite's online backup API while the service is running:

```powershell
backend/.venv/Scripts/python -m backend.manage backup backend/data/backups/wedding-2026-10-21.sqlite3
backend/.venv/Scripts/python -m pytest backend/tests -q
```

The backup command refuses to overwrite an existing file. Restore by stopping the service and selecting a backup copied into a fresh directory with `WEDDING_DATABASE`; do not mix it with older WAL files. Protect backups because they contain guest contact details and credentials.

Future photo albums can use additional migrations and API routers. Store image files separately from the relational metadata; uploads and galleries are outside this initial implementation.

## Settings

- `WEDDING_DATABASE`: SQLite path; default `backend/data/wedding.sqlite3`.
- `WEDDING_PUBLIC_ORIGIN`: complete website origin, default `http://127.0.0.1:5173`. Used for share links and accepted origins; do not include a path.
- `WEDDING_COOKIE_SECURE`: `true` for HTTPS deployment; default `false` for local development.
- `WEDDING_ALLOWED_ORIGINS`: extra comma-separated origins. Default includes `http://localhost:5173`, `http://127.0.0.1:8000`, and `http://localhost:8000`. Set to an empty string for a deployment that only needs the public origin.

FastAPI serves the built `dist/` directory and SPA routes including `/admin` and `/invite/{token}`. Unknown `/api` routes and missing asset files return 404 instead of the SPA. API and invitation/admin routes use `no-store`, `noindex`, and `no-referrer` headers. Run with `--no-access-log`, and configure reverse-proxy access logs to avoid retaining guest token URLs.

The test client lifecycle follows the [official FastAPI testing guidance](https://fastapi.tiangolo.com/advanced/testing-events/).
