import { useState, useEffect, useRef } from 'react'
import Header from './components/Header'
import CameraGrid from './components/CameraGrid'
import ControlPanel from './components/ControlPanel'
import LogsPanel from './components/LogsPanel'
import CalibrationScreen from './components/CalibrationScreen'
import EyeTrackingPanel from './components/EyeTrackingPanel'
import { useWebSocket } from './hooks/useWebSocket'
import { useCamera } from './hooks/useCamera'
import { useStreamRecorder } from './hooks/useStreamRecorder'
import { useCalibration } from './hooks/useCalibration'
import { useEyeTracking } from './hooks/useEyeTracking'
import './App.css'

interface Log {
  id: string
  timestamp: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
}

interface MLResult {
  camera_id: string
  face?: boolean
  drowsy?: number
  stress?: number
  confidence?: number
  boxes?: Array<{
    x: number
    y: number
    w: number
    h: number
    label: string
    score: number
  }>
}

function App() {
  const [logs, setLogs] = useState<Log[]>([])
  const [operatorName, setOperatorName] = useState('Operator-1')
  const [showNameInput, setShowNameInput] = useState(false)
  const logIdRef = useRef(0)
  const sessionIdRef = useRef(`${Date.now()}-${Math.random()}`)
  const initializedRef = useRef(false)

  // Add log entry
  const addLog = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    logIdRef.current += 1
    const uniqueId = `${sessionIdRef.current}-${logIdRef.current}`
    setLogs(prev => [{
      id: uniqueId,
      timestamp,
      message,
      type
    }, ...prev].slice(0, 50))
  }

  // Camera hook
  const {
    cameras,
    availableDevices,
    getAvailableDevices,
    setSelectedDevice,
    isDeviceInUse,
    updateCameraMetrics,
    updateCameraFace,
    videoRefs,
    canvasRefs,
    streamsRef,
    startAllCameras,
    stopAllCameras,
    startCamera
  } = useCamera()

  // Stream Recorder hook
  const {
    isRecording,
    startRecording,
    stopRecording,
    sessionId: recordingSessionId
  } = useStreamRecorder({
    onLog: addLog
  })

  // Calibration hook
  const {
    isCalibrating,
    currentStep,
    totalSteps,
    currentPoint,
    calibrationType,
    calibrationComplete,
    calibrationAccuracy,
    startCalibration,
    captureCalibrationSample,
    nextCalibrationPoint,
    cancelCalibration,
    getProgress
  } = useCalibration({
    sessionId: sessionIdRef.current,
    onLog: addLog
  })

  // Eye Tracking hook
  const {
    isTracking,
    latestGazeData,
    alertLevel,
    isConnected: eyeTrackingConnected,
    startTracking,
    stopTracking
  } = useEyeTracking({
    sessionId: sessionIdRef.current,
    onLog: addLog,
    onGazeData: (data) => {
      // Update camera metrics from eye tracking
      if (data.eye_metrics) {
        updateCameraMetrics('cam1', {
          drowsy: Math.round(data.eye_metrics.perclos * 100),
          stress: data.alert.level === 'critical' ? 100 : data.alert.level === 'danger' ? 75 : 30,
          confidence: Math.round((1 - data.eye_metrics.ear) * 100)
        })
      }
    }
  })

  // WebSocket hook for ML inference (legacy - optional)
  const {
    wsConnected,
    mlActive,
    connectWebSocket,
    disconnectWebSocket,
    sendFrame
  } = useWebSocket({
    onMessage: handleMLResult,
    onLog: addLog
  })

  // Handle ML results from WebSocket (legacy)
  function handleMLResult(data: MLResult) {
    const camId = data.camera_id || 'cam1'
    
    if (data.face !== undefined) {
      updateCameraFace(camId, data.face)
    }
    
    const metrics: Record<string, number> = {}
    if (data.drowsy !== undefined) {
      metrics.drowsy = Math.round(data.drowsy * 100)
    }
    if (data.stress !== undefined) {
      metrics.stress = Math.round(data.stress * 100)
    }
    if (data.confidence !== undefined) {
      metrics.confidence = Math.round(data.confidence * 100)
    }
    
    if (Object.keys(metrics).length > 0) {
      updateCameraMetrics(camId, metrics)
    }
    
    if (data.boxes && data.boxes.length > 0) {
      drawBoundingBoxes(camId, data.boxes)
    }
  }

  // Draw bounding boxes on canvas
  function drawBoundingBoxes(camId: string, boxes: MLResult['boxes']) {
    const canvas = canvasRefs[camId as 'cam1' | 'cam2' | 'cam3']?.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    boxes?.forEach(box => {
      const x = box.x * canvas.width
      const y = box.y * canvas.height
      const w = box.w * canvas.width
      const h = box.h * canvas.height
      
      ctx.strokeStyle = '#00ff88'
      ctx.lineWidth = 3
      ctx.strokeRect(x, y, w, h)
      
      ctx.fillStyle = '#00ff88'
      ctx.font = 'bold 16px Rajdhani'
      const label = `${box.label} ${Math.round(box.score * 100)}%`
      const textWidth = ctx.measureText(label).width
      
      ctx.fillStyle = 'rgba(0, 255, 136, 0.8)'
      ctx.fillRect(x, y - 25, textWidth + 10, 20)
      
      ctx.fillStyle = '#0a0d12'
      ctx.fillText(label, x + 5, y - 10)
    })
  }

  // ML inference interval (legacy - optional)
  useEffect(() => {
    if (!wsConnected) return
    
    const interval = setInterval(() => {
      Object.keys(streamsRef.current).forEach(camId => {
        if (streamsRef.current[camId]) {
          sendFrame(camId, videoRefs[camId as 'cam1' | 'cam2' | 'cam3']?.current)
        }
      })
    }, 200)
    
    return () => clearInterval(interval)
  }, [wsConnected, streamsRef, videoRefs, sendFrame])

  // Start cameras
  const handleStartCameras = async () => {
    addLog('Initializing camera access...', 'info')
    const success = await startAllCameras()
    if (success) {
      addLog('All cameras started successfully', 'success')
    }
  }

  // Stop cameras
  const handleStopCameras = () => {
    if (isRecording) {
      stopRecording()
    }
    if (isTracking) {
      stopTracking()
    }
    stopAllCameras()
    addLog('All cameras stopped', 'info')
  }

  // Start calibration
  const handleStartCalibration = async () => {
    // Check if camera is active
    if (!cameras.cam1.active) {
      addLog('Please start camera first', 'warning')
      return
    }

    const success = await startCalibration('multipose')
    if (success) {
      addLog('Calibration started - follow on-screen instructions', 'info')
    }
  }

  // Start eye tracking
  const handleStartEyeTracking = () => {
    if (!calibrationComplete) {
      addLog('Please complete calibration first', 'warning')
      return
    }

    const videoElement = videoRefs.cam1?.current
    if (!videoElement) {
      addLog('Camera not available', 'error')
      return
    }

    startTracking(videoElement)
  }

  // Stop eye tracking
  const handleStopEyeTracking = () => {
    stopTracking()
  }

  // Handle recording toggle
  const handleToggleRecording = async () => {
    if (isRecording) {
      await stopRecording()
    } else {
      const activeCameras = Object.entries(cameras)
        .filter(([_, cam]) => cam.active)
      
      if (activeCameras.length === 0) {
        addLog('No active cameras to record', 'warning')
        return
      }

      const cameraStreams = new Map()
      
      if (cameras.cam1.active && streamsRef.current.cam1) {
        cameraStreams.set('cam1', { stream: streamsRef.current.cam1 })
      }
      if (cameras.cam2.active && streamsRef.current.cam2) {
        cameraStreams.set('cam2', { stream: streamsRef.current.cam2 })
      }
      if (cameras.cam3.active && streamsRef.current.cam3) {
        cameraStreams.set('cam3', { stream: streamsRef.current.cam3 })
      }

      // Start backend session first
      try {
        const response = await fetch('http://localhost:8000/record/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionIdRef.current,
            operator_name: operatorName,
            fps: 60
          })
        })

        if (!response.ok) {
          throw new Error('Failed to start backend session')
        }

        // Then start recording
        const success = await startRecording(cameraStreams, 60)
        
        if (!success) {
          addLog('Failed to start recording', 'error')
        }
      } catch (error) {
        addLog(`Failed to start session: ${error}`, 'error')
      }
    }
  }

  // Handle device change
  const handleDeviceChange = async (camId: string, deviceId: string) => {
    if (isRecording) {
      addLog('Cannot change devices while recording', 'warning')
      return
    }
    
    setSelectedDevice(camId, deviceId)
    
    if (cameras[camId as keyof typeof cameras].active) {
      addLog(`Switching ${camId} to new device...`, 'info')
      await startCamera(camId, deviceId)
    }
  }

  // Initialize
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      addLog('PLTU Eye Tracking System v4.0 initialized', 'success')
      addLog('Eye tracking + 60 FPS recording available', 'info')
      
      getAvailableDevices().then(devices => {
        if (devices.length > 0) {
          addLog(`Found ${devices.length} camera device(s)`, 'info')
        } else {
          addLog('No camera devices found!', 'warning')
        }
      })
    }
  }, [])

  const systemActive = Object.values(cameras).some(cam => cam.active)

  const handleStartCamera = async (camId: string, deviceId?: string) => {
    if (isRecording) {
      addLog('Cannot start individual camera while recording', 'warning')
      return
    }
    await startCamera(camId, deviceId)
  }

  return (
    <div className="app">
      {/* Calibration Screen (Full-screen overlay) */}
      {isCalibrating && currentPoint && videoRefs.cam1?.current && (
        <CalibrationScreen
          currentPoint={currentPoint}
          currentStep={currentStep}
          totalSteps={totalSteps}
          videoElement={videoRefs.cam1.current}
          onCaptureSample={captureCalibrationSample}
          onNext={nextCalibrationPoint}
          onCancel={cancelCalibration}
          calibrationType={calibrationType}
        />
      )}

      <div className="container">
        <Header 
          systemActive={systemActive}
          wsConnected={wsConnected}
          mlActive={mlActive}
          deviceCount={availableDevices.length}
          isRecording={isRecording}
          recordingSessionId={recordingSessionId}
          operatorName={operatorName}
          onOperatorNameChange={(name) => {
            setOperatorName(name)
            setShowNameInput(false)
          }}
          showNameInput={showNameInput}
          onShowNameInput={() => setShowNameInput(!showNameInput)}
        />
        
        {/* Eye Tracking Panel */}
        {(calibrationComplete || isTracking) && (
          <EyeTrackingPanel
            gazeData={latestGazeData}
            isTracking={isTracking}
            isCalibrated={calibrationComplete}
            calibrationAccuracy={calibrationAccuracy}
            alertLevel={alertLevel}
          />
        )}
        
        <CameraGrid 
          cameras={cameras}
          availableDevices={availableDevices}
          videoRefs={videoRefs}
          canvasRefs={canvasRefs}
          onDeviceChange={handleDeviceChange}
          onStartCamera={handleStartCamera}
          isDeviceInUse={isDeviceInUse}
          isRecording={isRecording}
        />
        
        <ControlPanel
          wsConnected={wsConnected}
          recording={isRecording}
          systemActive={systemActive}
          isCalibrating={isCalibrating}
          calibrationComplete={calibrationComplete}
          isTracking={isTracking}
          onStartCameras={handleStartCameras}
          onStopCameras={handleStopCameras}
          onConnectWS={connectWebSocket}
          onToggleRecording={handleToggleRecording}
          onStartCalibration={handleStartCalibration}
          onStartTracking={handleStartEyeTracking}
          onStopTracking={handleStopEyeTracking}
          recordingSessionId={recordingSessionId}
        />
        
        <LogsPanel logs={logs} />
      </div>
    </div>
  )
}

export default App