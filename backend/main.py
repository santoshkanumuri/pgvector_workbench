from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import asyncio
from datetime import datetime
from contextlib import asynccontextmanager
import os
from api import router as api_router
from auth import router as auth_router, get_current_user, UserOut
from session_manager import init_metadata_pool, list_user_sessions, create_session, connect_session, disconnect_session, get_session_record, cleanup_inactive, get_metadata_pool
from pydantic import BaseModel

# Background task for cleaning up inactive connections
async def cleanup_task():
    """Background task to clean up inactive database connections"""
    while True:
        try:
            await asyncio.sleep(300)  # Run every 5 minutes
            cleaned_count = await cleanup_inactive(max_idle_minutes=30)
            if cleaned_count > 0:
                print(f"Background cleanup: removed {cleaned_count} inactive connections")
        except Exception as e:
            print(f"Error in cleanup task: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("🚀 PgVector Workbench API starting up...")
    await init_metadata_pool()
    
    # Start background cleanup task
    cleanup_task_handle = asyncio.create_task(cleanup_task())
    print("🧹 Background cleanup task started")
    
    yield
    
    # Shutdown
    print("👋 PgVector Workbench API shutting down...")
    cleanup_task_handle.cancel()
    try:
        await cleanup_task_handle
    except asyncio.CancelledError:
        pass
    print("🧹 Background cleanup task stopped")

app = FastAPI(
    title="PgVector Workbench API", 
    version="1.0.0",
    description="A PostgreSQL vector database visualization tool",
    lifespan=lifespan
)

# Configure CORS for frontend (hardened)
origins_env = os.getenv("APP_CORS_ORIGINS", "*")
if origins_env == "*" or origins_env.strip() == "":
    cors_allow_origins = ["*"]
    cors_allow_credentials = False  # cannot use * with credentials
else:
    cors_allow_origins = [o.strip() for o in origins_env.split(",") if o.strip()]
    cors_allow_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins,
    allow_credentials=cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(auth_router)
app.include_router(api_router)

@app.get("/")
async def root():
    return {"message": "PgVector Workbench API is running", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    """Enhanced health check with system metrics"""
    try:
        # Check metadata database
        pool = get_metadata_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        
        # Get active session count
        from session_manager import _active_sessions
        active_sessions = len(_active_sessions)
        
        return {
            "status": "healthy",
            "metadata_db": "connected",
            "active_sessions": active_sessions,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


class SessionCreate(BaseModel):
    name: str
    db_url: str


@app.get("/sessions")
async def sessions(current_user: UserOut = Depends(get_current_user)):
    return {"sessions": await list_user_sessions(current_user.id)}


@app.post("/sessions")
async def create_new_session(payload: SessionCreate, current_user: UserOut = Depends(get_current_user)):
    sid = await create_session(current_user.id, payload.name, payload.db_url)
    return {"session_id": sid}


@app.post("/sessions/{session_id}/connect")
async def connect_existing_session(session_id: str, current_user: UserOut = Depends(get_current_user)):
    try:
        await connect_session(current_user.id, session_id)
        return {"connected": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/sessions/{session_id}/disconnect")
async def disconnect_existing_session(session_id: str, current_user: UserOut = Depends(get_current_user)):
    await disconnect_session(current_user.id, session_id)
    return {"disconnected": True}


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str, current_user: UserOut = Depends(get_current_user)):
    from session_manager import delete_session as ds
    ok = await ds(current_user.id, session_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"deleted": True}


@app.get("/sessions/{session_id}")
async def get_session(session_id: str, current_user: UserOut = Depends(get_current_user)):
    rec = await get_session_record(current_user.id, session_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Session not found")
    return rec

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8011, reload=True)
