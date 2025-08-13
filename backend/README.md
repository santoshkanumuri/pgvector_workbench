PgVector Workbench Backend
==========================

Features
--------
- FastAPI backend with asyncpg connection pools
- Multi-user authentication (JWT) with bcrypt password hashing
- Per-user multi-session database connections (each session stores its own target DB URL)
- Session metadata stored in internal tables with prefix `db_look_`
- Vector table exploration & search endpoints secured per session

Environment Variables
---------------------
Set these in a `.env` file (not committed) or deployment environment:

APP_JWT_SECRET=change-me
DATABASE_URL=postgresql://internal_user:pass@host:5432/internal_meta_db   # metadata store for auth + sessions
# Optionally override metadata DB:
# APP_METADATA_DB_URL=postgresql://...

Startup
-------
1. Install dependencies (uv / pip):
	pip install -r requirements.txt
2. Run server:
	uvicorn main:app --host 0.0.0.0 --port 8011

The first start auto-creates tables:
  db_look_users
  db_look_sessions

Auth Flow
---------
1. POST /auth/register {email,password}
2. POST /auth/login (OAuth2 password form) => access_token
3. Use Authorization: Bearer <token>
4. Create session: POST /sessions {name, db_url}
5. Connect session: POST /sessions/{id}/connect (establish underlying pool on demand)
6. Use X-Session-Id: <id> header for /api endpoints (/api/tables, /api/connection/status, etc.)

Security Notes
--------------
- User DB passwords are hashed with bcrypt via passlib.
- JWT secret must be strong & rotated for production.
- Session DB URLs are stored plaintext; for production consider encryption (KMS or libsodium) before insert.
- Enforce host allowlists or validations before creating sessions if exposing publicly.

Extending
---------
- Add rate limiting (e.g. slowapi) for /auth/login.
- Add background cleanup for idle sessions (currently placeholder function in session_manager.py).
- Add role-based access if needed (extend db_look_users schema).

License
-------
Internal project (add license info here).
