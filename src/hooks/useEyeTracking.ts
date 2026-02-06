/**
 * Hook for Real-Time Eye Tracking
 * Sends frames to backend and receives gaze data
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import config from '../config'

interface GazeData {
  gaze: {
    x: number
    y: number
    raw_x: number
    raw_y: number
  }
  head_pose: {
    pitch: number
    yaw: number
    roll: number
  }
  eye_metrics: {
    ear: number
    perclos: number
    blink_rate: number
    is_closed: boolean
  }
  fixation: {
    duration: number
    saccade: number
    area: string | null
  }
  alert: {
    level: string
    status_text: string
    is_nodding: boolean
    nod_duration: number
  }
  distance_m: number
  timestamp: string
}

interface EyeTrackingHookProps {
  sessionId: string
  cameraId: string
  onLog?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  onGazeData?: (data: GazeData) => void
}

export function useEyeTracking({ sessionId, cameraId, onLog, onGazeData }: EyeTrackingHookProps) {
  const [isTracking, setIsTracking] = useState(false)
  const [latestGazeData, setLatestGazeData] = useState<GazeData | null>(null)
  const [alertLevel, setAlertLevel] = useState<'normal' | 'warning' | 'danger' | 'critical'>('normal')
  
  const wsRef = useRef<WebSocket | null>(null)
  const trackingIntervalRef = useRef<number | null>(null)
  const isConnectedRef = useRef(false)

  /**
   * Connect WebSocket for eye tracking (per-camera)
   */
  const connectWebSocket = useCallback(() => {
    if (wsRef.current) return

    try {
      let baseUrl = config.wsUrl
      if (baseUrl.endsWith('/ws')) {
        baseUrl = baseUrl.slice(0, -3)
      }
      
      // Backend format: /ws/record/{camera_id}/{session_id}
      const wsUrl = `${baseUrl}/ws/record/${cameraId}/${sessionId}`
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log('[EyeTracking] WebSocket connected')
        isConnectedRef.current = true
        onLog?.('Eye tracking: Connected to backend', 'success')
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          
          if (message.type === 'tracking_result' && message.data) {
            const gazeData: GazeData = message.data
            setLatestGazeData(gazeData)
            setAlertLevel(gazeData.alert.level as any)
            
            // Callback
            if (onGazeData) {
              onGazeData(gazeData)
            }
            
            // Log alerts
            if (gazeData.alert.level === 'danger' || gazeData.alert.level === 'critical') {
              onLog?.(gazeData.alert.status_text, 'warning')
            }
          }
        } catch (error) {
          console.error('[EyeTracking] Message parse error:', error)
        }
      }

      ws.onerror = (error) => {
        console.error('[EyeTracking] WebSocket error:', error)
        onLog?.('Eye tracking: Connection error', 'error')
      }

      ws.onclose = () => {
        console.log('[EyeTracking] WebSocket closed')
        isConnectedRef.current = false
        wsRef.current = null
      }

      wsRef.current = ws

    } catch (error) {
      console.error('[EyeTracking] Connection failed:', error)
      onLog?.('Eye tracking: Failed to connect', 'error')
    }
  }, [sessionId, cameraId, onLog, onGazeData])

  /**
   * Disconnect WebSocket
   */
  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close()
      } catch (error) {
        // Ignore
      }
      wsRef.current = null
      isConnectedRef.current = false
    }
  }, [])

  /**
   * Send frame for tracking
   */
  const sendTrackingFrame = useCallback((videoElement: HTMLVideoElement) => {
    if (!wsRef.current || !isConnectedRef.current) return

    try {
      // Capture frame
      const canvas = document.createElement('canvas')
      canvas.width = videoElement.videoWidth
      canvas.height = videoElement.videoHeight
      
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      
      ctx.drawImage(videoElement, 0, 0)
      const frameBase64 = canvas.toDataURL('image/jpeg', 0.8)

      // Send to backend
      wsRef.current.send(JSON.stringify({
        type: 'tracking_frame',
        frame: frameBase64
      }))

    } catch (error) {
      console.error('[EyeTracking] Send frame error:', error)
    }
  }, [])

  /**
   * Start eye tracking
   */
  const startTracking = useCallback((videoElement: HTMLVideoElement) => {
    if (isTracking) return

    connectWebSocket()
    setIsTracking(true)
    
    // Send frames at tracking FPS (10 FPS default)
    const interval = setInterval(() => {
      if (isConnectedRef.current && videoElement) {
        sendTrackingFrame(videoElement)
      }
    }, 1000 / config.camera.trackingFps)
    
    trackingIntervalRef.current = interval as any
    
    onLog?.('Eye tracking started', 'success')
  }, [isTracking, connectWebSocket, sendTrackingFrame, onLog])

  /**
   * Stop eye tracking
   */
  const stopTracking = useCallback(() => {
    if (!isTracking) return

    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current)
      trackingIntervalRef.current = null
    }

    disconnectWebSocket()
    setIsTracking(false)
    setLatestGazeData(null)
    setAlertLevel('normal')
    
    onLog?.('Eye tracking stopped', 'info')
  }, [isTracking, disconnectWebSocket, onLog])

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      stopTracking()
    }
  }, [])

  return {
    // State
    isTracking,
    latestGazeData,
    alertLevel,
    isConnected: isConnectedRef.current,
    
    // Methods
    startTracking,
    stopTracking,
    sendTrackingFrame
  }
}