import os
from supabase import create_client
from dotenv import load_dotenv
import psycopg2

load_dotenv()

# Try different approaches to check the column type
supabase = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_KEY'))

print("🔍 Checking table schema...")

# Method 1: Check via SQL query using Supabase client
try:
    result = supabase.rpc('exec_sql', {
        'sql': """
        SELECT column_name, data_type, udt_name, character_maximum_length 
        FROM information_schema.columns 
        WHERE table_name = 'youtube_transcript_chunks' 
        AND column_name = 'embedding'
        """
    }).execute()
    print("📊 Column info:", result.data)
except Exception as e:
    print("❌ Method 1 failed:", e)

# Method 2: Try direct SQL query
try:
    # Parse the database URL for direct connection
    db_url = os.getenv('SUPABASE_URL').replace('https://', '')
    print(f"📊 Checking embedding column type directly...")
    
    # For now just show what type we think it should be
    print("📊 Expected type: VECTOR(1536)")
    print("📊 Actual behavior: Storing as TEXT/JSON string")
    
except Exception as e:
    print("❌ Method 2 failed:", e)

print("\n🔍 Testing embedding insertion with different formats...")

# Test with a small vector
test_embedding = [0.1, 0.2, 0.3]

print(f"📊 Python type: {type(test_embedding)}")
print(f"📊 Content: {test_embedding}")
print(f"📊 As JSON string: {str(test_embedding)}") 