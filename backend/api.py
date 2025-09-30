from fastapi import APIRouter, HTTPException, Query, Header, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, List, Union
import asyncio
from auth import get_current_user, UserOut
from session_manager import get_session_manager, disconnect_session
import json
from export_utils import export_to_json, export_to_csv, export_to_jsonl, export_to_markdown_table, get_export_filename
from vector_utils import reduce_dimensions_async, calculate_vector_statistics, find_outliers, perform_clustering
from io import BytesIO

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

@router.get("/tables/{schema}/{table}/schema")
async def get_table_schema_endpoint(
    schema: str,
    table: str,
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
):
    try:
        mgr = await get_session_manager(current_user.id, x_session_id)
        data = await mgr.get_table_schema(schema, table)
        return {"columns": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tables/{schema}/{table}/stats")
async def get_table_stats_endpoint(
    schema: str,
    table: str,
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
):
    try:
        mgr = await get_session_manager(current_user.id, x_session_id)
        data = await mgr.get_table_stats(schema, table)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tables/{schema}/{table}/vector-indexes")
async def get_vector_indexes_endpoint(
    schema: str,
    table: str,
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
):
    try:
        mgr = await get_session_manager(current_user.id, x_session_id)
        data = await mgr.get_vector_indexes(schema, table)
        return {"indexes": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tables/{schema}/{table}/relations")
async def get_table_relations_endpoint(
    schema: str,
    table: str,
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
):
    try:
        mgr = await get_session_manager(current_user.id, x_session_id)
        data = await mgr.get_table_relations(schema, table)
        return data
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

class CollectionStatsRequest(BaseModel):
    collection_ids: List[str]

@router.get("/health/pool-stats")
async def get_pool_stats(
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
):
    """Get database connection pool statistics for monitoring"""
    try:
        mgr = await get_session_manager(current_user.id, x_session_id)
        stats = mgr.get_pool_stats()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tables/{schema}/{table}/collection-stats")
async def get_collection_stats(
    schema: str,
    table: str,
    request: CollectionStatsRequest,
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
):
    """Get statistics for collections including document length metrics"""
    try:
        mgr = await get_session_manager(current_user.id, x_session_id)
        stats = await mgr.get_collection_stats(schema, table, request.collection_ids)
        return {"stats": stats}
    except Exception as e:
        print(f"Error in get_collection_stats API: {e}")
        # Return a more specific error message
        if "Timeout acquiring database connection" in str(e):
            raise HTTPException(status_code=503, detail="Database connection pool is busy. Please try again in a moment.")
        elif "created_at" in str(e).lower():
            raise HTTPException(status_code=400, detail="Table schema does not support date statistics")
        else:
            raise HTTPException(status_code=500, detail=f"Failed to get collection statistics: {str(e)}")

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


class BatchSearchRequest(BaseModel):
    vectors: List[List[float]]
    vector_column: str
    limit_per_query: int = 5
    metric: str = 'cosine'
    collection_id: Optional[str] = None


@router.post("/tables/{schema}/{table}/batch-search")
async def batch_search_table(
    schema: str,
    table: str,
    request: BatchSearchRequest,
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
):
    """
    Perform batch vector search - search for multiple vectors at once
    """
    try:
        mgr = await get_session_manager(current_user.id, x_session_id)
        
        # Limit batch size to prevent abuse
        if len(request.vectors) > 100:
            raise HTTPException(status_code=400, detail="Maximum 100 vectors per batch")
        
        results = []
        for vector in request.vectors:
            search_result = await mgr.search_table(
                schema=schema,
                table=table,
                vector_column=request.vector_column,
                vector_query=vector,
                limit=request.limit_per_query,
                metric=request.metric,
                collection_id=request.collection_id,
            )
            results.append(search_result)
        
        return {
            "batch_size": len(request.vectors),
            "results": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ExportRequest(BaseModel):
    format: str = 'json'  # json, csv, jsonl, markdown
    include_headers: bool = True


@router.post("/tables/{schema}/{table}/data/export")
async def export_table_data(
    schema: str,
    table: str,
    request: ExportRequest,
    page: int = Query(1, ge=1),
    page_size: int = Query(1000, ge=1, le=10000),
    collection_id: Optional[str] = Query(None),
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
):
    """
    Export table data in various formats
    """
    try:
        mgr = await get_session_manager(current_user.id, x_session_id)
        offset = (page - 1) * page_size
        
        data_result = await mgr.get_table_data(
            schema,
            table,
            limit=page_size,
            offset=offset,
            collection_id=collection_id,
        )
        
        data = data_result.get('data', [])
        
        # Generate export based on format
        if request.format == 'json':
            content = await export_to_json(data)
            media_type = 'application/json'
        elif request.format == 'csv':
            content = await export_to_csv(data, request.include_headers)
            media_type = 'text/csv'
        elif request.format == 'jsonl':
            content = await export_to_jsonl(data)
            media_type = 'application/x-ndjson'
        elif request.format == 'markdown' or request.format == 'md':
            content = await export_to_markdown_table(data)
            media_type = 'text/markdown'
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported format: {request.format}")
        
        filename = get_export_filename(f"{schema}_{table}", request.format)
        
        return StreamingResponse(
            BytesIO(content.encode('utf-8')),
            media_type=media_type,
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"'
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tables/{schema}/{table}/search/export")
async def export_search_results(
    schema: str,
    table: str,
    search_request: SearchRequest,
    export_format: str = Query('json', regex='^(json|csv|jsonl|markdown)$'),
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
):
    """
    Export search results directly
    """
    try:
        mgr = await get_session_manager(current_user.id, x_session_id)
        results = await mgr.search_table(
            schema=search_request.schema_name,
            table=search_request.table,
            text_query=search_request.query,
            search_column=search_request.search_column,
            vector_column=search_request.vector_column,
            vector_query=search_request.vector_query,
            limit=search_request.limit,
            metric=search_request.metric,
            sort_by=search_request.sortBy,
            sort_order=search_request.sortOrder,
            collection_id=search_request.collectionId,
        )
        
        data = results.get('data', [])
        
        # Generate export
        if export_format == 'json':
            content = await export_to_json(data)
            media_type = 'application/json'
        elif export_format == 'csv':
            content = await export_to_csv(data)
            media_type = 'text/csv'
        elif export_format == 'jsonl':
            content = await export_to_jsonl(data)
            media_type = 'application/x-ndjson'
        else:
            content = await export_to_markdown_table(data)
            media_type = 'text/markdown'
        
        filename = get_export_filename(f"{schema}_{table}_search", export_format)
        
        return StreamingResponse(
            BytesIO(content.encode('utf-8')),
            media_type=media_type,
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"'
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class VectorVisualizationRequest(BaseModel):
    vector_column: str
    collection_id: Optional[str] = None
    limit: int = 500
    method: str = 'pca'  # pca, tsne, umap
    n_components: int = 2
    sample_rate: Optional[float] = None


@router.post("/tables/{schema}/{table}/vector-visualization")
async def get_vector_visualization(
    schema: str,
    table: str,
    request: VectorVisualizationRequest,
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
):
    """
    Get dimensionality-reduced vectors for visualization
    """
    try:
        mgr = await get_session_manager(current_user.id, x_session_id)
        
        # Fetch vectors from database
        async with mgr.get_connection() as conn:
            query_parts = [f'SELECT {request.vector_column} as vector, * FROM "{schema}"."{table}"']
            params = []
            
            if request.collection_id:
                query_parts.append('WHERE collection_id = $1')
                params.append(request.collection_id)
            
            query_parts.append(f'LIMIT {request.limit}')
            query = ' '.join(query_parts)
            
            rows = await conn.fetch(query, *params)
        
        if not rows:
            return {
                "reduced_vectors": [],
                "original_data": [],
                "statistics": {},
                "method": request.method,
                "n_components": request.n_components
            }
        
        # Extract vectors and metadata
        vectors = []
        metadata = []
        skipped_count = 0
        expected_dim = None
        
        for idx, row in enumerate(rows):
            vec = row['vector']
            
            # Skip NULL vectors
            if vec is None:
                skipped_count += 1
                continue
            
            # Handle different vector storage formats
            try:
                if isinstance(vec, str):
                    vec = json.loads(vec) if vec.startswith('[') else [float(x) for x in vec.split(',')]
                elif hasattr(vec, '__iter__'):
                    vec = list(vec)
                else:
                    print(f"Skipping row {idx}: invalid vector type {type(vec)}")
                    skipped_count += 1
                    continue
                
                # Ensure it's a list of numbers
                if not isinstance(vec, list) or not all(isinstance(x, (int, float)) for x in vec):
                    print(f"Skipping row {idx}: vector contains non-numeric values")
                    skipped_count += 1
                    continue
                
                # Check dimension consistency
                if expected_dim is None:
                    expected_dim = len(vec)
                elif len(vec) != expected_dim:
                    print(f"Skipping row {idx}: dimension mismatch (expected {expected_dim}, got {len(vec)})")
                    skipped_count += 1
                    continue
                
                vectors.append(vec)
                # Store other columns as metadata
                meta = {k: v for k, v in dict(row).items() if k != 'vector'}
                metadata.append(meta)
                
            except Exception as e:
                print(f"Error processing row {idx}: {e}")
                skipped_count += 1
                continue
        
        if not vectors:
            raise HTTPException(
                status_code=400, 
                detail=f"No valid vectors found. Total rows: {len(rows)}, Skipped: {skipped_count}. "
                       "Ensure the column contains valid vector data."
            )
        
        if skipped_count > 0:
            print(f"Warning: Skipped {skipped_count} rows with invalid/NULL vectors out of {len(rows)} total")
        
        # Calculate statistics
        stats = calculate_vector_statistics(vectors)
        
        # Find outliers
        outlier_indices = find_outliers(vectors)
        
        # Reduce dimensions
        reduced = await reduce_dimensions_async(
            vectors,
            method=request.method,
            n_components=request.n_components
        )
        
        return {
            "reduced_vectors": reduced,
            "original_data": metadata,
            "statistics": stats,
            "outlier_indices": outlier_indices,
            "method": request.method,
            "n_components": request.n_components,
            "total_vectors": len(vectors)
        }
        
    except Exception as e:
        print(f"Error in vector visualization: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ClusteringRequest(BaseModel):
    vector_column: str
    collection_id: Optional[str] = None
    n_clusters: int = 5
    method: str = 'kmeans'  # kmeans, dbscan
    limit: int = 1000


@router.post("/tables/{schema}/{table}/clustering")
async def perform_vector_clustering(
    schema: str,
    table: str,
    request: ClusteringRequest,
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
):
    """
    Perform clustering analysis on vectors
    """
    try:
        mgr = await get_session_manager(current_user.id, x_session_id)
        
        # Fetch vectors
        async with mgr.get_connection() as conn:
            query_parts = [f'SELECT {request.vector_column} as vector, * FROM "{schema}"."{table}"']
            params = []
            
            if request.collection_id:
                query_parts.append('WHERE collection_id = $1')
                params.append(request.collection_id)
            
            query_parts.append(f'LIMIT {request.limit}')
            query = ' '.join(query_parts)
            
            rows = await conn.fetch(query, *params)
        
        if not rows:
            raise HTTPException(status_code=404, detail="No vectors found")
        
        # Extract vectors
        vectors = []
        for row in rows:
            vec = row['vector']
            if isinstance(vec, str):
                vec = json.loads(vec) if vec.startswith('[') else [float(x) for x in vec.split(',')]
            elif hasattr(vec, '__iter__'):
                vec = list(vec)
            vectors.append(vec)
        
        # Perform clustering
        labels, centers = perform_clustering(vectors, request.n_clusters, request.method)
        
        # Count items per cluster
        cluster_counts = {}
        for label in labels:
            cluster_counts[str(label)] = cluster_counts.get(str(label), 0) + 1
        
        return {
            "labels": labels,
            "centers": centers,
            "cluster_counts": cluster_counts,
            "method": request.method,
            "n_clusters": request.n_clusters,
            "total_vectors": len(vectors)
        }
        
    except Exception as e:
        print(f"Error in clustering: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/global-search")
async def global_search(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(50, ge=1, le=200, description="Maximum results"),
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
):
    """
    Global search across all tables and collections for a keyword.
    Searches in text columns and returns matching rows with context.
    """
    try:
        mgr = await get_session_manager(current_user.id, x_session_id)
        
        # Get all tables with text/uuid columns  
        tables_query = """
            SELECT DISTINCT
                t.table_schema,
                t.table_name,
                array_agg(DISTINCT c.column_name) FILTER (
                    WHERE c.data_type IN ('text', 'character varying', 'varchar', 'character')
                ) as text_columns,
                array_agg(DISTINCT c.column_name) FILTER (
                    WHERE c.udt_name = 'uuid'
                ) as uuid_columns,
                array_agg(DISTINCT c.column_name) as all_columns
            FROM information_schema.tables t
            JOIN information_schema.columns c 
                ON t.table_schema = c.table_schema 
                AND t.table_name = c.table_name
            WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
                AND t.table_type = 'BASE TABLE'
                AND (
                    c.data_type IN ('text', 'character varying', 'varchar', 'character')
                    OR c.udt_name = 'uuid'
                )
            GROUP BY t.table_schema, t.table_name
        """
        
        all_results = []
        search_pattern = f"%{q}%"
        
        # Use async context manager for connection
        async with mgr.get_connection() as conn:
            tables = await conn.fetch(tables_query)
            print(f"Found {len(tables)} tables to search")
            
            # Search in each table
            for table_row in tables:
                schema = table_row['table_schema']
                table = table_row['table_name']
                text_columns = table_row['text_columns'] or []
                uuid_columns = table_row['uuid_columns'] or []
                all_columns = table_row['all_columns'] or []
                
                if not text_columns and not uuid_columns:
                    continue
                
                # Build WHERE clause for text and UUID columns
                where_clauses = []
                params = []
                param_idx = 1
                
                # Search text columns with ILIKE
                for col in text_columns:
                    where_clauses.append(f'"{col}"::text ILIKE ${param_idx}')
                    params.append(search_pattern)
                    param_idx += 1
                
                # Search UUID columns with exact match (if query looks like UUID)
                if len(q) >= 8:  # UUID-ish length
                    for col in uuid_columns:
                        where_clauses.append(f'"{col}"::text ILIKE ${param_idx}')
                        params.append(search_pattern)
                        param_idx += 1
                
                where_condition = " OR ".join(where_clauses)
                
                # Try to get a primary key or identifier column
                try:
                    pk_query = f"""
                        SELECT a.attname
                        FROM pg_index i
                        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                        WHERE i.indrelid = '"{schema}"."{table}"'::regclass AND i.indisprimary
                        LIMIT 1
                    """
                    pk_result = await conn.fetchrow(pk_query)
                    pk_column = pk_result['attname'] if pk_result else 'ctid'
                except Exception as e:
                    print(f"Error getting PK for {schema}.{table}: {str(e)}")
                    pk_column = 'ctid'
                
                # Search query with all relevant columns
                select_columns = []
                for col in all_columns[:20]:  # Limit to 20 columns
                    select_columns.append(f'"{col}"')
                column_list = ", ".join(select_columns)
                
                search_query = f"""
                    SELECT 
                        '{schema}'::text as schema_name,
                        '{table}'::text as table_name,
                        {pk_column}::text as row_id,
                        {column_list}
                    FROM "{schema}"."{table}"
                    WHERE {where_condition}
                    LIMIT 10
                """
                
                try:
                    rows = await conn.fetch(search_query, *params)
                    
                    for row in rows:
                        row_dict = dict(row)
                        
                        # Find which columns matched
                        matched_columns = []
                        snippets = {}
                        
                        # Check text columns
                        for col in text_columns:
                            value = row_dict.get(col)
                            if value and isinstance(value, str) and q.lower() in value.lower():
                                matched_columns.append(col)
                                # Extract snippet with highlighting context
                                idx = value.lower().find(q.lower())
                                start = max(0, idx - 60)
                                end = min(len(value), idx + len(q) + 60)
                                snippet = value[start:end]
                                if start > 0:
                                    snippet = "..." + snippet
                                if end < len(value):
                                    snippet = snippet + "..."
                                snippets[col] = snippet
                        
                        # Check UUID columns
                        for col in uuid_columns:
                            value = row_dict.get(col)
                            if value and str(value).lower().find(q.lower()) != -1:
                                matched_columns.append(col)
                                snippets[col] = str(value)
                        
                        if matched_columns:
                            # Get collection info if this row has collection_id
                            collection_name = None
                            collection_id = None
                            
                            if 'collection_id' in row_dict and row_dict['collection_id']:
                                collection_id = str(row_dict['collection_id'])
                                try:
                                    coll_query = """
                                        SELECT name
                                        FROM langchain_pg_collection
                                        WHERE uuid = $1
                                    """
                                    coll_row = await conn.fetchrow(coll_query, row_dict['collection_id'])
                                    if coll_row:
                                        collection_name = coll_row['name']
                                except Exception as e:
                                    print(f"Error fetching collection name: {str(e)}")
                            
                            # Extract key identifiers
                            identifiers = {
                                'uuid': row_dict.get('uuid', row_dict.get('id')),
                                'custom_id': row_dict.get('custom_id'),
                                'document': row_dict.get('document'),
                            }
                            
                            all_results.append({
                                'schema': schema,
                                'table': table,
                                'row_id': row_dict.get('row_id', 'unknown'),
                                'matched_columns': matched_columns,
                                'snippets': snippets,
                                'collection_name': collection_name,
                                'collection_id': collection_id,
                                'identifiers': identifiers,
                                'full_row': {k: str(v)[:200] if v else None for k, v in row_dict.items() if k not in ['schema_name', 'table_name', 'row_id']}
                            })
                            
                            if len(all_results) >= limit:
                                break
                
                except Exception as e:
                    print(f"Error searching {schema}.{table}: {str(e)}")
                    continue
                
                if len(all_results) >= limit:
                    break
            
            print(f"Global search completed: {len(all_results)} results from {len(tables)} tables")
        
        return {
            'query': q,
            'total_results': len(all_results),
            'results': all_results[:limit],
            'searched_tables': len(tables)
        }
    
    except Exception as e:
        import traceback
        print(f"Global search error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Global search failed: {str(e)}")


# ============================================================================
# Saved Queries & Bookmarks API Endpoints
# ============================================================================

class SavedQueryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    query_type: str  # 'vector_search', 'text_search', 'data_query'
    schema_name: str
    table_name: str
    collection_id: Optional[str] = None
    parameters: Dict[str, Any]
    tags: List[str] = []
    is_favorite: bool = False
    is_public: bool = False

class SavedQueryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    is_favorite: Optional[bool] = None
    is_public: Optional[bool] = None

class SavedQueryOut(BaseModel):
    id: str
    user_id: str
    session_id: Optional[str]
    name: str
    description: Optional[str]
    query_type: str
    schema_name: str
    table_name: str
    collection_id: Optional[str]
    parameters: Dict[str, Any]
    tags: List[str]
    is_favorite: bool
    is_public: bool
    use_count: int
    last_used_at: Optional[str]
    created_at: str
    updated_at: str

class BookmarkCreate(BaseModel):
    bookmark_type: str  # 'table', 'collection'
    schema_name: str
    table_name: str
    collection_id: Optional[str] = None
    notes: Optional[str] = None
    color: Optional[str] = None

class BookmarkOut(BaseModel):
    id: str
    user_id: str
    session_id: Optional[str]
    bookmark_type: str
    schema_name: str
    table_name: str
    collection_id: Optional[str]
    notes: Optional[str]
    color: Optional[str]
    created_at: str


@router.get("/saved-queries")
async def get_saved_queries(
    session_id: Optional[str] = Query(None),
    schema: Optional[str] = Query(None),
    table: Optional[str] = Query(None),
    tags: Optional[str] = Query(None),  # Comma-separated tags
    favorites_only: bool = Query(False),
    current_user: UserOut = Depends(get_current_user),
) -> List[SavedQueryOut]:
    """Get user's saved queries with optional filtering"""
    try:
        from database import get_db_connection
        
        async with get_db_connection() as conn:
            query = """
                SELECT 
                    id::text, user_id::text, session_id::text,
                    name, description, query_type, schema_name, table_name, collection_id,
                    parameters, tags, is_favorite, is_public, use_count,
                    to_char(last_used_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as last_used_at,
                    to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
                    to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
                FROM db_look_saved_queries 
                WHERE user_id = $1
            """
            params = [current_user.id]
            param_idx = 2
            
            if session_id:
                query += f" AND session_id = ${param_idx}"
                params.append(session_id)
                param_idx += 1
            
            if schema:
                query += f" AND schema_name = ${param_idx}"
                params.append(schema)
                param_idx += 1
            
            if table:
                query += f" AND table_name = ${param_idx}"
                params.append(table)
                param_idx += 1
            
            if tags:
                tag_list = tags.split(',')
                query += f" AND tags && ${param_idx}"
                params.append(tag_list)
                param_idx += 1
            
            if favorites_only:
                query += " AND is_favorite = TRUE"
            
            query += " ORDER BY last_used_at DESC NULLS LAST, created_at DESC"
            
            rows = await conn.fetch(query, *params)
            return [dict(row) for row in rows]
    except Exception as e:
        print(f"Error getting saved queries: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch saved queries")


@router.post("/saved-queries", status_code=201)
async def create_saved_query(
    query_data: SavedQueryCreate,
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
) -> SavedQueryOut:
    """Save a new query"""
    try:
        from database import get_db_connection
        
        async with get_db_connection() as conn:
            row = await conn.fetchrow("""
                INSERT INTO db_look_saved_queries 
                (user_id, session_id, name, description, query_type, schema_name, table_name, 
                 collection_id, parameters, tags, is_favorite, is_public)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING 
                    id::text, user_id::text, session_id::text,
                    name, description, query_type, schema_name, table_name, collection_id,
                    parameters, tags, is_favorite, is_public, use_count,
                    to_char(last_used_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as last_used_at,
                    to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
                    to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
            """, 
                current_user.id, x_session_id, query_data.name, query_data.description,
                query_data.query_type, query_data.schema_name, query_data.table_name,
                query_data.collection_id, json.dumps(query_data.parameters), query_data.tags,
                query_data.is_favorite, query_data.is_public
            )
            return dict(row)
    except Exception as e:
        print(f"Error creating saved query: {e}")
        raise HTTPException(status_code=500, detail="Failed to create saved query")


@router.patch("/saved-queries/{query_id}")
async def update_saved_query(
    query_id: str,
    query_update: SavedQueryUpdate,
    current_user: UserOut = Depends(get_current_user),
) -> SavedQueryOut:
    """Update a saved query"""
    try:
        from database import get_db_connection
        
        async with get_db_connection() as conn:
            # Build dynamic update query
            updates = []
            params = [query_id, current_user.id]
            param_idx = 3
            
            if query_update.name is not None:
                updates.append(f"name = ${param_idx}")
                params.append(query_update.name)
                param_idx += 1
            
            if query_update.description is not None:
                updates.append(f"description = ${param_idx}")
                params.append(query_update.description)
                param_idx += 1
            
            if query_update.tags is not None:
                updates.append(f"tags = ${param_idx}")
                params.append(query_update.tags)
                param_idx += 1
            
            if query_update.is_favorite is not None:
                updates.append(f"is_favorite = ${param_idx}")
                params.append(query_update.is_favorite)
                param_idx += 1
            
            if query_update.is_public is not None:
                updates.append(f"is_public = ${param_idx}")
                params.append(query_update.is_public)
                param_idx += 1
            
            if not updates:
                raise HTTPException(status_code=400, detail="No updates provided")
            
            query = f"""
                UPDATE db_look_saved_queries 
                SET {', '.join(updates)}
                WHERE id = $1::uuid AND user_id = $2::uuid
                RETURNING 
                    id::text, user_id::text, session_id::text,
                    name, description, query_type, schema_name, table_name, collection_id,
                    parameters, tags, is_favorite, is_public, use_count,
                    to_char(last_used_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as last_used_at,
                    to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
                    to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
            """
            
            row = await conn.fetchrow(query, *params)
            if not row:
                raise HTTPException(status_code=404, detail="Query not found")
            
            return dict(row)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating saved query: {e}")
        raise HTTPException(status_code=500, detail="Failed to update saved query")


@router.post("/saved-queries/{query_id}/use")
async def record_query_use(
    query_id: str,
    current_user: UserOut = Depends(get_current_user),
):
    """Record that a query was used (increments use count)"""
    try:
        from database import get_db_connection
        
        async with get_db_connection() as conn:
            await conn.execute("""
                UPDATE db_look_saved_queries 
                SET use_count = use_count + 1, last_used_at = NOW()
                WHERE id = $1::uuid AND user_id = $2::uuid
            """, query_id, current_user.id)
        return {"status": "success"}
    except Exception as e:
        print(f"Error recording query use: {e}")
        raise HTTPException(status_code=500, detail="Failed to record query use")


@router.delete("/saved-queries/{query_id}")
async def delete_saved_query(
    query_id: str,
    current_user: UserOut = Depends(get_current_user),
):
    """Delete a saved query"""
    try:
        from database import get_db_connection
        
        async with get_db_connection() as conn:
            result = await conn.execute("""
                DELETE FROM db_look_saved_queries 
                WHERE id = $1::uuid AND user_id = $2::uuid
            """, query_id, current_user.id)
            
            if result == "DELETE 0":
                raise HTTPException(status_code=404, detail="Query not found")
        
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting saved query: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete saved query")


# Bookmark Routes
@router.get("/bookmarks")
async def get_bookmarks(
    session_id: Optional[str] = Query(None),
    bookmark_type: Optional[str] = Query(None),
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
) -> List[BookmarkOut]:
    """Get user's bookmarks"""
    try:
        from database import get_db_connection
        
        async with get_db_connection() as conn:
            query = """
                SELECT 
                    id::text, user_id::text, session_id::text,
                    bookmark_type, schema_name, table_name, collection_id, notes, color,
                    to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
                FROM db_look_bookmarks 
                WHERE user_id = $1
            """
            params = [current_user.id]
            param_idx = 2
            
            if session_id:
                query += f" AND session_id = ${param_idx}"
                params.append(session_id)
                param_idx += 1
            
            if bookmark_type:
                query += f" AND bookmark_type = ${param_idx}"
                params.append(bookmark_type)
                param_idx += 1
            
            query += " ORDER BY created_at DESC"
            
            rows = await conn.fetch(query, *params)
            return [dict(row) for row in rows]
    except Exception as e:
        print(f"Error getting bookmarks: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch bookmarks")


@router.post("/bookmarks", status_code=201)
async def create_bookmark(
    bookmark_data: BookmarkCreate,
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
) -> BookmarkOut:
    """Create a bookmark"""
    try:
        from database import get_db_connection
        
        async with get_db_connection() as conn:
            try:
                row = await conn.fetchrow("""
                    INSERT INTO db_look_bookmarks 
                    (user_id, session_id, bookmark_type, schema_name, table_name, collection_id, notes, color)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING 
                        id::text, user_id::text, session_id::text,
                        bookmark_type, schema_name, table_name, collection_id, notes, color,
                        to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
                """, 
                    current_user.id, x_session_id, bookmark_data.bookmark_type,
                    bookmark_data.schema_name, bookmark_data.table_name,
                    bookmark_data.collection_id, bookmark_data.notes, bookmark_data.color
                )
                return dict(row)
            except Exception as e:
                if 'unique' in str(e).lower():
                    raise HTTPException(status_code=409, detail="Bookmark already exists")
                raise
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating bookmark: {e}")
        raise HTTPException(status_code=500, detail="Failed to create bookmark")


@router.delete("/bookmarks/{bookmark_id}")
async def delete_bookmark(
    bookmark_id: str,
    current_user: UserOut = Depends(get_current_user),
):
    """Delete a bookmark"""
    try:
        from database import get_db_connection
        
        async with get_db_connection() as conn:
            result = await conn.execute("""
                DELETE FROM db_look_bookmarks 
                WHERE id = $1::uuid AND user_id = $2::uuid
            """, bookmark_id, current_user.id)
            
            if result == "DELETE 0":
                raise HTTPException(status_code=404, detail="Bookmark not found")
        
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting bookmark: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete bookmark")