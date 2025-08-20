import asyncpg
from typing import Dict, Any, List, Optional, Union
import json
from .connection_manager import ConnectionManager
from .exceptions import VectorOperationError, ConnectionError, ValidationError

class VectorOperations:
    def __init__(self, connection_manager: ConnectionManager):
        self.connection_manager = connection_manager
    
    async def get_tables_with_vectors(self) -> List[Dict[str, Any]]:
        """Get all tables that contain vector columns with relationship detection"""
        if not self.connection_manager.is_connected():
            raise ConnectionError("No database connection available", 503)
        
        try:
            async with self.connection_manager.get_connection() as conn:
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
                
        except ConnectionError:
            # Re-raise connection errors without wrapping
            raise
        except Exception as e:
            raise VectorOperationError(f"Failed to get tables with vectors: {e}")
    
    async def get_collection_names(self, schema: str, table: str, id_column: str, name_column: str) -> Dict[str, str]:
        """Get collection names mapped to their IDs"""
        if not self.connection_manager.is_connected():
            raise ConnectionError("No database connection available", 503)
        
        try:
            async with self.connection_manager.get_connection() as conn:
                query = f'SELECT DISTINCT "{id_column}", "{name_column}" FROM "{schema}"."{table}" WHERE "{id_column}" IS NOT NULL AND "{name_column}" IS NOT NULL'
                rows = await conn.fetch(query)
                
                name_map = {}
                for row in rows:
                    id_val = row[id_column]
                    name_val = row[name_column]
                    if id_val is not None and name_val is not None:
                        name_map[str(id_val)] = str(name_val)
                
                return name_map
        except ConnectionError:
            # Re-raise connection errors without wrapping
            raise
        except Exception as e:
            # Log the error but return empty dict to avoid breaking the UI
            print(f"Failed to get collection names: {e}")
            return {}
    
    async def get_table_metadata(self, schema: str, table: str) -> Dict[str, Any]:
        """Get metadata for a specific table with optimized queries for better performance."""
        if not self.connection_manager.is_connected():
            raise ConnectionError("No database connection available", 503)
        try:
            print(f"Getting metadata for table: {schema}.{table}")
            async with self.connection_manager.get_connection() as conn:
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
                                    'is_nullable', is_nullable,
                                    'ordinal_position', ordinal_position
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
                                    'name', indexname,
                                    'definition', indexdef,
                                    'vector_index_type', vector_index_type
                                )
                            ), 
                            '[]'::json
                        ) 
                        FROM index_info
                    ) as indexes
                """
                
                result = await conn.fetchrow(metadata_query, schema, table)
                
                if not result:
                    raise Exception(f"Table {schema}.{table} not found")
                
                # Convert to dict and handle JSON columns
                metadata = dict(result)
                
                # Parse JSON columns
                for key in ['columns', 'indexes']:
                    if isinstance(metadata[key], str):
                        metadata[key] = json.loads(metadata[key])
                
                # Get vector column dimensions
                vector_columns = [col for col in metadata['columns'] if col['udt_name'] == 'vector']
                
                if vector_columns:
                    # Get dimensions for each vector column
                    for vc in vector_columns:
                        try:
                            dim_query = f"""
                            SELECT vector_dims("{vc['column_name']}") as dimensions
                            FROM "{schema}"."{table}"
                            WHERE "{vc['column_name']}" IS NOT NULL
                            LIMIT 1
                            """
                            dimensions = await conn.fetchval(dim_query)
                            vc['dimensions'] = dimensions
                        except Exception as e:
                            print(f"Error getting dimensions for {vc['column_name']}: {e}")
                            vc['dimensions'] = None
                
                # Get primary key info
                try:
                    pk_query = """
                    SELECT a.attname as column_name
                    FROM pg_index i
                    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                    WHERE i.indrelid = $1::regclass
                    AND i.indisprimary
                    """
                    table_oid = f'"{schema}"."{table}"'
                    pk_columns = await conn.fetch(pk_query, table_oid)
                    metadata['primary_key'] = [col['column_name'] for col in pk_columns]
                except Exception as e:
                    print(f"Error getting primary key for {schema}.{table}: {e}")
                    metadata['primary_key'] = []
                
                return metadata
        except ConnectionError:
            # Re-raise connection errors without wrapping
            raise
        except Exception as e:
            raise VectorOperationError(f"Failed to get table metadata: {e}")
    
    async def vector_search(
        self, 
        schema: str, 
        table: str, 
        vector_column: str, 
        query_vector: List[float], 
        limit: int = 10, 
        metric: str = 'cosine',
        filter_conditions: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Perform vector search with optional filtering"""
        if not self.connection_manager.is_connected():
            raise ConnectionError("No database connection available", 503)
        
        try:
            async with self.connection_manager.get_connection() as conn:
                # Validate metric
                if metric not in ['cosine', 'l2', 'inner', 'euclidean']:
                    raise ValidationError(f"Invalid distance metric: {metric}. Must be one of: cosine, l2, inner, euclidean")
                
                # Map metric names to pgvector operators
                operators = {
                    'cosine': '<=>',
                    'l2': '<->',
                    'euclidean': '<->',
                    'inner': '<#>'
                }
                
                operator = operators[metric]
                
                # Build the query
                base_query = f'SELECT * FROM "{schema}"."{table}"'
                
                # Add filter conditions if provided
                where_clauses = []
                params = []
                
                if filter_conditions:
                    param_index = 1
                    for column, value in filter_conditions.items():
                        # Simple sanitization to prevent SQL injection
                        if not all(c.isalnum() or c == '_' for c in column):
                            raise ValidationError(f"Invalid column name: {column}")
                        
                        where_clauses.append(f'"{column}" = ${param_index}')
                        params.append(value)
                        param_index += 1
                
                # Add vector search condition
                vector_param_index = len(params) + 1
                where_clauses.append(f'"{vector_column}" {operator} ${vector_param_index}')
                params.append(query_vector)
                
                # Combine where clauses
                if where_clauses:
                    base_query += " WHERE " + " AND ".join(where_clauses)
                
                # Add ordering and limit
                base_query += f' ORDER BY "{vector_column}" {operator} ${vector_param_index} LIMIT {limit}'
                
                # Execute query
                rows = await conn.fetch(base_query, *params)
                
                # Convert to list of dicts with proper JSON serialization
                result = []
                for row in rows:
                    row_dict = dict(row)
                    # Handle JSON serialization for special types
                    for key, value in row_dict.items():
                        if isinstance(value, (asyncpg.Record, list, dict)):
                            row_dict[key] = json.dumps(value)
                    result.append(row_dict)
                
                return result
        except ConnectionError:
            # Re-raise connection errors without wrapping
            raise
        except ValidationError:
            # Re-raise validation errors without wrapping
            raise
        except Exception as e:
            raise VectorOperationError(f"Vector search failed: {str(e)}")