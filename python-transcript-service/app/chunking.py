#!/usr/bin/env python3

from typing import List, Dict, Optional
import re
from datetime import datetime

class TranscriptChunker:
    """
    Time-based chunking for YouTube transcripts with intelligent boundary handling
    """
    
    def __init__(self, 
                 chunk_duration: float = 45.0,
                 overlap_duration: float = 10.0,
                 min_chunk_words: int = 5):
        """
        Initialize the chunker with configuration
        
        Args:
            chunk_duration: Target duration per chunk in seconds (default: 45)
            overlap_duration: Overlap between chunks in seconds (default: 10)
            min_chunk_words: Minimum words per chunk to be valid (default: 5)
        """
        self.chunk_duration = chunk_duration
        self.overlap_duration = overlap_duration
        self.min_chunk_words = min_chunk_words
        
    def create_time_based_chunks(self, 
                                transcript_segments: List[Dict],
                                video_id: str) -> List[Dict]:
        """
        Create time-based chunks from YouTube transcript segments
        
        Args:
            transcript_segments: List of segments with 'text', 'start', 'duration'
            video_id: YouTube video ID for chunk identification
            
        Returns:
            List of chunk dictionaries ready for embedding and storage
        """
        if not transcript_segments:
            return []
            
        chunks = []
        current_time = 0.0
        chunk_index = 0
        
        # Get total duration for context
        total_duration = max(
            seg.get('start', 0) + seg.get('duration', 0) 
            for seg in transcript_segments
        )
        
        print(f"📊 Processing {len(transcript_segments)} segments, total duration: {total_duration:.1f}s")
        
        while current_time < total_duration:
            chunk_start = current_time
            chunk_end = min(current_time + self.chunk_duration, total_duration)
            
            # Extract segments for this time window
            chunk_segments = self._get_segments_in_timeframe(
                transcript_segments, chunk_start, chunk_end
            )
            
            if chunk_segments:
                # Create chunk from segments
                chunk = self._create_chunk_from_segments(
                    chunk_segments, 
                    video_id, 
                    chunk_index,
                    chunk_start,
                    chunk_end
                )
                
                if chunk:  # Only add valid chunks
                    chunks.append(chunk)
                    chunk_index += 1
            
            # Move to next chunk with overlap consideration
            current_time += (self.chunk_duration - self.overlap_duration)
            
        print(f"✅ Created {len(chunks)} chunks from transcript")
        return chunks
    
    def _get_segments_in_timeframe(self, 
                                  segments: List[Dict], 
                                  start_time: float, 
                                  end_time: float) -> List[Dict]:
        """
        Extract transcript segments that fall within the specified timeframe
        """
        relevant_segments = []
        
        for segment in segments:
            seg_start = segment.get('start', 0)
            seg_duration = segment.get('duration', 0)
            seg_end = seg_start + seg_duration
            
            # Include segment if it overlaps with our time window
            if (seg_start < end_time and seg_end > start_time):
                relevant_segments.append(segment)
                
        return relevant_segments
    
    def _create_chunk_from_segments(self, 
                                   segments: List[Dict],
                                   video_id: str,
                                   chunk_index: int,
                                   chunk_start: float,
                                   chunk_end: float) -> Optional[Dict]:
        """
        Create a chunk dictionary from transcript segments
        """
        if not segments:
            return None
            
        # Combine all text from segments
        combined_text = " ".join(
            segment.get('text', '').strip() 
            for segment in segments
        ).strip()
        
        # Clean up the text
        combined_text = self._clean_text(combined_text)
        
        # Validate chunk quality
        word_count = len(combined_text.split())
        if word_count < self.min_chunk_words:
            return None
            
        # Get actual time boundaries from segments
        actual_start = min(seg.get('start', chunk_start) for seg in segments)
        actual_end = max(
            seg.get('start', 0) + seg.get('duration', 0) 
            for seg in segments
        )
        
        # Create chunk dictionary
        chunk = {
            'video_id': video_id,
            'chunk_index': chunk_index,
            'start_time': round(actual_start, 2),
            'end_time': round(actual_end, 2),
            'content': combined_text,
            'word_count': word_count,
            'segment_count': len(segments)
        }
        
        return chunk
    
    def _clean_text(self, text: str) -> str:
        """
        Clean and normalize transcript text
        """
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Remove common transcript artifacts
        text = re.sub(r'\[.*?\]', '', text)  # Remove [Music], [Applause], etc.
        text = re.sub(r'\(.*?\)', '', text)  # Remove (inaudible), etc.
        
        # Clean up punctuation spacing
        text = re.sub(r'\s+([.!?])', r'\1', text)
        text = re.sub(r'([.!?])\s*([.!?])+', r'\1', text)
        
        # Remove extra spaces again
        text = re.sub(r'\s+', ' ', text).strip()
        
        return text
    
    def get_chunking_stats(self, chunks: List[Dict]) -> Dict:
        """
        Generate statistics about the chunking process
        """
        if not chunks:
            return {'total_chunks': 0}
            
        total_chunks = len(chunks)
        total_words = sum(chunk.get('word_count', 0) for chunk in chunks)
        total_duration = max(chunk.get('end_time', 0) for chunk in chunks)
        avg_chunk_duration = sum(
            chunk.get('end_time', 0) - chunk.get('start_time', 0) 
            for chunk in chunks
        ) / total_chunks if total_chunks > 0 else 0
        
        return {
            'total_chunks': total_chunks,
            'total_words': total_words,
            'total_duration': round(total_duration, 2),
            'avg_words_per_chunk': round(total_words / total_chunks, 1) if total_chunks > 0 else 0,
            'avg_chunk_duration': round(avg_chunk_duration, 2),
            'chunks_per_minute': round(total_chunks / (total_duration / 60), 2) if total_duration > 0 else 0
        }


def create_transcript_chunks(transcript_segments: List[Dict], 
                           video_id: str,
                           chunk_duration: float = 45.0,
                           overlap_duration: float = 10.0) -> List[Dict]:
    """
    Convenience function to create chunks from transcript segments
    
    Args:
        transcript_segments: List of transcript segments from YouTube API
        video_id: YouTube video ID
        chunk_duration: Duration per chunk in seconds
        overlap_duration: Overlap between chunks in seconds
        
    Returns:
        List of chunk dictionaries ready for embedding
    """
    chunker = TranscriptChunker(
        chunk_duration=chunk_duration,
        overlap_duration=overlap_duration
    )
    
    chunks = chunker.create_time_based_chunks(transcript_segments, video_id)
    stats = chunker.get_chunking_stats(chunks)
    
    print(f"📊 Chunking Stats: {stats}")
    
    return chunks


# Example usage and testing
if __name__ == "__main__":
    # Test with sample transcript data
    sample_transcript = [
        {"text": "Welcome to this tutorial on building RAG systems.", "start": 0.0, "duration": 3.0},
        {"text": "Today we will learn about vector embeddings.", "start": 3.0, "duration": 2.5},
        {"text": "Vector embeddings are numerical representations of text.", "start": 5.5, "duration": 3.5},
        {"text": "They allow us to perform semantic search.", "start": 9.0, "duration": 2.0},
        {"text": "This is much more powerful than keyword search.", "start": 11.0, "duration": 3.0},
    ]
    
    chunks = create_transcript_chunks(sample_transcript, "test_video")
    
    print(f"\n🎯 Created {len(chunks)} chunks:")
    for i, chunk in enumerate(chunks):
        print(f"Chunk {i}: {chunk['start_time']}-{chunk['end_time']}s ({chunk['word_count']} words)")
        print(f"  Content: {chunk['content'][:80]}...")
        print() 