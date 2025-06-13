-- ============================================================================
-- YouTube Search Functions - 4-Dimensional RAG System
-- 
-- This file contains all the search functions for the YouTube transcript
-- database, implementing the 4-dimensional RAG approach:
-- 1. FTS (Full-Text Search) - Exact keyword matching
-- 2. Vector Search - Semantic similarity 
-- 3. Hybrid Search - Combined FTS + Vector
-- 4. Metadata Search - Channel/video attributes
-- ============================================================================

-- ============================================================================
-- 1. VECTOR SIMILARITY SEARCH
-- ============================================================================

-- Vector similarity search function for semantic queries
CREATE OR REPLACE FUNCTION match_youtube_embeddings(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 10,
    content_types text[] DEFAULT ARRAY['transcript_chunk', 'transcript_full']
)
RETURNS TABLE (
    id uuid,
    content_id text,
    content_type text,
    similarity float,
    chunk_text text,
    metadata jsonb,
    video_id text,
    channel_id text,
    video_title text,
    channel_name text
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.content_id,
        e.content_type,
        (1 - (e.embedding <=> query_embedding)) as similarity,
        e.chunk_text,
        e.metadata,
        CASE 
            WHEN e.content_type IN ('transcript_chunk', 'transcript_full') THEN 
                COALESCE(ts.video_id, t.video_id)
            WHEN e.content_type = 'video_metadata' THEN e.content_id
            ELSE NULL
        END as video_id,
        CASE 
            WHEN e.content_type IN ('transcript_chunk', 'transcript_full') THEN 
                COALESCE(ts.video_id, t.channel_id)
            WHEN e.content_type = 'video_metadata' THEN v.channel_id
            WHEN e.content_type = 'channel_metadata' THEN e.content_id
            ELSE NULL
        END as channel_id,
        v.title as video_title,
        c.name as channel_name
    FROM youtube_embeddings e
    LEFT JOIN youtube_transcript_segments ts ON e.content_id = ts.id::text AND e.content_type = 'transcript_chunk'
    LEFT JOIN youtube_transcripts t ON e.content_id = t.id::text AND e.content_type = 'transcript_full'
    LEFT JOIN youtube_videos v ON (
        (e.content_type = 'video_metadata' AND e.content_id = v.id) OR
        (e.content_type IN ('transcript_chunk', 'transcript_full') AND COALESCE(ts.video_id, t.video_id) = v.id)
    )
    LEFT JOIN youtube_channels c ON (
        (e.content_type = 'channel_metadata' AND e.content_id = c.id) OR
        (v.channel_id = c.id)
    )
    WHERE 
        e.content_type = ANY(content_types)
        AND (1 - (e.embedding <=> query_embedding)) > match_threshold
    ORDER BY e.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ============================================================================
-- 2. FULL-TEXT SEARCH (FTS)
-- ============================================================================

-- Advanced FTS search across transcripts and segments
CREATE OR REPLACE FUNCTION search_youtube_fts(
    search_query text,
    match_count int DEFAULT 20,
    include_segments boolean DEFAULT true,
    include_transcripts boolean DEFAULT true,
    min_rank float DEFAULT 0.1
)
RETURNS TABLE (
    id text,
    content_type text,
    content text,
    rank float,
    video_id text,
    channel_id text,
    video_title text,
    channel_name text,
    start_time numeric,
    end_time numeric,
    segment_index int
)
LANGUAGE plpgsql
AS $$
DECLARE
    ts_query tsquery;
BEGIN
    -- Convert search query to tsquery
    ts_query := plainto_tsquery('english', search_query);
    
    RETURN QUERY
    (
        -- Search transcript segments
        SELECT 
            ts.id::text,
            'segment'::text as content_type,
            ts.text as content,
            ts_rank(to_tsvector('english', ts.text), ts_query) as rank,
            ts.video_id,
            v.channel_id,
            v.title as video_title,
            c.name as channel_name,
            ts.start_time,
            ts.end_time,
            ts.segment_index
        FROM youtube_transcript_segments ts
        JOIN youtube_videos v ON ts.video_id = v.id
        JOIN youtube_channels c ON v.channel_id = c.id
        WHERE 
            include_segments = true
            AND to_tsvector('english', ts.text) @@ ts_query
            AND ts_rank(to_tsvector('english', ts.text), ts_query) > min_rank
        
        UNION ALL
        
        -- Search full transcripts
        SELECT 
            t.id::text,
            'transcript'::text as content_type,
            t.content as content,
            ts_rank(to_tsvector('english', t.content), ts_query) as rank,
            t.video_id,
            t.channel_id,
            v.title as video_title,
            c.name as channel_name,
            NULL::numeric as start_time,
            NULL::numeric as end_time,
            NULL::int as segment_index
        FROM youtube_transcripts t
        JOIN youtube_videos v ON t.video_id = v.id
        JOIN youtube_channels c ON v.channel_id = c.id
        WHERE 
            include_transcripts = true
            AND to_tsvector('english', t.content) @@ ts_query
            AND ts_rank(to_tsvector('english', t.content), ts_query) > min_rank
    )
    ORDER BY rank DESC
    LIMIT match_count;
END;
$$;

-- ============================================================================
-- 3. HYBRID SEARCH (FTS + Vector)
-- ============================================================================

-- Hybrid search combining FTS and vector similarity
CREATE OR REPLACE FUNCTION hybrid_search_youtube(
    search_query text,
    query_embedding vector(1536) DEFAULT NULL,
    fts_weight float DEFAULT 0.3,
    vector_weight float DEFAULT 0.7,
    match_count int DEFAULT 15,
    fts_threshold float DEFAULT 0.1,
    vector_threshold float DEFAULT 0.7
)
RETURNS TABLE (
    id text,
    content_type text,
    content text,
    relevance_score float,
    fts_score float,
    vector_score float,
    video_id text,
    channel_id text,
    video_title text,
    channel_name text,
    start_time numeric,
    metadata jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
    ts_query tsquery;
BEGIN
    -- Convert search query to tsquery
    ts_query := plainto_tsquery('english', search_query);
    
    RETURN QUERY
    WITH fts_results AS (
        -- FTS results from segments
        SELECT 
            ts.id::text,
            'segment'::text as content_type,
            ts.text as content,
            ts_rank(to_tsvector('english', ts.text), ts_query) as fts_score,
            0.0::float as vector_score,
            ts.video_id,
            v.channel_id,
            v.title as video_title,
            c.name as channel_name,
            ts.start_time,
            jsonb_build_object(
                'segment_index', ts.segment_index,
                'duration', ts.duration,
                'keywords', ts.keywords
            ) as metadata
        FROM youtube_transcript_segments ts
        JOIN youtube_videos v ON ts.video_id = v.id
        JOIN youtube_channels c ON v.channel_id = c.id
        WHERE 
            to_tsvector('english', ts.text) @@ ts_query
            AND ts_rank(to_tsvector('english', ts.text), ts_query) > fts_threshold
    ),
    vector_results AS (
        -- Vector results (only if embedding provided)
        SELECT 
            e.content_id as id,
            e.content_type,
            COALESCE(e.chunk_text, ts.text, t.content) as content,
            0.0::float as fts_score,
            (1 - (e.embedding <=> query_embedding)) as vector_score,
            COALESCE(ts.video_id, t.video_id, v.id) as video_id,
            COALESCE(t.channel_id, v.channel_id, c.id) as channel_id,
            v.title as video_title,
            c.name as channel_name,
            ts.start_time,
            jsonb_build_object(
                'embedding_type', e.content_type,
                'chunk_index', e.chunk_index,
                'model', e.model
            ) as metadata
        FROM youtube_embeddings e
        LEFT JOIN youtube_transcript_segments ts ON e.content_id = ts.id::text AND e.content_type = 'transcript_chunk'
        LEFT JOIN youtube_transcripts t ON e.content_id = t.id::text AND e.content_type = 'transcript_full'
        LEFT JOIN youtube_videos v ON e.content_id = v.id AND e.content_type = 'video_metadata'
        LEFT JOIN youtube_channels c ON e.content_id = c.id AND e.content_type = 'channel_metadata'
        WHERE 
            query_embedding IS NOT NULL
            AND (1 - (e.embedding <=> query_embedding)) > vector_threshold
    ),
    combined_results AS (
        -- Combine and deduplicate results
        SELECT 
            COALESCE(f.id, v.id) as id,
            COALESCE(f.content_type, v.content_type) as content_type,
            COALESCE(f.content, v.content) as content,
            COALESCE(f.fts_score, 0.0) as fts_score,
            COALESCE(v.vector_score, 0.0) as vector_score,
            COALESCE(f.video_id, v.video_id) as video_id,
            COALESCE(f.channel_id, v.channel_id) as channel_id,
            COALESCE(f.video_title, v.video_title) as video_title,
            COALESCE(f.channel_name, v.channel_name) as channel_name,
            COALESCE(f.start_time, v.start_time) as start_time,
            COALESCE(f.metadata, v.metadata) as metadata
        FROM fts_results f
        FULL OUTER JOIN vector_results v ON f.id = v.id
    )
    SELECT 
        cr.id,
        cr.content_type,
        cr.content,
        (cr.fts_score * fts_weight + cr.vector_score * vector_weight) as relevance_score,
        cr.fts_score,
        cr.vector_score,
        cr.video_id,
        cr.channel_id,
        cr.video_title,
        cr.channel_name,
        cr.start_time,
        cr.metadata
    FROM combined_results cr
    WHERE (cr.fts_score > 0 OR cr.vector_score > 0)
    ORDER BY relevance_score DESC
    LIMIT match_count;
END;
$$;

-- ============================================================================
-- 4. METADATA SEARCH
-- ============================================================================

-- Search videos and channels by metadata
CREATE OR REPLACE FUNCTION search_youtube_metadata(
    search_query text DEFAULT NULL,
    channel_ids text[] DEFAULT NULL,
    video_ids text[] DEFAULT NULL,
    categories text[] DEFAULT NULL,
    filter_tags text[] DEFAULT NULL,
    min_duration_seconds int DEFAULT NULL,
    max_duration_seconds int DEFAULT NULL,
    published_after timestamptz DEFAULT NULL,
    published_before timestamptz DEFAULT NULL,
    has_transcript boolean DEFAULT NULL,
    match_count int DEFAULT 20
)
RETURNS TABLE (
    video_id text,
    video_title text,
    video_description text,
    channel_id text,
    channel_name text,
    published_at timestamptz,
    duration_seconds int,
    view_count bigint,
    has_captions boolean,
    transcript_status text,
    tags text[],
    relevance_score float
)
LANGUAGE plpgsql
AS $$
DECLARE
    ts_query tsquery;
BEGIN
    -- Convert search query to tsquery if provided
    IF search_query IS NOT NULL THEN
        ts_query := plainto_tsquery('english', search_query);
    END IF;
    
    RETURN QUERY
    SELECT 
        v.id as video_id,
        v.title as video_title,
        v.description as video_description,
        v.channel_id,
        c.name as channel_name,
        v.published_at,
        v.duration_seconds,
        v.view_count,
        v.has_captions,
        v.transcript_status,
        v.tags,
        CASE 
            WHEN search_query IS NOT NULL THEN
                GREATEST(
                    ts_rank(to_tsvector('english', v.title), ts_query),
                    ts_rank(to_tsvector('english', COALESCE(v.description, '')), ts_query) * 0.5,
                    ts_rank(to_tsvector('english', c.name), ts_query) * 0.3
                )
            ELSE 1.0
        END as relevance_score
    FROM youtube_videos v
    JOIN youtube_channels c ON v.channel_id = c.id
    WHERE 
        -- Text search conditions
        (search_query IS NULL OR (
            to_tsvector('english', v.title) @@ ts_query OR
            to_tsvector('english', COALESCE(v.description, '')) @@ ts_query OR
            to_tsvector('english', c.name) @@ ts_query
        ))
        -- Filter conditions
        AND (channel_ids IS NULL OR v.channel_id = ANY(channel_ids))
        AND (video_ids IS NULL OR v.id = ANY(video_ids))
        AND (categories IS NULL OR v.category = ANY(categories))
        AND (filter_tags IS NULL OR v.tags && filter_tags)
        AND (min_duration_seconds IS NULL OR v.duration_seconds >= min_duration_seconds)
        AND (max_duration_seconds IS NULL OR v.duration_seconds <= max_duration_seconds)
        AND (published_after IS NULL OR v.published_at >= published_after)
        AND (published_before IS NULL OR v.published_at <= published_before)
        AND (has_transcript IS NULL OR (
            CASE 
                WHEN has_transcript = true THEN v.transcript_status = 'completed'
                ELSE v.transcript_status != 'completed'
            END
        ))
    ORDER BY relevance_score DESC, v.published_at DESC
    LIMIT match_count;
END;
$$;

-- ============================================================================
-- 5. INTELLIGENT QUERY ROUTER
-- ============================================================================

-- Intelligent query router that determines the best search strategy
CREATE OR REPLACE FUNCTION route_youtube_query(
    search_query text,
    query_embedding vector(1536) DEFAULT NULL,
    user_context jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
    recommended_strategy text,
    confidence_score float,
    reasoning text,
    suggested_params jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
    query_length int;
    has_quotes boolean;
    has_technical_terms boolean;
    has_time_references boolean;
    has_channel_mentions boolean;
    embedding_available boolean;
BEGIN
    -- Analyze query characteristics
    query_length := length(search_query);
    has_quotes := search_query ~ '"[^"]*"';
    has_technical_terms := search_query ~* '\b(api|algorithm|function|code|programming|tutorial|how to)\b';
    has_time_references := search_query ~* '\b(recent|latest|new|old|2023|2024|yesterday|today)\b';
    has_channel_mentions := search_query ~* '\b(channel|creator|youtuber|@\w+)\b';
    embedding_available := query_embedding IS NOT NULL;
    
    -- Determine best strategy
    IF has_quotes OR (query_length < 20 AND NOT has_technical_terms) THEN
        -- Short, specific queries or quoted text -> FTS
        RETURN QUERY SELECT 
            'fts'::text,
            0.9::float,
            'Query contains specific terms or quotes, best suited for exact matching'::text,
            jsonb_build_object(
                'fts_weight', 1.0,
                'include_segments', true,
                'min_rank', 0.1
            );
    
    ELSIF has_channel_mentions OR has_time_references THEN
        -- Metadata-focused queries
        RETURN QUERY SELECT 
            'metadata'::text,
            0.85::float,
            'Query focuses on channel or temporal information'::text,
            jsonb_build_object(
                'include_channel_search', true,
                'include_temporal_filters', has_time_references
            );
    
    ELSIF embedding_available AND (has_technical_terms OR query_length > 30) THEN
        -- Complex, conceptual queries -> Hybrid
        RETURN QUERY SELECT 
            'hybrid'::text,
            0.95::float,
            'Complex query with semantic meaning, hybrid search recommended'::text,
            jsonb_build_object(
                'fts_weight', 0.3,
                'vector_weight', 0.7,
                'fts_threshold', 0.1,
                'vector_threshold', 0.7
            );
    
    ELSIF embedding_available THEN
        -- General semantic queries -> Vector
        RETURN QUERY SELECT 
            'vector'::text,
            0.8::float,
            'Semantic query, vector search recommended'::text,
            jsonb_build_object(
                'similarity_threshold', 0.7,
                'content_types', ARRAY['transcript_chunk', 'transcript_full']
            );
    
    ELSE
        -- Fallback to FTS
        RETURN QUERY SELECT 
            'fts'::text,
            0.6::float,
            'No embedding available, falling back to text search'::text,
            jsonb_build_object(
                'fts_weight', 1.0,
                'include_segments', true
            );
    END IF;
END;
$$;

-- ============================================================================
-- 6. UNIFIED SEARCH INTERFACE
-- ============================================================================

-- Unified search function that automatically routes and executes queries
CREATE OR REPLACE FUNCTION search_youtube_unified(
    search_query text,
    query_embedding vector(1536) DEFAULT NULL,
    strategy text DEFAULT 'auto',
    match_count int DEFAULT 15,
    user_context jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
    id text,
    content_type text,
    content text,
    relevance_score float,
    video_id text,
    channel_id text,
    video_title text,
    channel_name text,
    start_time numeric,
    metadata jsonb,
    search_strategy text,
    execution_time_ms int
)
LANGUAGE plpgsql
AS $$
DECLARE
    start_time timestamptz;
    end_time timestamptz;
    execution_ms int;
    chosen_strategy text;
    route_result record;
BEGIN
    start_time := clock_timestamp();
    
    -- Determine strategy
    IF strategy = 'auto' THEN
        SELECT rs.recommended_strategy INTO chosen_strategy
        FROM route_youtube_query(search_query, query_embedding, user_context) rs
        LIMIT 1;
    ELSE
        chosen_strategy := strategy;
    END IF;
    
    -- Execute based on chosen strategy
    IF chosen_strategy = 'fts' THEN
        RETURN QUERY
        SELECT 
            f.id,
            f.content_type,
            f.content,
            f.rank as relevance_score,
            f.video_id,
            f.channel_id,
            f.video_title,
            f.channel_name,
            f.start_time,
            jsonb_build_object('segment_index', f.segment_index) as metadata,
            'fts'::text as search_strategy,
            0::int as execution_time_ms
        FROM search_youtube_fts(search_query, match_count) f;
        
    ELSIF chosen_strategy = 'vector' AND query_embedding IS NOT NULL THEN
        RETURN QUERY
        SELECT 
            v.id::text,
            v.content_type,
            COALESCE(v.chunk_text, 'Vector match') as content,
            v.similarity as relevance_score,
            v.video_id,
            v.channel_id,
            v.video_title,
            v.channel_name,
            NULL::numeric as start_time,
            v.metadata,
            'vector'::text as search_strategy,
            0::int as execution_time_ms
        FROM match_youtube_embeddings(query_embedding, 0.7, match_count) v;
        
    ELSIF chosen_strategy = 'hybrid' AND query_embedding IS NOT NULL THEN
        RETURN QUERY
        SELECT 
            h.id,
            h.content_type,
            h.content,
            h.relevance_score,
            h.video_id,
            h.channel_id,
            h.video_title,
            h.channel_name,
            h.start_time,
            h.metadata,
            'hybrid'::text as search_strategy,
            0::int as execution_time_ms
        FROM hybrid_search_youtube(search_query, query_embedding, 0.3, 0.7, match_count) h;
        
    ELSIF chosen_strategy = 'metadata' THEN
        RETURN QUERY
        SELECT 
            m.video_id as id,
            'video'::text as content_type,
            m.video_description as content,
            m.relevance_score,
            m.video_id,
            m.channel_id,
            m.video_title,
            m.channel_name,
            NULL::numeric as start_time,
            jsonb_build_object(
                'duration_seconds', m.duration_seconds,
                'view_count', m.view_count,
                'published_at', m.published_at,
                'tags', m.tags
            ) as metadata,
            'metadata'::text as search_strategy,
            0::int as execution_time_ms
        FROM search_youtube_metadata(search_query, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, match_count) m;
    END IF;
    
    -- Calculate execution time
    end_time := clock_timestamp();
    execution_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    
    -- Update all returned rows with actual execution time
    UPDATE pg_temp.temp_results SET execution_time_ms = execution_ms WHERE true;
END;
$$;

-- ============================================================================
-- 7. CACHE MANAGEMENT FUNCTIONS
-- ============================================================================

-- Function to clean expired cache entries
CREATE OR REPLACE FUNCTION cleanup_youtube_cache()
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count int := 0;
    temp_count int;
BEGIN
    -- Clean search cache
    DELETE FROM youtube_search_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Clean web cache
    DELETE FROM youtube_web_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    RETURN deleted_count;
END;
$$;

-- Function to get cache statistics
CREATE OR REPLACE FUNCTION get_youtube_cache_stats()
RETURNS TABLE (
    cache_type text,
    total_entries bigint,
    expired_entries bigint,
    hit_rate float,
    avg_execution_time_ms float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        'search'::text as cache_type,
        COUNT(*)::bigint as total_entries,
        COUNT(*) FILTER (WHERE expires_at < NOW())::bigint as expired_entries,
        AVG(hit_count)::float as hit_rate,
        AVG(execution_time_ms)::float as avg_execution_time_ms
    FROM youtube_search_cache
    
    UNION ALL
    
    SELECT 
        'web'::text as cache_type,
        COUNT(*)::bigint as total_entries,
        COUNT(*) FILTER (WHERE expires_at < NOW())::bigint as expired_entries,
        1.0::float as hit_rate, -- Web cache doesn't track hits the same way
        NULL::float as avg_execution_time_ms
    FROM youtube_web_cache;
END;
$$; 