import { useState, useRef, useCallback } from 'react'
import config from '../config'

interface Camera {
  active: boolean
  fps: number
  metrics: {
    drowsy: number
    stress: number
    confidence: number
  }
  face: boolean
  selectedDeviceId?: string
}

interface CameraDevice {
  deviceId: string
  label: string
  index?: number
}

interface CameraRefs {
  [key: string]: React.RefObject<HTMLVideoElement>
}

interface CanvasRefs {
  [key: string]: React.RefObject<HTMLCanvasElement>
}

interface StreamsRef {
  [key: string]: MediaStream | undefined
}

interface FPSIntervalsRef {
  [key: string]: number
}

export function useCamera() {
  const [cameras, setCameras] = useState<Record<string, Camera>>({
    cam1: { active: false, fps: 0, metrics: { drowsy: 0, stress: 0, confidence: 0 }, face: false },
    cam2: { active: false, fps: 0, metrics: { drowsy: 0, stress: 0, confidence: 0 }, face: false },
    cam3: { active: false, fps: 0, metrics: { drowsy: 0, stress: 0, confidence: 0 }, face: false }
  })

  const [availableDevices, setAvailableDevices] = useState<CameraDevice[]>([])

  const videoRefs: CameraRefs = {
    cam1: useRef(null),
    cam2: useRef(null),
    cam3: useRef(null)
  }

  const canvasRefs: CanvasRefs = {
    cam1: useRef(null),
    cam2: useRef(null),
    cam3: useRef(null)
  }

  const streamsRef = useRef<StreamsRef>({})
  const fpsIntervalsRef = useRef<FPSIntervalsRef>({})
  
  // Track AbortControllers for each camera to cancel pending getUserMedia calls
  const abortControllersRef = useRef<Record<string, AbortController>>({
    cam1: new AbortController(),
    cam2: new AbortController(),
    cam3: new AbortController()
  })

  // Enumerate available camera devices
  const getAvailableDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices
        .filter(d => d.kind === 'videoinput')
        .map((d, index) => {
          // Create unique label including index if devices have same ID
          const baseLabel = d.label || `Camera ${d.deviceId.slice(0, 5)}`
          const fullLabel = `${baseLabel} [ID: ${d.deviceId.slice(0, 8)}...]`
          return {
            deviceId: d.deviceId,
            label: fullLabel,
            index: index
          }
        })
      
      // Log device details untuk debugging
      console.log('Available Devices:', videoDevices)
      videoDevices.forEach((dev, idx) => {
        console.log(`Device ${idx + 1}: ${dev.label}`)
      })
      
      setAvailableDevices(videoDevices)
      return videoDevices
    } catch (error) {
      console.error('Failed to enumerate devices:', error)
      return []
    }
  }, [])

  // Set selected device for a camera
  const setSelectedDevice = useCallback((camId: string, deviceId: string) => {
    setCameras(prev => ({
      ...prev,
      [camId]: { ...prev[camId], selectedDeviceId: deviceId }
    }))
  }, [])

  // Update camera metrics
  const updateCameraMetrics = useCallback((camId: string, metrics: Partial<Camera['metrics']>) => {
    setCameras(prev => ({
      ...prev,
      [camId]: {
        ...prev[camId],
        metrics: { ...prev[camId].metrics, ...metrics }
      }
    }))
  }, [])

  // Update camera face detection
  const updateCameraFace = useCallback((camId: string, face: boolean) => {
    setCameras(prev => ({
      ...prev,
      [camId]: { ...prev[camId], face }
    }))
  }, [])

  // Update camera FPS
  const updateCameraFPS = useCallback((camId: string, fps: number) => {
    setCameras(prev => ({
      ...prev,
      [camId]: { ...prev[camId], fps }
    }))
  }, [])

  // Set camera active state
  const setCameraActive = useCallback((camId: string, active: boolean) => {
    setCameras(prev => ({
      ...prev,
      [camId]: { ...prev[camId], active }
    }))
  }, [])

  // Start FPS counter
  const startFPSCounter = useCallback((camId: string) => {
    let lastTime = Date.now()
    let frames = 0

    const updateFPS = () => {
      frames++
      const now = Date.now()
      const elapsed = now - lastTime

      if (elapsed >= 1000) {
        const fps = Math.round((frames * 1000) / elapsed)
        // Update directly without dependency
        setCameras(prev => ({
          ...prev,
          [camId]: { ...prev[camId], fps }
        }))
        frames = 0
        lastTime = now
      }

      if (streamsRef.current[camId]) {
        fpsIntervalsRef.current[camId] = requestAnimationFrame(updateFPS)
      }
    }

    updateFPS()
  }, [])

  // Check if device is already in use by another camera
  const isDeviceInUse = useCallback((targetDeviceId: string, excludeCamId?: string) => {
    for (const [camId, camera] of Object.entries(cameras)) {
      if (excludeCamId && camId === excludeCamId) continue
      // Only prevent if EXACT same device is being used by another active camera
      // For cameras with same device ID (identical models), allow both to try
      if (camera.selectedDeviceId === targetDeviceId && camera.active) {
        return camId
      }
    }
    return null
  }, [cameras])

  // Start individual camera dengan retry logic
  const startCamera = useCallback(async (camId: string, deviceId?: string, retryCount = 0) => {
    const MAX_RETRIES = 3
    const RETRY_DELAY = 1000 // 1 second
    
    try {
      // Cancel any pending operations from previous calls
      const currentAbortController = abortControllersRef.current[camId]
      if (currentAbortController) {
        console.log(`[${camId}] Aborting previous operations...`)
        currentAbortController.abort()
        // Give abort signal time to propagate
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      // Create new AbortController for this attempt
      abortControllersRef.current[camId] = new AbortController()
      const newAbortController = abortControllersRef.current[camId]
      
      console.log(`[${camId}] Starting fresh (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`)
      
      // Stop existing stream first - cleanup old streams immediately
      const video = videoRefs[camId].current
      if (streamsRef.current[camId]) {
        const oldStream = streamsRef.current[camId]
        console.log(`[${camId}] Stopping old stream...`)
        
        // Immediately detach video from old stream to prevent issues
        if (video) {
          video.srcObject = null
        }
        
        // Stop all tracks
        oldStream?.getTracks().forEach(track => {
          try {
            track.stop()
            console.log(`[${camId}] Stopped track`)
          } catch (e) {
            console.warn(`[${camId}] Error stopping track:`, e)
          }
        })
        delete streamsRef.current[camId]
      }

      // Cancel any FPS counter that was running
      if (fpsIntervalsRef.current[camId]) {
        cancelAnimationFrame(fpsIntervalsRef.current[camId])
        delete fpsIntervalsRef.current[camId]
      }

      // Use provided deviceId first, then fallback to selected device
      let selectedDeviceId = deviceId
      if (!selectedDeviceId && cameras[camId]) {
        selectedDeviceId = cameras[camId].selectedDeviceId
        console.log(`[${camId}] Got selectedDeviceId from state: ${selectedDeviceId}`)
      }
      
      if (!selectedDeviceId) {
        throw new Error(`No device ID provided for ${camId}`)
      }
      
      console.log(`[${camId}] Attempting to start with device: ${selectedDeviceId.slice(0, 8)}... (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`)
      
      // Smart frame rate based on camera number for USB stability at 1080p
      const frameRate = camId === 'cam3' ? 30 : 45 // cam3 gets 30fps, others get 45fps
      
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: { exact: selectedDeviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: frameRate, max: frameRate }
        }
      }

      console.log(`[${camId}] Constraints applied (${frameRate}fps)`)
      
      // Check if this operation was aborted before we proceed
      if (newAbortController.signal.aborted) {
        console.log(`[${camId}] Operation cancelled before getUserMedia`)
        return false
      }
      
      // Add timeout for getUserMedia with better error handling
      let timeoutId: NodeJS.Timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('getUserMedia timeout after 10 seconds'))
        }, 10000)
      })
      
      console.log(`[${camId}] Calling getUserMedia...`)
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia(constraints),
        timeoutPromise
      ])
      
      // Clear timeout since we got a response
      clearTimeout(timeoutId!)
      
      // Check again if operation was aborted while waiting
      if (newAbortController.signal.aborted) {
        console.log(`[${camId}] Operation cancelled after getUserMedia, stopping stream`)
        stream.getTracks().forEach(track => track.stop())
        return false
      }
      
      console.log(`[${camId}] Stream started successfully`)

      if (video && !newAbortController.signal.aborted) {
        // Setup a cleanup handler for when abort signal fires
        const cleanup = () => {
          console.log(`[${camId}] Abort signal detected, cleaning up video element`)
          if (video.srcObject === stream) {
            video.srcObject = null
          }
          // Also set camera to inactive when abort happens
          setCameraActive(camId, false)
          stream.getTracks().forEach(track => {
            try {
              track.stop()
            } catch (e) {
              console.warn(`[${camId}] Error stopping track during cleanup:`, e)
            }
          })
        }

        // Register cleanup when abort fires
        newAbortController.signal.addEventListener('abort', cleanup, { once: true })

        // Only attach stream if not already aborted
        console.log(`[${camId}] Attaching stream to video element...`)
        video.srcObject = stream
        streamsRef.current[camId] = stream

        // Setup metadata listener with abort awareness
        const metadataHandler = () => {
          // Only process if operation is not aborted
          if (!newAbortController.signal.aborted) {
            console.log(`[${camId}] Video metadata loaded - ${video.videoWidth}x${video.videoHeight}`)
            const canvas = canvasRefs[camId].current
            if (canvas) {
              canvas.width = video.videoWidth
              canvas.height = video.videoHeight
            }
            // IMPORTANT: Set camera active only AFTER metadata is loaded
            setCameraActive(camId, true)
            // Also auto-select the device in dropdown if not already selected
            const currentDevice = cameras[camId as 'cam1' | 'cam2' | 'cam3']?.selectedDeviceId
            if (!currentDevice) {
              // Get the device ID from the stream tracks
              const videoTrack = stream.getVideoTracks()[0]
              const trackDeviceId = videoTrack?.getSettings().deviceId || videoTrack?.getCapabilities().deviceId
              if (trackDeviceId) {
                setSelectedDevice(camId, trackDeviceId)
                console.log(`[${camId}] Auto-selected device in dropdown: ${trackDeviceId.slice(0, 8)}...`)
              }
            }
            startFPSCounter(camId)
          } else {
            console.log(`[${camId}] Metadata loaded but operation already aborted, ignoring`)
          }
        }

        video.addEventListener('loadedmetadata', metadataHandler, { once: true })

        // If abort fires before metadata, remove listener
        newAbortController.signal.addEventListener('abort', () => {
          video.removeEventListener('loadedmetadata', metadataHandler)
        }, { once: true })

        return true
      } else {
        console.log(`[${camId}] Video element not available or operation aborted`)
        stream.getTracks().forEach(track => track.stop())
        return false
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      // Check if error was due to abort
      if (errorMessage.includes('AbortError') || errorMessage.includes('NotAllowedError')) {
        console.log(`[${camId}] Operation cancelled or denied`)
        return false
      }
      
      console.error(`[${camId}] Failed to start (attempt ${retryCount + 1}):`, errorMessage)
      
      // Retry logic untuk timeout atau temporary errors
      if ((errorMessage.includes('Timeout') || errorMessage.includes('NotReadableError')) && retryCount < MAX_RETRIES) {
        console.log(`[${camId}] Retrying in ${RETRY_DELAY}ms...`)
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
        return startCamera(camId, deviceId, retryCount + 1)
      }
      
      setCameraActive(camId, false)
      return false
    }
  }, [videoRefs, canvasRefs, setCameraActive, startFPSCounter, cameras])

  // Start all cameras
  const startAllCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter(d => d.kind === 'videoinput')

      if (videoDevices.length === 0) {
        console.error('No cameras detected!')
        return false
      }

      // Check if devices are already selected in state, if so use them
      // Otherwise use default assignment: cam1=first, cam2=secondLast, cam3=last
      const maxCameras = Math.min(config.camera.maxCameras, videoDevices.length)
      const camerasToStart: Array<{ camId: string; deviceId: string }> = []
      
      for (let i = 0; i < maxCameras; i++) {
        const camId = `cam${i + 1}`
        const selectedDeviceId = cameras[camId as 'cam1' | 'cam2' | 'cam3']?.selectedDeviceId
        
        // Use selected device if available, otherwise use smart default assignment
        let deviceToUse: string
        
        if (selectedDeviceId) {
          // User has already selected a device for this camera
          deviceToUse = selectedDeviceId
          console.log(`[${camId}] Using pre-selected device: ${selectedDeviceId}`)
        } else {
          // Smart assignment: cam1=first, cam2=secondLast, cam3=last
          let deviceIndex: number
          if (i === 0) {
            deviceIndex = 0 // cam1 gets first device
          } else if (i === 1) {
            deviceIndex = Math.max(0, videoDevices.length - 2) // cam2 gets second-to-last
          } else {
            deviceIndex = videoDevices.length - 1 // cam3 gets last device
          }
          
          deviceToUse = videoDevices[deviceIndex].deviceId
          console.log(`[${camId}] Using default assignment at index ${deviceIndex}: ${deviceToUse}`)
        }
        
        camerasToStart.push({ camId, deviceId: deviceToUse })
      }

      // Start cameras SEQUENTIALLY with delay to avoid USB power surge
      // Instead of Promise.all() which starts all at once
      const STARTUP_DELAY = 3000 // 3000ms delay between each camera start for 1080p stability
      for (let i = 0; i < camerasToStart.length; i++) {
        const { camId, deviceId } = camerasToStart[i]
        console.log(`Starting ${camId} (${i + 1}/${camerasToStart.length})...`)
        
        // Start this camera
        const success = await startCamera(camId, deviceId)
        
        // Add delay before next camera (except for last one)
        if (i < camerasToStart.length - 1) {
          console.log(`Waiting ${STARTUP_DELAY}ms before next camera...`)
          await new Promise(resolve => setTimeout(resolve, STARTUP_DELAY))
        }
      }

      return true
    } catch (error) {
      console.error('Camera initialization error:', error)
      return false
    }
  }, [startCamera, cameras])

  // Stop all cameras
  const stopAllCameras = useCallback(() => {
    // Abort all pending operations
    Object.entries(abortControllersRef.current).forEach(([camId, controller]) => {
      controller.abort()
      console.log(`[${camId}] Aborted all pending operations`)
    })
    
    Object.entries(streamsRef.current).forEach(([camId, stream]) => {
      if (stream) {
        stream.getTracks().forEach(track => {
          try {
            track.stop()
          } catch (e) {
            console.warn(`[${camId}] Error stopping track:`, e)
          }
        })
        const video = videoRefs[camId].current
        if (video) video.srcObject = null
      }

      // Cancel FPS counter
      if (fpsIntervalsRef.current[camId]) {
        cancelAnimationFrame(fpsIntervalsRef.current[camId])
      }
    })

    streamsRef.current = {}
    fpsIntervalsRef.current = {}

    setCameras({
      cam1: { active: false, fps: 0, metrics: { drowsy: 0, stress: 0, confidence: 0 }, face: false },
      cam2: { active: false, fps: 0, metrics: { drowsy: 0, stress: 0, confidence: 0 }, face: false },
      cam3: { active: false, fps: 0, metrics: { drowsy: 0, stress: 0, confidence: 0 }, face: false }
    })
  }, [videoRefs])

  return {
    cameras,
    availableDevices,
    getAvailableDevices,
    setSelectedDevice,
    isDeviceInUse,
    updateCameraMetrics,
    updateCameraFace,
    updateCameraFPS,
    setCameraActive,
    videoRefs,
    canvasRefs,
    streamsRef,
    startAllCameras,
    stopAllCameras,
    startCamera
  }
}
