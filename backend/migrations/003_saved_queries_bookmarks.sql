-- Migration: Add Saved Queries and Bookmarks tables
-- Run this on your metadata database

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

CREATE INDEX IF NOT EXISTS idx_saved_queries_user ON db_look_saved_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_queries_session ON db_look_saved_queries(session_id);
CREATE INDEX IF NOT EXISTS idx_saved_queries_table ON db_look_saved_queries(schema_name, table_name);
CREATE INDEX IF NOT EXISTS idx_saved_queries_tags ON db_look_saved_queries USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_saved_queries_favorite ON db_look_saved_queries(user_id, is_favorite) WHERE is_favorite = TRUE;

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

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON db_look_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_session ON db_look_bookmarks(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmarks_unique ON db_look_bookmarks(user_id, session_id, schema_name, table_name, COALESCE(collection_id, ''));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_saved_queries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS trigger_update_saved_queries_updated_at ON db_look_saved_queries;
CREATE TRIGGER trigger_update_saved_queries_updated_at
    BEFORE UPDATE ON db_look_saved_queries
    FOR EACH ROW
    EXECUTE FUNCTION update_saved_queries_updated_at();

-- Comments for documentation
COMMENT ON TABLE db_look_saved_queries IS 'Stores user-saved search queries for quick replay';
COMMENT ON TABLE db_look_bookmarks IS 'Stores user bookmarks for quick access to tables and collections';
COMMENT ON COLUMN db_look_saved_queries.parameters IS 'JSONB object containing all search parameters';
COMMENT ON COLUMN db_look_saved_queries.tags IS 'Array of tags for organizing and filtering queries';
COMMENT ON COLUMN db_look_saved_queries.use_count IS 'Number of times this query has been executed';
