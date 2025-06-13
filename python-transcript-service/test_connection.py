import asyncpg
import asyncio
import os

async def test_connection_with_password():
    """Test database connection with actual password"""
    try:
        # Get DATABASE_URL from environment
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            print("❌ DATABASE_URL not found in environment")
            return False
            
        print(f"🔗 Testing connection to: {database_url.replace(database_url.split('@')[0].split(':')[-1], '***')}")
        
        conn = await asyncpg.connect(database_url)
        result = await conn.fetchval('SELECT 1')
        print(f'✅ Connection successful! Test query result: {result}')
        
        # Test our YouTube tables exist
        tables = await conn.fetch("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name LIKE 'youtube_%'
            ORDER BY table_name
        """)
        
        print(f'📊 Found {len(tables)} YouTube tables:')
        for table in tables:
            count = await conn.fetchval(f"SELECT COUNT(*) FROM {table['table_name']}")
            print(f'  - {table["table_name"]}: {count} rows')
            
        await conn.close()
        return True
        
    except Exception as e:
        print(f'❌ Connection failed: {e}')
        return False

if __name__ == "__main__":
    asyncio.run(test_connection_with_password()) 