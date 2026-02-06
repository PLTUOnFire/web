import { useRef, useCallback, useState } from 'react'
import config from '../config'

interface StreamRecorderProps {
  onLog?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
}

interface CameraRecorder {
  mediaRecorder: MediaRecorder
  cameraId: string
}

export function useStreamRecorder({ onLog }: StreamRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const sessionIdRef = useRef<string | null>(null)
  const recordersRef = useRef<Map<string, CameraRecorder>>(new Map())
  const wsRef = useRef<WebSocket | null>(null)
  const isConnectedRef = useRef(false)

  /**
   * Check if WebSocket is connected
   */
  const isWebSocketConnected = useCallback(() => {
    return wsRef.current !== null && 
           wsRef.current.readyState === WebSocket.OPEN &&
           isConnectedRef.current
  }, [])

  /**
   * Safely send via WebSocket
   */
  const safeSend = useCallback((data: string | Blob) => {
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
   * Connect to WebSocket for recording
   */
  const connectWebSocket = useCallback((sessionId: string, fps: number = 60): Promise<WebSocket | null> => {
    return new Promise((resolve) => {
      try {
        cleanupWebSocket()

        let baseUrl = config.wsUrl
        if (baseUrl.endsWith('/ws')) {
          baseUrl = baseUrl.slice(0, -3)
        }
        
        const wsUrl = `${baseUrl}/ws/record/${sessionId}`
        console.log(`[Recorder] Connecting to: ${wsUrl}`)
        
        const ws = new WebSocket(wsUrl)

        ws.onopen = () => {
          console.log('[Recorder] WebSocket connected')
          isConnectedRef.current = true
          
          // Send init with FPS
          ws.send(JSON.stringify({ type: 'init', fps }))
          
          onLog?.(`Recording: WebSocket streaming at ${fps} FPS`, 'success')
          resolve(ws)
        }

        ws.onerror = (error) => {
          console.error('[Recorder] WebSocket error:', error)
          onLog?.('Recording: WebSocket error, will use HTTP fallback', 'warning')
          resolve(null)
        }

        ws.onclose = () => {
          console.log('[Recorder] WebSocket closed')
          isConnectedRef.current = false
        }

        // Timeout fallback
        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            ws.close()
            resolve(null)
          }
        }, 3000)

      } catch (error) {
        console.error('[Recorder] Connection failed:', error)
        resolve(null)
      }
    })
  }, [cleanupWebSocket, onLog])

  /**
   * Create MediaRecorder for camera stream with 60 FPS support
   */
  const createRecorder = useCallback((
    cameraId: string,
    stream: MediaStream,
    fps: number = 60
  ): MediaRecorder | null => {
    try {
      // Check supported MIME types with high bitrate for 60 FPS
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ]

      let selectedMimeType = ''
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType
          break
        }
      }

      if (!selectedMimeType) {
        console.error('[Recorder] No supported MIME type found')
        return null
      }

      console.log(`[Recorder] ${cameraId}: Using ${selectedMimeType} @ ${fps} FPS`)

      // Higher bitrate for 60 FPS 1080p (10 Mbps for quality)
      const videoBitsPerSecond = fps >= 60 ? 10000000 : 5000000

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond, // 10 Mbps for 60fps, 5 Mbps for 30fps
      })

      return mediaRecorder
    } catch (error) {
      console.error(`[Recorder] Failed to create MediaRecorder for ${cameraId}:`, error)
      return null
    }
  }, [])

  /**
   * Setup MediaRecorder with WebSocket streaming
   */
  const setupRecorderWebSocket = useCallback((
    mediaRecorder: MediaRecorder,
    cameraId: string,
    ws: WebSocket
  ) => {
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            // Send camera selection
            ws.send(JSON.stringify({
              type: 'camera_select',
              camera_id: cameraId
            }))
            
            // Send video chunk
            ws.send(event.data)
          }
        } catch (error) {
          console.error(`[Recorder] ${cameraId}: Send error:`, error)
        }
      }
    }

    mediaRecorder.onerror = (event) => {
      console.error(`[Recorder] ${cameraId}: MediaRecorder error:`, event)
    }

    mediaRecorder.onstart = () => {
      console.log(`[Recorder] ${cameraId}: Recording started`)
    }

    mediaRecorder.onstop = () => {
      console.log(`[Recorder] ${cameraId}: Recording stopped`)
    }
  }, [])

  /**
   * Setup MediaRecorder with HTTP fallback
   */
  const setupRecorderHTTP = useCallback((
    mediaRecorder: MediaRecorder,
    cameraId: string,
    sessionId: string
  ) => {
    let chunkCounter = 0

    mediaRecorder.ondataavailable = async (event) => {
      if (event.data && event.data.size > 0) {
        chunkCounter++
        
        try {
          const formData = new FormData()
          formData.append('session_id', sessionId)
          formData.append('camera_id', cameraId)
          formData.append('chunk_data', event.data, `${cameraId}_chunk_${chunkCounter}.webm`)

          const response = await fetch(`${config.apiUrl}/record/chunk`, {
            method: 'POST',
            body: formData
          })

          if (!response.ok) {
            console.warn(`[Recorder] ${cameraId}: Chunk ${chunkCounter} upload failed`)
          }
        } catch (error) {
          console.error(`[Recorder] ${cameraId}: HTTP error:`, error)
        }
      }
    }
  }, [])

  /**
   * Start recording all cameras at specified FPS (default 60)
   */
  const startRecording = useCallback(async (
    cameraStreams: Map<string, { stream: MediaStream | null }>,
    fps: number = 60
  ) => {
    try {
      // Generate session ID
      const sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      sessionIdRef.current = sessionId

      // Start session on backend
      const response = await fetch(`${config.apiUrl}/record/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, fps })
      })

      if (!response.ok) {
        throw new Error(`Backend error: ${response.statusText}`)
      }

      onLog?.(`Recording session started (60 FPS)`, 'info')

      // Connect WebSocket
      const ws = await connectWebSocket(sessionId, fps)
      wsRef.current = ws

      // Create recorders for each camera
      let successCount = 0
      for (const [cameraId, { stream }] of cameraStreams.entries()) {
        if (!stream) {
          console.warn(`[Recorder] ${cameraId}: No stream available`)
          continue
        }

        const mediaRecorder = createRecorder(cameraId, stream, fps)
        if (!mediaRecorder) {
          console.warn(`[Recorder] ${cameraId}: Failed to create recorder`)
          continue
        }

        // Setup handlers
        if (ws && ws.readyState === WebSocket.OPEN) {
          setupRecorderWebSocket(mediaRecorder, cameraId, ws)
        } else {
          setupRecorderHTTP(mediaRecorder, cameraId, sessionId)
        }

        // Start recording
        // Request chunks more frequently for 60 FPS (every 500ms for smoother recording)
        mediaRecorder.start(500)

        recordersRef.current.set(cameraId, {
          mediaRecorder,
          cameraId
        })
        
        successCount++
      }

      if (successCount > 0) {
        setIsRecording(true)
        onLog?.(`Recording: ${successCount} camera(s) @ ${fps} FPS`, 'success')
        return true
      } else {
        throw new Error('No cameras could be started')
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      onLog?.(`Failed to start recording: ${message}`, 'error')
      return false
    }
  }, [connectWebSocket, createRecorder, setupRecorderWebSocket, setupRecorderHTTP, onLog])

  /**
   * Stop recording all cameras
   */
  const stopRecording = useCallback(async () => {
    try {
      if (!sessionIdRef.current) {
        onLog?.('No active recording session', 'warning')
        return false
      }

      const sessionId = sessionIdRef.current

      // Stop all recorders
      for (const recorder of recordersRef.current.values()) {
        if (recorder.mediaRecorder.state !== 'inactive') {
          recorder.mediaRecorder.stop()
        }
      }

      // Wait for final chunks
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Close WebSocket
      cleanupWebSocket()

      // Stop recording on backend
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
      const cameraCount = data.cameras ? Object.keys(data.cameras).length : 0

      setIsRecording(false)
      recordersRef.current.clear()
      sessionIdRef.current = null

      onLog?.(
        `Recording stopped. Duration: ${duration.toFixed(1)}s, Cameras: ${cameraCount}`,
        'success'
      )

      return true

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      onLog?.(`Failed to stop recording: ${message}`, 'error')
      return false
    }
  }, [cleanupWebSocket, onLog])

  return {
    isRecording,
    startRecording,
    stopRecording,
    sessionId: sessionIdRef.current,
    isWebSocketConnected: isWebSocketConnected()
  }
}