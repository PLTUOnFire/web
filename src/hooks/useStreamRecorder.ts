import { useRef, useCallback, useState } from 'react'
import config from '../config'

interface StreamRecorderProps {
  onLog?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
}

interface CameraRecorder {
  mediaRecorder: MediaRecorder
  cameraId: string
  sessionId: string
  ws: WebSocket | null
}

interface RecordingSession {
  sessionId: string
  cameraId: string
  operatorName: string
  fps: number
}

export function useStreamRecorder({ onLog }: StreamRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const recordingSessions = useRef<Map<string, RecordingSession>>(new Map())
  const recordersRef = useRef<Map<string, CameraRecorder>>(new Map())
  const wsConnectionsRef = useRef<Map<string, WebSocket>>(new Map())

  /**
   * Check if WebSocket is connected for specific camera
   */
  const isWebSocketConnected = useCallback((cameraId: string) => {
    const ws = wsConnectionsRef.current.get(cameraId)
    return ws !== null && 
           ws !== undefined && 
           ws.readyState === WebSocket.OPEN
  }, [])

  /**
   * Cleanup WebSocket connection for specific camera
   */
  const cleanupWebSocket = useCallback((cameraId: string) => {
    const ws = wsConnectionsRef.current.get(cameraId)
    if (ws) {
      try {
        ws.close()
      } catch (error) {
        // Ignore
      } finally {
        wsConnectionsRef.current.delete(cameraId)
      }
    }
  }, [])

  /**
   * Connect to WebSocket for specific camera recording
   * Backend format: /ws/record/{camera_id}/{session_id}
   */
  const connectWebSocket = useCallback((
    cameraId: string,
    sessionId: string,
    fps: number = 60
  ): Promise<WebSocket | null> => {
    return new Promise((resolve) => {
      try {
        cleanupWebSocket(cameraId)

        let baseUrl = config.wsUrl
        if (baseUrl.endsWith('/ws')) {
          baseUrl = baseUrl.slice(0, -3)
        }
        
        const wsUrl = `${baseUrl}/ws/record/${cameraId}/${sessionId}`
        console.log(`[Recorder] ${cameraId}: Connecting to: ${wsUrl}`)
        
        const ws = new WebSocket(wsUrl)

        ws.onopen = () => {
          console.log(`[Recorder] ${cameraId}: WebSocket connected`)
          wsConnectionsRef.current.set(cameraId, ws)
          onLog?.(`${cameraId}: WebSocket streaming at ${fps} FPS`, 'success')
          resolve(ws)
        }

        ws.onerror = (error) => {
          console.error(`[Recorder] ${cameraId}: WebSocket error:`, error)
          onLog?.(`${cameraId}: WebSocket error, will use HTTP fallback`, 'warning')
          resolve(null)
        }

        ws.onclose = () => {
          console.log(`[Recorder] ${cameraId}: WebSocket closed`)
          wsConnectionsRef.current.delete(cameraId)
        }

        // Timeout fallback
        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            ws.close()
            resolve(null)
          }
        }, 3000)

      } catch (error) {
        console.error(`[Recorder] ${cameraId}: Connection failed:`, error)
        resolve(null)
      }
    })
  }, [cleanupWebSocket, onLog])

  /**
   * Setup MediaRecorder with WebSocket streaming (per-camera)
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
            // Send frame_info JSON first, then binary data
            ws.send(JSON.stringify({
              type: 'frame_info',
              camera_id: cameraId
            }))
            
            // Send video chunk as binary
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
      console.log(`[Recorder] ${cameraId}: Recording started @ ${mediaRecorder.mimeType}`)
    }

    mediaRecorder.onstop = () => {
      console.log(`[Recorder] ${cameraId}: Recording stopped`)
    }
  }, [])

  /**
   * Setup MediaRecorder with HTTP fallback (per-camera)
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
   * Start recording for a single camera (per-operator session)
   */
  const startRecording = useCallback(async (
    cameraId: string,
    stream: MediaStream | null,
    operatorName: string,
    fps: number = 60,
    sessionId?: string
  ) => {
    try {
      if (!stream) {
        onLog?.(`${cameraId}: No stream available`, 'warning')
        return { success: false, sessionId: null }
      }

      // Use provided sessionId or generate new one
      const actualSessionId = sessionId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      // Start session on backend for this camera
      const response = await fetch(`${config.apiUrl}/record/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: actualSessionId,
          camera_id: cameraId,
          operator_name: operatorName,
          fps
        })
      })

      if (!response.ok) {
        throw new Error(`Backend error: ${response.statusText}`)
      }

      // Store recording session
      recordingSessions.current.set(cameraId, {
        sessionId: actualSessionId,
        cameraId,
        operatorName,
        fps
      })

      onLog?.(`${cameraId} (${operatorName}): Recording session started @ ${fps} FPS`, 'info')

      // Connect WebSocket for this camera
      const ws = await connectWebSocket(cameraId, actualSessionId, fps)

      // Create recorder for this camera
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9,opus',
        videoBitsPerSecond: fps >= 60 ? 10000000 : 5000000
      })

      // Setup handlers
      if (ws && ws.readyState === WebSocket.OPEN) {
        setupRecorderWebSocket(mediaRecorder, cameraId, ws)
      } else {
        setupRecorderHTTP(mediaRecorder, cameraId, actualSessionId)
      }

      // Start recording
      mediaRecorder.start(500)

      recordersRef.current.set(cameraId, {
        mediaRecorder,
        cameraId,
        sessionId: actualSessionId,
        ws: ws || null
      })

      setIsRecording(true)
      onLog?.(`${cameraId}: Recording started`, 'success')
      return { success: true, sessionId: actualSessionId }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      onLog?.(`${cameraId}: Failed to start recording: ${message}`, 'error')
      return { success: false, sessionId: null }
    }
  }, [connectWebSocket, setupRecorderWebSocket, setupRecorderHTTP, onLog])

  /**
   * Stop recording for a single camera
   */
  const stopRecording = useCallback(async (cameraId: string) => {
    try {
      const recorder = recordersRef.current.get(cameraId)
      const session = recordingSessions.current.get(cameraId)

      if (!recorder || !session) {
        onLog?.(`${cameraId}: No active recording`, 'warning')
        return false
      }

      // Stop MediaRecorder
      if (recorder.mediaRecorder.state !== 'inactive') {
        recorder.mediaRecorder.stop()
      }

      // Wait for final chunks
      await new Promise(resolve => setTimeout(resolve, 500))

      // Close WebSocket for this camera
      cleanupWebSocket(cameraId)

      // Stop recording on backend
      const response = await fetch(`${config.apiUrl}/record/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.sessionId,
          camera_id: cameraId
        })
      })

      if (!response.ok) {
        throw new Error(`Backend error: ${response.statusText}`)
      }

      const data = await response.json()
      const duration = data.duration_seconds || 0

      recordersRef.current.delete(cameraId)
      recordingSessions.current.delete(cameraId)

      // Check if any cameras still recording
      if (recordersRef.current.size === 0) {
        setIsRecording(false)
      }

      onLog?.(`${cameraId}: Recording stopped (${duration.toFixed(1)}s)`, 'success')
      return true

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      onLog?.(`${cameraId}: Failed to stop recording: ${message}`, 'error')
      return false
    }
  }, [cleanupWebSocket, onLog])

  return {
    isRecording,
    startRecording,
    stopRecording,
    recordingSessions: recordingSessions.current,
    isWebSocketConnected,
    getRecordingSessionId: (cameraId: string) => recordingSessions.current.get(cameraId)?.sessionId || null
  }
}