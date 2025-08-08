from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Dict, Any, List, Union
from database import db_manager
import json

router = APIRouter(prefix="/api", tags=["database"])

class ConnectionRequest(BaseModel):
    connection_string: str

class ConnectionResponse(BaseModel):
    success: bool
    message: str
    database_info: Optional[Dict[str, Any]] = None

class SearchRequest(BaseModel):
    schema_name: str  # Renamed from 'schema' to avoid BaseModel conflict
    table: str
    query: Optional[str] = None
    vector_column: Optional[str] = None
    vector_query: Optional[List[float]] = None
    search_column: Optional[str] = None
    limit: int = 10
    metric: str = 'cosine'
    sortBy: Optional[str] = None
    sortOrder: str = 'asc'
    collectionId: Optional[str] = None

@router.post("/connect", response_model=ConnectionResponse)
async def connect_database(request: ConnectionRequest):
    """Connect to PostgreSQL database"""
    try:
        success = await db_manager.connect(request.connection_string)
        
        if success:
            # Get database info after successful connection
            db_info = await db_manager.test_connection()
            return ConnectionResponse(
                success=True,
                message="Successfully connected to database",
                database_info=db_info
            )
        else:
            return ConnectionResponse(
                success=False,
                message="Failed to connect to database"
            )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {str(e)}")

@router.get("/connection/status")
async def get_connection_status():
    """Get current connection status"""
    if db_manager.is_connected():
        db_info = await db_manager.test_connection()
        return {"connected": True, "database_info": db_info}
    else:
        return {"connected": False}

@router.post("/disconnect")
async def disconnect_database():
    """Disconnect from database"""
    await db_manager.disconnect()
    return {"message": "Disconnected from database"}

@router.get("/tables")
async def get_tables():
    """Get all tables with vector columns"""
    try:
        tables = await db_manager.get_tables_with_vectors()
        return {"tables": tables}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tables/{schema}/{table}/metadata")
async def get_table_metadata(schema: str, table: str):
    """Get metadata for a specific table"""
    try:
        metadata = await db_manager.get_table_metadata(schema, table)
        return metadata
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tables/{schema}/{table}/data")
async def get_table_data(
    schema: str, 
    table: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: Optional[str] = Query(None),
    sort_order: str = Query('asc'),
    collection_id: Optional[str] = Query(None)
):
    """Get paginated data from a table"""
    try:
        offset = (page - 1) * page_size
        data = await db_manager.get_table_data(
            schema, 
            table, 
            limit=page_size, 
            offset=offset, 
            sort_by=sort_by, 
            sort_order=sort_order,
            collection_id=collection_id
        )
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tables/{schema}/{table}/collection-names")
async def get_collection_names(schema: str, table: str, id_column: str, name_column: str):
    """Get collection names mapped to their IDs"""
    try:
        names = await db_manager.get_collection_names(schema, table, id_column, name_column)
        return {"names": names}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tables/{schema}/{table}/collection-info/{collection_id}")
async def get_collection_info(schema: str, table: str, collection_id: str):
    """Get information about a specific collection including vector dimensions"""
    try:
        print(f"Getting collection info for: {collection_id}")
        info = await db_manager.get_collection_info(schema, table, collection_id)
        print(f"Collection info result: {info}")
        return info
    except Exception as e:
        print(f"Collection info error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/tables/{schema}/{table}/search")
async def search_table(schema: str, table: str, request: SearchRequest):
    """Search table data with text or vector similarity"""
    try:
        print(f"Search request: schema={schema}, table={table}")
        print(f"Request data: {request.dict()}")
        
        results = await db_manager.search_table(
            schema=request.schema_name,
            table=request.table,
            text_query=request.query,
            search_column=request.search_column,
            vector_column=request.vector_column,
            vector_query=request.vector_query,
            limit=request.limit,
            metric=request.metric,
            sort_by=request.sortBy,
            sort_order=request.sortOrder,
            collection_id=request.collectionId
        )
        
        print(f"Results keys: {list(results.keys()) if results else 'None'}")
        if results and 'data' in results and results['data']:
            print(f"First row keys: {list(results['data'][0].keys()) if results['data'][0] else 'None'}")
            if 'similarity_score' in results['data'][0]:
                print(f"Similarity score found: {results['data'][0]['similarity_score']}")
            else:
                print("WARNING: No similarity_score in first row!")
        
        print(f"Query info: {results.get('query_info', {})}")
        
        return results
    except Exception as e:
        print(f"Search error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
