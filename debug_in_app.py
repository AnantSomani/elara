#!/usr/bin/env python3
"""
Debug script to test PostgreSQL connection using same setup as main app
"""

import os
import sys
import logging

# Add the app directory to Python path (same as main app)
sys.path.append('python-transcript-service')

# Import from our main app
from python-transcript-service.app.main import get_postgres_connection, insert_chunk_with_vector

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_postgres_in_app_context():
    """Test PostgreSQL connection using exact same setup as main app"""
    
    print("🧪 Testing PostgreSQL connection in app context...")
    
    # Test 1: Check environment variables
    db_password = os.getenv('SUPABASE_DB_PASSWORD')
    supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    
    print(f"📊 SUPABASE_URL: {bool(supabase_url)}")
    print(f"📊 SUPABASE_DB_PASSWORD: {bool(db_password)}")
    
    if not db_password:
        print("❌ SUPABASE_DB_PASSWORD not found!")
        return
        
    # Test 2: Test direct connection using app's function
    try:
        print("\n🔗 Testing get_postgres_connection()...")
        conn = get_postgres_connection()
        print("✅ Connection successful!")
        
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        result = cursor.fetchone()
        print(f"📊 Test query result: {result}")
        
        cursor.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return
    
    # Test 3: Test the vector insertion function
    try:
        print("\n🧪 Testing insert_chunk_with_vector()...")
        
        test_chunk = {
            'video_id': 'DEBUG_TEST',
            'chunk_index': 0,
            'start_time': 0.0,
            'end_time': 10.0,
            'text': 'Debug test chunk',
            'word_count': 3,
            'metadata': {'debug': True},
            'embedding': [0.1, 0.2, 0.3] * 512  # 1536 elements
        }
        
        success = insert_chunk_with_vector(test_chunk)
        
        if success:
            print("✅ Vector insertion successful!")
        else:
            print("❌ Vector insertion failed!")
            
    except Exception as e:
        print(f"❌ Vector insertion test failed: {e}")
        
    print("\n🎯 If this works, the issue might be in the main app's execution context")

if __name__ == "__main__":
    test_postgres_in_app_context() 