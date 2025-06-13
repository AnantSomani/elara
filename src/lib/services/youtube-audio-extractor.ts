import { spawn } from 'child_process'
import { promisify } from 'util'
import { exec } from 'child_process'

const execAsync = promisify(exec)

interface AudioExtractionResult {
  success: boolean
  audioUrl?: string
  duration?: number
  title?: string
  error?: string
}

interface VideoMetadata {
  title: string
  duration: number
  uploader: string
  uploadDate: string
  viewCount: number
  likeCount?: number
  description: string
}

export class YouTubeAudioExtractor {
  private static instance: YouTubeAudioExtractor
  private readonly maxRetries = 3
  private readonly timeoutMs = 30000 // 30 seconds

  static getInstance(): YouTubeAudioExtractor {
    if (!YouTubeAudioExtractor.instance) {
      YouTubeAudioExtractor.instance = new YouTubeAudioExtractor()
    }
    return YouTubeAudioExtractor.instance
  }

  /**
   * Extract direct audio URL from YouTube video
   * This is the main method used by UniversalTranscriptService
   */
  async extractAudioUrl(videoId: string): Promise<string | null> {
    try {
      console.log(`🎵 Extracting audio URL for video: ${videoId}`)
      
      const result = await this.getAudioStreamUrl(videoId)
      
      if (result.success && result.audioUrl) {
        console.log(`✅ Successfully extracted audio URL for ${videoId}`)
        return result.audioUrl
      }
      
      console.log(`❌ Failed to extract audio URL for ${videoId}: ${result.error}`)
      return null

    } catch (error) {
      console.error(`Audio extraction failed for ${videoId}:`, error)
      return null
    }
  }

  /**
   * Get video metadata using yt-dlp
   */
  async getVideoMetadata(videoId: string): Promise<VideoMetadata | null> {
    try {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
      
      const command = [
        'yt-dlp',
        '--print', '%(title)s',
        '--print', '%(duration)s', 
        '--print', '%(uploader)s',
        '--print', '%(upload_date)s',
        '--print', '%(view_count)s',
        '--print', '%(like_count)s',
        '--print', '%(description)s',
        '--no-warnings',
        videoUrl
      ].join(' ')

      const { stdout, stderr } = await execAsync(command, { 
        timeout: this.timeoutMs,
        maxBuffer: 1024 * 1024 // 1MB buffer
      })

      if (stderr && !stdout) {
        throw new Error(`yt-dlp metadata error: ${stderr}`)
      }

      const lines = stdout.trim().split('\n')
      
      if (lines.length < 5) {
        throw new Error('Incomplete metadata response')
      }

      return {
        title: lines[0] || 'Unknown Title',
        duration: parseInt(lines[1]) || 0,
        uploader: lines[2] || 'Unknown Channel',
        uploadDate: lines[3] || '',
        viewCount: parseInt(lines[4]) || 0,
        likeCount: parseInt(lines[5]) || undefined,
        description: lines[6] || ''
      }

    } catch (error) {
      console.error(`Failed to get metadata for ${videoId}:`, error)
      return null
    }
  }

  /**
   * Get direct audio stream URL using yt-dlp
   */
  private async getAudioStreamUrl(videoId: string): Promise<AudioExtractionResult> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🔄 Audio extraction attempt ${attempt}/${this.maxRetries} for ${videoId}`)
        
        const result = await this.attemptAudioExtraction(videoId)
        
        if (result.success) {
          return result
        }
        
        if (attempt < this.maxRetries) {
          console.log(`⏳ Retrying audio extraction for ${videoId} in 2 seconds...`)
          await this.sleep(2000)
        }
        
      } catch (error) {
        console.error(`Audio extraction attempt ${attempt} failed:`, error)
        
        if (attempt === this.maxRetries) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }
        }
      }
    }

    return {
      success: false,
      error: `Failed after ${this.maxRetries} attempts`
    }
  }

  /**
   * Single attempt at audio extraction
   */
  private async attemptAudioExtraction(videoId: string): Promise<AudioExtractionResult> {
    return new Promise((resolve, reject) => {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
      
      // Use yt-dlp to get the best audio-only stream URL
      const ytDlpArgs = [
        '--get-url',
        '--format', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
        '--no-warnings',
        '--no-playlist',
        videoUrl
      ]

      console.log(`🎙️ Running: yt-dlp ${ytDlpArgs.join(' ')}`)

      const process = spawn('yt-dlp', ytDlpArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.timeoutMs
      })

      let stdout = ''
      let stderr = ''

      process.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      process.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      process.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          const audioUrl = stdout.trim().split('\n')[0] // Get first URL
          
          if (this.isValidAudioUrl(audioUrl)) {
            resolve({
              success: true,
              audioUrl
            })
          } else {
            resolve({
              success: false,
              error: 'Invalid audio URL returned'
            })
          }
        } else {
          resolve({
            success: false,
            error: stderr || `yt-dlp process exited with code ${code}`
          })
        }
      })

      process.on('error', (error) => {
        reject(new Error(`yt-dlp process error: ${error.message}`))
      })

      // Kill process if it takes too long
      setTimeout(() => {
        if (!process.killed) {
          process.kill('SIGKILL')
          reject(new Error('yt-dlp process timed out'))
        }
      }, this.timeoutMs)
    })
  }

  /**
   * Validate that the extracted URL is a valid audio stream
   */
  private isValidAudioUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url)
      
      // Check if it's a valid URL
      if (!parsedUrl.protocol.startsWith('http')) {
        return false
      }
      
      // Check if it contains typical YouTube audio stream patterns
      const validPatterns = [
        'googlevideo.com',
        'mime=audio',
        'itag=',
        '&signature=',
        '&source=youtube'
      ]
      
      return validPatterns.some(pattern => url.includes(pattern))
      
    } catch {
      return false
    }
  }

  /**
   * Get multiple audio format options for fallback
   */
  async getAudioFormats(videoId: string): Promise<Array<{
    format_id: string
    ext: string
    acodec: string
    abr: number
    url: string
  }> | null> {
    try {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
      
      const command = [
        'yt-dlp',
        '--list-formats',
        '--format', 'bestaudio',
        '--print', '%(format_id)s|%(ext)s|%(acodec)s|%(abr)s|%(url)s',
        '--no-warnings',
        videoUrl
      ].join(' ')

      const { stdout, stderr } = await execAsync(command, { 
        timeout: this.timeoutMs 
      })

      if (stderr && !stdout) {
        throw new Error(`Format listing error: ${stderr}`)
      }

      const formats = stdout.trim()
        .split('\n')
        .filter(line => line.includes('|'))
        .map(line => {
          const [format_id, ext, acodec, abr, url] = line.split('|')
          return {
            format_id,
            ext,
            acodec,
            abr: parseInt(abr) || 0,
            url
          }
        })
        .filter(format => format.url && format.url.startsWith('http'))

      return formats.length > 0 ? formats : null

    } catch (error) {
      console.error(`Failed to get audio formats for ${videoId}:`, error)
      return null
    }
  }

  /**
   * Check if yt-dlp is installed and working
   */
  async checkYtDlpAvailability(): Promise<{
    available: boolean
    version?: string
    error?: string
  }> {
    try {
      const { stdout, stderr } = await execAsync('yt-dlp --version', { 
        timeout: 5000 
      })

      if (stderr && !stdout) {
        return {
          available: false,
          error: stderr
        }
      }

      return {
        available: true,
        version: stdout.trim()
      }

    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Install or update yt-dlp (for development environments)
   */
  async installYtDlp(): Promise<{
    success: boolean
    message: string
  }> {
    try {
      console.log('📦 Installing/updating yt-dlp...')
      
      // Try pip install first
      const { stdout, stderr } = await execAsync(
        'pip install -U yt-dlp', 
        { timeout: 60000 }
      )

      if (stderr && stderr.includes('error')) {
        throw new Error(stderr)
      }

      return {
        success: true,
        message: 'yt-dlp installed/updated successfully'
      }

    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Utility function to sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Clean up any temporary files or processes
   */
  cleanup(): void {
    // Clean up any background processes if needed
    console.log('🧹 YouTube audio extractor cleanup complete')
  }
} 