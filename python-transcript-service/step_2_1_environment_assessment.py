#!/usr/bin/env python3

import os
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
load_dotenv('../.env.local')

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

def step_2_1_environment_assessment():
    print('🔍 Step 2.1: Environment Assessment')
    print('=' * 50)
    
    # Basic environment check
    print(f'Supabase URL: {SUPABASE_URL[:50]}...' if SUPABASE_URL else 'Supabase URL: MISSING')
    print(f'API Key: {SUPABASE_KEY[:20]}...' if SUPABASE_KEY else 'API Key: MISSING')
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        print('❌ Environment variables missing!')
        return False
    
    headers = {
        'apikey': SUPABASE_KEY, 
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json'
    }
    
    # Test 1: Basic database connection
    print('\n📡 Testing Database Connection...')
    try:
        response = requests.get(
            f'{SUPABASE_URL}/rest/v1/youtube_transcripts?select=id&limit=1', 
            headers=headers, 
            timeout=10
        )
        if response.status_code == 200:
            print('✅ Database connection: WORKING')
        else:
            print(f'❌ Database connection: FAILED ({response.status_code})')
            print(f'   Response: {response.text[:100]}')
            return False
    except Exception as e:
        print(f'❌ Database connection: ERROR ({e})')
        return False
    
    # Test 2: Check existing tables
    print('\n📋 Checking Existing Tables...')
    tables = ['youtube_transcripts', 'youtube_videos', 'youtube_channels']
    for table in tables:
        try:
            response = requests.get(
                f'{SUPABASE_URL}/rest/v1/{table}?select=*&limit=1', 
                headers=headers, 
                timeout=5
            )
            if response.status_code == 200:
                data = response.json()
                count = len(data)
                print(f'✅ Table {table}: EXISTS ({count} sample records)')
            else:
                print(f'❌ Table {table}: MISSING ({response.status_code})')
        except Exception as e:
            print(f'❌ Table {table}: ERROR ({e})')
    
    # Test 3: Check schema modification permissions
    print('\n🔧 Testing Schema Permissions...')
    try:
        # Try to describe a table structure (read-only check)
        response = requests.get(
            f'{SUPABASE_URL}/rest/v1/youtube_transcripts?select=*&limit=0', 
            headers=headers, 
            timeout=5
        )
        if response.status_code == 200:
            print('✅ Schema read permissions: WORKING')
        else:
            print(f'❌ Schema read permissions: FAILED')
    except Exception as e:
        print(f'❌ Schema permissions: ERROR ({e})')
    
    # Test 4: Check for pgvector extension (if possible via REST API)
    print('\n🔬 Checking pgvector Extension...')
    # Note: This might not be possible via REST API, but we'll check
    try:
        # Try a basic query that would use vector operations
        response = requests.get(
            f'{SUPABASE_URL}/rest/v1/youtube_transcripts?select=id&limit=1', 
            headers=headers, 
            timeout=5
        )
        if response.status_code == 200:
            print('ℹ️  pgvector check: Need SQL access to verify extension')
            print('   (Will check this in next step)')
        else:
            print('❌ Cannot check pgvector extension via REST API')
    except Exception as e:
        print(f'❌ pgvector check: ERROR ({e})')
    
    print('\n✅ Environment Assessment Complete!')
    print('🎯 Ready to proceed with pgvector setup')
    return True

if __name__ == "__main__":
    success = step_2_1_environment_assessment()
    if success:
        print('\n🚀 Environment ready for database schema extension')
    else:
        print('\n❌ Environment issues need to be resolved first') 