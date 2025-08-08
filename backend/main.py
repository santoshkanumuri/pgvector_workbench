from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from contextlib import asynccontextmanager
from api import router as api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("🚀 PgVector Workbench API starting up...")
    yield
    # Shutdown
    print("👋 PgVector Workbench API shutting down...")

app = FastAPI(
    title="PgVector Workbench API", 
    version="1.0.0",
    description="A PostgreSQL vector database visualization tool",
    lifespan=lifespan
)

# Configure CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3011"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router)

@app.get("/")
async def root():
    return {"message": "PgVector Workbench API is running", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8011, reload=True)
