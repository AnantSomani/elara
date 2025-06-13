#!/usr/bin/env python3

"""
End-to-End Test for New Video Processing
Tests complete pipeline: Transcript → Chunks → Embeddings → Validation
"""

import os
import sys
import asyncio
import requests
import time
from typing import List, Dict
from dotenv import load_dotenv
from youtube_transcript_api import YouTubeTranscriptApi
# YouTube API not needed for basic test

# Load environment variables
load_dotenv()

# Add app directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), "app"))

from chunking import create_transcript_chunks
from embeddings import EmbeddingGenerator

class VideoProcessor:
    """Complete video processing pipeline"""
    
    def __init__(self, video_id: str):
        self.video_id = video_id
        self.supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self.youtube_api_key = os.getenv("YOUTUBE_API_KEY")
        
        if not all([self.supabase_url, self.supabase_key]):
            raise ValueError("Missing Supabase environment variables")
            
        self.headers = {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
            "Content-Type": "application/json"
        }
        
        self.stats = {
            "transcript_segments": 0,
            "chunks_created": 0,
            "embeddings_generated": 0,
            "total_time": 0,
            "processing_stages": {}
        }
    
    def print_header(self, title: str):
        """Print formatted section header"""
        print(f"\n{'='*60}")
        print(f"🎬 {title}")
        print(f"{'='*60}")
    
    def print_status(self, message: str, status: str = "info"):
        """Print formatted status message"""
        emoji = {"info": "ℹ️", "success": "✅", "error": "❌", "warning": "⚠️"}
        print(f"{emoji.get(status, 'ℹ️')} {message}")
    
    async def fetch_and_store_transcript(self):
        """Fetch transcript and store in database"""
        self.print_header("STEP 1: FETCH TRANSCRIPT")
        start_time = time.time()
        
        try:
            # Check if video already exists
            check_url = f"{self.supabase_url}/rest/v1/youtube_videos?select=id&id=eq.{self.video_id}"
            response = requests.get(check_url, headers=self.headers)
            
            if response.status_code == 200 and response.json():
                self.print_status("Video already exists in database", "warning")
                return True
            
            # Get transcript
            self.print_status(f"Fetching transcript for video {self.video_id}")
            transcript_list = YouTubeTranscriptApi.get_transcript(self.video_id)
            self.stats["transcript_segments"] = len(transcript_list)
            self.print_status(f"Found {len(transcript_list)} transcript segments", "success")
            
            # Calculate video duration from transcript
            duration_seconds = int(transcript_list[-1]['start'] + transcript_list[-1]['duration']) if transcript_list else 0
            
            # Set basic video metadata with required fields
            video_metadata = {
                "id": self.video_id, 
                "title": f"Test Video {self.video_id}",
                "channel_id": "UC_test_channel_123",
                "description": "Test video for end-to-end processing pipeline",
                "published_at": "2024-01-01T00:00:00Z",
                "language": "en",
                "duration_seconds": duration_seconds
            }
            self.print_status(f"Using basic metadata for test video", "info")
            
            # Store video metadata
            video_url = f"{self.supabase_url}/rest/v1/youtube_videos"
            video_response = requests.post(video_url, headers=self.headers, json=video_metadata)
            
            if video_response.status_code not in [200, 201]:
                self.print_status(f"Failed to store video metadata: {video_response.text}", "error")
                return False
            
            # Store full transcript (single record)
            full_text = " ".join([segment['text'] for segment in transcript_list])
            transcript_data = {
                "video_id": self.video_id,
                "channel_id": "UC_test_channel_123",
                "content": full_text,
                "segment_count": len(transcript_list),
                "total_duration": duration_seconds,
                "language": "en",
                "format": "json",
                "source": "auto",
                "confidence_score": 0.95
            }
            
            transcript_url = f"{self.supabase_url}/rest/v1/youtube_transcripts"
            response = requests.post(transcript_url, headers=self.headers, json=transcript_data)
            
            if response.status_code not in [200, 201]:
                self.print_status(f"Failed to store transcript: {response.text}", "error")
                return False
            
            self.print_status(f"Stored full transcript ({len(full_text)} characters)", "success")
            
            self.stats["processing_stages"]["transcript"] = time.time() - start_time
            return True
            
        except Exception as e:
            self.print_status(f"Error in transcript fetching: {str(e)}", "error")
            return False
    
    async def create_and_store_chunks(self):
        """Create chunks from transcript"""
        self.print_header("STEP 2: CREATE CHUNKS")
        start_time = time.time()
        
        try:
            # Get transcript segments directly from YouTube API again (for chunking)
            transcript_list = YouTubeTranscriptApi.get_transcript(self.video_id)
            
            # Use transcript segments directly (they have the right format)
            segments = transcript_list
            
            self.print_status(f"Processing {len(segments)} transcript segments for chunking")
            
            # Create chunks using the chunking module
            chunks = create_transcript_chunks(
                transcript_segments=segments,
                video_id=self.video_id,
                chunk_duration=45.0,  # 45 seconds per chunk
                overlap_duration=10.0  # 10 seconds overlap
            )
            
            self.stats["chunks_created"] = len(chunks)
            self.print_status(f"Created {len(chunks)} chunks", "success")
            
            # Store chunks in database
            chunk_data = []
            for i, chunk in enumerate(chunks):
                chunk_data.append({
                    "video_id": self.video_id,
                    "chunk_index": i,
                    "start_time": chunk["start_time"],
                    "end_time": chunk["end_time"],
                    "text": chunk["content"],  # chunking function returns 'content'
                    "word_count": chunk["word_count"],
                    "metadata": {
                        "duration": chunk["end_time"] - chunk["start_time"],
                        "segment_count": chunk["segment_count"],
                        "chunk_config": {
                            "chunk_duration": 45.0,
                            "overlap_duration": 10.0
                        }
                    }
                })
            
            chunks_url = f"{self.supabase_url}/rest/v1/youtube_transcript_chunks"
            response = requests.post(chunks_url, headers=self.headers, json=chunk_data)
            
            if response.status_code not in [200, 201]:
                self.print_status(f"Failed to store chunks: {response.text}", "error")
                return False
            
            self.print_status(f"Stored {len(chunk_data)} chunks in database", "success")
            
            # Print chunk statistics
            total_words = sum(chunk["word_count"] for chunk in chunks)
            avg_words = total_words / len(chunks) if chunks else 0
            self.print_status(f"Total words: {total_words}, Average per chunk: {avg_words:.1f}")
            
            self.stats["processing_stages"]["chunks"] = time.time() - start_time
            return True
            
        except Exception as e:
            self.print_status(f"Error in chunk creation: {str(e)}", "error")
            return False
    
    async def generate_embeddings(self):
        """Generate embeddings for chunks"""
        self.print_header("STEP 3: GENERATE EMBEDDINGS")
        start_time = time.time()
        
        try:
            # Initialize embedding generator
            generator = EmbeddingGenerator()
            
            # Test connections
            self.print_status("Testing connections...")
            connection_test = await generator.test_connection()
            
            if connection_test['openai_api'] != 'healthy':
                self.print_status(f"OpenAI API unhealthy: {connection_test['openai_api']}", "error")
                return False
                
            if connection_test['supabase'] != 'healthy':
                self.print_status(f"Supabase unhealthy: {connection_test['supabase']}", "error")
                return False
            
            self.print_status("All connections healthy", "success")
            
            # Generate embeddings
            self.print_status(f"Generating embeddings for video {self.video_id}")
            result = await generator.generate_embeddings_for_video(self.video_id)
            
            if not result.get('success', True):
                self.print_status(f"Embedding generation failed: {result.get('message', 'Unknown error')}", "error")
                return False
            
            self.stats["embeddings_generated"] = result.get('processed_count', 0)
            self.print_status(f"Generated {result['processed_count']} embeddings", "success")
            self.print_status(f"Failed: {result['failed_count']}")
            self.print_status(f"Cost: ${result['cost_estimate']:.4f}")
            self.print_status(f"Processing time: {result['processing_time']:.2f}s")
            
            self.stats["processing_stages"]["embeddings"] = time.time() - start_time
            return True
            
        except Exception as e:
            self.print_status(f"Error in embedding generation: {str(e)}", "error")
            return False
    
    async def validate_embeddings(self):
        """Validate stored embeddings"""
        self.print_header("STEP 4: VALIDATE EMBEDDINGS")
        start_time = time.time()
        
        try:
            generator = EmbeddingGenerator()
            
            # Validate embeddings
            validation_result = await generator.validate_embeddings(self.video_id)
            
            if validation_result['status'] == 'error':
                self.print_status(f"Validation error: {validation_result['error']}", "error")
                return False
            
            if validation_result['status'] == 'no_embeddings':
                self.print_status("No embeddings found", "error")
                return False
            
            # Print validation results
            self.print_status(f"Total chunks: {validation_result['total_chunks']}")
            self.print_status(f"Valid embeddings: {validation_result['valid_embeddings']}")
            self.print_status(f"Invalid embeddings: {validation_result['invalid_embeddings']}")
            self.print_status(f"Validation percentage: {validation_result['validation_percentage']}%")
            
            success = validation_result['validation_percentage'] == 100.0
            status = "success" if success else "error"
            message = "All embeddings valid" if success else "Some embeddings invalid"
            self.print_status(message, status)
            
            self.stats["processing_stages"]["validation"] = time.time() - start_time
            return success
            
        except Exception as e:
            self.print_status(f"Error in validation: {str(e)}", "error")
            return False
    
    def print_final_summary(self):
        """Print final processing summary"""
        self.print_header("PROCESSING COMPLETE")
        
        self.stats["total_time"] = sum(self.stats["processing_stages"].values())
        
        print(f"📊 Final Statistics:")
        print(f"   Video ID: {self.video_id}")
        print(f"   Transcript segments: {self.stats['transcript_segments']}")
        print(f"   Chunks created: {self.stats['chunks_created']}")
        print(f"   Embeddings generated: {self.stats['embeddings_generated']}")
        print(f"   Total processing time: {self.stats['total_time']:.2f}s")
        
        print(f"\n⏱️ Stage Timing:")
        for stage, duration in self.stats["processing_stages"].items():
            print(f"   {stage.capitalize()}: {duration:.2f}s")
        
        print(f"\n🎉 End-to-End Test Complete!")
    
    async def run_complete_pipeline(self):
        """Run the complete processing pipeline"""
        self.print_header(f"END-TO-END VIDEO PROCESSING: {self.video_id}")
        
        start_time = time.time()
        
        # Step 1: Fetch transcript
        if not await self.fetch_and_store_transcript():
            self.print_status("Pipeline failed at transcript fetching", "error")
            return False
        
        # Step 2: Create chunks
        if not await self.create_and_store_chunks():
            self.print_status("Pipeline failed at chunk creation", "error")
            return False
        
        # Step 3: Generate embeddings
        if not await self.generate_embeddings():
            self.print_status("Pipeline failed at embedding generation", "error")
            return False
        
        # Step 4: Validate embeddings
        if not await self.validate_embeddings():
            self.print_status("Pipeline failed at validation", "error")
            return False
        
        self.stats["total_time"] = time.time() - start_time
        self.print_final_summary()
        return True


async def main():
    """Main function to run the complete test"""
    video_id = "kpt4Dzrr1p8"
    
    processor = VideoProcessor(video_id)
    
    try:
        success = await processor.run_complete_pipeline()
        
        if success:
            print(f"\n🎉 SUCCESS: Complete pipeline test passed!")
            return 0
        else:
            print(f"\n❌ FAILURE: Pipeline test failed")
            return 1
            
    except Exception as e:
        print(f"\n💥 CRITICAL ERROR: {str(e)}")
        return 1


if __name__ == "__main__":
    import sys
    exit_code = asyncio.run(main())
    sys.exit(exit_code) 