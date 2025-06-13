#!/usr/bin/env python3

from app.chunking import create_transcript_chunks
from youtube_transcript_api import YouTubeTranscriptApi

def test_chunking_with_real_data():
    """Test chunking with real YouTube transcript data"""
    
    print("🧪 Testing Chunking with Real YouTube Data")
    print("=" * 50)
    
    # Use our known working video
    video_id = "ZPUtA3W-7_I"  # PM Modi interview
    
    try:
        # Fetch real transcript
        print(f"🎥 Fetching transcript for video: {video_id}")
        transcript_segments = YouTubeTranscriptApi.get_transcript(video_id)
        
        print(f"📊 Raw transcript: {len(transcript_segments)} segments")
        total_duration = max(seg['start'] + seg['duration'] for seg in transcript_segments)
        print(f"⏱️  Total duration: {total_duration:.1f} seconds ({total_duration/60:.1f} minutes)")
        
        # Test different chunk configurations
        configurations = [
            {"duration": 30, "overlap": 5, "name": "Short chunks (30s)"},
            {"duration": 45, "overlap": 10, "name": "Default chunks (45s)"},
            {"duration": 60, "overlap": 15, "name": "Long chunks (60s)"},
        ]
        
        for config in configurations:
            print(f"\n🔧 Testing: {config['name']}")
            print("-" * 30)
            
            chunks = create_transcript_chunks(
                transcript_segments,
                video_id,
                chunk_duration=config['duration'],
                overlap_duration=config['overlap']
            )
            
            # Show sample chunks
            print(f"\n📋 Sample chunks (showing first 3 of {len(chunks)}):")
            for i, chunk in enumerate(chunks[:3]):
                duration = chunk['end_time'] - chunk['start_time']
                print(f"  Chunk {chunk['chunk_index']}: {chunk['start_time']:.1f}-{chunk['end_time']:.1f}s "
                      f"({duration:.1f}s duration, {chunk['word_count']} words)")
                print(f"    Content preview: {chunk['content'][:100]}...")
                print()
        
        # Test with first 100 segments for detailed analysis
        print(f"\n🔍 Detailed Analysis (first 100 segments):")
        print("-" * 40)
        
        sample_segments = transcript_segments[:100]
        sample_chunks = create_transcript_chunks(
            sample_segments,
            video_id + "_sample",
            chunk_duration=45,
            overlap_duration=10
        )
        
        print(f"\n📈 Detailed chunk breakdown:")
        for i, chunk in enumerate(sample_chunks[:5]):
            duration = chunk['end_time'] - chunk['start_time']
            print(f"Chunk {i}: {chunk['start_time']:.1f}s - {chunk['end_time']:.1f}s")
            print(f"  Duration: {duration:.1f}s | Words: {chunk['word_count']} | Segments: {chunk['segment_count']}")
            print(f"  Content: {chunk['content'][:150]}...")
            print()
        
        return True
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

if __name__ == "__main__":
    success = test_chunking_with_real_data()
    if success:
        print("✅ Chunking test completed successfully!")
    else:
        print("❌ Chunking test failed!") 