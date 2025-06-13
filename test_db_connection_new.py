import asyncio
import asyncpg
import os
from dotenv import load_dotenv
import sys

async def test_connections():
    # Load environment variables
    load_dotenv('../.env.local')
    
    # Get connection details
    supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL', '')
    supabase_key = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    database_url = os.getenv('DATABASE_URL', '')
    
    print("🔍 Testing Supabase connection methods...")
    print(f"Database URL: {database_url[:50]}***")
    print(f"Supabase URL: {supabase_url}")
    print(f"Supabase Key: {supabase_key[:20]}***")
    print()
    
    # Extract project ref from supabase URL
    if 'yuecfzzsvpndsqgczfbv.supabase.co' in supabase_url:
        project_ref = 'yuecfzzsvpndsqgczfbv'
        # Try different hostname formats
        hostnames_to_try = [
            f"db.{project_ref}.supabase.co",  # Standard format
            f"{project_ref}.supabase.co",     # Base format
            f"aws-0-us-east-1.pooler.supabase.com"  # Alternative pooler format
        ]
    else:
        print("❌ Cannot extract project reference from Supabase URL")
        return
    
    password = "tAAo1UrQGrqrJM0O"  # Updated password
    
    # Test different hostname formats
    for i, hostname in enumerate(hostnames_to_try, 1):
        print(f"🔗 Method {i}: Testing hostname {hostname}")
        connection_string = f"postgresql://postgres:{password}@{hostname}:5432/postgres"
        
        try:
            conn = await asyncpg.connect(connection_string)
            print(f"✅ Connection successful with {hostname}!")
            
            # Test a simple query
            result = await conn.fetchval("SELECT version()")
            print(f"📊 Database version: {result[:50]}...")
            
            # Check if our YouTube tables exist
            tables = await conn.fetch("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name LIKE 'youtube_%'
            """)
            
            if tables:
                print(f"📋 Found {len(tables)} YouTube tables:")
                for table in tables:
                    print(f"  - {table['table_name']}")
            else:
                print("⚠️  No YouTube tables found")
            
            await conn.close()
            return True
            
        except Exception as e:
            print(f"❌ Failed with {hostname}: {str(e)}")
            continue
    
    print("\n❌ All connection attempts failed")
    return False

if __name__ == "__main__":
    success = asyncio.run(test_connections())
    sys.exit(0 if success else 1) 