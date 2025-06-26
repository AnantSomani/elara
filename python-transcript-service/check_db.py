#!/usr/bin/env python3
import os
import sys
import psycopg2
from pathlib import Path

# Load environment variables from .env.local
def load_env():
    env_file = Path(__file__).parent.parent / '.env.local'
    if env_file.exists():
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key] = value
        return True
    return False

def check_database():
    print("🔍 Checking Database for Transcript Data...")
    print("=" * 50)
    
    try:
        supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
        db_password = os.getenv('SUPABASE_DB_PASSWORD')
        
        if not supabase_url or not db_password:
            print("❌ Missing environment variables")
            return
            
        supabase_url_clean = supabase_url.replace('https://', '')
        project_id = supabase_url_clean.split('.')[0]
        connection_string = f'postgresql://postgres:{db_password}@db.{project_id}.supabase.co:5432/postgres'
        
        conn = psycopg2.connect(connection_string)
        cur = conn.cursor()
        
        # Check for transcript chunks
        cur.execute('SELECT COUNT(*) FROM youtube_transcript_chunks')
        chunks = cur.fetchone()[0]
        print(f"📊 Transcript chunks: {chunks}")
        
        # Check for full transcripts
        cur.execute('SELECT COUNT(*) FROM youtube_transcripts')
        transcripts = cur.fetchone()[0]
        print(f"📊 Full transcripts: {transcripts}")
        
        if chunks > 0:
            cur.execute('SELECT DISTINCT video_id FROM youtube_transcript_chunks LIMIT 5')
            video_ids = [row[0] for row in cur.fetchall()]
            print(f"📹 Sample video IDs with transcripts: {video_ids}")
            
            # Test with first video ID
            test_video = video_ids[0]
            print(f"\n🧪 Testing memory with video: {test_video}")
            
            # Check if memory tables exist
            cur.execute("SELECT COUNT(*) FROM youtube_chat_sessions")
            sessions = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM youtube_chat_messages") 
            messages = cur.fetchone()[0]
            print(f"💬 Chat sessions: {sessions}, messages: {messages}")
            
            return test_video
        else:
            print("❌ NO TRANSCRIPT DATA FOUND!")
            print("💡 The memory system can't work without transcript data.")
            print("📝 You need to:")
            print("   1. Process some YouTube videos first")
            print("   2. Ensure transcripts are stored in the database")
            print("   3. Then test the memory feature")
            return None
            
    except Exception as e:
        print(f"❌ Database error: {e}")
        return None
    finally:
        if 'cur' in locals():
            cur.close()
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    if load_env():
        test_video = check_database()
        if test_video:
            print(f"\n✅ Use this video ID to test memory: {test_video}")
            print(f"🔗 URL: http://localhost:8080/chat/video/{test_video}")
    else:
        print("❌ Could not load .env.local file") 