/**
 * Hook for Real-Time Eye Tracking (Multi-Camera)
 * Manages WebSocket connections and frame sending for all cameras
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import config from '../config'

export interface GazeData {
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

interface CameraTrackingConfig {
  cameraId: string
  sessionId: string
  videoRef: React.RefObject<HTMLVideoElement>
}

interface EyeTrackingHookProps {
  cameras: CameraTrackingConfig[]
  onLog?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  onGazeData?: (cameraId: string, data: GazeData) => void
}

export function useEyeTracking({ cameras, onLog, onGazeData }: EyeTrackingHookProps) {
  const [isTracking, setIsTracking] = useState(false)
  const [gazeDataMap, setGazeDataMap] = useState<Record<string, GazeData>>({})
  const [alertLevels, setAlertLevels] = useState<Record<string, 'normal' | 'warning' | 'danger' | 'critical'>>({})

  const wsMapRef = useRef<Record<string, WebSocket>>({})
  const connectedMapRef = useRef<Record<string, boolean>>({})
  const intervalsRef = useRef<Record<string, number>>({})

  /**
   * Get active cameras that have sessionId and active video
   */
  const getActiveCameras = useCallback(() => {
    return cameras.filter(cam => {
      const video = cam.videoRef.current
      return video && video.srcObject && video.videoWidth > 0 && cam.sessionId
    })
  }, [cameras])

  /**
   * Connect WebSocket for a single camera
   */
  const connectCamera = useCallback((cam: CameraTrackingConfig) => {
    if (wsMapRef.current[cam.cameraId]) return

    try {
      let baseUrl = config.wsUrl
      if (baseUrl.endsWith('/ws')) {
        baseUrl = baseUrl.slice(0, -3)
      }

      const wsUrl = `${baseUrl}/ws/record/${cam.cameraId}/${cam.sessionId}`
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log(`[EyeTracking] ${cam.cameraId}: WebSocket connected`)
        connectedMapRef.current[cam.cameraId] = true
        onLog?.(`${cam.cameraId}: Eye tracking connected`, 'success')
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)

          if (message.type === 'tracking_result' && message.data) {
            const gazeData: GazeData = message.data

            setGazeDataMap(prev => ({ ...prev, [cam.cameraId]: gazeData }))
            setAlertLevels(prev => ({ ...prev, [cam.cameraId]: gazeData.alert.level as any }))

            onGazeData?.(cam.cameraId, gazeData)

            if (gazeData.alert.level === 'danger' || gazeData.alert.level === 'critical') {
              onLog?.(`${cam.cameraId}: ${gazeData.alert.status_text}`, 'warning')
            }
          }
        } catch (error) {
          console.error(`[EyeTracking] ${cam.cameraId}: Message parse error:`, error)
        }
      }

      ws.onerror = (error) => {
        console.error(`[EyeTracking] ${cam.cameraId}: WebSocket error:`, error)
        onLog?.(`${cam.cameraId}: Eye tracking connection error`, 'error')
      }

      ws.onclose = () => {
        console.log(`[EyeTracking] ${cam.cameraId}: WebSocket closed`)
        connectedMapRef.current[cam.cameraId] = false
        delete wsMapRef.current[cam.cameraId]
      }

      wsMapRef.current[cam.cameraId] = ws
    } catch (error) {
      console.error(`[EyeTracking] ${cam.cameraId}: Connection failed:`, error)
      onLog?.(`${cam.cameraId}: Eye tracking failed to connect`, 'error')
    }
  }, [onLog, onGazeData])

  /**
   * Disconnect WebSocket for a single camera
   */
  const disconnectCamera = useCallback((cameraId: string) => {
    const ws = wsMapRef.current[cameraId]
    if (ws) {
      try { ws.close() } catch { /* ignore */ }
      delete wsMapRef.current[cameraId]
      connectedMapRef.current[cameraId] = false
    }
  }, [])

  /**
   * Disconnect all WebSockets
   */
  const disconnectAll = useCallback(() => {
    Object.keys(wsMapRef.current).forEach(disconnectCamera)
  }, [disconnectCamera])

  /**
   * Send frame for a single camera
   */
  const sendFrame = useCallback((cameraId: string, videoElement: HTMLVideoElement) => {
    const ws = wsMapRef.current[cameraId]
    if (!ws || !connectedMapRef.current[cameraId]) return

    try {
      const canvas = document.createElement('canvas')
      canvas.width = videoElement.videoWidth
      canvas.height = videoElement.videoHeight

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(videoElement, 0, 0)
      const frameBase64 = canvas.toDataURL('image/jpeg', 0.8)

      ws.send(JSON.stringify({
        type: 'tracking_frame',
        frame: frameBase64
      }))
    } catch (error) {
      console.error(`[EyeTracking] ${cameraId}: Send frame error:`, error)
    }
  }, [])

  /**
   * Start eye tracking for all active cameras
   */
  const startTracking = useCallback(() => {
    if (isTracking) return

    const activeCameras = getActiveCameras()
    if (activeCameras.length === 0) {
      onLog?.('No active cameras with sessions to track', 'warning')
      return
    }

    onLog?.(`Starting eye tracking for ${activeCameras.length} camera(s): ${activeCameras.map(c => c.cameraId).join(', ')}`, 'info')

    // Connect WebSocket + start frame interval for each camera
    for (const cam of activeCameras) {
      connectCamera(cam)

      const videoElement = cam.videoRef.current
      if (videoElement) {
        const interval = setInterval(() => {
          if (connectedMapRef.current[cam.cameraId] && videoElement) {
            sendFrame(cam.cameraId, videoElement)
          }
        }, 1000 / config.camera.trackingFps)

        intervalsRef.current[cam.cameraId] = interval as any
      }
    }

    setIsTracking(true)
    onLog?.(`Eye tracking started for ${activeCameras.length} camera(s)`, 'success')
  }, [isTracking, getActiveCameras, connectCamera, sendFrame, onLog])

  /**
   * Stop eye tracking for all cameras
   */
  const stopTracking = useCallback(() => {
    if (!isTracking) return

    // Clear all intervals
    Object.entries(intervalsRef.current).forEach(([, interval]) => {
      clearInterval(interval)
    })
    intervalsRef.current = {}

    // Disconnect all WebSockets
    disconnectAll()

    setIsTracking(false)
    setGazeDataMap({})
    setAlertLevels({})

    onLog?.('Eye tracking stopped', 'info')
  }, [isTracking, disconnectAll, onLog])

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      Object.values(intervalsRef.current).forEach(interval => clearInterval(interval))
      intervalsRef.current = {}
      Object.keys(wsMapRef.current).forEach(camId => {
        try { wsMapRef.current[camId]?.close() } catch { /* ignore */ }
      })
      wsMapRef.current = {}
      connectedMapRef.current = {}
    }
  }, [])

  // Compute worst alert level across all cameras
  const worstAlertLevel = Object.values(alertLevels).reduce<'normal' | 'warning' | 'danger' | 'critical'>((worst, level) => {
    const order = { normal: 0, warning: 1, danger: 2, critical: 3 }
    return order[level] > order[worst] ? level : worst
  }, 'normal')

  return {
    isTracking,
    gazeDataMap,
    alertLevels,
    worstAlertLevel,
    startTracking,
    stopTracking
  }
}
