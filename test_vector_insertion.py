import os
from dotenv import load_dotenv
from supabase import create_client
import json

# Load environment variables
load_dotenv()
load_dotenv('.env.local')

supabase = create_client(
    os.getenv("NEXT_PUBLIC_SUPABASE_URL"), 
    os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
)

print("🧪 TESTING VECTOR INSERTION AFTER COLUMN FIX")
print("=" * 50)

# Test embedding (small vector for testing)
test_embedding = [0.1, 0.2, 0.3, 0.4, 0.5] * 307 + [0.1]  # Creates exactly 1536 elements

print(f"📊 Test embedding length: {len(test_embedding)}")
print(f"📊 Test embedding type: {type(test_embedding)}")
print(f"📊 First 5 elements: {test_embedding[:5]}")

# Test insertion
try:
    print("\n🔄 Attempting to insert test vector...")
    
    result = supabase.table('youtube_transcript_chunks').insert({
        'video_id': 'TEST_VECTOR_FIX',
        'chunk_index': 0,
        'start_time': 0.0,
        'end_time': 10.0,
        'text': 'This is a test chunk to verify vector insertion works',
        'word_count': 10,
        'metadata': {'test': True},
        'embedding': test_embedding
    }).execute()
    
    if result.data:
        print("✅ Test insertion successful!")
        test_id = result.data[0]['chunk_id']
        print(f"📊 Inserted chunk_id: {test_id}")
        
        # Now retrieve it and check the type
        print("\n🔄 Retrieving inserted data...")
        check_result = supabase.table('youtube_transcript_chunks').select('chunk_id, embedding').eq('chunk_id', test_id).execute()
        
        if check_result.data:
            retrieved_embedding = check_result.data[0]['embedding']
            print(f"📊 Retrieved embedding type: {type(retrieved_embedding)}")
            print(f"📊 Retrieved embedding length: {len(retrieved_embedding) if isinstance(retrieved_embedding, (list, str)) else 'N/A'}")
            
            if isinstance(retrieved_embedding, list):
                print("✅ SUCCESS: Embedding stored as proper vector!")
                print(f"📊 First 5 elements: {retrieved_embedding[:5]}")
            else:
                print("❌ STILL BROKEN: Embedding stored as string")
                print(f"📊 Preview: {str(retrieved_embedding)[:100]}...")
        
        # Clean up test data
        print(f"\n🧹 Cleaning up test data...")
        supabase.table('youtube_transcript_chunks').delete().eq('chunk_id', test_id).execute()
        print("✅ Test data cleaned up")
        
    else:
        print("❌ Test insertion failed")
        
except Exception as e:
    print(f"❌ Test failed with error: {e}")

print("\n🎯 NEXT STEPS:")
print("1. If SUCCESS: Your future video embeddings will work correctly")
print("2. If STILL BROKEN: We need to investigate the column definition further") 