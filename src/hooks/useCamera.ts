/**
 * Hook for Camera Management (Multi-Operator)
 * Each camera = 1 operator with independent session
 */

import { useState, useRef, useCallback } from 'react'

interface CameraMetrics {
  drowsy: number
  stress: number
  confidence: number
}

interface Camera {
  active: boolean
  fps: number
  metrics: CameraMetrics
  face: boolean
  selectedDeviceId?: string
  operatorName?: string
  recording?: boolean
  sessionId?: string
  calibrated?: boolean
  tracking?: boolean
}

interface CameraDevice {
  deviceId: string
  label: string
}

export function useCamera() {
  const [cameras, setCameras] = useState<Record<string, Camera>>({
    cam1: {
      active: false,
      fps: 60,
      metrics: { drowsy: 0, stress: 0, confidence: 0 },
      face: false,
      operatorName: 'Operator-1',
      recording: false,
      calibrated: false,
      tracking: false
    },
    cam2: {
      active: false,
      fps: 60,
      metrics: { drowsy: 0, stress: 0, confidence: 0 },
      face: false,
      operatorName: 'Operator-2',
      recording: false,
      calibrated: false,
      tracking: false
    },
    cam3: {
      active: false,
      fps: 60,
      metrics: { drowsy: 0, stress: 0, confidence: 0 },
      face: false,
      operatorName: 'Operator-3',
      recording: false,
      calibrated: false,
      tracking: false
    }
  })

  const [availableDevices, setAvailableDevices] = useState<CameraDevice[]>([])

  // Refs for video elements
  const videoRefs = {
    cam1: useRef<HTMLVideoElement>(null),
    cam2: useRef<HTMLVideoElement>(null),
    cam3: useRef<HTMLVideoElement>(null)
  }

  // Refs for canvas elements (for drawing overlays)
  const canvasRefs = {
    cam1: useRef<HTMLCanvasElement>(null),
    cam2: useRef<HTMLCanvasElement>(null),
    cam3: useRef<HTMLCanvasElement>(null)
  }

  // Ref to store actual MediaStream objects
  const streamsRef = useRef<Record<string, MediaStream | null>>({
    cam1: null,
    cam2: null,
    cam3: null
  })

  /**
   * Get available camera devices
   */
  const getAvailableDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${device.deviceId.slice(0, 5)}`
        }))

      setAvailableDevices(videoDevices)
      return videoDevices
    } catch (error) {
      console.error('Error getting devices:', error)
      return []
    }
  }, [])

  /**
   * Check if a device is already in use
   */
  const isDeviceInUse = useCallback((deviceId: string): string | null => {
    for (const [camId, camera] of Object.entries(cameras)) {
      if (camera.active && camera.selectedDeviceId === deviceId) {
        return camId
      }
    }
    return null
  }, [cameras])

  /**
   * Set selected device for a camera
   */
  const setSelectedDevice = useCallback((camId: string, deviceId: string) => {
    setCameras(prev => ({
      ...prev,
      [camId]: {
        ...prev[camId],
        selectedDeviceId: deviceId
      }
    }))
  }, [])

  /**
   * Set operator name for a camera
   */
  const setOperatorName = useCallback((camId: string, name: string) => {
    setCameras(prev => ({
      ...prev,
      [camId]: {
        ...prev[camId],
        operatorName: name
      }
    }))
  }, [])

  /**
   * Set recording status for a camera
   */
  const setRecording = useCallback((camId: string, recording: boolean, sessionId?: string) => {
    setCameras(prev => ({
      ...prev,
      [camId]: {
        ...prev[camId],
        recording,
        sessionId: recording ? sessionId : undefined
      }
    }))
  }, [])

  /**
   * Set calibration status for a camera
   */
  const setCalibrated = useCallback((camId: string, calibrated: boolean) => {
    setCameras(prev => ({
      ...prev,
      [camId]: {
        ...prev[camId],
        calibrated
      }
    }))
  }, [])

  /**
   * Set tracking status for a camera
   */
  const setTracking = useCallback((camId: string, tracking: boolean) => {
    setCameras(prev => ({
      ...prev,
      [camId]: {
        ...prev[camId],
        tracking
      }
    }))
  }, [])

  /**
   * Start a single camera
   */
  const startCamera = useCallback(async (camId: string, deviceId?: string) => {
    try {
      // Get device ID - try explicit, then selected, then first available
      let targetDeviceId = deviceId || cameras[camId].selectedDeviceId

      if (!targetDeviceId) {
        // Auto-select first available device not in use
        const firstAvailable = availableDevices.find(
          device => !isDeviceInUse(device.deviceId) || isDeviceInUse(device.deviceId) === camId
        )
        
        if (!firstAvailable) {
          console.error(`No available device for ${camId}`)
          return false
        }
        
        targetDeviceId = firstAvailable.deviceId
        
        // Update selected device in state
        setCameras(prev => ({
          ...prev,
          [camId]: {
            ...prev[camId],
            selectedDeviceId: targetDeviceId
          }
        }))
        
        console.log(`${camId}: Auto-selected device: ${firstAvailable.label}`)
      }

      // Check if device is in use
      const inUse = isDeviceInUse(targetDeviceId)
      if (inUse && inUse !== camId) {
        console.error(`Device already in use by ${inUse}`)
        return false
      }

      // Stop existing stream if any
      if (streamsRef.current[camId]) {
        streamsRef.current[camId]?.getTracks().forEach(track => track.stop())
        streamsRef.current[camId] = null
      }

      // Request camera with high resolution for 60 FPS
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: { exact: targetDeviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60, max: 60 }
        },
        audio: false
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)

      // Set video element source
      const videoElement = videoRefs[camId as 'cam1' | 'cam2' | 'cam3']?.current
      if (videoElement) {
        videoElement.srcObject = stream
        await videoElement.play()

        // Get actual FPS
        const track = stream.getVideoTracks()[0]
        const settings = track.getSettings()
        const actualFps = settings.frameRate || 60

        // Store stream
        streamsRef.current[camId] = stream

        // Update camera state
        setCameras(prev => ({
          ...prev,
          [camId]: {
            ...prev[camId],
            active: true,
            fps: actualFps,
            selectedDeviceId: targetDeviceId
          }
        }))

        console.log(`${camId} started @ ${actualFps} FPS`)
        return true
      }

      return false
    } catch (error) {
      console.error(`Error starting ${camId}:`, error)
      return false
    }
  }, [cameras, availableDevices, isDeviceInUse, videoRefs])

  /**
   * Stop a single camera
   */
  const stopCamera = useCallback((camId: string) => {
    // Stop stream
    if (streamsRef.current[camId]) {
      streamsRef.current[camId]?.getTracks().forEach(track => track.stop())
      streamsRef.current[camId] = null
    }

    // Clear video element
    const videoElement = videoRefs[camId as 'cam1' | 'cam2' | 'cam3']?.current
    if (videoElement) {
      videoElement.srcObject = null
    }

    // Update state
    setCameras(prev => ({
      ...prev,
      [camId]: {
        ...prev[camId],
        active: false,
        face: false,
        tracking: false
      }
    }))

    console.log(`${camId} stopped`)
  }, [videoRefs])

  /**
   * Start all cameras (deprecated - use per-camera start)
   */
  const startAllCameras = useCallback(async () => {
    // Get devices first
    const devices = await getAvailableDevices()

    if (devices.length === 0) {
      console.error('No camera devices found')
      return false
    }

    // Just get devices, don't auto-start
    return true
  }, [getAvailableDevices])

  /**
   * Stop all cameras
   */
  const stopAllCameras = useCallback(() => {
    Object.keys(cameras).forEach(camId => {
      if (cameras[camId].active && !cameras[camId].recording) {
        stopCamera(camId)
      }
    })
  }, [cameras, stopCamera])

  /**
   * Update camera metrics
   */
  const updateCameraMetrics = useCallback((camId: string, metrics: Partial<CameraMetrics>) => {
    setCameras(prev => ({
      ...prev,
      [camId]: {
        ...prev[camId],
        metrics: {
          ...prev[camId].metrics,
          ...metrics
        }
      }
    }))
  }, [])

  /**
   * Update camera face detection
   */
  const updateCameraFace = useCallback((camId: string, face: boolean) => {
    setCameras(prev => ({
      ...prev,
      [camId]: {
        ...prev[camId],
        face
      }
    }))
  }, [])

  /**
   * Generate session ID for camera
   */
  const generateSessionId = useCallback((camId: string) => {
    return `${camId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }, [])

  return {
    cameras,
    availableDevices,
    videoRefs,
    canvasRefs,
    streamsRef,
    getAvailableDevices,
    setSelectedDevice,
    setOperatorName,
    setRecording,
    setCalibrated,
    setTracking,
    isDeviceInUse,
    startCamera,
    stopCamera,
    startAllCameras,
    stopAllCameras,
    updateCameraMetrics,
    updateCameraFace,
    generateSessionId
  }
}