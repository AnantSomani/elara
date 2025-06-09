import { useState, useEffect } from 'react'

interface VoicePermissions {
  hasPermission: boolean | null // null = unknown, true = granted, false = denied
  isSupported: boolean
  requestPermission: () => Promise<boolean>
}

export function useVoicePermissions(): VoicePermissions {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [isSupported, setIsSupported] = useState(false)

  useEffect(() => {
    // Check if the browser supports the required APIs
    const supported = !!(
      navigator.mediaDevices && 
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof MediaRecorder !== 'undefined'
    )
    setIsSupported(supported)

    if (supported) {
      // Check current permission status
      navigator.permissions?.query({ name: 'microphone' as PermissionName })
        .then((result) => {
          setHasPermission(result.state === 'granted')
          
          // Listen for permission changes
          result.onchange = () => {
            setHasPermission(result.state === 'granted')
          }
        })
        .catch(() => {
          // Permissions API not supported, we'll check when requesting
          setHasPermission(null)
        })
    }
  }, [])

  const requestPermission = async (): Promise<boolean> => {
    if (!isSupported) return false

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Permission granted, clean up the stream
      stream.getTracks().forEach(track => track.stop())
      setHasPermission(true)
      return true
    } catch (error) {
      console.error('Microphone permission denied:', error)
      setHasPermission(false)
      return false
    }
  }

  return {
    hasPermission,
    isSupported,
    requestPermission,
  }
} 