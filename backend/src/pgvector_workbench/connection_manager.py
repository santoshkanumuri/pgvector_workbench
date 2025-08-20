import asyncpg
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any
from contextlib import asynccontextmanager
from pydantic import BaseModel
from .exceptions import ConnectionError, TimeoutError, PgVectorWorkbenchError

class ConnectionInfo(BaseModel):
    host: str
    port: int
    database: str
    user: str
    password: str

class ConnectionManager:
    def __init__(self):
        self._connection_pool: Optional[asyncpg.Pool] = None
        self._connection_string: Optional[str] = None
        self._last_activity = datetime.now()
        self._connection_lock = asyncio.Lock()  # Protect connection operations
    
    async def connect(self, connection_string: str) -> bool:
        """Connect to PostgreSQL database and test connection with proper error handling"""
        async with self._connection_lock:
            try:
                # Close existing connection if any
                await self._cleanup_connection()
                
                print(f"Attempting to connect to database...")
                
                # Create new connection pool with optimized settings
                self._connection_pool = await asyncpg.create_pool(
                    connection_string,
                    min_size=2,  # Minimum connections for responsiveness
                    max_size=20,  # Increased max for concurrent users
                    max_queries=50000,  # Allow more queries per connection
                    max_inactive_connection_lifetime=300,  # 5 minutes
                    command_timeout=60,  # Increased timeout for large queries
                    server_settings={
                        'application_name': 'pgvector_workbench',
                        'statement_timeout': '300000',  # 5 minute statement timeout
                    }
                )
                
                print("Connection pool created, testing connection...")
                
                # Test connection with timeout
                try:
                    async with asyncio.timeout(10):  # 10 second timeout for initial connection
                        async with self._connection_pool.acquire() as conn:
                            await conn.fetchval("SELECT 1")
                except asyncio.TimeoutError:
                    await self._cleanup_connection()
                    print("Connection test timed out")
                    return False
                    
                print("Connection test successful!")
                self._connection_string = connection_string
                self._last_activity = datetime.now()
                return True
                
            except Exception as e:
                print(f"Connection failed with error: {type(e).__name__}: {e}")
                await self._cleanup_connection()
                return False
    
    async def _cleanup_connection(self):
        """Internal method to clean up connection pool"""
        if self._connection_pool:
            try:
                await self._connection_pool.close()
            except Exception as e:
                print(f"Error closing connection pool: {e}")
            finally:
                self._connection_pool = None
                self._connection_string = None
    
    async def disconnect(self):
        """Close database connection with proper cleanup"""
        async with self._connection_lock:
            await self._cleanup_connection()
    
    def is_connected(self) -> bool:
        """Check if database is connected"""
        return self._connection_pool is not None and not self._connection_pool._closed
    
    def update_activity(self):
        """Update last activity timestamp for connection management"""
        self._last_activity = datetime.now()
    
    @asynccontextmanager
    async def get_connection(self):
        """Get database connection from pool with activity tracking and error handling"""
        if not self.is_connected():
            raise ConnectionError("No database connection available", 503)
        
        try:
            # Update activity timestamp
            self.update_activity()
            
            # Get connection with timeout
            async with asyncio.timeout(30):  # 30 second timeout to acquire connection
                async with self._connection_pool.acquire() as connection:
                    yield connection
        except asyncio.TimeoutError:
            raise TimeoutError("Timeout acquiring database connection - pool may be exhausted", 408)
        except Exception as e:
            raise ConnectionError(f"Failed to acquire database connection: {str(e)}", 500)
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test current connection and return database info"""
        if not self.is_connected():
            return {"connected": False, "error": "No connection established"}
        
        try:
            async with self.get_connection() as conn:
                # Get basic database info
                db_version = await conn.fetchval("SELECT version()")
                db_name = await conn.fetchval("SELECT current_database()")
                
                # Check if pgvector extension exists
                pgvector_exists = await conn.fetchval("""
                    SELECT EXISTS(
                        SELECT 1 FROM pg_extension WHERE extname = 'vector'
                    )
                """)
                
                return {
                    "connected": True,
                    "database": db_name,
                    "version": db_version,
                    "pgvector_installed": pgvector_exists
                }
        except Exception as e:
            return {"connected": False, "error": str(e)}