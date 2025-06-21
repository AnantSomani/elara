import os
from dotenv import load_dotenv
import psycopg2

# Load environment variables
load_dotenv()
load_dotenv('.env.local')

print("🔧 Testing Direct PostgreSQL Connection...")

# Get connection details
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_DB_PASSWORD = os.getenv("SUPABASE_DB_PASSWORD")

print(f"📊 SUPABASE_URL: {SUPABASE_URL}")
print(f"📊 SUPABASE_DB_PASSWORD loaded: {bool(SUPABASE_DB_PASSWORD)}")

if not SUPABASE_URL or not SUPABASE_DB_PASSWORD:
    print("❌ Missing credentials")
    exit()

# Parse Supabase URL
supabase_url = SUPABASE_URL.replace('https://', '')
project_id = supabase_url.split('.')[0]

print(f"📊 Project ID: {project_id}")

# Connection parameters
conn_params = {
    'host': f'db.{project_id}.supabase.co',
    'port': '5432',
    'database': 'postgres',
    'user': 'postgres',
    'password': SUPABASE_DB_PASSWORD,
}

print(f"📊 Connecting to: {conn_params['host']}")

try:
    # Test connection
    conn = psycopg2.connect(**conn_params)
    cursor = conn.cursor()
    
    print("✅ Connection successful!")
    
    # Test vector insertion
    print("\n🧪 Testing vector insertion...")
    test_vector = [0.1, 0.2, 0.3] * 512  # 1536 elements
    
    cursor.execute("""
        INSERT INTO youtube_transcript_chunks 
        (video_id, chunk_index, start_time, end_time, text, word_count, metadata, embedding)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s::vector(1536))
        RETURNING chunk_id
    """, (
        'TEST_POSTGRES_CONNECTION',
        0,
        0.0,
        10.0,
        'Test text for PostgreSQL vector insertion',
        8,
        '{"test": true}',
        test_vector
    ))
    
    result = cursor.fetchone()
    if result:
        test_chunk_id = result[0]
        print(f"✅ Vector insertion successful! Chunk ID: {test_chunk_id}")
        
        # Test retrieval
        cursor.execute("SELECT embedding, pg_typeof(embedding) FROM youtube_transcript_chunks WHERE chunk_id = %s", (test_chunk_id,))
        retrieved = cursor.fetchone()
        if retrieved:
            embedding, embedding_type = retrieved
            print(f"📊 Retrieved embedding type: {embedding_type}")
            print(f"📊 Retrieved embedding length: {len(embedding)}")
            print(f"📊 First 3 elements: {embedding[:3]}")
            
            if embedding_type == 'vector':
                print("🎉 SUCCESS: Vector stored and retrieved correctly!")
            else:
                print(f"❌ Wrong type: {embedding_type}")
        
        # Clean up
        cursor.execute("DELETE FROM youtube_transcript_chunks WHERE chunk_id = %s", (test_chunk_id,))
        conn.commit()
        print("🧹 Test data cleaned up")
    
    cursor.close()
    conn.close()
    
except Exception as e:
    print(f"❌ Connection failed: {e}")
    print(f"Error type: {type(e)}") 