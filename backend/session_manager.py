import os
import uuid
import asyncio
import asyncpg
from datetime import datetime, timedelta
from typing import Dict, Optional, Any
from database import DatabaseManager
from dotenv import load_dotenv

# Ensure .env is loaded early so APP_METADATA_DB_URL / DATABASE_URL / POSTGRES_URL are available
load_dotenv()

_metadata_pool: Optional[asyncpg.Pool] = None
_session_lock = asyncio.Lock()
_active_sessions: Dict[str, DatabaseManager] = {}


def get_metadata_dsn() -> str:
    dsn = (
        os.getenv("APP_METADATA_DB_URL")
        or os.getenv("DATABASE_URL")
        or os.getenv("POSTGRES_URL")
        or os.getenv("POSTGRES_URI")
        or ""
    )
    # Normalize SQLAlchemy-style scheme (e.g. postgresql+psycopg2) to plain postgresql for asyncpg
    if dsn.startswith("postgresql+"):
        # keep everything after the '+' removed
        dsn = "postgresql://" + dsn.split("://", 1)[1]
    if dsn.startswith("postgres+"):
        dsn = "postgres://" + dsn.split("://", 1)[1]
    return dsn


async def init_metadata_pool():
    global _metadata_pool
    if _metadata_pool is None:
        dsn = get_metadata_dsn()
        if not dsn:
            # Help diagnose by listing which env vars are set
            present = {k: ("***set***" if os.getenv(k) else None) for k in ["APP_METADATA_DB_URL", "DATABASE_URL", "POSTGRES_URL", "POSTGRES_URI"]}
            raise RuntimeError(
                f"No metadata database URL provided (looked for APP_METADATA_DB_URL / DATABASE_URL / POSTGRES_URL / POSTGRES_URI). Present flags: {present}"
            )
        _metadata_pool = await asyncpg.create_pool(dsn, min_size=1, max_size=5)
        # Run migrations (idempotent) - ensure tables exist
        async with _metadata_pool.acquire() as conn:
            # Create tables if they don't exist (safe for production)
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS db_look_users (
                    id UUID PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    last_login_at TIMESTAMPTZ
                );
                CREATE TABLE IF NOT EXISTS db_look_sessions (
                    id UUID PRIMARY KEY,
                    user_id UUID REFERENCES db_look_users(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    db_url TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    last_db_name TEXT,
                    last_db_version TEXT
                );
                """
            )
            
            # Create indexes if they don't exist
            try:
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_db_look_sessions_user ON db_look_sessions(user_id);")
            except Exception:
                # Index might already exist, ignore
                pass


def get_metadata_pool() -> asyncpg.Pool:
    if _metadata_pool is None:
        raise RuntimeError("Metadata pool not initialized")
    return _metadata_pool


async def list_user_sessions(user_id: str):
    pool = get_metadata_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, name, created_at, last_used_at, last_db_name, last_db_version
            FROM db_look_sessions WHERE user_id = $1
            ORDER BY last_used_at DESC
            LIMIT 50
            """,
            user_id,
        )
    return [dict(r) for r in rows]


async def create_session(user_id: str, name: str, db_url: str) -> str:
    pool = get_metadata_pool()
    session_id = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO db_look_sessions (id, user_id, name, db_url)
            VALUES ($1, $2, $3, $4)
            """,
            session_id,
            user_id,
            name,
            db_url,
        )
    return session_id


async def delete_session(user_id: str, session_id: str) -> bool:
    pool = get_metadata_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM db_look_sessions WHERE id = $1 AND user_id = $2",
            session_id,
            user_id,
        )
    # Close active pool if any
    async with _session_lock:
        mgr = _active_sessions.pop(session_id, None)
        if mgr:
            await mgr.disconnect()
    return result.endswith("DELETE 1")


async def get_session_record(user_id: str, session_id: str) -> Optional[dict]:
    pool = get_metadata_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, user_id, name, db_url, last_used_at FROM db_look_sessions WHERE id = $1 AND user_id = $2",
            session_id,
            user_id,
        )
    return dict(row) if row else None


async def connect_session(user_id: str, session_id: str) -> DatabaseManager:
    """Connect to a session with proper error handling and connection validation"""
    # Ensure session exists and belongs to the user
    record = await get_session_record(user_id, session_id)
    if not record:
        raise ValueError(f"Session {session_id} not found for user {user_id}")
    
    async with _session_lock:
        # Double-check that another request didn't create the connection while we were waiting
        existing_mgr = _active_sessions.get(session_id)
        if existing_mgr and existing_mgr.is_connected():
            try:
                await existing_mgr.test_connection()
                return existing_mgr
            except Exception:
                # Connection test failed, proceed with creating new connection
                await existing_mgr.disconnect()
                _active_sessions.pop(session_id, None)
        
        # Create new manager with better error handling
        mgr = DatabaseManager()
        try:
            print(f"Connecting to database for session {session_id}")
            connected = await mgr.connect(record["db_url"])
            if not connected:
                await mgr.disconnect()  # Clean up any partial connection
                raise ValueError(f"Failed to connect to database for session {session_id}")
            
            # Test the connection works
            info = await mgr.test_connection()
            if not info.get("connected", False):
                await mgr.disconnect()
                raise ValueError(f"Database connection test failed for session {session_id}")
                
            _active_sessions[session_id] = mgr
            print(f"Successfully connected session {session_id}")
            
        except Exception as e:
            print(f"Connection failed for session {session_id}: {e}")
            await mgr.disconnect()  # Ensure cleanup
            raise ValueError(f"Connection error for session {session_id}: {str(e)}")
    
    # Update session metadata outside the lock to avoid blocking other requests
    try:
        pool = get_metadata_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE db_look_sessions SET last_used_at = NOW(), last_db_name = $2, last_db_version = $3 WHERE id = $1",
                session_id,
                info.get("database"),
                info.get("version"),
            )
    except Exception as e:
        print(f"Warning: Failed to update session metadata for {session_id}: {e}")
        # Don't fail the connection for metadata update issues
    
    return mgr


async def disconnect_session(user_id: str, session_id: str) -> bool:
    async with _session_lock:
        mgr = _active_sessions.pop(session_id, None)
        if mgr:
            await mgr.disconnect()
            return True
    return False


async def get_session_manager(user_id: str, session_id: str) -> DatabaseManager:
    """Get or create a database manager for a session with proper error handling and connection pooling"""
    async with _session_lock:
        mgr = _active_sessions.get(session_id)
        
        # Check if existing manager is still valid
        if mgr:
            if mgr.is_connected():
                # Test the connection to ensure it's actually working
                try:
                    await mgr.test_connection()
                    return mgr
                except Exception as e:
                    print(f"Existing connection test failed for session {session_id}: {e}")
                    # Connection is stale, remove it and create a new one
                    await mgr.disconnect()
                    _active_sessions.pop(session_id, None)
            else:
                # Connection is not active, remove from cache
                _active_sessions.pop(session_id, None)
    
    # Need to create a new connection
    return await connect_session(user_id, session_id)


async def cleanup_inactive(max_idle_minutes: int = 30):
    """Clean up inactive session connections to prevent resource leaks"""
    cutoff_time = datetime.now() - timedelta(minutes=max_idle_minutes)
    removed_sessions = []
    
    async with _session_lock:
        # Get list of sessions to check (copy to avoid modification during iteration)
        sessions_to_check = list(_active_sessions.items())
    
    # Check each session outside the lock to avoid blocking other operations
    for session_id, mgr in sessions_to_check:
        try:
            # Test if connection is still alive
            if not mgr.is_connected():
                async with _session_lock:
                    if session_id in _active_sessions:
                        _active_sessions.pop(session_id)
                        removed_sessions.append(session_id)
                continue
            
            # Test the connection with a timeout
            try:
                await asyncio.wait_for(mgr.test_connection(), timeout=5.0)
            except asyncio.TimeoutError:
                print(f"Connection test timeout for session {session_id}, removing")
                async with _session_lock:
                    if session_id in _active_sessions:
                        await mgr.disconnect()
                        _active_sessions.pop(session_id)
                        removed_sessions.append(session_id)
            except Exception as e:
                print(f"Connection test failed for session {session_id}: {e}, removing")
                async with _session_lock:
                    if session_id in _active_sessions:
                        await mgr.disconnect()
                        _active_sessions.pop(session_id)
                        removed_sessions.append(session_id)
                        
        except Exception as e:
            print(f"Error during cleanup of session {session_id}: {e}")
            # Remove the session to be safe
            async with _session_lock:
                if session_id in _active_sessions:
                    try:
                        await mgr.disconnect()
                    except:
                        pass  # Ignore errors during cleanup
                    _active_sessions.pop(session_id)
                    removed_sessions.append(session_id)
    
    if removed_sessions:
        print(f"Cleaned up {len(removed_sessions)} inactive sessions: {removed_sessions}")
    
    return len(removed_sessions)
