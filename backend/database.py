import asyncpg
import os
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any, List
from contextlib import asynccontextmanager
import json
import re
from pydantic import BaseModel

class ConnectionInfo(BaseModel):
    host: str
    port: int
    database: str
    user: str
    password: str

class DatabaseManager:
    def __init__(self):
        self._connection_pool: Optional[asyncpg.Pool] = None
        self._connection_string: Optional[str] = None
        self._last_activity = datetime.now()
        self._connection_lock = asyncio.Lock()  # Protect connection operations
        # Lightweight per-instance caches
        self._tables_cache: Optional[Dict[str, Any]] = None  # {"data": [...], "ts": datetime}
        self._metadata_cache: Dict[str, Dict[str, Any]] = {}  # key -> {"data": {...}, "ts": datetime}
        # TTLs (seconds)
        try:
            self._tables_cache_ttl = int(os.getenv("APP_TABLES_CACHE_TTL", "60"))
        except Exception:
            self._tables_cache_ttl = 60
        try:
            self._metadata_cache_ttl = int(os.getenv("APP_METADATA_CACHE_TTL", "30"))
        except Exception:
            self._metadata_cache_ttl = 30
    
    async def _setup_connection(self, connection):
        """Setup callback for new connections to optimize performance"""
        try:
            # Set connection-level parameters for better performance
            await connection.execute("SET work_mem = '16MB'")
            await connection.execute("SET maintenance_work_mem = '64MB'")
            await connection.execute("SET effective_cache_size = '1GB'")
            await connection.execute("SET random_page_cost = 1.1")
        except Exception as e:
            print(f"Warning: Failed to optimize connection settings: {e}")

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
                    min_size=1,  # Reduced minimum connections
                    max_size=10,  # Reduced max connections to prevent exhaustion
                    max_queries=50000,  # Allow more queries per connection
                    max_inactive_connection_lifetime=180,  # 3 minutes - shorter lifetime
                    command_timeout=30,  # Reduced timeout for better responsiveness
                    setup=self._setup_connection,  # Add connection setup
                    server_settings={
                        'application_name': 'pgvector_workbench',
                        'statement_timeout': '60000',  # 1 minute statement timeout
                        'idle_in_transaction_session_timeout': '30000',  # 30 second idle timeout
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
    
    @staticmethod
    def _is_safe_identifier(name: Optional[str]) -> bool:
        if not name:
            return False
        return all(c.isalnum() or c == '_' for c in name)
    
    @asynccontextmanager
    async def get_connection(self):
        """Get database connection from pool with activity tracking and error handling"""
        if not self.is_connected():
            raise Exception("No database connection available")
        
        try:
            # Update activity timestamp
            self.update_activity()
            
            # Get connection with shorter timeout to prevent hanging
            async with asyncio.timeout(10):  # 10 second timeout to acquire connection
                async with self._connection_pool.acquire() as connection:
                    yield connection
        except asyncio.TimeoutError:
            # Log pool stats for debugging
            if self._connection_pool:
                print(f"Pool stats - Size: {self._connection_pool.get_size()}, "
                      f"Min: {self._connection_pool.get_min_size()}, "
                      f"Max: {self._connection_pool.get_max_size()}, "
                      f"Free: {self._connection_pool.get_size() - self._connection_pool.get_idle_size()}")
            raise Exception("Timeout acquiring database connection - pool may be exhausted")
        except Exception as e:
            raise Exception(f"Failed to acquire database connection: {str(e)}")
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test current connection and return database info"""
        if not self.is_connected():
            return {"connected": False, "error": "No connection established"}
        
        try:
            # Use a shorter timeout for connection test to avoid hanging
            async with asyncio.timeout(5):
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
                        "pgvector_installed": pgvector_exists,
                        "pool_size": self._connection_pool.get_size() if self._connection_pool else 0,
                        "pool_idle": self._connection_pool.get_idle_size() if self._connection_pool else 0
                    }
        except asyncio.TimeoutError:
            return {"connected": False, "error": "Connection test timed out"}
        except Exception as e:
            return {"connected": False, "error": str(e)}

    def get_pool_stats(self) -> Dict[str, Any]:
        """Get connection pool statistics for monitoring"""
        if not self._connection_pool:
            return {"status": "no_pool"}
        
        return {
            "status": "active",
            "size": self._connection_pool.get_size(),
            "max_size": self._connection_pool.get_max_size(),
            "min_size": self._connection_pool.get_min_size(),
            "idle_size": self._connection_pool.get_idle_size(),
            "active_connections": self._connection_pool.get_size() - self._connection_pool.get_idle_size(),
            "closed": self._connection_pool._closed
        }
    
    async def get_tables_with_vectors(self) -> List[Dict[str, Any]]:
        """Get all tables that contain vector columns with relationship detection"""
        if not self.is_connected():
            raise Exception("No database connection available")
        
        try:
            # Serve from cache if fresh
            if self._tables_cache and (datetime.now() - self._tables_cache["ts"]).total_seconds() < self._tables_cache_ttl:
                return self._tables_cache["data"]
            async with self.get_connection() as conn:
                # Get vector tables
                query = """
                SELECT 
                    t.table_name,
                    t.table_schema,
                    c.column_name,
                    c.data_type,
                    c.udt_name
                FROM information_schema.tables t
                JOIN information_schema.columns c ON t.table_name = c.table_name 
                    AND t.table_schema = c.table_schema
                WHERE c.udt_name = 'vector'
                    AND t.table_schema NOT IN ('information_schema', 'pg_catalog')
                ORDER BY t.table_schema, t.table_name, c.column_name
                """
                
                rows = await conn.fetch(query)
                
                # Group by table
                tables = {}
                for row in rows:
                    table_key = f"{row['table_schema']}.{row['table_name']}"
                    if table_key not in tables:
                        tables[table_key] = {
                            "schema": row['table_schema'],
                            "name": row['table_name'],
                            "vector_columns": [],
                            "relationships": [],
                            "collections": []
                        }
                    
                    tables[table_key]["vector_columns"].append({
                        "name": row['column_name'],
                        "type": row['udt_name']
                    })

                # Detect LangChain collections and other relationships
                for table_key, table_info in tables.items():
                    # Check for LangChain pattern (collection_id column)
                    langchain_query = """
                    SELECT DISTINCT collection_id::text as collection_id, 
                           COUNT(*) as document_count,
                           (
                               SELECT cmetadata->>'source' 
                               FROM "{schema}"."{table}" as t2 
                               WHERE t2.collection_id = t1.collection_id 
                               AND cmetadata->>'source' IS NOT NULL 
                               LIMIT 1
                           ) as sample_source
                    FROM "{schema}"."{table}" as t1
                    WHERE collection_id IS NOT NULL
                    GROUP BY collection_id
                    ORDER BY collection_id
                    """.format(schema=table_info["schema"], table=table_info["name"])
                    
                    try:
                        collections = await conn.fetch(langchain_query)
                        print(f"Collections query result for {table_key}: {collections}")
                        if collections:
                            # Try to get actual collection names from langchain_pg_collection table
                            try:
                                collection_names_query = """
                                SELECT uuid::text as collection_id, name, cmetadata
                                FROM langchain_pg_collection
                                WHERE uuid = ANY($1::uuid[])
                                """
                                collection_ids = [collection['collection_id'] for collection in collections]
                                collection_names_result = await conn.fetch(collection_names_query, collection_ids)
                                
                                # Create a mapping of collection_id -> name
                                name_mapping = {}
                                for name_row in collection_names_result:
                                    name_mapping[name_row['collection_id']] = name_row['name']
                                    print(f"Found collection name: {name_row['collection_id']} -> {name_row['name']}")
                                    
                            except Exception as name_error:
                                print(f"Could not fetch collection names from langchain_pg_collection: {name_error}")
                                name_mapping = {}
                            
                            for collection in collections:
                                collection_id = str(collection['collection_id'])
                                
                                # Use actual name from langchain_pg_collection if available
                                if collection_id in name_mapping:
                                    display_name = name_mapping[collection_id]
                                    print(f"Using actual collection name: {display_name}")
                                else:
                                    # Fallback to deriving name from sample source or collection ID
                                    display_name = "Collection " + collection_id[:8]
                                    if collection['sample_source']:
                                        source = collection['sample_source']
                                        # Extract meaningful part from source (e.g., "OP30.15.md" -> "OP30 Collection")
                                        if '.' in source:
                                            base_name = source.split('.')[0]
                                            # Look for patterns like "OP30", "CH01", etc.
                                            if len(base_name) >= 3 and any(c.isdigit() for c in base_name):
                                                display_name = f"{base_name} Collection"
                                            else:
                                                display_name = f"{source} Collection"
                                        else:
                                            display_name = f"{source} Collection"
                                    print(f"Using fallback name: {display_name}")
                                
                                tables[table_key]["collections"].append({
                                    "id": collection_id,
                                    "name": display_name,
                                    "document_count": collection['document_count'],
                                    "type": "langchain_collection"
                                })
                        else:
                            print(f"No collections found for {table_key}")
                    except Exception as e:
                        print(f"Error querying collections for {table_key}: {e}")
                        # Try to see if collection_id column exists
                        try:
                            check_column_query = """
                            SELECT column_name FROM information_schema.columns 
                            WHERE table_schema = $1 AND table_name = $2 AND column_name = 'collection_id'
                            """
                            column_exists = await conn.fetchval(check_column_query, table_info["schema"], table_info["name"])
                            print(f"collection_id column exists in {table_key}: {column_exists is not None}")
                            
                            if column_exists:
                                # Try simpler query without COALESCE
                                simple_query = f'SELECT DISTINCT collection_id FROM "{table_info["schema"]}"."{table_info["name"]}" WHERE collection_id IS NOT NULL LIMIT 5'
                                simple_result = await conn.fetch(simple_query)
                                print(f"Simple collection_id query result for {table_key}: {simple_result}")
                        except Exception as inner_e:
                            print(f"Failed to check column existence for {table_key}: {inner_e}")
                        print(f"Skipping collection detection for {table_key}")
                    
                    # Original relationship detection for other patterns
                    relationship_query = """
                    SELECT 
                        c.column_name,
                        c.data_type,
                        ccu.table_schema AS referenced_table_schema,
                        ccu.table_name AS referenced_table_name,
                        ccu.column_name AS referenced_column_name
                    FROM information_schema.columns c
                    LEFT JOIN information_schema.key_column_usage kcu ON 
                        c.table_schema = kcu.table_schema AND
                        c.table_name = kcu.table_name AND
                        c.column_name = kcu.column_name
                    LEFT JOIN information_schema.referential_constraints rc ON 
                        kcu.constraint_name = rc.constraint_name AND
                        kcu.constraint_schema = rc.constraint_schema
                    LEFT JOIN information_schema.constraint_column_usage ccu ON
                        rc.unique_constraint_name = ccu.constraint_name AND
                        rc.unique_constraint_schema = ccu.constraint_schema
                    WHERE c.table_schema = $1 AND c.table_name = $2
                        AND (c.column_name ILIKE '%collection%id%' OR 
                             c.column_name ILIKE '%parent%id%' OR
                             c.column_name ILIKE '%collection%name%' OR
                             c.column_name ILIKE '%name%' OR
                             ccu.table_name IS NOT NULL)
                    """
                    
                    refs = await conn.fetch(relationship_query, table_info["schema"], table_info["name"])
                    
                    collection_name_column = None
                    # Look for collection name columns
                    for ref in refs:
                        if ('collection' in ref['column_name'].lower() and 'name' in ref['column_name'].lower()) or \
                           (ref['column_name'].lower() in ['name', 'title', 'display_name', 'collection_name']):
                            collection_name_column = ref['column_name']
                            break
                    
                    for ref in refs:
                        if ref['referenced_table_name']:
                            # Foreign key relationship found
                            referenced_table_key = f"{ref['referenced_table_schema']}.{ref['referenced_table_name']}"
                            if referenced_table_key in tables:
                                tables[table_key]["relationships"].append({
                                    "type": "foreign_key",
                                    "column": ref['column_name'],
                                    "references": {
                                        "schema": ref['referenced_table_schema'],
                                        "table": ref['referenced_table_name'],
                                        "column": ref['referenced_column_name']
                                    },
                                    "name_column": collection_name_column
                                })
                        elif 'collection' in ref['column_name'].lower() and ref['column_name'] != 'collection_id':
                            # Potential collection relationship (but not LangChain collection_id)
                            tables[table_key]["relationships"].append({
                                "type": "collection_reference",
                                "column": ref['column_name'],
                                "data_type": ref['data_type'],
                                "name_column": collection_name_column
                            })
                
                result = list(tables.values())
                self._tables_cache = {"data": result, "ts": datetime.now()}
                return result
                
        except Exception as e:
            raise Exception(f"Failed to get tables with vectors: {e}")
    
    async def get_collection_names(self, schema: str, table: str, id_column: str, name_column: str) -> Dict[str, str]:
        """Get collection names mapped to their IDs"""
        if not self.is_connected():
            raise Exception("No database connection available")
        if not (self._is_safe_identifier(id_column) and self._is_safe_identifier(name_column)):
            raise Exception("Invalid identifier provided")
        
        try:
            async with self.get_connection() as conn:
                query = f'SELECT DISTINCT "{id_column}", "{name_column}" FROM "{schema}"."{table}" WHERE "{id_column}" IS NOT NULL AND "{name_column}" IS NOT NULL'
                rows = await conn.fetch(query)
                
                name_map = {}
                for row in rows:
                    id_val = row[id_column]
                    name_val = row[name_column]
                    if id_val is not None and name_val is not None:
                        name_map[str(id_val)] = str(name_val)
                
                return name_map
        except Exception as e:
            print(f"Failed to get collection names: {e}")
            return {}
    
    async def get_table_metadata(self, schema: str, table: str) -> Dict[str, Any]:
        """Get metadata for a specific table with optimized queries for better performance."""
        if not self.is_connected():
            raise Exception("No database connection available")
        try:
            print(f"Getting metadata for table: {schema}.{table}")
            cache_key = f"{schema}.{table}"
            cached = self._metadata_cache.get(cache_key)
            if cached and (datetime.now() - cached["ts"]).total_seconds() < self._metadata_cache_ttl:
                return cached["data"]
            async with self.get_connection() as conn:
                # Use a single query to get multiple pieces of information efficiently
                metadata_query = """
                WITH table_stats AS (
                    SELECT 
                        c.reltuples::bigint AS approx_row_count,
                        pg_total_relation_size(c.oid) AS size_bytes,
                        pg_size_pretty(pg_total_relation_size(c.oid)) AS size_pretty
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = 'r'
                ),
                column_info AS (
                    SELECT 
                        column_name,
                        data_type,
                        udt_name,
                        is_nullable,
                        ordinal_position
                    FROM information_schema.columns 
                    WHERE table_schema = $1 AND table_name = $2
                    ORDER BY ordinal_position
                ),
                index_info AS (
                    SELECT 
                        indexname, 
                        indexdef,
                        CASE 
                            WHEN indexdef ILIKE '%USING ivfflat%' THEN 'ivfflat'
                            WHEN indexdef ILIKE '%USING hnsw%' THEN 'hnsw'
                            ELSE NULL 
                        END AS vector_index_type
                    FROM pg_indexes 
                    WHERE schemaname = $1 AND tablename = $2
                )
                SELECT 
                    (SELECT approx_row_count FROM table_stats) as approx_row_count,
                    (SELECT size_bytes FROM table_stats) as size_bytes,
                    (SELECT size_pretty FROM table_stats) as size_pretty,
                    (
                        SELECT COALESCE(
                            json_agg(
                                json_build_object(
                                    'column_name', column_name,
                                    'data_type', data_type,
                                    'udt_name', udt_name,
                                    'is_nullable', is_nullable
                                )
                            ),
                            '[]'::json
                        )
                        FROM column_info
                    ) as columns,
                    (
                        SELECT COALESCE(
                            json_agg(
                                json_build_object(
                                    'indexname', indexname,
                                    'indexdef', indexdef,
                                    'vector_index_type', vector_index_type
                                )
                            ),
                            '[]'::json
                        )
                        FROM index_info
                    ) as indexes;
                """
                
                print(f"Executing metadata query for {schema}.{table}")
                result = await conn.fetchrow(metadata_query, schema, table)
                
                if not result:
                    raise Exception(f"Table {schema}.{table} not found")

                print(f"Basic metadata retrieved for {schema}.{table}")

                # Get precise row count for small tables or if approximate is None
                approx_count = result['approx_row_count'] or 0
                if approx_count < 100000:  # Get precise count for smaller tables
                    try:
                        print(f"Getting precise row count for {schema}.{table}")
                        precise_count = await conn.fetchval(f'SELECT COUNT(*) FROM "{schema}"."{table}"')
                        row_count = precise_count
                        precise = True
                    except Exception as e:
                        print(f"Failed to get precise row count for {schema}.{table}: {e}")
                        row_count = approx_count
                        precise = False
                else:
                    row_count = approx_count
                    precise = False

                columns = result['columns'] or []
                print(f"Found {len(columns)} columns for {schema}.{table}")
                
                # Debug: Check what type of data we're getting
                if columns:
                    print(f"First column type: {type(columns[0])}, value: {columns[0]}")
                
                # Handle case where columns might be returned as strings instead of dicts
                if columns and isinstance(columns[0], str):
                    print("Columns returned as strings, parsing JSON...")
                    import json
                    try:
                        columns = [json.loads(col) if isinstance(col, str) else col for col in columns]
                        print(f"Successfully parsed {len(columns)} column objects")
                    except json.JSONDecodeError as e:
                        print(f"Failed to parse column JSON: {e}")
                        columns = []
                
                # Get vector dimensions for vector columns
                vector_info: Dict[str, Any] = {}
                for col in columns:
                    if isinstance(col, dict) and col.get('udt_name') == 'vector':
                        print(f"Processing vector column: {col['column_name']}")
                        try:
                            # More efficient vector dimension query
                            dim_query = f"""
                            SELECT COALESCE(
                                (SELECT vector_dims("{col['column_name']}") FROM "{schema}"."{table}" 
                                 WHERE "{col['column_name']}" IS NOT NULL LIMIT 1),
                                (SELECT a.atttypmod FROM pg_attribute a 
                                 JOIN pg_class c ON a.attrelid = c.oid 
                                 JOIN pg_namespace n ON c.relnamespace = n.oid 
                                 WHERE n.nspname = $1 AND c.relname = $2 AND a.attname = $3)
                            ) as dimension
                            """
                            print(f"Executing vector dimension query for {col['column_name']}")
                            dim_result = await conn.fetchval(dim_query, schema, table, col['column_name'])
                            vector_info[col['column_name']] = {"dimension": dim_result}
                            print(f"Vector column {col['column_name']} has dimension: {dim_result}")
                        except Exception as e:
                            print(f"Failed to get vector dimension for {col['column_name']}: {e}")
                            vector_info[col['column_name']] = {"dimension": None}

                print(f"Metadata retrieval completed for {schema}.{table}")
                result_obj = {
                    "schema": schema,
                    "table": table,
                    "row_count": row_count,
                    "row_count_precise": precise,
                    "columns": columns,
                    "vector_info": vector_info,
                    "size_bytes": result['size_bytes'] or 0,
                    "size_pretty": result['size_pretty'] or "Unknown",
                    "indexes": result['indexes'] or [],
                }
                self._metadata_cache[cache_key] = {"data": result_obj, "ts": datetime.now()}
                return result_obj
                
        except Exception as e:
            print(f"ERROR in get_table_metadata for {schema}.{table}: {e}")
            import traceback
            traceback.print_exc()
            raise Exception(f"Failed to get table metadata: {e}")

    async def get_table_schema(self, schema: str, table: str) -> List[Dict[str, Any]]:
        """Return detailed column info: data types, nullability, defaults, identity, lengths."""
        if not self.is_connected():
            raise Exception("No database connection available")
        try:
            async with self.get_connection() as conn:
                query = """
                SELECT 
                    column_name,
                    data_type,
                    udt_name,
                    is_nullable,
                    column_default,
                    character_maximum_length,
                    numeric_precision,
                    numeric_scale,
                    is_identity,
                    identity_generation,
                    collation_name
                FROM information_schema.columns
                WHERE table_schema = $1 AND table_name = $2
                ORDER BY ordinal_position
                """
                rows = await conn.fetch(query, schema, table)
                return [dict(r) for r in rows]
        except Exception as e:
            raise Exception(f"Failed to get table schema: {e}")

    async def get_table_stats(self, schema: str, table: str) -> Dict[str, Any]:
        """Return table stats from pg_stat/pg_statio plus size breakdown."""
        if not self.is_connected():
            raise Exception("No database connection available")
        try:
            async with self.get_connection() as conn:
                query = """
                SELECT 
                    s.seq_scan, s.idx_scan, s.n_tup_ins, s.n_tup_upd, s.n_tup_del,
                    s.n_live_tup, s.n_dead_tup,
                    s.last_vacuum, s.last_autovacuum, s.last_analyze, s.last_autoanalyze,
                    st.heap_blks_read, st.heap_blks_hit, st.idx_blks_read, st.idx_blks_hit,
                    pg_total_relation_size(c.oid) AS size_total,
                    pg_relation_size(c.oid) AS size_heap,
                    pg_indexes_size(c.oid) AS size_indexes
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                LEFT JOIN pg_stat_all_tables s ON s.relid = c.oid
                LEFT JOIN pg_statio_all_tables st ON st.relid = c.oid
                WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = 'r'
                """
                row = await conn.fetchrow(query, schema, table)
                return dict(row) if row else {}
        except Exception as e:
            raise Exception(f"Failed to get table stats: {e}")

    async def get_vector_indexes(self, schema: str, table: str) -> List[Dict[str, Any]]:
        """List vector indexes and parsed parameters from index definitions."""
        if not self.is_connected():
            raise Exception("No database connection available")
        try:
            async with self.get_connection() as conn:
                q = """
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE schemaname = $1 AND tablename = $2
                ORDER BY indexname
                """
                rows = await conn.fetch(q, schema, table)
                results: List[Dict[str, Any]] = []
                for r in rows:
                    idx = {"indexname": r["indexname"], "indexdef": r["indexdef"], "method": None, "column": None, "operator_class": None, "params": {}}
                    m = re.search(r"USING\s+(ivfflat|hnsw)\s*\(([^\)]+)\)", r["indexdef"], flags=re.IGNORECASE)
                    if m:
                        idx["method"] = m.group(1).lower()
                        colspec = m.group(2)
                        parts = colspec.split()
                        if parts:
                            idx["column"] = parts[0].strip('"')
                        if len(parts) > 1:
                            idx["operator_class"] = parts[1]
                        wp = re.search(r"WITH\s*\(([^\)]*)\)", r["indexdef"], flags=re.IGNORECASE)
                        if wp:
                            params_str = wp.group(1)
                            params: Dict[str, Any] = {}
                            for kv in [p.strip() for p in params_str.split(',') if p.strip()]:
                                if '=' in kv:
                                    k, v = kv.split('=', 1)
                                    params[k.strip()] = v.strip()
                            idx["params"] = params
                    results.append(idx)
                return results
        except Exception as e:
            raise Exception(f"Failed to get vector indexes: {e}")

    async def get_table_relations(self, schema: str, table: str) -> Dict[str, Any]:
        """Return foreign key relations: references and referenced_by."""
        if not self.is_connected():
            raise Exception("No database connection available")
        try:
            async with self.get_connection() as conn:
                refs_q = """
                SELECT 
                    tc.constraint_name,
                    kcu.column_name,
                    ccu.table_schema AS referenced_schema,
                    ccu.table_name AS referenced_table,
                    ccu.column_name AS referenced_column
                FROM information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
                WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1 AND tc.table_name = $2
                ORDER BY kcu.ordinal_position
                """
                outgoing = [dict(r) for r in await conn.fetch(refs_q, schema, table)]
                incoming_q = """
                SELECT 
                    tc.table_schema AS referencing_schema,
                    tc.table_name AS referencing_table,
                    kcu.column_name AS referencing_column,
                    ccu.column_name AS referenced_column,
                    tc.constraint_name
                FROM information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
                WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_schema = $1 AND ccu.table_name = $2
                ORDER BY kcu.ordinal_position
                """
                incoming = [dict(r) for r in await conn.fetch(incoming_q, schema, table)]
                return {"references": outgoing, "referenced_by": incoming}
        except Exception as e:
            raise Exception(f"Failed to get table relations: {e}")
    
    async def get_table_data(
        self, 
        schema: str, 
        table: str, 
        limit: int = 20, 
        offset: int = 0, 
        sort_by: Optional[str] = None, 
        sort_order: str = 'asc',
        collection_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get paginated data from a table"""
        if not self.is_connected():
            raise Exception("No database connection available")
        
        try:
            async with self.get_connection() as conn:
                # Build base query with optional collection filtering
                base_query = f'SELECT * FROM "{schema}"."{table}"'
                where_clause = ''
                query_params = []
                
                if collection_id:
                    where_clause = ' WHERE collection_id = $1'
                    query_params.append(collection_id)
                
                # Get total count with same filter
                count_query = f'SELECT COUNT(*) FROM "{schema}"."{table}"{where_clause}'
                if query_params:
                    total_count = await conn.fetchval(count_query, *query_params)
                else:
                    total_count = await conn.fetchval(count_query)
                
                # Build query with optional sorting
                order_by = ''
                if sort_by:
                    if not self._is_safe_identifier(sort_by):
                        raise Exception(f"Invalid sort column: {sort_by}")
                    sort_direction = 'DESC' if sort_order.lower() == 'desc' else 'ASC'
                    order_by = f' ORDER BY "{sort_by}" {sort_direction}'
                
                # Add LIMIT and OFFSET with appropriate parameter numbers
                limit_offset_params = [limit, offset]
                if query_params:
                    data_query = f'{base_query}{where_clause}{order_by} LIMIT ${len(query_params) + 1} OFFSET ${len(query_params) + 2}'
                    all_params = query_params + limit_offset_params
                else:
                    data_query = f'{base_query}{order_by} LIMIT $1 OFFSET $2'
                    all_params = limit_offset_params
                    
                rows = await conn.fetch(data_query, *all_params)
                
                # Convert rows to dictionaries and handle vector columns
                data = []
                for row in rows:
                    row_dict = {}
                    for key, value in row.items():
                        if isinstance(value, str) and value.startswith('[') and value.endswith(']'):
                            # Try to parse vector data
                            try:
                                row_dict[key] = json.loads(value)
                            except:
                                row_dict[key] = value
                        else:
                            row_dict[key] = value
                    data.append(row_dict)
                
                return {
                    "data": data,
                    "total_count": total_count,
                    "page_size": limit,
                    "offset": offset,
                    "has_next": (offset + limit) < total_count,
                    "has_previous": offset > 0
                }
                
        except Exception as e:
            raise Exception(f"Failed to get table data: {e}")
    
    async def get_collection_stats(self, schema: str, table: str, collection_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """Get statistics for collections including document length metrics"""
        if not self.is_connected():
            raise Exception("No database connection available")
        
        try:
            async with self.get_connection() as conn:
                stats = {}
                
                for collection_id in collection_ids:
                    # Check if the table has a document column (common in RAG applications)
                    # First, get all column names for the table
                    columns_query = f"""
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_schema = $1 AND table_name = $2
                    """
                    columns = await conn.fetch(columns_query, schema, table)
                    
                    # Look for potential document columns (text, json, jsonb types with names like document, content, text, etc.)
                    document_columns = []
                    for col in columns:
                        col_name = col['column_name'].lower()
                        col_type = col['data_type'].lower()
                        
                        if col_type in ('text', 'varchar', 'character varying', 'json', 'jsonb') and (
                            'document' in col_name or 
                            'content' in col_name or 
                            'text' in col_name or 
                            col_name in ('page_content', 'content', 'document', 'text', 'body')
                        ):
                            document_columns.append(col['column_name'])
                    
                    # If no document columns found, use any text column as fallback
                    if not document_columns:
                        for col in columns:
                            if col['data_type'].lower() in ('text', 'varchar', 'character varying'):
                                document_columns.append(col['column_name'])
                                break
                    
                    # Calculate statistics for each document column
                    collection_stats = {
                        "id": collection_id,
                        "avg_word_count": 0,
                        "median_word_count": 0,
                        "min_word_count": 0,
                        "max_word_count": 0,
                        "total_characters": 0,
                        "avg_characters": 0,
                        "avg_token_count": 0,
                        "tokens_per_character": 0,
                        "document_column": None
                    }
                    
                    # Get document dates if available (check if created_at column exists first)
                    try:
                        # First check if created_at column exists
                        check_column_query = """
                        SELECT column_name FROM information_schema.columns 
                        WHERE table_schema = $1 AND table_name = $2 AND column_name = 'created_at'
                        """
                        has_created_at = await conn.fetchval(check_column_query, schema, table)
                        
                        if has_created_at:
                            dates_query = f"""
                            SELECT 
                                MIN(created_at) as oldest_date,
                                MAX(created_at) as latest_date
                            FROM "{schema}"."{table}"
                            WHERE collection_id = $1
                            """
                            dates = await conn.fetchrow(dates_query, collection_id)
                            if dates and dates['oldest_date']:
                                collection_stats["oldest_document_date"] = dates['oldest_date'].isoformat() if dates['oldest_date'] else None
                                collection_stats["latest_document_date"] = dates['latest_date'].isoformat() if dates['latest_date'] else None
                        else:
                            # Try other common timestamp columns
                            for date_col in ['updated_at', 'modified_at', 'timestamp', 'date_created']:
                                check_alt_column_query = """
                                SELECT column_name FROM information_schema.columns 
                                WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
                                """
                                has_alt_column = await conn.fetchval(check_alt_column_query, schema, table, date_col)
                                if has_alt_column:
                                    dates_query = f"""
                                    SELECT 
                                        MIN("{date_col}") as oldest_date,
                                        MAX("{date_col}") as latest_date
                                    FROM "{schema}"."{table}"
                                    WHERE collection_id = $1
                                    """
                                    dates = await conn.fetchrow(dates_query, collection_id)
                                    if dates and dates['oldest_date']:
                                        collection_stats["oldest_document_date"] = dates['oldest_date'].isoformat() if dates['oldest_date'] else None
                                        collection_stats["latest_document_date"] = dates['latest_date'].isoformat() if dates['latest_date'] else None
                                    break
                    except Exception as e:
                        print(f"Could not get document dates: {e}")
                    
                    # Calculate statistics for each document column
                    for doc_col in document_columns:
                        try:
                            # Calculate average, min, max word count and character count
                            stats_query = f"""
                            SELECT 
                                AVG(array_length(regexp_split_to_array("{doc_col}"::text, '\\s+'), 1)) as avg_words,
                                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY array_length(regexp_split_to_array("{doc_col}"::text, '\\s+'), 1)) as median_words,
                                MIN(array_length(regexp_split_to_array("{doc_col}"::text, '\\s+'), 1)) as min_words,
                                MAX(array_length(regexp_split_to_array("{doc_col}"::text, '\\s+'), 1)) as max_words,
                                AVG(LENGTH("{doc_col}"::text)) as avg_chars,
                                SUM(LENGTH("{doc_col}"::text)) as total_chars,
                                COUNT(*) as doc_count
                            FROM "{schema}"."{table}"
                            WHERE collection_id = $1 AND "{doc_col}" IS NOT NULL
                            """
                            
                            col_stats = await conn.fetchrow(stats_query, collection_id)
                            
                            if col_stats and col_stats['avg_words'] is not None:
                                collection_stats["avg_word_count"] = float(col_stats['avg_words'])
                                collection_stats["median_word_count"] = float(col_stats['median_words']) if col_stats['median_words'] else 0
                                collection_stats["min_word_count"] = int(col_stats['min_words']) if col_stats['min_words'] is not None else 0
                                collection_stats["max_word_count"] = int(col_stats['max_words']) if col_stats['max_words'] is not None else 0
                                collection_stats["avg_characters"] = float(col_stats['avg_chars'])
                                collection_stats["total_characters"] = int(col_stats['total_chars'])
                                collection_stats["document_column"] = doc_col
                                
                                # Calculate token counts based on the rule of thumb:
                                # 1 token ≈ 4 characters or 3/4 of a word in English
                                # We'll use the character-based calculation as it's more reliable
                                avg_chars = float(col_stats['avg_chars'])
                                avg_words = float(col_stats['avg_words'])
                                
                                # Calculate tokens using both methods and take the average for better accuracy
                                tokens_by_chars = avg_chars / 4.0
                                tokens_by_words = avg_words * 0.75
                                
                                # Use the character-based calculation as primary method
                                collection_stats["avg_token_count"] = tokens_by_chars
                                
                                # Calculate tokens per character ratio
                                collection_stats["tokens_per_character"] = 0.25  # 1 token per 4 characters
                                break  # Use the first valid document column
                        except Exception as e:
                            print(f"Error calculating stats for column {doc_col}: {e}")
                    
                    stats[collection_id] = collection_stats
                
                return stats
                
        except Exception as e:
            print(f"Error in get_collection_stats: {e}")
            raise Exception(f"Failed to get collection statistics: {str(e)}")

    async def get_collection_info(self, schema: str, table: str, collection_id: str) -> Dict[str, Any]:
        """Get information about a specific collection including vector dimensions"""
        if not self.is_connected():
            raise Exception("No database connection available")
        
        try:
            async with self.get_connection() as conn:
                # Get a sample vector from this collection to determine dimensions
                sample_query = f'SELECT embedding FROM "{schema}"."{table}" WHERE collection_id = $1 LIMIT 1'
                sample_row = await conn.fetchrow(sample_query, collection_id)
                
                if sample_row:
                    embedding = sample_row['embedding']
                    print(f"Debug: embedding type: {type(embedding)}")
                    print(f"Debug: embedding value (first 100 chars): {str(embedding)[:100]}")
                    
                    # Handle different embedding storage formats
                    dimensions = 0
                    sample_values = []
                    
                    if isinstance(embedding, str):
                        # If stored as string, parse it
                        if embedding.startswith('[') and embedding.endswith(']'):
                            # JSON array format
                            try:
                                import json
                                parsed = json.loads(embedding)
                                dimensions = len(parsed)
                                sample_values = parsed[:5] if len(parsed) > 5 else parsed
                            except:
                                # Try comma-separated format
                                embedding_clean = embedding.strip('[]')
                                values = [float(x.strip()) for x in embedding_clean.split(',') if x.strip()]
                                dimensions = len(values)
                                sample_values = values[:5]
                        else:
                            # Try splitting by comma
                            values = [float(x.strip()) for x in embedding.split(',') if x.strip()]
                            dimensions = len(values)
                            sample_values = values[:5]
                    elif hasattr(embedding, '__len__'):
                        # If it's a list or array-like object
                        dimensions = len(embedding)
                        sample_values = embedding[:5] if dimensions > 5 else embedding
                    else:
                        # Try to get dimensions from PostgreSQL vector type
                        # Query the actual vector dimensions using PostgreSQL functions
                        dim_query = f'SELECT array_length(embedding::float[], 1) as dimensions FROM "{schema}"."{table}" WHERE collection_id = $1 LIMIT 1'
                        try:
                            dim_row = await conn.fetchrow(dim_query, collection_id)
                            dimensions = dim_row['dimensions'] if dim_row else 0
                        except Exception as e:
                            print(f"Debug: Failed to get dimensions via PostgreSQL: {e}")
                            dimensions = 0
                    
                    print(f"Debug: detected dimensions: {dimensions}")
                    
                    # Get collection metadata from langchain_pg_collection if available
                    try:
                        collection_query = """
                        SELECT name, cmetadata 
                        FROM langchain_pg_collection 
                        WHERE uuid = $1
                        """
                        collection_info = await conn.fetchrow(collection_query, collection_id)
                        collection_name = collection_info['name'] if collection_info else f"Collection {collection_id[:8]}"
                    except:
                        collection_name = f"Collection {collection_id[:8]}"
                    
                    return {
                        "collection_id": collection_id,
                        "collection_name": collection_name,
                        "vector_dimensions": dimensions,
                        "sample_embedding": sample_values
                    }
                else:
                    raise Exception(f"No vectors found for collection {collection_id}")
                    
        except Exception as e:
            print(f"Debug: Error in get_collection_info: {e}")
            raise Exception(f"Failed to get collection info: {str(e)}")

    async def search_table(
        self, 
        schema: str, 
        table: str, 
        text_query: Optional[str] = None,
        search_column: Optional[str] = None,
        vector_column: Optional[str] = None,
        vector_query: Optional[List[float]] = None,
        limit: int = 10,
        metric: str = 'cosine',
        sort_by: Optional[str] = None,
        sort_order: str = 'asc',
        collection_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Search table data with text or vector similarity (cosine/l2/ip)."""
        if not self.is_connected():
            raise Exception("No database connection available")
        
        # Debug: Print all input parameters
        print(f"SEARCH DEBUG - Parameters received:")
        print(f"  schema: {schema}")
        print(f"  table: {table}")
        print(f"  text_query: {text_query}")
        print(f"  search_column: {search_column}")
        print(f"  vector_column: {vector_column}")
        print(f"  vector_query: {vector_query} (type: {type(vector_query)})")
        print(f"  limit: {limit}")
        print(f"  metric: {metric}")
        print(f"  collection_id: {collection_id}")
        
        try:
            async with self.get_connection() as conn:
                where_conditions: List[str] = []
                params: List[Any] = []
                param_index = 0

                # Modify base query to include similarity score if doing vector search
                if vector_query and vector_column:
                    if not self._is_safe_identifier(vector_column):
                        raise Exception(f"Invalid vector column: {vector_column}")
                    # Build vector literal string for PostgreSQL: '[1,2,3]'
                    vector_literal = '[' + ','.join(str(x) for x in vector_query) + ']'
                    # Choose operator based on metric and convert to similarity score
                    if metric == 'cosine':
                        # Cosine distance (<=>) returns 0 for identical, 1 for opposite
                        # Convert to similarity: 1 - distance = similarity score
                        similarity_expr = f"(1 - (\"{vector_column}\" <=> '{vector_literal}'::vector))"
                        operator = '<=>'  # for ordering (ascending distance = descending similarity)
                    elif metric == 'ip':
                        # Inner product (<#>) - higher values = more similar (negative of actual inner product)
                        # Convert to positive similarity score
                        similarity_expr = f"(-(\"{vector_column}\" <#> '{vector_literal}'::vector))"
                        operator = '<#>'  # for ordering
                    else:  # l2
                        # L2 distance (<->) returns 0 for identical, higher for different
                        # Convert to similarity: 1 / (1 + distance) for normalized similarity
                        similarity_expr = f"(1 / (1 + (\"{vector_column}\" <-> '{vector_literal}'::vector)))"
                        operator = '<->'  # for ordering
                    
                    print(f"DEBUG: vector_literal = {vector_literal}")
                    print(f"DEBUG: metric = {metric}")
                    print(f"DEBUG: similarity_expr = {similarity_expr}")
                    
                    # Include similarity score in SELECT
                    base_query = f"SELECT *, {similarity_expr} AS similarity_score FROM \"{schema}\".\"{table}\""
                else:
                    base_query = f'SELECT * FROM "{schema}"."{table}"'

                # Add collection filtering if specified
                if collection_id:
                    param_index += 1
                    where_conditions.append(f'collection_id = ${param_index}')
                    params.append(collection_id)

                if text_query and search_column:
                    if not self._is_safe_identifier(search_column):
                        raise Exception(f"Invalid search column: {search_column}")
                    param_index += 1
                    where_conditions.append(f'"{search_column}"::text ILIKE ${param_index}')
                    params.append(f'%{text_query}%')

                order_by = ''
                if vector_query and vector_column:
                    # For vector similarity, order by the distance operator (ascending = most similar first)
                    if metric == 'cosine':
                        order_by = f'ORDER BY (\"{vector_column}\" <=> \'{vector_literal}\'::vector)'
                    elif metric == 'ip':
                        order_by = f'ORDER BY (\"{vector_column}\" <#> \'{vector_literal}\'::vector)'
                    else:  # l2
                        order_by = f'ORDER BY (\"{vector_column}\" <-> \'{vector_literal}\'::vector)'
                elif sort_by:
                    if not self._is_safe_identifier(sort_by):
                        raise Exception(f"Invalid sort column: {sort_by}")
                    # Regular column sorting
                    sort_direction = 'DESC' if sort_order.lower() == 'desc' else 'ASC'
                    order_by = f'ORDER BY "{sort_by}" {sort_direction}'

                if where_conditions:
                    query = f"{base_query} WHERE {' AND '.join(where_conditions)} {order_by} LIMIT {limit}"
                else:
                    query = f"{base_query} {order_by} LIMIT {limit}"

                # Debug: print query when vector search is involved
                if vector_query and vector_column:
                    print(f"Vector search query: {query}")
                    print(f"Parameters: {params}")

                rows = await conn.fetch(query, *params)

                data = []
                for row in rows:
                    row_dict = dict(row)
                    data.append(row_dict)
                    
                # Additional debug info when vector search is performed
                if vector_query and vector_column:
                    print(f"Vector search returned {len(data)} rows")
                    if data:
                        print(f"First row columns: {list(data[0].keys())}")
                        if 'similarity_score' in data[0]:
                            print(f"First row similarity_score: {data[0]['similarity_score']}")
                        else:
                            print("WARNING: similarity_score column not found in results!")

                # Get total count for the filtered collection (if collection_id is specified)
                total_count = len(data)
                if collection_id:
                    # Get the actual count for this collection
                    count_query = f'SELECT COUNT(*) as total FROM "{schema}"."{table}" WHERE collection_id = $1'
                    count_result = await conn.fetchrow(count_query, collection_id)
                    total_available = count_result['total'] if count_result else 0
                else:
                    # Get total count for the entire table
                    count_query = f'SELECT COUNT(*) as total FROM "{schema}"."{table}"'
                    count_result = await conn.fetchrow(count_query)
                    total_available = count_result['total'] if count_result else 0

                return {
                    "data": data,
                    "query_info": {
                        "text_query": text_query,
                        "search_column": search_column,
                        "vector_query_provided": vector_query is not None,
                        "vector_column": vector_column,
                        "limit": limit,
                        "metric": metric,
                        "sort_by": sort_by,
                        "sort_order": sort_order,
                        "has_similarity_score": vector_query is not None and vector_column is not None,
                        "collection_id": collection_id,
                        "results_returned": len(data),
                        "total_available_in_collection": total_available,
                    }
                }
        except Exception as e:
            raise Exception(f"Failed to search table: {e}")

# Global database manager instance
db_manager = DatabaseManager()
