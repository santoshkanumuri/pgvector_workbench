from fastapi import APIRouter, HTTPException, Query, Header, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any, List, Union
import asyncio
from auth import get_current_user, UserOut
from session_manager import get_session_manager, disconnect_session
import json

router = APIRouter(prefix="/api", tags=["database"])

class ConnectionResponse(BaseModel):
    connected: bool
    database_info: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

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

@router.get("/connection/status", response_model=ConnectionResponse)
async def get_connection_status(
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
):
    """Get current session connection status with better error handling"""
    try:
        # Add timeout to prevent hanging requests
        async with asyncio.timeout(30):
            mgr = await get_session_manager(current_user.id, x_session_id)
            if mgr.is_connected():
                db_info = await mgr.test_connection()
                return ConnectionResponse(connected=True, database_info=db_info)
            return ConnectionResponse(connected=False)
    except asyncio.TimeoutError:
        return ConnectionResponse(connected=False, error="Connection status check timed out")
    except ValueError as e:
        # Session not found or connection failed
        return ConnectionResponse(connected=False, error=str(e))
    except Exception as e:
        print(f"Unexpected error in get_connection_status: {e}")
        return ConnectionResponse(connected=False, error="Connection status check failed")

@router.post("/disconnect")
async def disconnect_database(
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
):
    await disconnect_session(current_user.id, x_session_id)
    return {"message": "Disconnected"}

@router.get("/tables")
async def get_tables(
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
):
    """Get tables with vectors - optimized for multi-user performance"""
    try:
        async with asyncio.timeout(60):  # Reasonable timeout for table discovery
            mgr = await get_session_manager(current_user.id, x_session_id)
            tables = await mgr.get_tables_with_vectors()
            return {"tables": tables}
    except asyncio.TimeoutError:
        raise HTTPException(status_code=408, detail="Table discovery timed out - database may be slow")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"Error in get_tables for user {current_user.id}, session {x_session_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch tables")

@router.get("/tables/{schema}/{table}/metadata")
async def get_table_metadata(
    schema: str,
    table: str,
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
):
    try:
        mgr = await get_session_manager(current_user.id, x_session_id)
        metadata = await mgr.get_table_metadata(schema, table)
        return metadata
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tables/{schema}/{table}/data")
async def get_table_data(
    schema: str,
    table: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),  # Increased max for flexibility but with limit
    sort_by: Optional[str] = Query(None),
    sort_order: str = Query('asc'),
    collection_id: Optional[str] = Query(None),
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
):
    """Get table data with pagination - optimized for large datasets"""
    try:
        # Longer timeout for data queries which might be large
        async with asyncio.timeout(120):
            mgr = await get_session_manager(current_user.id, x_session_id)
            offset = (page - 1) * page_size
            data = await mgr.get_table_data(
                schema,
                table,
                limit=page_size,
                offset=offset,
                sort_by=sort_by,
                sort_order=sort_order,
                collection_id=collection_id,
            )
            return data
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=408, 
            detail=f"Data query timed out - try reducing page size (current: {page_size}) or add more specific filtering"
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"Error in get_table_data for user {current_user.id}: {schema}.{table}, page {page}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch table data")

@router.get("/tables/{schema}/{table}/collection-names")
async def get_collection_names(
    schema: str,
    table: str,
    id_column: str,
    name_column: str,
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
):
    try:
        mgr = await get_session_manager(current_user.id, x_session_id)
        names = await mgr.get_collection_names(schema, table, id_column, name_column)
        return {"names": names}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tables/{schema}/{table}/collection-info/{collection_id}")
async def get_collection_info(
    schema: str,
    table: str,
    collection_id: str,
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
):
    try:
        mgr = await get_session_manager(current_user.id, x_session_id)
        info = await mgr.get_collection_info(schema, table, collection_id)
        return info
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/tables/{schema}/{table}/search")
async def search_table(
    schema: str,
    table: str,
    request: SearchRequest,
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
):
    try:
        mgr = await get_session_manager(current_user.id, x_session_id)
        results = await mgr.search_table(
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
            collection_id=request.collectionId,
        )
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
