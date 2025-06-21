import os
from dotenv import load_dotenv
from supabase import create_client
import json

# Load environment variables (same as main service)
load_dotenv()
load_dotenv('.env.local')

# Debug environment loading - use same variable names as main service
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

print(f"🔧 SUPABASE_URL loaded: {bool(SUPABASE_URL)}")
print(f"🔧 SUPABASE_KEY loaded: {bool(SUPABASE_KEY)}")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Missing environment variables!")
    print(f"URL: {SUPABASE_URL[:20]}..." if SUPABASE_URL else "None")
    print(f"KEY: {SUPABASE_KEY[:20]}..." if SUPABASE_KEY else "None")
    exit()

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

print("🔍 PRECISE EMBEDDING DEBUG")
print("=" * 50)

# Get a chunk with embedding (using correct column names)
result = supabase.table('youtube_transcript_chunks').select('chunk_id, video_id, embedding').eq('video_id', 'qM4e7g2RukI').limit(1).execute()

if not result.data:
    print("❌ No data found")
    exit()

chunk = result.data[0]
embedding = chunk['embedding']

print(f"📊 Chunk ID: {chunk['chunk_id']}")
print(f"📊 Video ID: {chunk['video_id']}")
print()

# Detailed analysis of what we received
print("🔍 PYTHON OBJECT ANALYSIS:")
print(f"📊 Python type: {type(embedding)}")
print(f"📊 Python type name: {type(embedding).__name__}")
print(f"📊 Is list: {isinstance(embedding, list)}")
print(f"📊 Is string: {isinstance(embedding, str)}")
print(f"📊 Length: {len(embedding)}")

if isinstance(embedding, str):
    print(f"📊 String preview: {embedding[:100]}...")
    print(f"📊 Starts with '[': {embedding.startswith('[')}")
    print(f"📊 Ends with ']': {embedding.endswith(']')}")
    
    # Try to parse as JSON
    try:
        parsed = json.loads(embedding)
        print(f"📊 JSON parseable: ✅")
        print(f"📊 Parsed type: {type(parsed)}")
        print(f"📊 Parsed length: {len(parsed)}")
        print(f"📊 First 5 elements: {parsed[:5]}")
    except:
        print(f"📊 JSON parseable: ❌")

elif isinstance(embedding, list):
    print(f"📊 List length: {len(embedding)}")
    print(f"📊 First 5 elements: {embedding[:5]}")
    print(f"📊 Element types: {[type(x) for x in embedding[:3]]}")

print()
print("🔍 RAW RESPONSE ANALYSIS:")
print(f"📊 Raw response type: {type(result.data)}")
print(f"📊 Raw chunk type: {type(chunk)}")
print(f"📊 Raw embedding key exists: {'embedding' in chunk}")

# Let's also check what the Supabase client is actually receiving
print()
print("🔍 SUPABASE CLIENT RESPONSE:")
print(f"📊 Response data: {result.data[0].keys()}")

# Check if it's actually a PostgreSQL array that got converted to string
print()
print("🔍 POSTGRESQL ARRAY CHECK:")
if isinstance(embedding, str) and embedding.startswith('[') and embedding.endswith(']'):
    print("📊 Looks like PostgreSQL array format")
    # Try to evaluate as Python literal
    try:
        import ast
        evaluated = ast.literal_eval(embedding)
        print(f"📊 literal_eval successful: ✅")
        print(f"📊 Evaluated type: {type(evaluated)}")
        print(f"📊 Evaluated length: {len(evaluated)}")
    except Exception as e:
        print(f"📊 literal_eval failed: {e}")

print()
print("🎯 CONCLUSION:")
if isinstance(embedding, list):
    print("✅ Embeddings are stored as proper arrays!")
    print("✅ The issue might be elsewhere in our code")
elif isinstance(embedding, str):
    print("❌ Embeddings are stored as strings")
    print("❌ We need to fix the column type or insertion method")
else:
    print(f"❓ Unexpected type: {type(embedding)}") 