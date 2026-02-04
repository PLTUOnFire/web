import { useRef, useCallback, useState } from 'react'
import config from '../config'

interface RecorderProps {
  onLog?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
}

export function useRecorder({ onLog }: RecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const recordingSessionRef = useRef<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const frameCountRef = useRef(0)
  const lastUploadTimeRef = useRef<number>(0)
  const isConnectedRef = useRef(false)

  /**
   * Safely check if WebSocket is connected
   */
  const isWebSocketConnected = useCallback(() => {
    return wsRef.current !== null && 
           wsRef.current.readyState === WebSocket.OPEN &&
           isConnectedRef.current
  }, [])

  /**
   * Safely send via WebSocket
   */
  const safeSend = useCallback((data: string | ArrayBuffer) => {
    if (!isWebSocketConnected()) {
      return false
    }

    try {
      wsRef.current?.send(data)
      return true
    } catch (error) {
      console.error('[Recorder] Send error:', error)
      isConnectedRef.current = false
      return false
    }
  }, [isWebSocketConnected])

  /**
   * Cleanup WebSocket connection
   */
  const cleanupWebSocket = useCallback(() => {
    if (wsRef.current) {
      try {
        if (isWebSocketConnected()) {
          safeSend(JSON.stringify({ type: 'disconnect' }))
        }
        wsRef.current.close()
      } catch (error) {
        // Ignore
      } finally {
        wsRef.current = null
        isConnectedRef.current = false
      }
    }
  }, [isWebSocketConnected, safeSend])

  /**
   * Connect to WebSocket
   */
  const connectWebSocket = useCallback((sessionId: string, fps: number = 30) => {
    try {
      cleanupWebSocket()

      let baseUrl = config.wsUrl
      if (baseUrl.endsWith('/ws')) {
        baseUrl = baseUrl.slice(0, -3)
      }
      
      const wsRecordUrl = `${baseUrl}/ws/record/${sessionId}`
      
      console.log(`[Recorder] Connecting WebSocket to: ${wsRecordUrl}`)
      wsRef.current = new WebSocket(wsRecordUrl)

      wsRef.current.onopen = () => {
        console.log('[Recorder] WebSocket connected')
        isConnectedRef.current = true
        onLog?.('Recording: WebSocket streaming connected', 'success')
        safeSend(JSON.stringify({ type: 'init', fps }))
      }

      wsRef.current.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.status === 'error') {
            onLog?.(`Recording error: ${msg.message}`, 'error')
          }
        } catch (e) {
          // Ignore
        }
      }

      wsRef.current.onerror = (error) => {
        console.error('[Recorder] WebSocket error:', error)
        isConnectedRef.current = false
        onLog?.('Recording: WebSocket unavailable, using HTTP fallback', 'warning')
      }

      wsRef.current.onclose = (event) => {
        console.log(`[Recorder] WebSocket closed (code: ${event.code}, reason: ${event.reason})`)
        isConnectedRef.current = false
        
        if (event.code !== 1000) {
          onLog?.('Recording: Connection lost, switching to HTTP', 'warning')
        }
      }

      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Recorder] WebSocket connection failed:', message)
      isConnectedRef.current = false
      return false
    }
  }, [cleanupWebSocket, onLog, safeSend])

  /**
   * Validate frame before sending (check if not black)
   */
  const isValidFrame = useCallback((canvas: HTMLCanvasElement): boolean => {
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return false

      // Sample center pixels to check if frame is not all black
      const centerX = Math.floor(canvas.width / 2)
      const centerY = Math.floor(canvas.height / 2)
      const sampleSize = 50

      const imageData = ctx.getImageData(
        centerX - sampleSize / 2,
        centerY - sampleSize / 2,
        sampleSize,
        sampleSize
      )

      // Check if there's any non-black pixel
      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i]
        const g = imageData.data[i + 1]
        const b = imageData.data[i + 2]
        
        // If we find any pixel that's not pure black, frame is valid
        if (r > 10 || g > 10 || b > 10) {
          return true
        }
      }

      console.warn('[Recorder] Detected black frame, skipping')
      return false
    } catch (error) {
      console.error('[Recorder] Frame validation error:', error)
      return true // Assume valid on error
    }
  }, [])

  /**
   * Send frame via WebSocket
   */
  const sendFrameViaWebSocket = useCallback(async (
    camId: string, 
    blob: Blob, 
    mlResult?: any
  ): Promise<boolean> => {
    if (!isWebSocketConnected()) {
      return false
    }

    try {
      frameCountRef.current++

      const frameInfo = {
        type: 'frame_info',
        camera_id: camId,
        frame_number: frameCountRef.current,
        ml_data: mlResult || null
      }
      
      if (!safeSend(JSON.stringify(frameInfo))) {
        return false
      }

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 10))

      // Send binary
      const arrayBuffer = await blob.arrayBuffer()
      if (!safeSend(arrayBuffer)) {
        return false
      }

      return true
    } catch (error) {
      console.error('[Recorder] Error sending frame via WebSocket:', error)
      return false
    }
  }, [isWebSocketConnected, safeSend])

  /**
   * Send frame via HTTP (fallback)
   */
  const sendFrameViaHTTP = useCallback(async (
    camId: string, 
    blob: Blob, 
    mlResult?: any
  ): Promise<boolean> => {
    if (!recordingSessionRef.current) {
      return false
    }

    try {
      frameCountRef.current++

      const formData = new FormData()
      formData.append('session_id', recordingSessionRef.current)
      formData.append('camera_id', camId)
      formData.append('frame_data', blob, `${camId}_${frameCountRef.current}.jpg`)

      if (mlResult) {
        formData.append('ml_data', JSON.stringify(mlResult))
      }

      const response = await fetch(`${config.apiUrl}/record/frame`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        console.warn(`Frame upload failed: ${response.statusText}`)
        return false
      }

      return true
    } catch (error) {
      console.error('[Recorder] Error sending frame via HTTP:', error)
      return false
    }
  }, [])

  /**
   * Start recording session
   */
  const startRecording = useCallback(async (fps: number = 30) => {
    try {
      const sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      const response = await fetch(`${config.apiUrl}/record/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, fps })
      })

      if (!response.ok) {
        throw new Error(`Backend error: ${response.statusText}`)
      }

      recordingSessionRef.current = sessionId
      frameCountRef.current = 0
      lastUploadTimeRef.current = Date.now()

      // Connect WebSocket
      connectWebSocket(sessionId, fps)

      setIsRecording(true)
      onLog?.(`Recording started (Session: ${sessionId.slice(0, 8)}..., FPS: ${fps})`, 'success')
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      onLog?.(`Failed to start recording: ${message}`, 'error')
      return false
    }
  }, [connectWebSocket, onLog])

  /**
   * Stop recording session
   */
  const stopRecording = useCallback(async () => {
    try {
      if (!recordingSessionRef.current) {
        onLog?.('No active recording session', 'warning')
        return false
      }

      const sessionId = recordingSessionRef.current

      // Close WebSocket first
      cleanupWebSocket()

      // Wait a bit for pending frames
      await new Promise(resolve => setTimeout(resolve, 500))

      // Send stop signal
      const response = await fetch(`${config.apiUrl}/record/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      })

      if (!response.ok) {
        throw new Error(`Backend error: ${response.statusText}`)
      }

      const data = await response.json()
      const duration = data.duration_seconds || 0
      const frameCount = data.cameras ? 
        Object.values(data.cameras).reduce((sum: number, cam: any) => sum + (cam.frame_count || 0), 0) : 0

      setIsRecording(false)
      onLog?.(
        `Recording stopped. Duration: ${duration.toFixed(1)}s, Total frames: ${frameCount}`,
        'success'
      )

      recordingSessionRef.current = null
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      onLog?.(`Failed to stop recording: ${message}`, 'error')
      return false
    }
  }, [cleanupWebSocket, onLog])

  /**
   * Send frame to backend (FIXED: proper frame validation)
   */
  const sendFrame = useCallback(
    async (camId: string, videoElement: HTMLVideoElement | null | undefined, mlResult?: any) => {
      if (!isRecording || !recordingSessionRef.current || !videoElement) {
        return
      }

      try {
        // Throttle uploads (max 4 FPS for recording)
        const now = Date.now()
        if (now - lastUploadTimeRef.current < 250) {
          return
        }

        // Check if video is actually playing and has data
        if (
          videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
          videoElement.paused ||
          videoElement.videoWidth === 0 ||
          videoElement.videoHeight === 0
        ) {
          console.warn(`[Recorder] Video not ready for ${camId}`)
          return
        }

        // Create canvas with proper size
        const canvas = document.createElement('canvas')
        canvas.width = videoElement.videoWidth
        canvas.height = videoElement.videoHeight

        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return

        // Draw video frame
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height)

        // Validate frame (check if not black)
        if (!isValidFrame(canvas)) {
          console.warn(`[Recorder] Skipping invalid frame for ${camId}`)
          return
        }

        // Convert to JPEG blob with quality
        canvas.toBlob(
          async (blob) => {
            if (!blob) return

            try {
              let success = false

              // Try WebSocket first
              if (isWebSocketConnected()) {
                success = await sendFrameViaWebSocket(camId, blob, mlResult)
              }

              // Fallback to HTTP
              if (!success) {
                success = await sendFrameViaHTTP(camId, blob, mlResult)
              }

              if (success) {
                lastUploadTimeRef.current = now
              }
            } catch (error) {
              console.error('[Recorder] Error in sendFrame:', error)
            }
          },
          'image/jpeg',
          0.90  // Higher quality for recording
        )
      } catch (error) {
        console.error('[Recorder] Error capturing frame:', error)
      }
    },
    [isRecording, isWebSocketConnected, isValidFrame, sendFrameViaWebSocket, sendFrameViaHTTP]
  )

  return {
    isRecording,
    startRecording,
    stopRecording,
    sendFrame,
    sessionId: recordingSessionRef.current,
    isWebSocketConnected: isWebSocketConnected()
  }
}