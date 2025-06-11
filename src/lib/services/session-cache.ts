import type { CachedVideo, ProcessedVideo } from '@/types/youtube-chat'

export class SessionBasedCache {
  private static instance: SessionBasedCache
  private cache: Map<string, CachedVideo> = new Map()
  private readonly SESSION_TTL = 30 * 60 * 1000 // 30 minutes
  private readonly MAX_CACHE_SIZE = 25 // videos

  static getInstance(): SessionBasedCache {
    if (!SessionBasedCache.instance) {
      SessionBasedCache.instance = new SessionBasedCache()
    }
    return SessionBasedCache.instance
  }

  async get(videoId: string): Promise<CachedVideo | null> {
    const cached = this.cache.get(videoId)
    
    if (!cached) {
      return null
    }

    // Check if TTL expired
    if (Date.now() > cached.ttl) {
      this.cache.delete(videoId)
      console.log(`🗑️ Expired cache entry removed for ${videoId}`)
      return null
    }

    // Update access tracking
    cached.accessCount++
    cached.lastAccessed = Date.now()
    
    console.log(`✅ Cache hit for ${videoId} (accessed ${cached.accessCount} times)`)
    return cached
  }

  async set(videoId: string, data: ProcessedVideo): Promise<void> {
    // Check if we need to evict oldest entries
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      await this.evictOldest()
    }

    const cachedVideo: CachedVideo = {
      videoId,
      data,
      ttl: Date.now() + this.SESSION_TTL,
      accessCount: 1,
      lastAccessed: Date.now()
    }

    this.cache.set(videoId, cachedVideo)
    console.log(`💾 Cached video ${videoId} (cache size: ${this.cache.size}/${this.MAX_CACHE_SIZE})`)
  }

  private async evictOldest(): Promise<void> {
    if (this.cache.size === 0) return

    // Find the oldest accessed entry
    let oldestKey = ''
    let oldestTime = Date.now()

    for (const [key, value] of this.cache.entries()) {
      if (value.lastAccessed < oldestTime) {
        oldestTime = value.lastAccessed
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
      console.log(`🗑️ Evicted oldest cache entry: ${oldestKey}`)
    }
  }

  // Check if video is already cached
  has(videoId: string): boolean {
    const cached = this.cache.get(videoId)
    if (!cached) return false
    
    // Check TTL
    if (Date.now() > cached.ttl) {
      this.cache.delete(videoId)
      return false
    }
    
    return true
  }

  // Get cache statistics
  getStats(): {
    size: number
    maxSize: number
    entries: { videoId: string, accessCount: number, lastAccessed: number, ttl: number }[]
    totalCost: number
  } {
    const entries = Array.from(this.cache.entries()).map(([videoId, cached]) => ({
      videoId,
      accessCount: cached.accessCount,
      lastAccessed: cached.lastAccessed,
      ttl: cached.ttl
    }))

    const totalCost = Array.from(this.cache.values())
      .reduce((sum, cached) => sum + cached.data.cost, 0)

    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      entries,
      totalCost
    }
  }

  // Clear expired entries
  cleanup(): number {
    const now = Date.now()
    let removedCount = 0

    for (const [videoId, cached] of this.cache.entries()) {
      if (now > cached.ttl) {
        this.cache.delete(videoId)
        removedCount++
      }
    }

    if (removedCount > 0) {
      console.log(`🧹 Cleaned up ${removedCount} expired cache entries`)
    }

    return removedCount
  }

  // Clear all cache entries
  clear(): void {
    this.cache.clear()
    console.log(`🗑️ Cache cleared`)
  }

  // Get specific video from cache
  async getVideoData(videoId: string): Promise<ProcessedVideo | null> {
    const cached = await this.get(videoId)
    return cached?.data || null
  }
} 