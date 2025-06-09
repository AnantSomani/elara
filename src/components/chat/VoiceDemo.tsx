'use client'

import { useRef, useState } from 'react'
import VoiceControls, { VoiceControlsRef } from './VoiceControls'

export default function VoiceDemo() {
  const [transcript, setTranscript] = useState('')
  const voiceRef = useRef<VoiceControlsRef>(null)

  const handleVoiceInput = (text: string) => {
    setTranscript(text)
  }

  const testTTS = async () => {
    if (voiceRef.current) {
      await voiceRef.current.speakText(`Hi there! I'm Elara, your podcast discussion companion. I'm here to help you explore and understand podcast episodes. Thanks for testing out the voice feature!`)
    }
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg max-w-md mx-auto border border-purple-200">
      <h2 className="text-xl font-bold mb-4 text-purple-800">Voice Demo - Meet Elara</h2>
      
      <div className="mb-4 p-3 bg-purple-50 rounded border border-purple-200">
        <p className="text-sm text-purple-800">
          <strong>Elara</strong> is your universal podcast assistant. She helps you understand and discuss any podcast episode using her friendly, knowledgeable voice.
        </p>
      </div>

      <div className="mb-4">
        <VoiceControls 
          ref={voiceRef}
          onVoiceInput={handleVoiceInput}
        />
      </div>

      {transcript && (
        <div className="mb-4 p-3 bg-gray-100 rounded border border-gray-200">
          <strong>You said:</strong> {transcript}
        </div>
      )}

      <button 
        onClick={testTTS}
        className="w-full bg-purple-500 text-white p-2 rounded hover:bg-purple-600 transition-colors"
      >
        Test Elara's Voice
      </button>
      
      <div className="mt-4 text-xs text-gray-600">
        Try saying: "Tell me about this episode" or "What's interesting about this podcast?"
      </div>
    </div>
  )
} 