from typing import Dict, Any, List, Optional, Union
from .connection_manager import ConnectionManager, ConnectionInfo
from .query_executor import QueryExecutor
from .vector_operations import VectorOperations

class DatabaseManager:
    """
    Integrated database manager that combines connection management,
    query execution, and vector operations functionality.
    
    This class provides backward compatibility with the original database.py
    implementation while using the refactored modules internally.
    """
    
    def __init__(self):
        self._connection_manager = ConnectionManager()
        self._query_executor = QueryExecutor(self._connection_manager)
        self._vector_operations = VectorOperations(self._connection_manager)
    
    # Connection management methods (delegated to ConnectionManager)
    
    async def connect(self, connection_string: str) -> bool:
        """Connect to PostgreSQL database and test connection"""
        return await self._connection_manager.connect(connection_string)
    
    async def disconnect(self):
        """Close database connection with proper cleanup"""
        await self._connection_manager.disconnect()
    
    def is_connected(self) -> bool:
        """Check if database is connected"""
        return self._connection_manager.is_connected()
    
    def update_activity(self):
        """Update last activity timestamp for connection management"""
        self._connection_manager.update_activity()
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test current connection and return database info"""
        return await self._connection_manager.test_connection()
    
    # Query execution methods (delegated to QueryExecutor)
    
    async def execute_query(self, query: str, params: Optional[List[Any]] = None) -> List[Dict[str, Any]]:
        """Execute a query and return results as a list of dictionaries"""
        return await self._query_executor.execute_query(query, params)
    
    async def execute_modification(self, query: str, params: Optional[List[Any]] = None) -> int:
        """Execute a modification query (INSERT, UPDATE, DELETE) and return affected row count"""
        return await self._query_executor.execute_modification(query, params)
    
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
        return await self._query_executor.get_table_data(
            schema, table, offset, limit, sort_by, sort_order, collection_id
        )
    
    async def get_table_schema(self, schema: str, table: str) -> List[Dict[str, Any]]:
        """Get table schema information"""
        return await self._query_executor.get_table_schema(schema, table)
    
    async def get_primary_keys(self, schema: str, table: str) -> List[str]:
        """Get primary key columns for a table"""
        return await self._query_executor.get_primary_keys(schema, table)
    
    # Vector operations methods (delegated to VectorOperations)
    
    async def get_tables_with_vectors(self) -> List[Dict[str, Any]]:
        """Get all tables that contain vector columns with relationship detection"""
        return await self._vector_operations.get_tables_with_vectors()
    
    async def get_collection_names(self, schema: str, table: str, id_column: str, name_column: str) -> Dict[str, str]:
        """Get collection names mapped to their IDs"""
        return await self._vector_operations.get_collection_names(schema, table, id_column, name_column)
    
    async def get_table_metadata(self, schema: str, table: str) -> Dict[str, Any]:
        """Get metadata for a specific table with optimized queries for better performance."""
        return await self._vector_operations.get_table_metadata(schema, table)
    
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
        return await self._vector_operations.vector_search(
            schema, table, vector_column, query_vector, limit, metric, filter_conditions
        )