'use client'

import { useState, useRef, useCallback, useImperativeHandle, forwardRef } from 'react'
import { MicrophoneIcon, SpeakerWaveIcon, StopIcon } from '@heroicons/react/24/outline'
import { useVoicePermissions } from '../../hooks/useVoicePermissions'

interface VoiceControlsProps {
  onVoiceInput: (text: string) => void
}

export interface VoiceControlsRef {
  speakText: (text: string) => Promise<void>
  stopSpeaking: () => void
}

const VoiceControls = forwardRef<VoiceControlsRef, VoiceControlsProps>(({ 
  onVoiceInput
}, ref) => {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const { hasPermission, isSupported, requestPermission } = useVoicePermissions()

  const startRecording = useCallback(async () => {
    // Check permissions first
    if (!isSupported) {
      alert('Voice input is not supported in this browser.')
      return
    }

    if (hasPermission === false) {
      const granted = await requestPermission()
      if (!granted) {
        alert('Microphone permission is required for voice input. Please check your browser settings.')
        return
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      
      audioChunksRef.current = []
      mediaRecorderRef.current = mediaRecorder
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        await processVoiceInput(audioBlob)
        stream.getTracks().forEach(track => track.stop())
      }
      
      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error('Error starting recording:', error)
      alert('Could not access microphone. Please check permissions.')
    }
  }, [isSupported, hasPermission, requestPermission])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }, [isRecording])

  const processVoiceInput = async (audioBlob: Blob) => {
    setIsProcessing(true)
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.wav')
      
      const response = await fetch('/api/voice/speech-to-text', {
        method: 'POST',
        body: formData,
      })
      
      const data = await response.json()
      
      if (data.success && data.text) {
        onVoiceInput(data.text)
      } else {
        console.error('Speech-to-text failed:', data.error)
      }
    } catch (error) {
      console.error('Error processing voice input:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const speakText = useCallback(async (text: string) => {
    try {
      // Stop any currently playing audio
      if (currentAudio) {
        currentAudio.pause()
        currentAudio.currentTime = 0
      }

      const response = await fetch('/api/voice/text-to-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text
        }),
      })

      if (response.ok) {
        const audioBlob = await response.blob()
        const audioUrl = URL.createObjectURL(audioBlob)
        
        // Create audio element properly
        const audio = new Audio()
        audio.src = audioUrl
        
        setCurrentAudio(audio)
        
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl)
          setCurrentAudio(null)
        }
        
        await audio.play()
      } else {
        console.error('Text-to-speech failed')
      }
    } catch (error) {
      console.error('Error playing speech:', error)
    }
  }, [currentAudio])

  const stopSpeaking = useCallback(() => {
    if (currentAudio) {
      currentAudio.pause()
      currentAudio.currentTime = 0
      setCurrentAudio(null)
    }
  }, [currentAudio])

  // Expose functions via ref
  useImperativeHandle(ref, () => ({
    speakText,
    stopSpeaking
  }), [speakText, stopSpeaking])

  return (
    <div className="flex items-center space-x-2">
      {/* Voice Input Button */}
      <button
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isProcessing}
        className={`p-2 rounded-lg transition-colors ${
          isRecording
            ? 'bg-red-500 text-white animate-pulse'
            : isProcessing
            ? 'bg-gray-300 text-gray-500'
            : 'bg-purple-100 text-purple-600 hover:bg-purple-200'
        }`}
        title={isRecording ? 'Stop recording' : 'Start voice input'}
      >
        {isProcessing ? (
          <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <MicrophoneIcon className="h-5 w-5" />
        )}
      </button>

      {/* Voice Output Control */}
      {currentAudio ? (
        <button
          onClick={stopSpeaking}
          className="p-2 bg-green-100 text-green-600 hover:bg-green-200 rounded-lg transition-colors"
          title="Stop speaking"
        >
          <StopIcon className="h-5 w-5" />
        </button>
      ) : (
        <div className="p-2 bg-purple-100 text-purple-600 rounded-lg opacity-50">
          <SpeakerWaveIcon className="h-5 w-5" />
        </div>
      )}

      {/* Status indicators */}
      {isRecording && (
        <span className="text-xs text-red-600 font-medium">Recording...</span>
      )}
      {isProcessing && (
        <span className="text-xs text-purple-600 font-medium">Processing...</span>
      )}
      {currentAudio && (
        <span className="text-xs text-green-600 font-medium">Elara is speaking...</span>
      )}
    </div>
  )
})

VoiceControls.displayName = 'VoiceControls'

export default VoiceControls 