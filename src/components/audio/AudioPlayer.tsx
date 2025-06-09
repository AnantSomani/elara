'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { 
  PlayIcon, 
  PauseIcon, 
  SpeakerWaveIcon, 
  SpeakerXMarkIcon,
  ForwardIcon,
  BackwardIcon
} from '@heroicons/react/24/solid'

interface AudioPlayerProps {
  episodeId: string
  title: string
  audioUrl?: string
}

export default function AudioPlayer({ episodeId, title, audioUrl }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Demo mode detection - check if URL is fake/demo
  const isDemoMode = !audioUrl || audioUrl.includes('example.com') || audioUrl.includes('demo-audio')
  
  // Demo state for fake playback
  const [demoCurrentTime, setDemoCurrentTime] = useState(0)
  const [demoIsPlaying, setDemoIsPlaying] = useState(false)
  const demoDuration = 135 * 60 + 30 // 2:15:30 in seconds
  const demoIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Pre-generate memoized waveform heights based on episode ID for consistency
  const waveformHeights = useMemo(() => {
    const seed = episodeId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const heights = []
    for (let i = 0; i < 25; i++) {
      // Use seeded random for consistent heights
      const seedValue = (seed + i * 137) % 1000
      const height = 20 + (seedValue % 60) // Heights between 20-80px
      heights.push(height)
    }
    return heights
  }, [episodeId])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || isDemoMode) return

    const updateTime = () => setCurrentTime(audio.currentTime)
    const updateDuration = () => setDuration(audio.duration)
    const handleEnded = () => setIsPlaying(false)
    const handleError = (e: any) => {
      console.error('Audio error:', e)
      setError('Failed to load audio')
      setIsLoading(false)
    }
    const handleLoadStart = () => {
      setIsLoading(true)
      setError(null)
    }
    const handleLoadedData = () => {
      setIsLoading(false)
    }

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)
    audio.addEventListener('loadstart', handleLoadStart)
    audio.addEventListener('loadeddata', handleLoadedData)

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('loadstart', handleLoadStart)
      audio.removeEventListener('loadeddata', handleLoadedData)
    }
  }, [isDemoMode])

  // Demo mode interval for fake progress
  useEffect(() => {
    if (isDemoMode && demoIsPlaying) {
      demoIntervalRef.current = setInterval(() => {
        setDemoCurrentTime(prev => {
          if (prev >= demoDuration) {
            setDemoIsPlaying(false)
            return demoDuration
          }
          return prev + 1
        })
      }, 1000)
    } else {
      if (demoIntervalRef.current) {
        clearInterval(demoIntervalRef.current)
        demoIntervalRef.current = null
      }
    }

    return () => {
      if (demoIntervalRef.current) {
        clearInterval(demoIntervalRef.current)
      }
    }
  }, [isDemoMode, demoIsPlaying, demoDuration])

  const togglePlayPause = async () => {
    if (isDemoMode) {
      setDemoIsPlaying(!demoIsPlaying)
      return
    }

    const audio = audioRef.current
    if (!audio) return

    try {
      if (isPlaying) {
        audio.pause()
        setIsPlaying(false)
      } else {
        setIsLoading(true)
        await audio.play()
        setIsPlaying(true)
        setIsLoading(false)
      }
    } catch (error) {
      console.error('Playback error:', error)
      setError('Failed to play audio')
      setIsLoading(false)
    }
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    
    if (isDemoMode) {
      setDemoCurrentTime(percent * demoDuration)
      return
    }

    const audio = audioRef.current
    if (audio && duration) {
      audio.currentTime = percent * duration
    }
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value)
    setVolume(newVolume)
    setIsMuted(newVolume === 0)
    
    if (!isDemoMode && audioRef.current) {
      audioRef.current.volume = newVolume
    }
  }

  const toggleMute = () => {
    if (isDemoMode) {
      setIsMuted(!isMuted)
      return
    }

    const audio = audioRef.current
    if (!audio) return

    if (isMuted) {
      audio.volume = volume
      setIsMuted(false)
    } else {
      audio.volume = 0
      setIsMuted(true)
    }
  }

  const skip = (seconds: number) => {
    if (isDemoMode) {
      setDemoCurrentTime(prev => Math.max(0, Math.min(demoDuration, prev + seconds)))
      return
    }

    const audio = audioRef.current
    if (audio) {
      audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + seconds))
    }
  }

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const currentDisplayTime = isDemoMode ? demoCurrentTime : currentTime
  const totalDisplayTime = isDemoMode ? demoDuration : duration
  const displayIsPlaying = isDemoMode ? demoIsPlaying : isPlaying
  const progress = totalDisplayTime > 0 ? (currentDisplayTime / totalDisplayTime) * 100 : 0

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 h-full flex flex-col">
      {/* Audio element for real audio */}
      {!isDemoMode && audioUrl && (
        <audio ref={audioRef} src={audioUrl} preload="metadata" />
      )}

      {/* Demo mode indicator */}
      {isDemoMode && (
        <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
              <span className="text-purple-700 font-medium text-sm">Demo Mode</span>
            </div>
            <span className="text-purple-600 text-xs">Simulated Audio Playback</span>
          </div>
          <p className="text-purple-600 text-xs mt-1">
            This episode uses simulated playback for demonstration purposes
          </p>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Waveform Visualization */}
      <div className="flex-1 flex items-center justify-center mb-6">
        <div 
          className="flex items-end space-x-1 h-32 cursor-pointer transform-gpu"
          onClick={handleSeek}
        >
          {waveformHeights.map((height, index) => {
            const barProgress = (index / waveformHeights.length) * 100
            const isActive = barProgress <= progress
            
            return (
              <div
                key={index}
                className={`w-2 transition-colors duration-150 rounded-sm ${
                  isActive 
                    ? 'bg-purple-500' 
                    : 'bg-slate-300'
                }`}
                style={{ 
                  height: `${height}px`,
                  transform: displayIsPlaying && isActive ? 'scaleY(1.1)' : 'scaleY(1)',
                  transition: 'transform 0.2s ease, colors 0.15s ease'
                }}
              />
            )
          })}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div 
          className="w-full h-2 bg-slate-200 rounded-full cursor-pointer"
          onClick={handleSeek}
        >
          <div 
            className="h-full bg-purple-500 rounded-full transition-all duration-150 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-sm text-slate-500 mt-1">
          <span>{formatTime(currentDisplayTime)}</span>
          <span>{formatTime(totalDisplayTime)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center space-x-4 mb-4">
        <button
          onClick={() => skip(-15)}
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors"
          title="Rewind 15 seconds"
        >
          <BackwardIcon className="h-5 w-5" />
        </button>

        <button
          onClick={togglePlayPause}
          disabled={isLoading}
          className="p-4 bg-purple-600 hover:bg-purple-700 text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed transform-gpu"
        >
          {isLoading ? (
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
          ) : displayIsPlaying ? (
            <PauseIcon className="h-6 w-6" />
          ) : (
            <PlayIcon className="h-6 w-6" />
          )}
        </button>

        <button
          onClick={() => skip(15)}
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors"
          title="Forward 15 seconds"
        >
          <ForwardIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Volume Control */}
      <div className="flex items-center space-x-3">
        <button
          onClick={toggleMute}
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors"
        >
          {isMuted ? (
            <SpeakerXMarkIcon className="h-5 w-5" />
          ) : (
            <SpeakerWaveIcon className="h-5 w-5" />
          )}
        </button>
        
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #9333EA 0%, #9333EA ${(isMuted ? 0 : volume) * 100}%, #E2E8F0 ${(isMuted ? 0 : volume) * 100}%, #E2E8F0 100%)`
          }}
        />
        
        <span className="text-sm text-slate-500 w-8 text-right">
          {Math.round((isMuted ? 0 : volume) * 100)}
        </span>
      </div>

      {/* Episode Info */}
      <div className="mt-4 pt-4 border-t border-slate-200">
        <h3 className="font-semibold text-slate-900 text-sm mb-1">Now Playing</h3>
        <p className="text-slate-600 text-sm truncate">{title}</p>
      </div>
    </div>
  )
} 