import asyncpg
import asyncio
import os

async def test_db():
    try:
        # Test different connection approaches
        project_ref = 'yuecfzzsvpndsqgczfbv'
        
        # Try 1: With service role key as password
        service_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1ZWNmenpzdnBuZHNxZ2N6ZmJ2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODY0Mzg0MywiZXhwIjoyMDY0MjE5ODQzfQ.M-qBCKr99kvEn-Hx8fCXKHjc2XoKNwS2leo6ZTIYm3s'
        
        # Connection strings to try
        connection_strings = [
            f'postgresql://postgres:podtalkai@db.{project_ref}.supabase.co:5432/postgres',
            f'postgresql://postgres.{project_ref}:podtalkai@aws-0-us-west-1.pooler.supabase.com:5432/postgres',
            f'postgresql://postgres.{project_ref}:{service_key}@aws-0-us-west-1.pooler.supabase.com:5432/postgres'
        ]
        
        for i, db_url in enumerate(connection_strings, 1):
            print(f'\\nTrying connection {i}:')
            print(f'Host: {db_url.split("@")[1].split("/")[0] if "@" in db_url else "unknown"}')
        
        conn = await asyncpg.connect(db_url)
        result = await conn.fetchval('SELECT 1')
        print(f'✅ Connection successful! Result: {result}')
        
        # Test our tables exist
        tables = await conn.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'youtube_%'")
        print(f'📊 Found {len(tables)} YouTube tables:')
        for table in tables:
            print(f'  - {table["table_name"]}')
            
        await conn.close()
    except Exception as e:
        print(f'❌ Connection failed: {e}')

if __name__ == "__main__":
    asyncio.run(test_db()) 