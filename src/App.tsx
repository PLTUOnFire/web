import { useState, useEffect, useRef } from 'react'
import Header from './components/Header'
import CameraGrid from './components/CameraGrid'
import ControlPanel from './components/ControlPanel'
import LogsPanel from './components/LogsPanel'
import { useWebSocket } from './hooks/useWebSocket'
import { useCamera } from './hooks/useCamera'
import { useRecorder } from './hooks/useRecorder'
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
  const logIdRef = useRef(0)
  const sessionIdRef = useRef(`${Date.now()}-${Math.random()}`)
  const initializedRef = useRef(false)
  const lastMLResultRef = useRef<MLResult | null>(null)

  // Add log entry - MUST be defined before useWebSocket
  const addLog = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    logIdRef.current += 1
    // Create unique ID combining session ID and counter to prevent duplicates on remount
    const uniqueId = `${sessionIdRef.current}-${logIdRef.current}`
    setLogs(prev => [{
      id: uniqueId,
      timestamp,
      message,
      type
    }, ...prev].slice(0, 50))
  }

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

  const {
    wsConnected,
    mlActive,
    connectWebSocket,
    sendFrame
  } = useWebSocket({
    onMessage: handleMLResult,
    onLog: addLog
  })

  const {
    isRecording,
    startRecording,
    stopRecording,
    sendFrame: sendRecorderFrame
  } = useRecorder({
    onLog: addLog
  })

  // Handle ML results from WebSocket
  function handleMLResult(data: MLResult) {
    const camId = data.camera_id || 'cam1'
    
    // Store last ML result for recording
    lastMLResultRef.current = data
    
    // Update face detection status
    if (data.face !== undefined) {
      updateCameraFace(camId, data.face)
    }
    
    // Update metrics
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
    
    // Draw bounding boxes
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
      
      // Draw box
      ctx.strokeStyle = '#00ff88'
      ctx.lineWidth = 3
      ctx.strokeRect(x, y, w, h)
      
      // Draw label
      ctx.fillStyle = '#00ff88'
      ctx.font = 'bold 16px Rajdhani'
      const label = `${box.label} ${Math.round(box.score * 100)}%`
      const textWidth = ctx.measureText(label).width
      
      // Background for text
      ctx.fillStyle = 'rgba(0, 255, 136, 0.8)'
      ctx.fillRect(x, y - 25, textWidth + 10, 20)
      
      // Text
      ctx.fillStyle = '#0a0d12'
      ctx.fillText(label, x + 5, y - 10)
    })
  }

  // Auto-send frames to backend and recorder
  useEffect(() => {
    if (!wsConnected && !isRecording) return
    
    const interval = setInterval(() => {
      Object.keys(streamsRef.current).forEach(camId => {
        const videoRef = videoRefs[camId as 'cam1' | 'cam2' | 'cam3']?.current
        if (streamsRef.current[camId] && videoRef) {
          // Send to ML backend if connected
          if (wsConnected) {
            sendFrame(camId, videoRef)
          }
          
          // Send to recorder if recording
          if (isRecording) {
            sendRecorderFrame(camId, videoRef, lastMLResultRef.current)
          }
        }
      })
    }, 200)
    
    return () => clearInterval(interval)
  }, [wsConnected, isRecording, streamsRef, videoRefs, sendFrame, sendRecorderFrame])

  // Handle start cameras
  const handleStartCameras = async () => {
    addLog('Initializing camera access...', 'info')
    const success = await startAllCameras()
    if (success) {
      addLog('All cameras started successfully', 'success')
    }
  }

  // Handle stop cameras
  const handleStopCameras = () => {
    stopAllCameras()
    addLog('All cameras stopped', 'info')
  }

  // Handle connect WebSocket
  const handleConnectWS = () => {
    addLog('Connecting to ML backend...', 'info')
    connectWebSocket()
  }

  // Handle recording toggle
  const handleToggleRecording = async () => {
    if (!isRecording) {
      const success = await startRecording()
      if (!success) {
        addLog('Failed to start recording', 'error')
      }
    } else {
      const success = await stopRecording()
      if (!success) {
        addLog('Failed to stop recording', 'error')
      }
    }
  }

  // Initialize logs and get available devices
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      addLog('Vision Nexus ML Monitoring System initialized', 'success')
      addLog('Ready to start cameras and connect to ML backend', 'info')
      
      // Get and log available devices
      getAvailableDevices().then(devices => {
        if (devices.length > 0) {
          addLog(`Found ${devices.length} camera device(s).`, 'info')
          // Auto-select first device if only one is available
          if (devices.length === 1) {
            setSelectedDevice('cam1', devices[0].deviceId)
            addLog(`Auto-selected device: ${devices[0].label}`, 'info')
          }
        } else {
          addLog('No camera devices found! Please check permissions and camera hardware.', 'warning')
        }
      })
    }
  }, [setSelectedDevice, addLog])

  const systemActive = Object.values(cameras).some(cam => cam.active)

  const handleDeviceChange = (camId: string, deviceId: string) => {
    setSelectedDevice(camId, deviceId)
  }

  const handleStartCamera = async (camId: string, deviceId?: string) => {
    await startCamera(camId, deviceId)
  }

  return (
    <div className="app">
      <div className="container">
        <Header 
          systemActive={systemActive}
          wsConnected={wsConnected}
          mlActive={mlActive}
          deviceCount={availableDevices.length}
        />
        
        <CameraGrid 
          cameras={cameras}
          availableDevices={availableDevices}
          videoRefs={videoRefs}
          canvasRefs={canvasRefs}
          onDeviceChange={handleDeviceChange}
          onStartCamera={handleStartCamera}
          isDeviceInUse={isDeviceInUse}
        />
        
        <ControlPanel
          wsConnected={wsConnected}
          recording={isRecording}
          onStartCameras={handleStartCameras}
          onStopCameras={handleStopCameras}
          onConnectWS={handleConnectWS}
          onToggleRecording={handleToggleRecording}
        />
        
        <LogsPanel logs={logs} />
      </div>
    </div>
  )
}

export default App
