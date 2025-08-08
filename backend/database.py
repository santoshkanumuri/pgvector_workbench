import asyncpg
import asyncio
from typing import Optional, Dict, Any, List
from contextlib import asynccontextmanager
import json
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
    
    async def connect(self, connection_string: str) -> bool:
        """Connect to PostgreSQL database and test connection"""
        try:
            # Close existing connection if any
            await self.disconnect()
            
            print(f"Attempting to connect to database with connection string: {connection_string[:20]}...")
            
            # Create new connection pool
            self._connection_pool = await asyncpg.create_pool(
                connection_string,
                min_size=1,
                max_size=10,
                command_timeout=30
            )
            
            print("Connection pool created, testing connection...")
            
            # Test connection
            async with self._connection_pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
                
            print("Connection test successful!")
            self._connection_string = connection_string
            return True
            
        except Exception as e:
            print(f"Connection failed with error: {type(e).__name__}: {e}")
            await self.disconnect()
            return False
    
    async def disconnect(self):
        """Close database connection"""
        if self._connection_pool:
            await self._connection_pool.close()
            self._connection_pool = None
            self._connection_string = None
    
    def is_connected(self) -> bool:
        """Check if database is connected"""
        return self._connection_pool is not None
    
    @asynccontextmanager
    async def get_connection(self):
        """Get database connection from pool"""
        if not self._connection_pool:
            raise Exception("No database connection available")
        
        async with self._connection_pool.acquire() as connection:
            yield connection
    
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
    
    async def get_tables_with_vectors(self) -> List[Dict[str, Any]]:
        """Get all tables that contain vector columns with relationship detection"""
        if not self.is_connected():
            raise Exception("No database connection available")
        
        try:
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
                
                return list(tables.values())
                
        except Exception as e:
            raise Exception(f"Failed to get tables with vectors: {e}")
    
    async def get_collection_names(self, schema: str, table: str, id_column: str, name_column: str) -> Dict[str, str]:
        """Get collection names mapped to their IDs"""
        if not self.is_connected():
            raise Exception("No database connection available")
        
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
        """Get metadata for a specific table including size, index info, vector dimensions."""
        if not self.is_connected():
            raise Exception("No database connection available")
        try:
            print(f"Getting metadata for table: {schema}.{table}")
            async with self.get_connection() as conn:
                # Row count (approximate using reltuples for speed, fallback precise)
                print("Fetching row count...")
                relid = await conn.fetchrow(
                    """
                    SELECT c.reltuples::bigint AS approx, c.relname
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = 'r'
                    """,
                    schema, table
                )
                if relid and relid["approx"] is not None and relid["approx"] >= 1000000:
                    row_count = relid["approx"]  # use estimate for very large tables
                    precise = False
                else:
                    row_count = await conn.fetchval(f'SELECT COUNT(*) FROM "{schema}"."{table}"')
                    precise = True

                print(f"Row count: {row_count}")

                # Columns
                print("Fetching columns...")
                columns_query = """
                SELECT 
                    column_name,
                    data_type,
                    udt_name,
                    is_nullable
                FROM information_schema.columns 
                WHERE table_schema = $1 AND table_name = $2
                ORDER BY ordinal_position
                """
                columns = await conn.fetch(columns_query, schema, table)
                print(f"Found {len(columns)} columns")

                # Vector info (dimension, avg norm maybe later)
                print("Fetching vector info...")
                vector_info: Dict[str, Any] = {}
                for col in columns:
                    if col['udt_name'] == 'vector':
                        try:
                            # Build the query with proper identifier quoting
                            quoted_schema = f'"{schema}"'
                            quoted_table = f'"{table}"' 
                            quoted_column = f'"{col["column_name"]}"'
                            
                            # Try different approaches to get vector dimension
                            # First try: use array_length on the vector
                            vector_dim_query = f"SELECT array_length(string_to_array(replace(replace({quoted_column}::text, '[', ''), ']', ''), ','), 1) as dim FROM {quoted_schema}.{quoted_table} WHERE {quoted_column} IS NOT NULL LIMIT 1"
                            print(f"Executing vector dims query (array_length): {vector_dim_query}")
                            dim = await conn.fetchval(vector_dim_query)
                            
                            if dim is None:
                                # Alternative: try using vector_dims if it exists
                                try:
                                    vector_dim_query2 = f"SELECT vector_dims({quoted_column}) FROM {quoted_schema}.{quoted_table} WHERE {quoted_column} IS NOT NULL LIMIT 1"
                                    print(f"Trying vector_dims function: {vector_dim_query2}")
                                    dim = await conn.fetchval(vector_dim_query2)
                                except:
                                    # Last resort: get from pg_attribute (typmod contains dimension for vector type)
                                    dim_query = """
                                    SELECT a.atttypmod 
                                    FROM pg_attribute a 
                                    JOIN pg_class c ON a.attrelid = c.oid 
                                    JOIN pg_namespace n ON c.relnamespace = n.oid 
                                    WHERE n.nspname = $1 AND c.relname = $2 AND a.attname = $3
                                    """
                                    dim = await conn.fetchval(dim_query, schema, table, col['column_name'])
                                    
                            vector_info[col['column_name']] = {"dimension": dim}
                            print(f"Vector column {col['column_name']} has dimension: {dim}")
                        except Exception as e:
                            print(f"Failed to get vector dimension for {col['column_name']}: {e}")
                            vector_info[col['column_name']] = {"dimension": None}

                # Table size
                print("Fetching table size...")
                try:
                    # Use direct string formatting instead of format() function with parameters
                    size_query = f'SELECT pg_total_relation_size(\'"{schema}"."{table}"\') AS size_bytes'
                    size_bytes = await conn.fetchval(size_query)
                    print(f"Table size in bytes: {size_bytes}")
                except Exception as e:
                    print(f"Failed to get table size: {e}")
                    size_bytes = 0
                
                # Pretty size
                print("Fetching pretty size...")
                try:
                    pretty_size_query = f'SELECT pg_size_pretty(pg_total_relation_size(\'"{schema}"."{table}"\')) AS pretty_size'
                    size_pretty = await conn.fetchval(pretty_size_query)
                    print(f"Pretty size: {size_pretty}")
                except Exception as e:
                    print(f"Failed to get pretty size: {e}")
                    size_pretty = "Unknown"

                # Index info (including vector indexes like ivfflat / hnsw)
                print("Fetching index info...")
                try:
                    index_rows = await conn.fetch(
                        """
                        SELECT indexname, indexdef,
                               CASE 
                                 WHEN indexdef ILIKE '%USING ivfflat%' THEN 'ivfflat'
                                 WHEN indexdef ILIKE '%USING hnsw%' THEN 'hnsw'
                                 ELSE NULL END AS vector_index_type
                        FROM pg_indexes 
                        WHERE schemaname = $1 AND tablename = $2
                        ORDER BY indexname
                        """,
                        schema, table
                    )
                    indexes = [dict(r) for r in index_rows]
                    print(f"Found {len(indexes)} indexes")
                except Exception as e:
                    print(f"Failed to get indexes: {e}")
                    indexes = []

                print("Preparing final response...")
                result = {
                    "schema": schema,
                    "table": table,
                    "row_count": row_count,
                    "row_count_precise": precise,
                    "columns": [dict(col) for col in columns],
                    "vector_info": vector_info,
                    "size_bytes": size_bytes,
                    "size_pretty": size_pretty,
                    "indexes": indexes,
                }
                print("Metadata collection completed successfully!")
                return result
        except Exception as e:
            raise Exception(f"Failed to get table metadata: {e}")
    
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
