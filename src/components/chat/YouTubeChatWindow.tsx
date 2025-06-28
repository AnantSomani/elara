'use client'

import { useState, useEffect, useRef } from 'react'
import { PaperAirplaneIcon, ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import VoiceControls, { VoiceControlsRef } from './VoiceControls'
import type { YouTubeChatMessage } from '@/types/youtube-chat'

interface YouTubeChatWindowProps {
  videoId: string
  videoTitle: string
  channelTitle: string
  duration: string
}

export default function YouTubeChatWindow({ 
  videoId, 
  videoTitle, 
  channelTitle, 
  duration 
}: YouTubeChatWindowProps) {
  const [messages, setMessages] = useState<YouTubeChatMessage[]>([])
  const [currentMessage, setCurrentMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [transcriptAvailable, setTranscriptAvailable] = useState<boolean | null>(null)
  const [sessionCost, setSessionCost] = useState(0)
  const [sessionId, setSessionId] = useState<string>('')
  const [conversationHistory, setConversationHistory] = useState<YouTubeChatMessage[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const voiceControlsRef = useRef<VoiceControlsRef>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    // Generate unique session ID for this video chat
    const newSessionId = `${videoId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    setSessionId(newSessionId)
    console.log(`💾 [SESSION] Created session: ${newSessionId}`)
    
    // Try to restore conversation from localStorage
    const savedChatKey = `elara-chat-${videoId}`
    const saved = localStorage.getItem(savedChatKey)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // Validate the data structure
        if (parsed.messages && Array.isArray(parsed.messages)) {
          console.log(`💾 [SESSION] Restoring ${parsed.messages.length} messages from localStorage`)
          
          // Restore messages with proper Date objects
          const restoredMessages = parsed.messages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
          
          setMessages(restoredMessages)
          setConversationHistory(restoredMessages)
          
          // Restore session cost if available
          if (parsed.sessionCost) {
            setSessionCost(parsed.sessionCost)
          }
        }
      } catch (e) {
        console.warn('💾 [SESSION] Could not restore chat history:', e)
        // Clear corrupted data
        localStorage.removeItem(savedChatKey)
      }
    }
  }, [videoId])

  useEffect(() => {
    // Check transcript availability when component mounts
    checkTranscriptAvailability()
  }, [videoId])

  // 🧠 Phase 1.2: Message persistence to localStorage
  useEffect(() => {
    if (messages.length > 0 && sessionId) {
      const chatData = {
        sessionId,
        messages,
        sessionCost,
        timestamp: Date.now(),
        videoId,
        videoTitle
      }
      
      const savedChatKey = `elara-chat-${videoId}`
      localStorage.setItem(savedChatKey, JSON.stringify(chatData))
      
      // Update conversation history for backend
      setConversationHistory(messages)
      
      console.log(`💾 [SESSION] Saved ${messages.length} messages to localStorage`)
    }
  }, [messages, sessionId, sessionCost, videoId, videoTitle])

  const checkTranscriptAvailability = async () => {
    try {
      const response = await fetch(`/api/youtube/transcript/${videoId}/check`)
      if (response.ok) {
        const data = await response.json()
        setTranscriptAvailable(data.available)
        if (data.message) {
          console.log('✅ Backend processed video:', data.message)
        }
      } else {
        setTranscriptAvailable(false)
      }
    } catch (error) {
      console.error('Error checking transcript availability:', error)
      setTranscriptAvailable(false)
    }
  }

  const sendMessage = async (messageText?: string) => {
    const textToSend = messageText || currentMessage
    if (!textToSend.trim() || isLoading) return

    const userMessage: YouTubeChatMessage = {
      role: 'user',
      content: textToSend,
      timestamp: new Date(),
      videoId
    }

    setMessages(prev => [...prev, userMessage])
    if (!messageText) setCurrentMessage('') // Only clear if using text input
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat/youtube', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: textToSend,
          videoId: videoId,
          sessionId: sessionId,
          conversationHistory: conversationHistory.slice(-6),
          context: {
            videoTitle,
            channelTitle,
            duration,
            assistant: 'elara'
          }
        }),
      })

      console.log(`🧠 [SESSION] Sent message with sessionId: ${sessionId}, history: ${conversationHistory.length} messages`)

      const data = await response.json()
      
      if (data.success) {
        const assistantMessage: YouTubeChatMessage = {
          role: 'assistant',
          content: data.response,
          timestamp: new Date(),
          videoId,
          cost: data.cost || 0
        }
        setMessages(prev => [...prev, assistantMessage])
        
        // Update session cost
        if (data.cost) {
          setSessionCost(prev => prev + data.cost)
        }
        
        // Automatically speak the response in Elara's voice
        if (voiceControlsRef.current) {
          await voiceControlsRef.current.speakText(data.response)
        }
      } else {
        throw new Error(data.error || 'Failed to get response')
      }
    } catch (error) {
      console.error('YouTube chat error:', error)
      
      // Create appropriate fallback based on transcript availability
      let fallbackContent = ''
      if (transcriptAvailable === false) {
        fallbackContent = `I'd love to discuss "${textToSend}" about this YouTube video, but unfortunately this video doesn't have captions or transcripts available. I can still help with general questions about the topic or channel if you'd like!`
      } else {
        fallbackContent = `I'm having some technical difficulties right now, but I'd love to discuss "${textToSend}" about "${videoTitle}" with you. Let me try to process this video and get back to you in a moment.`
      }

      const fallbackMessage: YouTubeChatMessage = {
        role: 'assistant',
        content: fallbackContent,
        timestamp: new Date(),
        videoId
      }
      setMessages(prev => [...prev, fallbackMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleVoiceInput = (text: string) => {
    setCurrentMessage(text)
    // Automatically send the voice input
    sendMessage(text)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  const formatCost = (cost: number): string => {
    return `$${cost.toFixed(4)}`
  }

  const resetChat = () => {
    console.log(`🔄 [RESET] Resetting chat for video: ${videoId}`)
    
    // 1. Clear all React state
    setMessages([])
    setConversationHistory([])
    setSessionCost(0)
    setCurrentMessage('')
    
    // 2. Clear localStorage
    const savedChatKey = `elara-chat-${videoId}`
    localStorage.removeItem(savedChatKey)
    console.log(`🔄 [RESET] Cleared localStorage: ${savedChatKey}`)
    
    // 3. Generate completely new session ID
    const newSessionId = `${videoId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    setSessionId(newSessionId)
    
    console.log(`🔄 [RESET] Chat reset complete. New session: ${newSessionId}`)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with transcript status */}
      <div className="border-b border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">🤖 Chat with Elara</h2>
            <p className="text-sm text-slate-600">Ask about "{videoTitle}"</p>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="text-right">
              {transcriptAvailable !== null && (
                <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                  transcriptAvailable 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {transcriptAvailable ? '✅ Transcript Available' : '⚠️ No Transcript'}
                </div>
              )}
              {sessionCost > 0 && (
                <div className="text-xs text-slate-500 mt-1">
                  Session cost: {formatCost(sessionCost)}
                </div>
              )}
            </div>
            
            {/* Reset Chat Button */}
            <button
              onClick={resetChat}
              disabled={isLoading}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
              title="Reset conversation"
            >
              <ArrowPathIcon className="w-5 h-5 group-hover:rotate-180 transition-transform duration-200" />
            </button>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="text-slate-400 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-slate-600 mb-2">Start a conversation about this video!</p>
            <p className="text-sm text-slate-500">
              {transcriptAvailable 
                ? 'I can analyze the video content and answer your questions.'
                : 'I can help with general questions about the topic and channel.'}
            </p>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-100 text-slate-900'
              }`}
            >
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {message.content}
              </p>
              <div className="flex items-center justify-between mt-1">
                <p
                  className={`text-xs ${
                    message.role === 'user' ? 'text-purple-100' : 'text-slate-500'
                  }`}
                >
                  {formatTime(message.timestamp)}
                </p>
                {message.cost && message.cost > 0 && (
                  <p className="text-xs text-slate-400">
                    {formatCost(message.cost)}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-lg px-4 py-2">
              <div className="flex items-center space-x-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span className="text-xs text-slate-500">
                  {transcriptAvailable ? 'Analyzing video content...' : 'Elara is thinking...'}
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-200 p-4">
        {/* Transcript warning */}
        {transcriptAvailable === false && (
          <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start">
              <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-yellow-800 font-medium">Limited Chat Mode</p>
                <p className="text-xs text-yellow-700 mt-1">
                  This video doesn't have captions available. I can still help with general questions about the topic.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Voice Controls */}
        <div className="mb-3 flex justify-center">
          <VoiceControls 
            ref={voiceControlsRef}
            onVoiceInput={handleVoiceInput}
          />
        </div>

        <div className="flex space-x-2">
          <textarea
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={transcriptAvailable 
              ? "Ask about this video..." 
              : "Ask a general question about this topic..."
            }
            disabled={isLoading}
            rows={1}
            className="flex-1 px-3 py-2 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-slate-100 disabled:text-slate-400 resize-none"
            style={{ minHeight: '40px', maxHeight: '120px' }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!currentMessage.trim() || isLoading}
            className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-purple-600"
          >
            <PaperAirplaneIcon className="h-5 w-5" />
          </button>
        </div>
        
        <div className="mt-2 text-xs text-slate-500">
          Press Enter to send, Shift+Enter for new line • Use voice input to talk with Elara
        </div>
      </div>
    </div>
  )
} 