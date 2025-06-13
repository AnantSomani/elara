import asyncio
import asyncpg

async def test():
    password = "tAAo1UrQGrqrJM0O"
    
    # Test db.hostname format
    try:
        print("Testing db.yuecfzzsvpndsqgczfbv.supabase.co...")
        conn = await asyncpg.connect(f"postgresql://postgres:{password}@db.yuecfzzsvpndsqgczfbv.supabase.co:5432/postgres")
        result = await conn.fetchval("SELECT version()")
        print(f"✅ SUCCESS with db.hostname: {result[:50]}...")
        
        # Check YouTube tables
        tables = await conn.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'youtube_%'")
        print(f"📋 Found {len(tables)} YouTube tables")
        
        await conn.close()
        return True
    except Exception as e:
        print(f"❌ Failed db.hostname: {e}")
    
    # Test base hostname format
    try:
        print("Testing yuecfzzsvpndsqgczfbv.supabase.co...")
        conn = await asyncpg.connect(f"postgresql://postgres:{password}@yuecfzzsvpndsqgczfbv.supabase.co:5432/postgres")
        result = await conn.fetchval("SELECT version()")
        print(f"✅ SUCCESS with base hostname: {result[:50]}...")
        
        # Check YouTube tables
        tables = await conn.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'youtube_%'")
        print(f"📋 Found {len(tables)} YouTube tables")
        
        await conn.close()
        return True
    except Exception as e:
        print(f"❌ Failed base hostname: {e}")
    
    print("❌ All connection attempts failed")
    return False

if __name__ == "__main__":
    asyncio.run(test()) 