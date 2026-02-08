import MetricCard from './MetricCard'
import './CameraPanel.css'
import { useState } from 'react'

interface CameraMetrics {
  drowsy: number
  stress: number
  confidence: number
}

interface CameraDevice {
  deviceId: string
  label: string
}

interface Camera {
  active: boolean
  fps: number
  metrics: CameraMetrics
  face: boolean
  selectedDeviceId?: string
}

interface CameraPanelProps {
  camId: string
  camera: Camera
  videoRef: React.RefObject<HTMLVideoElement>
  canvasRef: React.RefObject<HTMLCanvasElement>
  index: number
  availableDevices: CameraDevice[]
  onDeviceChange: (deviceId: string) => void
  onStartCamera: (deviceId?: string) => Promise<void>
  onStopCamera?: (camId: string) => Promise<void>
  isDeviceInUse?: (deviceId: string) => string | null
  isRecording?: boolean
}

function CameraPanel({ 
  camId, 
  camera, 
  videoRef, 
  canvasRef, 
  index,
  availableDevices,
  onDeviceChange,
  onStartCamera,
  onStopCamera,
  isDeviceInUse,
  isRecording
}: CameraPanelProps) {
  const camNumber = String(index + 1).padStart(2, '0')
  const [isStarting, setIsStarting] = useState(false)

  const handleDeviceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const deviceId = e.target.value
    onDeviceChange(deviceId)
    if (camera.active && !isRecording) {
      await onStartCamera(deviceId)
    }
  }

  const handleStartCamera = async () => {
    setIsStarting(true)
    try {
      // Start with selected device or auto-select first available
      await onStartCamera(camera.selectedDeviceId)
    } finally {
      setIsStarting(false)
    }
  }

  const handleStopCamera = async () => {
    if (onStopCamera) {
      await onStopCamera(camId)
    }
  }

  return (
    <div 
      className="camera-panel" 
      style={{ 
        animationDelay: `${index * 0.1}s`,
        borderColor: isRecording && camera.active ? '#ff3366' : undefined
      }}
    >
      {/* Header */}
      <div className="camera-header">
        <div className="camera-id">
          CAM-{camNumber}
          {isRecording && camera.active && (
            <span style={{ 
              marginLeft: '10px', 
              fontSize: '0.8rem',
              color: '#ff3366',
              animation: 'pulse 1.5s ease-in-out infinite'
            }}>
              ● REC
            </span>
          )}
        </div>
        <div className="camera-status">
          <span className="badge info">{camera.fps} FPS</span>
          <span className={`badge ${camera.face ? 'success' : 'danger'}`}>
            {camera.face ? 'FACE ✓' : 'NO FACE'}
          </span>
        </div>
      </div>

      {/* Device Selector */}
      <div className="device-selector">
        <select 
          value={camera.selectedDeviceId || ''} 
          onChange={handleDeviceChange}
          className="device-select"
          disabled={isRecording || camera.active}
          title={isRecording ? 'Cannot change device while recording' : camera.active ? 'Camera is active' : undefined}
        >
          <option value="">Select Camera Device</option>
          {availableDevices.map(device => {
            const inUse = isDeviceInUse?.(device.deviceId)
            const disabled = inUse !== null && inUse !== camId
            return (
              <option 
                key={device.deviceId} 
                value={device.deviceId}
                disabled={disabled}
              >
                {device.label} {disabled ? `(Used by ${inUse})` : ''}
              </option>
            )
          })}
        </select>
        
        {/* Start/Stop Button */}
        <button
          onClick={camera.active ? handleStopCamera : handleStartCamera}
          disabled={isRecording || isStarting}
          className={`camera-control-btn ${camera.active ? 'stop' : 'start'}`}
          title={camera.active ? 'Stop camera' : 'Start camera'}
        >
          {isStarting ? (
            <>
              <span className="spinner-mini"></span>
              {' Starting...'}
            </>
          ) : camera.active ? (
            <>
              ⏹️ {' Stop'}
            </>
          ) : (
            <>
              ▶️ {' Start Camera'}
            </>
          )}
        </button>
        
        {isRecording && (
          <div style={{ 
            fontSize: '0.7rem', 
            color: 'var(--text-dim)', 
            marginTop: '5px',
            textAlign: 'center'
          }}>
            🔒 Locked while recording
          </div>
        )}
      </div>

      {/* Video Display */}
      <div className="video-wrapper">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
        />
        <canvas ref={canvasRef} />
        {!camera.active && (
          <div className="video-placeholder">
            <div className="video-placeholder-icon">📹</div>
            <div className="video-placeholder-text">Camera Inactive</div>
          </div>
        )}
        {isRecording && camera.active && (
          <div style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: 'rgba(255, 51, 102, 0.9)',
            color: 'white',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            animation: 'pulse 1.5s ease-in-out infinite'
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: 'white',
              animation: 'pulse 1s ease-in-out infinite'
            }} />
            60 FPS RECORDING
          </div>
        )}
      </div>

      {/* Metrics */}
      <div className="metrics-panel">
        <div className="metrics-grid">
          <MetricCard
            label="Drowsiness"
            value={camera.metrics.drowsy}
            type="drowsy"
          />
          <MetricCard
            label="Stress"
            value={camera.metrics.stress}
            type="stress"
          />
          <MetricCard
            label="Confidence"
            value={camera.metrics.confidence}
            type="face"
          />
        </div>
      </div>
    </div>
  )
}

export default CameraPanel