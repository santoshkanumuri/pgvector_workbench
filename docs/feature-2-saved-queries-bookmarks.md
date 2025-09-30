# Feature 2: Saved Queries & Bookmarks System

## 🎯 Overview

Enable users to save, organize, and share their important searches and frequently accessed tables. Transform one-time queries into a reusable knowledge base.

## Why This Matters

**Current State:**
- ✅ Query history exists (last 50 queries in localStorage)
- ❌ Can't permanently save important queries
- ❌ Can't organize or tag searches
- ❌ Can't share queries with teammates
- ❌ Can't bookmark favorite tables

**User Pain Points:**
1. "I spend 10 minutes recreating the same complex search every day"
2. "I can't remember which collection had the interesting patterns"
3. "How do I share this useful query with my teammate?"
4. "I need to test these 5 queries after every model update"

---

## User Stories

1. **ML Engineer**: "Save my test queries for benchmarking different embedding models"
2. **Data Scientist**: "Bookmark collections I'm currently analyzing"
3. **Team Lead**: "Share useful queries with my team"
4. **Developer**: "Create a suite of test queries for regression testing"

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│ Backend (PostgreSQL)                                            │
│                                                                  │
│  Table: db_look_saved_queries                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ id, user_id, name, description, query_type,             │   │
│  │ schema, table, parameters (JSONB), tags, is_public,     │   │
│  │ created_at, updated_at                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Table: db_look_bookmarks                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ id, user_id, bookmark_type, schema, table,              │   │
│  │ collection_id, notes, created_at                         │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ Frontend UI                                                      │
│                                                                  │
│  Sidebar Enhancement:                                            │
│  ┌────────────────────────────┐                                │
│  │  📊 Tables                 │                                │
│  │  ⭐ Bookmarks (5)          │  ← New Section                 │
│  │  💾 Saved Queries (12)     │  ← New Section                 │
│  └────────────────────────────┘                                │
│                                                                  │
│  Search Interface:                                               │
│  [Search Input] [Options] [Search] [Save 💾] [Load 📂]         │
│                                                                  │
│  Saved Queries Dialog:                                           │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ My Saved Queries                    [+ New] [Import]   │    │
│  │                                                          │    │
│  │ ┌────────────────────────────────────────────────┐     │    │
│  │ │ 🔍 Similar Documents Search                     │     │    │
│  │ │ "product descriptions" • cosine • limit 20      │     │    │
│  │ │ #ml-testing #production                          │     │    │
│  │ │ Created: 2 days ago • Used: 15 times            │     │    │
│  │ │ [Load] [Edit] [Share] [Delete]                  │     │    │
│  │ └────────────────────────────────────────────────┘     │    │
│  │                                                          │    │
│  │ [Filter by tags ▼] [Sort by ▼] [Search...]             │    │
│  └────────────────────────────────────────────────────┘    │    │
└────────────────────────────────────────────────────────────────┘
```

---

## Implementation

### Step 1: Database Schema (Backend)

**File: `backend/database_schema.sql`** (Add to existing schema)

```sql
-- Saved Queries Table
CREATE TABLE IF NOT EXISTS db_look_saved_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES db_look_users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES db_look_sessions(id) ON DELETE CASCADE,
    
    -- Query metadata
    name VARCHAR(255) NOT NULL,
    description TEXT,
    query_type VARCHAR(50) NOT NULL, -- 'vector_search', 'text_search', 'data_query'
    
    -- Target table
    schema_name VARCHAR(255) NOT NULL,
    table_name VARCHAR(255) NOT NULL,
    collection_id VARCHAR(255),
    
    -- Query parameters (stored as JSONB)
    parameters JSONB NOT NULL,
    
    -- Organization
    tags TEXT[], -- Array of tags for filtering
    is_favorite BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT FALSE, -- For sharing
    
    -- Usage tracking
    use_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_saved_queries_user ON db_look_saved_queries(user_id);
CREATE INDEX idx_saved_queries_session ON db_look_saved_queries(session_id);
CREATE INDEX idx_saved_queries_table ON db_look_saved_queries(schema_name, table_name);
CREATE INDEX idx_saved_queries_tags ON db_look_saved_queries USING GIN(tags);

-- Bookmarks Table
CREATE TABLE IF NOT EXISTS db_look_bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES db_look_users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES db_look_sessions(id) ON DELETE CASCADE,
    
    -- Bookmark target
    bookmark_type VARCHAR(50) NOT NULL, -- 'table', 'collection'
    schema_name VARCHAR(255) NOT NULL,
    table_name VARCHAR(255) NOT NULL,
    collection_id VARCHAR(255),
    
    -- Metadata
    notes TEXT,
    color VARCHAR(20), -- For visual organization
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bookmarks_user ON db_look_bookmarks(user_id);
CREATE INDEX idx_bookmarks_session ON db_look_bookmarks(session_id);
CREATE UNIQUE INDEX idx_bookmarks_unique ON db_look_bookmarks(user_id, session_id, schema_name, table_name, COALESCE(collection_id, ''));
```

### Step 2: Backend API Endpoints

**File: `backend/api.py`** (Add these routes)

```python
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime

# Pydantic Models
class SavedQueryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    query_type: str  # 'vector_search', 'text_search', 'data_query'
    schema_name: str
    table_name: str
    collection_id: Optional[str] = None
    parameters: Dict[str, Any]
    tags: Optional[List[str]] = []
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
    last_used_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

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
    created_at: datetime

# API Routes
@router.get("/saved-queries")
async def get_saved_queries(
    session_id: Optional[str] = Query(None),
    schema: Optional[str] = Query(None),
    table: Optional[str] = Query(None),
    tags: Optional[str] = Query(None),  # Comma-separated tags
    favorites_only: bool = Query(False),
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
) -> List[SavedQueryOut]:
    """Get user's saved queries with optional filtering"""
    async with get_db_connection() as conn:
        query = """
            SELECT * FROM db_look_saved_queries 
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

@router.post("/saved-queries", status_code=201)
async def create_saved_query(
    query_data: SavedQueryCreate,
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
) -> SavedQueryOut:
    """Save a new query"""
    async with get_db_connection() as conn:
        row = await conn.fetchrow("""
            INSERT INTO db_look_saved_queries 
            (user_id, session_id, name, description, query_type, schema_name, table_name, 
             collection_id, parameters, tags, is_favorite, is_public)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        """, 
            current_user.id, x_session_id, query_data.name, query_data.description,
            query_data.query_type, query_data.schema_name, query_data.table_name,
            query_data.collection_id, json.dumps(query_data.parameters), query_data.tags,
            query_data.is_favorite, query_data.is_public
        )
        return dict(row)

@router.patch("/saved-queries/{query_id}")
async def update_saved_query(
    query_id: str,
    query_update: SavedQueryUpdate,
    current_user: UserOut = Depends(get_current_user),
) -> SavedQueryOut:
    """Update a saved query"""
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
        
        updates.append(f"updated_at = NOW()")
        
        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")
        
        query = f"""
            UPDATE db_look_saved_queries 
            SET {', '.join(updates)}
            WHERE id = $1 AND user_id = $2
            RETURNING *
        """
        
        row = await conn.fetchrow(query, *params)
        if not row:
            raise HTTPException(status_code=404, detail="Query not found")
        
        return dict(row)

@router.post("/saved-queries/{query_id}/use")
async def record_query_use(
    query_id: str,
    current_user: UserOut = Depends(get_current_user),
):
    """Record that a query was used (increments use count)"""
    async with get_db_connection() as conn:
        await conn.execute("""
            UPDATE db_look_saved_queries 
            SET use_count = use_count + 1, last_used_at = NOW()
            WHERE id = $1 AND user_id = $2
        """, query_id, current_user.id)
    return {"status": "success"}

@router.delete("/saved-queries/{query_id}")
async def delete_saved_query(
    query_id: str,
    current_user: UserOut = Depends(get_current_user),
):
    """Delete a saved query"""
    async with get_db_connection() as conn:
        result = await conn.execute("""
            DELETE FROM db_look_saved_queries 
            WHERE id = $1 AND user_id = $2
        """, query_id, current_user.id)
        
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Query not found")
    
    return {"status": "success"}

# Bookmark Routes
@router.get("/bookmarks")
async def get_bookmarks(
    session_id: Optional[str] = Query(None),
    bookmark_type: Optional[str] = Query(None),
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
) -> List[BookmarkOut]:
    """Get user's bookmarks"""
    async with get_db_connection() as conn:
        query = "SELECT * FROM db_look_bookmarks WHERE user_id = $1"
        params = [current_user.id]
        
        if session_id:
            query += " AND session_id = $2"
            params.append(session_id)
        
        if bookmark_type:
            query += f" AND bookmark_type = ${len(params) + 1}"
            params.append(bookmark_type)
        
        query += " ORDER BY created_at DESC"
        
        rows = await conn.fetch(query, *params)
        return [dict(row) for row in rows]

@router.post("/bookmarks", status_code=201)
async def create_bookmark(
    bookmark_data: BookmarkCreate,
    x_session_id: str = Header(..., alias="X-Session-Id"),
    current_user: UserOut = Depends(get_current_user),
) -> BookmarkOut:
    """Create a bookmark"""
    async with get_db_connection() as conn:
        try:
            row = await conn.fetchrow("""
                INSERT INTO db_look_bookmarks 
                (user_id, session_id, bookmark_type, schema_name, table_name, collection_id, notes, color)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
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

@router.delete("/bookmarks/{bookmark_id}")
async def delete_bookmark(
    bookmark_id: str,
    current_user: UserOut = Depends(get_current_user),
):
    """Delete a bookmark"""
    async with get_db_connection() as conn:
        result = await conn.execute("""
            DELETE FROM db_look_bookmarks 
            WHERE id = $1 AND user_id = $2
        """, bookmark_id, current_user.id)
        
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Bookmark not found")
    
    return {"status": "success"}
```

### Step 3: Frontend API Client

**File: `frontend/src/lib/api.ts`** (Add methods)

```typescript
// Saved Queries
async getSavedQueries(
  sessionId?: string,
  schema?: string,
  table?: string,
  tags?: string[],
  favoritesOnly: boolean = false
) {
  const params = new URLSearchParams()
  if (sessionId) params.append('session_id', sessionId)
  if (schema) params.append('schema', schema)
  if (table) params.append('table', table)
  if (tags && tags.length > 0) params.append('tags', tags.join(','))
  if (favoritesOnly) params.append('favorites_only', 'true')
  
  const response = await this.client.get(`/saved-queries?${params}`)
  return response.data
}

async createSavedQuery(data: {
  name: string
  description?: string
  queryType: string
  schemaName: string
  tableName: string
  collectionId?: string
  parameters: any
  tags?: string[]
  isFavorite?: boolean
  isPublic?: boolean
}) {
  const response = await this.client.post('/saved-queries', {
    name: data.name,
    description: data.description,
    query_type: data.queryType,
    schema_name: data.schemaName,
    table_name: data.tableName,
    collection_id: data.collectionId,
    parameters: data.parameters,
    tags: data.tags || [],
    is_favorite: data.isFavorite || false,
    is_public: data.isPublic || false,
  })
  return response.data
}

async updateSavedQuery(queryId: string, data: {
  name?: string
  description?: string
  tags?: string[]
  isFavorite?: boolean
  isPublic?: boolean
}) {
  const response = await this.client.patch(`/saved-queries/${queryId}`, {
    name: data.name,
    description: data.description,
    tags: data.tags,
    is_favorite: data.isFavorite,
    is_public: data.isPublic,
  })
  return response.data
}

async deleteSavedQuery(queryId: string) {
  const response = await this.client.delete(`/saved-queries/${queryId}`)
  return response.data
}

async recordQueryUse(queryId: string) {
  const response = await this.client.post(`/saved-queries/${queryId}/use`)
  return response.data
}

// Bookmarks
async getBookmarks(sessionId?: string, type?: string) {
  const params = new URLSearchParams()
  if (sessionId) params.append('session_id', sessionId)
  if (type) params.append('bookmark_type', type)
  
  const response = await this.client.get(`/bookmarks?${params}`)
  return response.data
}

async createBookmark(data: {
  bookmarkType: string
  schemaName: string
  tableName: string
  collectionId?: string
  notes?: string
  color?: string
}) {
  const response = await this.client.post('/bookmarks', {
    bookmark_type: data.bookmarkType,
    schema_name: data.schemaName,
    table_name: data.tableName,
    collection_id: data.collectionId,
    notes: data.notes,
    color: data.color,
  })
  return response.data
}

async deleteBookmark(bookmarkId: string) {
  const response = await this.client.delete(`/bookmarks/${bookmarkId}`)
  return response.data
}
```

### Step 4: Frontend Components

**File: `frontend/src/components/database/saved-queries-dialog.tsx`**

```typescript
'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { BookmarkPlus, Star, StarOff, Trash2, Play, Search, Tag } from 'lucide-react'

interface SavedQuery {
  id: string
  name: string
  description?: string
  query_type: string
  schema_name: string
  table_name: string
  collection_id?: string
  parameters: any
  tags: string[]
  is_favorite: boolean
  use_count: number
  last_used_at?: string
  created_at: string
}

interface SavedQueriesDialogProps {
  onSelectQuery?: (query: SavedQuery) => void
}

export function SavedQueriesDialog({ onSelectQuery }: SavedQueriesDialogProps) {
  const [open, setOpen] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const queryClient = useQueryClient()

  const { data: savedQueries = [], isLoading } = useQuery({
    queryKey: ['saved-queries'],
    queryFn: () => apiClient.getSavedQueries(),
    enabled: open,
  })

  const deleteMutation = useMutation({
    mutationFn: (queryId: string) => apiClient.deleteSavedQuery(queryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-queries'] })
    },
  })

  const toggleFavoriteMutation = useMutation({
    mutationFn: ({ queryId, isFavorite }: { queryId: string; isFavorite: boolean }) =>
      apiClient.updateSavedQuery(queryId, { isFavorite: !isFavorite }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-queries'] })
    },
  })

  const filteredQueries = savedQueries.filter((q: SavedQuery) => {
    const matchesSearch = !searchFilter || 
      q.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      q.description?.toLowerCase().includes(searchFilter.toLowerCase())
    
    const matchesTags = tagFilter.length === 0 || 
      tagFilter.some(tag => q.tags.includes(tag))
    
    return matchesSearch && matchesTags
  })

  const allTags = [...new Set(savedQueries.flatMap((q: SavedQuery) => q.tags))]

  const handleLoadQuery = (query: SavedQuery) => {
    apiClient.recordQueryUse(query.id)
    onSelectQuery?.(query)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BookmarkPlus className="h-4 w-4 mr-2" />
          Saved Queries
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Saved Queries</DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="space-y-3 border-b pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input
              placeholder="Search queries..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-10"
            />
          </div>

          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => (
                <Badge
                  key={tag}
                  variant={tagFilter.includes(tag) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => {
                    setTagFilter(prev =>
                      prev.includes(tag)
                        ? prev.filter(t => t !== tag)
                        : [...prev, tag]
                    )
                  }}
                >
                  <Tag className="h-3 w-3 mr-1" />
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Queries List */}
        <div className="flex-1 overflow-auto space-y-3">
          {isLoading && (
            <div className="text-center py-8 text-neutral-500">Loading...</div>
          )}

          {!isLoading && filteredQueries.length === 0 && (
            <div className="text-center py-8 text-neutral-500">
              {searchFilter || tagFilter.length > 0
                ? 'No queries match your filters'
                : 'No saved queries yet'}
            </div>
          )}

          {filteredQueries.map((query: SavedQuery) => (
            <Card key={query.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate">{query.name}</h3>
                      {query.is_favorite && (
                        <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                      )}
                    </div>

                    {query.description && (
                      <p className="text-sm text-neutral-600 mb-2">{query.description}</p>
                    )}

                    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-2">
                      <Badge variant="secondary" className="text-xs">
                        {query.schema_name}.{query.table_name}
                      </Badge>
                      <span>•</span>
                      <span>{query.query_type.replace('_', ' ')}</span>
                      {query.use_count > 0 && (
                        <>
                          <span>•</span>
                          <span>Used {query.use_count} times</span>
                        </>
                      )}
                    </div>

                    {query.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {query.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleFavoriteMutation.mutate({ 
                        queryId: query.id, 
                        isFavorite: query.is_favorite 
                      })}
                    >
                      {query.is_favorite ? (
                        <StarOff className="h-4 w-4" />
                      ) : (
                        <Star className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleLoadQuery(query)}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(query.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

### Step 5: Add to Search Interface

**File: `frontend/src/components/database/search-interface.tsx`**

Add Save button and Saved Queries integration:

```typescript
import { SavedQueriesDialog } from './saved-queries-dialog'
import { Save } from 'lucide-react'

// In the search controls section, add:
<div className="flex items-center gap-2">
  <SavedQueriesDialog 
    onSelectQuery={(query) => {
      // Load the saved query parameters
      setTextQuery(query.parameters.query || '')
      setLimit(query.parameters.limit || 20)
      setMetric(query.parameters.metric || 'cosine')
      // ... load other parameters
      // Then trigger search
    }}
  />
  
  <Button
    variant="outline"
    size="sm"
    onClick={handleSaveQuery}
  >
    <Save className="h-4 w-4 mr-2" />
    Save Query
  </Button>
</div>

// Add save handler:
const handleSaveQuery = async () => {
  const queryData = {
    name: `Search: ${textQuery.substring(0, 30)}...`,
    queryType: 'vector_search',
    schemaName: schema,
    tableName: table,
    collectionId: selectedCollectionId,
    parameters: {
      query: textQuery,
      vector_column: selectedVectorColumn,
      search_column: selectedTextColumn,
      limit,
      metric,
      sortBy,
      sortOrder,
    },
    tags: ['search'],
  }
  
  await apiClient.createSavedQuery(queryData)
  toast({ title: 'Query saved successfully!' })
}
```

---

## Database Migration

Create migration script:

**File: `backend/migrations/003_saved_queries_bookmarks.sql`**

```sql
-- Run this to add the new tables to your existing database
\c your_metadata_database

-- Include the schema from Step 1 above
...
```

---

## Testing

1. **Save a Query**:
   - Perform a search
   - Click "Save Query"
   - Verify it appears in Saved Queries dialog

2. **Load a Query**:
   - Open Saved Queries
   - Click Play button
   - Verify search executes with saved parameters

3. **Organize with Tags**:
   - Edit a query
   - Add tags like "production", "ml-testing"
   - Filter by tags in the dialog

4. **Bookmark Tables**:
   - Right-click a table
   - Click "Bookmark"
   - See it in bookmarks section

---

## Success Metrics

- Users create 5+ saved queries in first week
- 50% of searches come from saved queries after 1 month
- Average query reuse count > 3
- Reduced time to execute common searches by 80%

---

## Estimated Time

- Backend (schema + API): 4-6 hours
- Frontend components: 6-8 hours  
- Integration & testing: 3-4 hours

**Total: 2-3 days**

This feature will dramatically improve user productivity and make DB Look essential for daily workflows! 💾
