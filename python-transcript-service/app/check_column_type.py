#!/usr/bin/env python3
"""
Step 1: Check Column Type - Diagnostic Script
This script checks the data type of the embedding column to confirm the root cause
"""

import os
import asyncio
import asyncpg
from dotenv import load_dotenv

# Load environment variables 
load_dotenv()
load_dotenv('.env.local')
load_dotenv('../.env.local')

async def check_column_type():
    """
    Check the embedding column type to confirm the format mismatch issue
    """
    print('🔍 Step 1: Checking Embedding Column Type')
    print('=' * 50)
    
    # Get database connection details
    database_url = os.getenv('DATABASE_URL')
    
    if not database_url:
        # Try to construct from individual components
        supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL', '')
        if 'yuecfzzsvpndsqgczfbv.supabase.co' in supabase_url:
            project_ref = 'yuecfzzsvpndsqgczfbv'
            password = "tAAo1UrQGrqrJM0O"  # From the connection tests
            database_url = f"postgresql://postgres:{password}@db.{project_ref}.supabase.co:5432/postgres"
        else:
            print("❌ Cannot find DATABASE_URL or construct connection string")
            return False
    
    print(f"🔗 Connecting to database...")
    print(f"   Host: {database_url.split('@')[1].split('/')[0] if '@' in database_url else 'unknown'}")
    
    try:
        # Connect to database
        conn = await asyncpg.connect(database_url)
        print("✅ Database connection successful")
        
        # Step 1: Check column type for embedding field
        print("\n📋 Checking column type for 'embedding' field...")
        
        column_info = await conn.fetch("""
            SELECT 
                column_name, 
                data_type, 
                character_maximum_length,
                numeric_precision,
                udt_name
            FROM information_schema.columns 
            WHERE table_name = 'youtube_transcript_chunks' 
            AND column_name = 'embedding'
        """)
        
        if column_info:
            for col in column_info:
                print(f"✅ Found embedding column:")
                print(f"   - Column: {col['column_name']}")
                print(f"   - Data Type: {col['data_type']}")
                print(f"   - UDT Name: {col['udt_name']}")
                print(f"   - Max Length: {col['character_maximum_length']}")
                print(f"   - Precision: {col['numeric_precision']}")
                
                # Analyze the type
                data_type = col['data_type'].lower()
                udt_name = col['udt_name'].lower()
                
                print(f"\n🔬 Analysis:")
                if 'vector' in data_type or 'vector' in udt_name:
                    print(f"   ✅ Column type is VECTOR - This is CORRECT for pgvector")
                    print(f"   ✅ Should support native vector operations")
                elif data_type in ['text', 'character varying', 'varchar', 'json', 'jsonb']:
                    print(f"   ❌ Column type is {data_type.upper()} - This is the PROBLEM!")
                    print(f"   ❌ Embeddings are stored as strings, not float arrays")
                    print(f"   🔧 This explains why similarity scores are 0.0000")
                else:
                    print(f"   ⚠️  Unknown column type: {data_type}")
                    print(f"   ⚠️  May need further investigation")
        else:
            print("❌ No 'embedding' column found in 'youtube_transcript_chunks' table")
            
            # Check what columns do exist
            print("\n📋 Available columns in youtube_transcript_chunks:")
            all_columns = await conn.fetch("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'youtube_transcript_chunks'
                ORDER BY ordinal_position
            """)
            
            for col in all_columns:
                print(f"   - {col['column_name']}: {col['data_type']}")
        
        # Step 2: Check if pgvector extension is available
        print(f"\n🔌 Checking pgvector extension availability...")
        
        extensions = await conn.fetch("""
            SELECT name, installed_version, default_version, comment
            FROM pg_available_extensions 
            WHERE name = 'vector'
        """)
        
        if extensions:
            ext = extensions[0]
            print(f"✅ pgvector extension found:")
            print(f"   - Name: {ext['name']}")
            print(f"   - Installed: {ext['installed_version'] or 'Not installed'}")
            print(f"   - Available: {ext['default_version']}")
            print(f"   - Description: {ext['comment']}")
            
            if not ext['installed_version']:
                print(f"\n⚠️  pgvector is available but NOT INSTALLED")
                print(f"   🔧 You may need to: CREATE EXTENSION vector;")
        else:
            print(f"❌ pgvector extension not found")
            print(f"   🔧 Supabase should have this by default")
        
        # Step 3: Sample data check - see actual format
        print(f"\n📊 Checking sample embedding data format...")
        
        sample_data = await conn.fetch("""
            SELECT chunk_id, video_id, 
                   CASE 
                       WHEN embedding IS NULL THEN 'NULL'
                       ELSE substring(embedding::text, 1, 100) || '...'
                   END as embedding_sample,
                   pg_typeof(embedding) as embedding_pg_type
            FROM youtube_transcript_chunks 
            WHERE embedding IS NOT NULL
            LIMIT 3
        """)
        
        if sample_data:
            print(f"✅ Found {len(sample_data)} chunks with embeddings:")
            for i, row in enumerate(sample_data, 1):
                print(f"   Sample {i}:")
                print(f"     - Chunk ID: {row['chunk_id']}")
                print(f"     - Video ID: {row['video_id']}")
                print(f"     - PostgreSQL Type: {row['embedding_pg_type']}")
                print(f"     - Sample Data: {row['embedding_sample']}")
                
                # Try to identify the format
                sample = row['embedding_sample']
                if sample.startswith('[') and ',' in sample:
                    print(f"     - Format: Likely JSON array (GOOD if vector type)")
                elif sample.startswith('"[') or sample.startswith("'["):
                    print(f"     - Format: Likely stringified JSON array (BAD - needs parsing)")
                else:
                    print(f"     - Format: Unknown format")
        else:
            print(f"❌ No chunks with embeddings found")
        
        await conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Database connection or query failed: {str(e)}")
        return False

if __name__ == "__main__":
    asyncio.run(check_column_type()) 