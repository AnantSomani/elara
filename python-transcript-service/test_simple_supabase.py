#!/usr/bin/env python3

import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
load_dotenv('../.env.local')

print("🔍 Testing Supabase Environment Variables...")
print(f"NEXT_PUBLIC_SUPABASE_URL: {os.getenv('NEXT_PUBLIC_SUPABASE_URL')}")
print(f"NEXT_PUBLIC_SUPABASE_ANON_KEY: {os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'Not found')[:20]}...")

# Test if we can import supabase
try:
    from supabase import create_client
    print("✅ Supabase package imported successfully")
except ImportError as e:
    print(f"❌ Cannot import supabase: {e}")
    sys.exit(1)

# Test creating client
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Missing Supabase environment variables")
    sys.exit(1)

try:
    print("🔗 Attempting to create Supabase client...")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("✅ Supabase client created successfully!")
    
    # Test a simple query
    print("📊 Testing database connection...")
    response = supabase.table('youtube_transcripts').select('transcript_id').limit(1).execute()
    print(f"✅ Database query successful! Found {len(response.data)} records")
    
except Exception as e:
    print(f"❌ Supabase connection failed: {e}")
    
    # Try alternative approach - direct REST API call
    print("🔄 Trying direct REST API approach...")
    import requests
    
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json'
    }
    
    try:
        api_url = f"{SUPABASE_URL}/rest/v1/youtube_transcripts?select=transcript_id&limit=1"
        response = requests.get(api_url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Direct REST API works! Found {len(data)} records")
            print("💡 We can use direct REST API calls instead of Supabase client")
        else:
            print(f"❌ REST API failed: {response.status_code} - {response.text}")
            
    except Exception as rest_error:
        print(f"❌ REST API also failed: {rest_error}") 