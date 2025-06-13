#!/usr/bin/env python3

"""
Phase 4.1: Direct Embedding Processing Script
Handles the complete workflow: Supabase → OpenAI → Supabase

This script:
1. Connects to Supabase and finds chunks without embeddings
2. Generates OpenAI embeddings in efficient batches  
3. Stores embeddings back to the database
4. Reports detailed performance metrics and costs
"""

import asyncio
import argparse
import os
import sys
import time
from pathlib import Path
from typing import List, Dict, Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add the app directory to Python path
sys.path.append(str(Path(__file__).parent / "app"))

from embeddings import EmbeddingGenerator

class EmbeddingProcessor:
    """
    Main processor for generating and storing embeddings for YouTube transcript chunks
    """
    
    def __init__(self):
        """Initialize the processor with environment validation"""
        self.start_time = time.time()
        self.generator = None
        self.stats = {
            "total_chunks_found": 0,
            "chunks_processed": 0,
            "chunks_failed": 0,
            "total_cost": 0.0,
            "processing_time": 0.0,
            "videos_processed": set()
        }
    
    async def initialize(self) -> bool:
        """
        Initialize the embedding generator and validate connections
        
        Returns:
            bool: True if initialization successful, False otherwise
        """
        print("🚀 Initializing Embedding Processor")
        print("=" * 50)
        
        # Check environment variables (with fallback names)
        openai_key = os.getenv("OPENAI_API_KEY")
        supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        missing_vars = []
        if not openai_key:
            missing_vars.append("OPENAI_API_KEY")
        if not supabase_url:
            missing_vars.append("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL")
        if not supabase_key:
            missing_vars.append("SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY")
        
        if missing_vars:
            print(f"❌ Missing environment variables: {missing_vars}")
            print("\n💡 Please add these to your .env file:")
            for var in missing_vars:
                print(f"   {var}=your_actual_key_here")
            print("\n🔧 You can find these values in:")
            print("   - OPENAI_API_KEY: https://platform.openai.com/api-keys")
            print("   - SUPABASE_URL: Your Supabase project settings")
            print("   - SUPABASE_SERVICE_KEY: Your Supabase project API settings")
            return False
        
        print("✅ Environment variables found")
        
        # Initialize embedding generator
        try:
            self.generator = EmbeddingGenerator()
            print("✅ Embedding generator initialized")
        except Exception as e:
            print(f"❌ Failed to initialize embedding generator: {str(e)}")
            return False
        
        # Test connections
        print("\n🔍 Testing Connections...")
        try:
            connection_test = await self.generator.test_connection()
            
            print(f"OpenAI API: {connection_test['openai_api']}")
            print(f"Supabase: {connection_test['supabase']}")
            print(f"Model: {connection_test['embedding_model']}")
            print(f"Dimensions: {connection_test['dimensions']}")
            
            if connection_test['openai_api'] != 'healthy' or connection_test['supabase'] != 'healthy':
                print("❌ Connection test failed")
                return False
                
            print("✅ All connections healthy")
            return True
            
        except Exception as e:
            print(f"❌ Connection test failed: {str(e)}")
            return False
    
    async def find_chunks_to_process(self, video_id: Optional[str] = None) -> List[Dict]:
        """
        Find chunks that need embeddings generated
        
        Args:
            video_id: Optional specific video ID to process
            
        Returns:
            List of chunk dictionaries needing embeddings
        """
        print(f"\n🔍 Finding Chunks to Process")
        if video_id:
            print(f"   Target: Specific video {video_id}")
        else:
            print(f"   Target: All videos with missing embeddings")
        
        try:
            chunks = await self.generator.get_chunks_without_embeddings(video_id)
            
            if not chunks:
                print("ℹ️  No chunks found needing embeddings")
                if video_id:
                    # Check if video exists at all
                    all_chunks = await self.generator.get_chunks_without_embeddings()
                    if not any(chunk['video_id'] == video_id for chunk in all_chunks):
                        print(f"⚠️  Video {video_id} not found in database")
                        print("💡 Available videos in database:")
                        video_ids = set(chunk['video_id'] for chunk in all_chunks)
                        for vid_id in video_ids:
                            print(f"   - {vid_id}")
                return []
            
            # Organize by video for reporting
            videos = {}
            for chunk in chunks:
                vid_id = chunk['video_id']
                if vid_id not in videos:
                    videos[vid_id] = []
                videos[vid_id].append(chunk)
            
            print(f"📊 Found {len(chunks)} chunks across {len(videos)} videos:")
            for vid_id, vid_chunks in videos.items():
                print(f"   - {vid_id}: {len(vid_chunks)} chunks")
            
            self.stats["total_chunks_found"] = len(chunks)
            self.stats["videos_processed"] = set(videos.keys())
            
            return chunks
            
        except Exception as e:
            print(f"❌ Failed to find chunks: {str(e)}")
            return []
    
    async def process_chunks(self, chunks: List[Dict]) -> Dict:
        """
        Process chunks to generate and store embeddings
        
        Args:
            chunks: List of chunk dictionaries to process
            
        Returns:
            Processing results dictionary
        """
        if not chunks:
            return {"success": True, "message": "No chunks to process"}
        
        print(f"\n⚡ Processing {len(chunks)} Chunks")
        print("=" * 30)
        
        batch_start_time = time.time()
        
        # Group chunks by video for better progress reporting
        videos = {}
        for chunk in chunks:
            vid_id = chunk['video_id']
            if vid_id not in videos:
                videos[vid_id] = []
            videos[vid_id].append(chunk)
        
        total_processed = 0
        total_failed = 0
        total_cost = 0.0
        
        # Process each video's chunks
        for i, (video_id, video_chunks) in enumerate(videos.items(), 1):
            print(f"\n📹 Processing Video {i}/{len(videos)}: {video_id}")
            print(f"   Chunks to process: {len(video_chunks)}")
            
            try:
                # Generate embeddings for this video
                result = await self.generator.generate_embeddings_for_video(video_id)
                
                print(f"   ✅ Processed: {result['processed_count']}")
                print(f"   ❌ Failed: {result['failed_count']}")
                print(f"   💰 Cost: ${result['cost_estimate']}")
                print(f"   ⏱️  Time: {result['processing_time']}s")
                
                total_processed += result['processed_count']
                total_failed += result['failed_count']
                total_cost += result['cost_estimate']
                
            except Exception as e:
                print(f"   ❌ Video processing failed: {str(e)}")
                total_failed += len(video_chunks)
        
        processing_time = time.time() - batch_start_time
        
        # Update stats
        self.stats["chunks_processed"] = total_processed
        self.stats["chunks_failed"] = total_failed
        self.stats["total_cost"] = total_cost
        self.stats["processing_time"] = processing_time
        
        return {
            "success": total_processed > 0,
            "total_processed": total_processed,
            "total_failed": total_failed,
            "total_cost": total_cost,
            "processing_time": processing_time,
            "videos_count": len(videos)
        }
    
    async def validate_results(self, video_ids: List[str]) -> Dict:
        """
        Validate that embeddings were stored correctly
        
        Args:
            video_ids: List of video IDs to validate
            
        Returns:
            Validation results
        """
        print(f"\n🔍 Validating Results")
        print("=" * 25)
        
        validation_results = {}
        
        for video_id in video_ids:
            try:
                result = await self.generator.validate_embeddings(video_id)
                validation_results[video_id] = result
                
                status_emoji = "✅" if result['status'] == 'valid' else "❌"
                print(f"{status_emoji} {video_id}:")
                print(f"   Total chunks: {result.get('total_chunks', 0)}")
                print(f"   Valid embeddings: {result.get('valid_embeddings', 0)}")
                print(f"   Validation: {result.get('validation_percentage', 0)}%")
                
            except Exception as e:
                print(f"❌ Validation failed for {video_id}: {str(e)}")
                validation_results[video_id] = {"status": "error", "error": str(e)}
        
        return validation_results
    
    def print_final_report(self, validation_results: Dict = None):
        """
        Print comprehensive final report
        
        Args:
            validation_results: Optional validation results to include
        """
        total_time = time.time() - self.start_time
        
        print("\n" + "=" * 60)
        print("🎉 PHASE 4.1 EMBEDDING PROCESSING COMPLETE")
        print("=" * 60)
        
        print(f"\n📊 Processing Summary:")
        print(f"   Total runtime: {total_time:.1f} seconds")
        print(f"   Chunks found: {self.stats['total_chunks_found']}")
        print(f"   Chunks processed: {self.stats['chunks_processed']}")
        print(f"   Chunks failed: {self.stats['chunks_failed']}")
        print(f"   Videos processed: {len(self.stats['videos_processed'])}")
        
        print(f"\n💰 Cost Analysis:")
        print(f"   Total cost: ${self.stats['total_cost']:.4f}")
        if self.stats['chunks_processed'] > 0:
            cost_per_chunk = self.stats['total_cost'] / self.stats['chunks_processed']
            print(f"   Cost per chunk: ${cost_per_chunk:.6f}")
        
        print(f"\n⚡ Performance Metrics:")
        if self.stats['processing_time'] > 0:
            chunks_per_second = self.stats['chunks_processed'] / self.stats['processing_time']
            print(f"   Processing speed: {chunks_per_second:.1f} chunks/second")
        
        if validation_results:
            print(f"\n✅ Validation Results:")
            for video_id, result in validation_results.items():
                if result['status'] == 'valid':
                    print(f"   {video_id}: {result['validation_percentage']}% valid")
                else:
                    print(f"   {video_id}: {result['status']}")
        
        print(f"\n🚀 Next Steps:")
        if self.stats['chunks_processed'] > 0:
            print("   ✅ Phase 4.1 Complete - Embeddings Generated Successfully")
            print("   🎯 Ready for Phase 4.2: Real Data Testing")
            print("   🔍 Ready for Phase 5: Semantic Search Engine")
        else:
            print("   ⚠️  No embeddings generated - check setup and try again")
        
        print("\n" + "=" * 60)

async def main():
    """
    Main entry point for the embedding processing script
    """
    parser = argparse.ArgumentParser(description="Process YouTube transcript chunks to generate embeddings")
    parser.add_argument("--video_id", type=str, help="Specific video ID to process (optional)")
    parser.add_argument("--batch_all", action="store_true", help="Process all videos with missing embeddings")
    parser.add_argument("--validate_only", action="store_true", help="Only run validation on existing embeddings")
    
    args = parser.parse_args()
    
    # Initialize processor
    processor = EmbeddingProcessor()
    
    if not await processor.initialize():
        print("❌ Initialization failed. Exiting.")
        return False
    
    # Handle validation-only mode
    if args.validate_only:
        print("\n🔍 Validation-only mode")
        if args.video_id:
            video_ids = [args.video_id]
        else:
            # Get all videos that have chunks
            chunks = await processor.generator.get_chunks_without_embeddings()
            video_ids = list(set(chunk['video_id'] for chunk in chunks))
        
        validation_results = await processor.validate_results(video_ids)
        processor.print_final_report(validation_results)
        return True
    
    # Find chunks to process
    chunks = await processor.find_chunks_to_process(args.video_id)
    
    if not chunks:
        processor.print_final_report()
        return True
    
    # Process chunks
    print(f"\n🎯 Starting embedding generation for {len(chunks)} chunks...")
    processing_result = await processor.process_chunks(chunks)
    
    # Validate results if processing was successful
    validation_results = None
    if processing_result["success"]:
        video_ids = list(processor.stats["videos_processed"])
        validation_results = await processor.validate_results(video_ids)
    
    # Print final report
    processor.print_final_report(validation_results)
    
    return processing_result["success"]

if __name__ == "__main__":
    success = asyncio.run(main())
    exit(0 if success else 1) 