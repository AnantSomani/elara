#!/usr/bin/env python3

import os
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
load_dotenv('../.env.local')

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

print(f"🔍 Checking Supabase schema...")
print(f"URL: {SUPABASE_URL}")

headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json'
}

# Check what tables exist
print("\n📋 Checking available tables...")

# Check if youtube_transcripts table exists and its structure
tables_to_check = [
    'youtube_transcripts', 
    'transcripts', 
    'youtube_videos', 
    'videos',
    'youtube_channels'
]

for table in tables_to_check:
    try:
        # Try to get the table structure by selecting with limit 1
        api_url = f"{SUPABASE_URL}/rest/v1/{table}?select=*&limit=1"
        response = requests.get(api_url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Table '{table}' exists")
            if data:
                print(f"   Columns: {list(data[0].keys())}")
                print(f"   Sample record: {data[0]}")
            else:
                print(f"   Table is empty")
                
        elif response.status_code == 404:
            print(f"❌ Table '{table}' not found")
        else:
            print(f"⚠️  Table '{table}': {response.status_code} - {response.text[:100]}")
            
    except Exception as e:
        print(f"❌ Error checking table '{table}': {e}")

print("\n🔍 Trying to get schema information...")
try:
    # PostgreSQL information_schema query
    schema_url = f"{SUPABASE_URL}/rest/v1/rpc/get_schema"
    response = requests.post(schema_url, headers=headers, json={}, timeout=10)
    print(f"Schema response: {response.status_code}")
    if response.status_code == 200:
        print(response.json())
except Exception as e:
    print(f"Schema query failed: {e}") 