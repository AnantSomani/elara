import asyncpg
import asyncio
import os
from supabase import create_client, Client

async def test_multiple_connection_methods():
    """Test multiple ways to connect to Supabase"""
    
    # Load environment variables
    database_url = os.getenv('DATABASE_URL')
    supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    supabase_key = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    
    print("🔍 Testing Supabase connection methods...")
    print(f"Database URL: {database_url[:50] + '***' if database_url else 'Not found'}")
    print(f"Supabase URL: {supabase_url}")
    print(f"Supabase Key: {supabase_key[:20] + '***' if supabase_key else 'Not found'}")
    print()
    
    # Method 1: Direct asyncpg connection
    print("🔗 Method 1: Direct PostgreSQL connection")
    try:
        if database_url:
            conn = await asyncpg.connect(database_url)
            result = await conn.fetchval('SELECT 1')
            print(f'✅ Direct connection successful! Result: {result}')
            await conn.close()
        else:
            print("❌ No DATABASE_URL found")
    except Exception as e:
        print(f'❌ Direct connection failed: {e}')
    print()
    
    # Method 2: Supabase REST API client
    print("🔗 Method 2: Supabase REST client")
    try:
        if supabase_url and supabase_key:
            supabase: Client = create_client(supabase_url, supabase_key)
            
            # Test by checking if we can access tables
            response = supabase.table('youtube_videos').select('id').limit(1).execute()
            print(f'✅ Supabase REST client successful! Found {len(response.data)} records')
        else:
            print("❌ Missing Supabase URL or key")
    except Exception as e:
        print(f'❌ Supabase REST client failed: {e}')
    print()
    
    # Method 3: Try alternative PostgreSQL connection with SSL disabled
    print("🔗 Method 3: PostgreSQL with SSL disabled")
    try:
        if database_url:
            # Modify URL to disable SSL
            alt_url = database_url + "?sslmode=disable"
            conn = await asyncpg.connect(alt_url)
            result = await conn.fetchval('SELECT 1')
            print(f'✅ No-SSL connection successful! Result: {result}')
            await conn.close()
        else:
            print("❌ No DATABASE_URL found")
    except Exception as e:
        print(f'❌ No-SSL connection failed: {e}')
    print()
    
    # Method 4: Check if tables exist via Supabase REST
    print("🔗 Method 4: Check YouTube tables via REST API")
    try:
        if supabase_url and supabase_key:
            supabase: Client = create_client(supabase_url, supabase_key)
            
            tables_to_check = ['youtube_channels', 'youtube_videos', 'youtube_transcripts', 'youtube_embeddings']
            for table in tables_to_check:
                try:
                    response = supabase.table(table).select('*').limit(1).execute()
                    print(f'  ✅ {table}: {len(response.data)} records found')
                except Exception as table_error:
                    print(f'  ❌ {table}: {table_error}')
    except Exception as e:
        print(f'❌ Table check failed: {e}')

if __name__ == "__main__":
    asyncio.run(test_multiple_connection_methods()) 