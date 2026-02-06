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
  // NOTE: Legacy hook - backend multi-operator requires /ws/record/{camera_id}/{session_id}
  const connectWebSocket = useCallback(() => {
    try {
      // Backend multi-operator no longer supports /ws endpoint
      // Use useStreamRecorder for per-camera recording and useEyeTracking for tracking
      onLog?.('Legacy ML inference WebSocket endpoint deprecated - use per-camera recording instead', 'warning')
      setWsConnected(false)
      setMlActive(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      onLog?.(`Connection setup failed: ${message}`, 'error')
    }
  }, [onLog])

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
