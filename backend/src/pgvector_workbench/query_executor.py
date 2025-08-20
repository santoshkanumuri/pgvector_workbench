import asyncpg
from typing import Dict, Any, List, Optional, Tuple, Union
import json
from .connection_manager import ConnectionManager
from .exceptions import QueryError, ConnectionError, ValidationError

class QueryExecutor:
    def __init__(self, connection_manager: ConnectionManager):
        self.connection_manager = connection_manager
    
    async def execute_query(self, query: str, params: Optional[List[Any]] = None) -> List[Dict[str, Any]]:
        """Execute a query and return results as a list of dictionaries"""
        if not self.connection_manager.is_connected():
            raise ConnectionError("No database connection available", 503)
        
        try:
            async with self.connection_manager.get_connection() as conn:
                if params:
                    rows = await conn.fetch(query, *params)
                else:
                    rows = await conn.fetch(query)
                
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
        except Exception as e:
            raise QueryError(f"Query execution failed: {str(e)}")
    
    async def execute_modification(self, query: str, params: Optional[List[Any]] = None) -> int:
        """Execute a modification query (INSERT, UPDATE, DELETE) and return affected row count"""
        if not self.connection_manager.is_connected():
            raise ConnectionError("No database connection available", 503)
        
        try:
            async with self.connection_manager.get_connection() as conn:
                if params:
                    result = await conn.execute(query, *params)
                else:
                    result = await conn.execute(query)
                
                # Parse the result to get the count (e.g., "DELETE 5" -> 5)
                if result and ' ' in result:
                    count_str = result.split(' ')[1]
                    if count_str.isdigit():
                        return int(count_str)
                return 0
        except ConnectionError:
            # Re-raise connection errors without wrapping
            raise
        except Exception as e:
            raise QueryError(f"Modification query failed: {str(e)}")
    
    async def get_table_data(
        self, 
        schema: str, 
        table: str, 
        offset: int = 0, 
        limit: int = 20, 
        sort_by: Optional[str] = None, 
        sort_order: str = 'asc',
        collection_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get table data with pagination, sorting, and optional filtering by collection_id"""
        if not self.connection_manager.is_connected():
            raise ConnectionError("No database connection available", 503)
        
        try:
            async with self.connection_manager.get_connection() as conn:
                # Build the query with proper quoting and parameterization
                base_query = f'SELECT * FROM "{schema}"."{table}"'
                count_query = f'SELECT COUNT(*) FROM "{schema}"."{table}"'
                
                # Add collection_id filter if provided
                where_clause = ""
                params: List[Any] = []
                if collection_id:
                    where_clause = " WHERE collection_id = $1"
                    params.append(collection_id)
                
                # Add sorting if provided
                order_clause = ""
                if sort_by:
                    # Sanitize sort_by to prevent SQL injection
                    if not all(c.isalnum() or c == '_' for c in sort_by):
                        raise ValidationError(f"Invalid sort column: {sort_by}")
                    
                    # Validate sort_order
                    sort_direction = "ASC" if sort_order.lower() == 'asc' else "DESC"
                    order_clause = f' ORDER BY "{sort_by}" {sort_direction}'
                
                # Add pagination
                pagination = f" LIMIT {limit} OFFSET {offset}"
                
                # Execute count query
                count_result = await conn.fetchval(count_query + where_clause, *params)
                
                # Execute data query
                full_query = base_query + where_clause + order_clause + pagination
                rows = await conn.fetch(full_query, *params)
                
                # Convert to list of dicts with proper JSON serialization
                result = []
                for row in rows:
                    row_dict = dict(row)
                    # Handle JSON serialization for special types
                    for key, value in row_dict.items():
                        if isinstance(value, (asyncpg.Record, list, dict)):
                            row_dict[key] = json.dumps(value)
                    result.append(row_dict)
                
                # Get column information
                columns_query = """
                SELECT column_name, data_type, udt_name
                FROM information_schema.columns
                WHERE table_schema = $1 AND table_name = $2
                ORDER BY ordinal_position
                """
                columns = await conn.fetch(columns_query, schema, table)
                
                return {
                    "data": result,
                    "total": count_result,
                    "columns": [dict(col) for col in columns]
                }
        except ConnectionError:
            # Re-raise connection errors without wrapping
            raise
        except ValidationError:
            # Re-raise validation errors without wrapping
            raise
        except Exception as e:
            raise QueryError(f"Failed to get table data: {str(e)}")
    
    async def get_table_schema(self, schema: str, table: str) -> List[Dict[str, Any]]:
        """Get table schema information"""
        if not self.connection_manager.is_connected():
            raise ConnectionError("No database connection available", 503)
        
        try:
            async with self.connection_manager.get_connection() as conn:
                query = """
                SELECT 
                    column_name, 
                    data_type, 
                    udt_name,
                    is_nullable,
                    column_default,
                    character_maximum_length
                FROM information_schema.columns
                WHERE table_schema = $1 AND table_name = $2
                ORDER BY ordinal_position
                """
                
                columns = await conn.fetch(query, schema, table)
                return [dict(col) for col in columns]
        except ConnectionError:
            # Re-raise connection errors without wrapping
            raise
        except Exception as e:
            raise QueryError(f"Failed to get table schema: {str(e)}")
    
    async def get_primary_keys(self, schema: str, table: str) -> List[str]:
        """Get primary key columns for a table"""
        if not self.connection_manager.is_connected():
            raise ConnectionError("No database connection available", 503)
        
        try:
            async with self.connection_manager.get_connection() as conn:
                query = """
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
                    AND tc.table_schema = $1
                    AND tc.table_name = $2
                ORDER BY kcu.ordinal_position
                """
                
                rows = await conn.fetch(query, schema, table)
                return [row['column_name'] for row in rows]
        except ConnectionError:
            # Re-raise connection errors without wrapping
            raise
        except Exception as e:
            raise QueryError(f"Failed to get primary keys: {str(e)}")