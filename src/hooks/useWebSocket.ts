import { useState, useRef, useCallback, useEffect } from 'react'
import config from '../config'

interface UseWebSocketProps {
  onMessage?: (data: any) => void
  onLog?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
}

export function useWebSocket({ onMessage, onLog }: UseWebSocketProps) {
  const [wsConnected, setWsConnected] = useState(false)
  const [mlActive, setMlActive] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)

  // Connect to WebSocket with auto-reconnect
  const connectWebSocket = useCallback(() => {
    try {
      // Clear any existing connection
      if (wsRef.current) {
        wsRef.current.close()
      }

      wsRef.current = new WebSocket(config.wsUrl)

      wsRef.current.onopen = () => {
        onLog?.('WebSocket connected successfully', 'success')
        setWsConnected(true)
        setMlActive(true)
        reconnectAttemptsRef.current = 0 // Reset reconnect attempts
      }

      wsRef.current.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data)
          onMessage?.(data)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      wsRef.current.onerror = (error: Event) => {
        onLog?.('WebSocket error occurred', 'error')
        console.error('WebSocket error:', error)
      }

      wsRef.current.onclose = () => {
        onLog?.('WebSocket disconnected', 'warning')
        setWsConnected(false)
        setMlActive(false)

        // Auto-reconnect with exponential backoff (max 5 attempts)
        if (reconnectAttemptsRef.current < 5) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
          onLog?.(`Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttemptsRef.current + 1}/5)`, 'info')
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++
            connectWebSocket()
          }, delay)
        } else {
          onLog?.('Max reconnection attempts reached. Please click "Connect ML" to retry.', 'error')
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      onLog?.(`Connection failed: ${message}`, 'error')
    }
  }, [onMessage, onLog])

  // Disconnect WebSocket
  const disconnectWebSocket = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    
    reconnectAttemptsRef.current = 0
  }, [])

  // Send frame to backend
  const sendFrame = useCallback(async (camId: string, videoElement: HTMLVideoElement | null) => {
    if (!wsConnected || !videoElement || !videoElement.srcObject) return

    try {
      const canvas = document.createElement('canvas')
      canvas.width = videoElement.videoWidth
      canvas.height = videoElement.videoHeight

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      
      ctx.drawImage(videoElement, 0, 0)

      canvas.toBlob(async (blob: Blob | null) => {
        if (!blob) return
        
        const formData = new FormData()
        formData.append('frame', blob)
        formData.append('camera_id', camId)

        try {
          await fetch(`${config.apiUrl}/ingest/frame`, {
            method: 'POST',
            body: formData
          })
        } catch (error) {
          console.error('Frame send error:', error)
        }
      }, 'image/jpeg', 0.8)
    } catch (error) {
      console.error('Frame capture error:', error)
    }
  }, [wsConnected])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectWebSocket()
    }
  }, [disconnectWebSocket])

  return {
    wsConnected,
    mlActive,
    connectWebSocket,
    disconnectWebSocket,
    sendFrame
  }
}
