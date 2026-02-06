import { useState, useEffect, useRef } from 'react'
import Header from './components/Header'
import CameraGrid from './components/CameraGrid'
import ControlPanel from './components/ControlPanel'
import LogsPanel from './components/LogsPanel'
import CalibrationScreen from './components/CalibrationScreen'
import EyeTrackingPanel from './components/EyeTrackingPanel'
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

function App() {
  const [logs, setLogs] = useState<Log[]>([])
  const [operatorName, setOperatorName] = useState('Operator-1')
  const [showNameInput, setShowNameInput] = useState(false)
  const [cameraSessionIds, setCameraSessionIds] = useState<Record<string, string>>({
    cam1: '',
    cam2: '',
    cam3: ''
  })
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
    videoRefs,
    canvasRefs,
    streamsRef,
    startAllCameras,
    stopAllCameras,
    startCamera,
    stopCamera
  } = useCamera()

  // Stream Recorder hook
  const {
    isRecording,
    startRecording,
    stopRecording
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
    cancelCalibration
  } = useCalibration({
    sessionId: cameraSessionIds.cam1 || sessionIdRef.current,
    cameraId: 'cam1',
    onLog: addLog
  })

  // Eye Tracking hook
  const {
    isTracking,
    latestGazeData,
    alertLevel,
    startTracking,
    stopTracking
  } = useEyeTracking({
    sessionId: cameraSessionIds.cam1 || sessionIdRef.current,
    cameraId: 'cam1',
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
    stopAllCameras()
    if (isTracking) {
      stopTracking()
    }
    addLog('All cameras stopped', 'info')
  }

  // Stop a single camera
  const handleStopCamera = async (camId: string) => {
    await stopCamera(camId)
    addLog(`${camId} stopped`, 'info')
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
      // Stop all active camera recordings
      const activeRecorders = ['cam1', 'cam2', 'cam3'].filter(camId => 
        cameras[camId as 'cam1' | 'cam2' | 'cam3'].active
      )
      
      let succeeded = true
      for (const camId of activeRecorders) {
        const success = await stopRecording(camId)
        if (!success) succeeded = false
      }
      
      if (succeeded) {
        addLog('All camera recordings stopped', 'success')
      }
    } else {
      // Start recording for all active cameras
      const activeCameras = ['cam1', 'cam2', 'cam3'].filter(camId =>
        cameras[camId as 'cam1' | 'cam2' | 'cam3'].active
      )
      
      if (activeCameras.length === 0) {
        addLog('No active cameras to record', 'warning')
        return
      }

      addLog(`Starting recording for ${activeCameras.length} camera(s)...`, 'info')
      
      let successCount = 0
      const newSessionIds = { ...cameraSessionIds }
      
      for (const camId of activeCameras) {
        const stream = streamsRef.current[camId as 'cam1' | 'cam2' | 'cam3']
        if (!stream) {
          addLog(`${camId}: No stream available`, 'warning')
          continue
        }
        
        const result = await startRecording(
          camId,
          stream,
          operatorName,
          60
        )
        
        if (result.success && result.sessionId) {
          successCount++
          newSessionIds[camId as 'cam1' | 'cam2' | 'cam3'] = result.sessionId
          addLog(`${camId}: Session ID captured: ${result.sessionId.slice(0, 12)}...`, 'info')
        }
      }
      
      setCameraSessionIds(newSessionIds)
      
      if (successCount === 0) {
        addLog('Failed to start any camera recording', 'error')
      } else {
        addLog(`Recording started for ${successCount} camera(s)`, 'success')
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
          deviceCount={availableDevices.length}
          isRecording={isRecording}
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
          videoRefs={videoRefs as Record<string, React.RefObject<HTMLVideoElement>>}
          canvasRefs={canvasRefs as Record<string, React.RefObject<HTMLCanvasElement>>}
          onDeviceChange={handleDeviceChange}
          onStartCamera={handleStartCamera}
          onStopCamera={handleStopCamera}
          isDeviceInUse={isDeviceInUse}
          isRecording={isRecording}
        />
        
        <ControlPanel
          recording={isRecording}
          systemActive={systemActive}
          isCalibrating={isCalibrating}
          calibrationComplete={calibrationComplete}
          isTracking={isTracking}
          onStartCameras={handleStartCameras}
          onStopCameras={handleStopCameras}
          onToggleRecording={handleToggleRecording}
          onStartCalibration={handleStartCalibration}
          onStartTracking={handleStartEyeTracking}
          onStopTracking={handleStopEyeTracking}
        />
        
        <LogsPanel logs={logs} />
      </div>
    </div>
  )
}

export default App