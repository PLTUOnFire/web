import { useState } from 'react'
import MetricCard from './MetricCard'
import './CameraPanel.css'

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
  operatorName?: string
  recording?: boolean
  calibrated?: boolean
  tracking?: boolean
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
  onStopCamera: () => void
  onStartRecording: () => Promise<void>
  onStopRecording: () => Promise<void>
  onStartCalibration: () => Promise<void>
  onStartTracking: () => void
  onStopTracking: () => void
  onOperatorNameChange: (name: string) => void
  isDeviceInUse?: (deviceId: string) => string | null
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
  onStartRecording,
  onStopRecording,
  onStartCalibration,
  onStartTracking,
  onStopTracking,
  onOperatorNameChange,
  isDeviceInUse
}: CameraPanelProps) {
  const camNumber = String(index + 1).padStart(2, '0')
  const [showNameInput, setShowNameInput] = useState(false)
  const [tempName, setTempName] = useState(camera.operatorName || '')

  const handleDeviceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const deviceId = e.target.value
    onDeviceChange(deviceId)
    if (camera.active && !camera.recording) {
      await onStartCamera(deviceId)
    }
  }

  const handleSaveOperatorName = () => {
    if (tempName.trim()) {
      onOperatorNameChange(tempName.trim())
      setShowNameInput(false)
    }
  }

  return (
    <div 
      className="camera-panel" 
      style={{ 
        animationDelay: `${index * 0.1}s`,
        borderColor: camera.recording ? '#ff3366' : camera.tracking ? '#00ccff' : undefined
      }}
    >
      {/* Header */}
      <div className="camera-header">
        <div className="camera-id">
          CAM-{camNumber}
          {camera.recording && (
            <span style={{ 
              marginLeft: '10px', 
              fontSize: '0.8rem',
              color: '#ff3366',
              animation: 'pulse 1.5s ease-in-out infinite'
            }}>
              ● REC
            </span>
          )}
          {camera.tracking && !camera.recording && (
            <span style={{ 
              marginLeft: '10px', 
              fontSize: '0.8rem',
              color: '#00ccff'
            }}>
              👁️ TRACKING
            </span>
          )}
        </div>
        <div className="camera-status">
          <span className="badge info">{camera.fps} FPS</span>
          <span className={`badge ${camera.face ? 'success' : 'danger'}`}>
            {camera.face ? 'FACE ✓' : 'NO FACE'}
          </span>
          {camera.calibrated && (
            <span className="badge success">CALIBRATED</span>
          )}
        </div>
      </div>

      {/* Operator Name */}
      <div style={{ padding: '10px', borderBottom: '1px solid rgba(0, 255, 136, 0.1)' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '5px' }}>
          Operator Name:
        </div>
        {showNameInput ? (
          <div style={{ display: 'flex', gap: '5px' }}>
            <input
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              placeholder={`Operator ${index + 1}`}
              autoFocus
              style={{
                flex: 1,
                padding: '6px 10px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--accent-primary)',
                borderRadius: '4px',
                color: 'var(--text-bright)',
                fontSize: '0.85rem'
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter') handleSaveOperatorName()
              }}
            />
            <button 
              onClick={handleSaveOperatorName}
              style={{
                padding: '6px 12px',
                background: 'var(--accent-primary)',
                border: 'none',
                borderRadius: '4px',
                color: 'var(--bg-dark)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Save
            </button>
            <button 
              onClick={() => setShowNameInput(false)}
              style={{
                padding: '6px 12px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '4px',
                color: 'var(--text-mid)',
                fontSize: '0.75rem',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div 
            onClick={() => !camera.recording && setShowNameInput(true)}
            style={{
              padding: '6px 10px',
              background: 'rgba(0, 255, 136, 0.05)',
              border: '1px solid rgba(0, 255, 136, 0.2)',
              borderRadius: '4px',
              color: 'var(--accent-primary)',
              fontSize: '0.9rem',
              cursor: camera.recording ? 'not-allowed' : 'pointer',
              fontWeight: 600
            }}
            title={camera.recording ? 'Cannot change name while recording' : 'Click to change operator name'}
          >
            {camera.operatorName || `Operator-${index + 1}`} ✏️
          </div>
        )}
      </div>

      {/* Device Selector */}
      <div className="device-selector">
        <select 
          value={camera.selectedDeviceId || ''} 
          onChange={handleDeviceChange}
          className="device-select"
          disabled={camera.recording}
          title={camera.recording ? 'Cannot change device while recording' : undefined}
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
        {camera.recording && (
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
        {camera.recording && (
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

      {/* Camera Controls */}
      <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Camera Start/Stop */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => onStartCamera()}
            disabled={camera.active || !camera.selectedDeviceId}
            style={{
              flex: 1,
              padding: '8px',
              background: camera.active ? 'rgba(255,255,255,0.1)' : 'var(--accent-primary)',
              border: 'none',
              borderRadius: '4px',
              color: camera.active ? 'var(--text-dim)' : 'var(--bg-dark)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: camera.active || !camera.selectedDeviceId ? 'not-allowed' : 'pointer',
              opacity: camera.active || !camera.selectedDeviceId ? 0.5 : 1
            }}
          >
            ▶ Start Camera
          </button>
          <button
            onClick={onStopCamera}
            disabled={!camera.active || camera.recording}
            style={{
              flex: 1,
              padding: '8px',
              background: !camera.active || camera.recording ? 'rgba(255,255,255,0.1)' : '#ff3366',
              border: 'none',
              borderRadius: '4px',
              color: !camera.active || camera.recording ? 'var(--text-dim)' : 'white',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: !camera.active || camera.recording ? 'not-allowed' : 'pointer',
              opacity: !camera.active || camera.recording ? 0.5 : 1
            }}
          >
            ■ Stop
          </button>
        </div>

        {/* Calibration */}
        <button
          onClick={onStartCalibration}
          disabled={!camera.active || camera.calibrated || camera.recording}
          style={{
            padding: '8px',
            background: camera.calibrated ? 'rgba(0, 255, 136, 0.2)' : 'rgba(0, 204, 255, 0.8)',
            border: 'none',
            borderRadius: '4px',
            color: 'white',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: !camera.active || camera.calibrated || camera.recording ? 'not-allowed' : 'pointer',
            opacity: !camera.active || camera.calibrated || camera.recording ? 0.5 : 1
          }}
        >
          {camera.calibrated ? '✓ Calibrated' : '👁️ Calibrate Eyes'}
        </button>

        {/* Eye Tracking */}
        {camera.calibrated && (
          <button
            onClick={camera.tracking ? onStopTracking : onStartTracking}
            disabled={!camera.active}
            style={{
              padding: '8px',
              background: camera.tracking ? '#ff6b35' : 'rgba(0, 255, 136, 0.8)',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: !camera.active ? 'not-allowed' : 'pointer',
              opacity: !camera.active ? 0.5 : 1
            }}
          >
            {camera.tracking ? '■ Stop Tracking' : '▶ Start Tracking'}
          </button>
        )}

        {/* Recording */}
        <button
          onClick={camera.recording ? onStopRecording : onStartRecording}
          disabled={!camera.active}
          style={{
            padding: '10px',
            background: camera.recording ? '#ff3366' : 'rgba(255, 255, 255, 0.1)',
            border: camera.recording ? 'none' : '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '4px',
            color: 'white',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: !camera.active ? 'not-allowed' : 'pointer',
            opacity: !camera.active ? 0.5 : 1,
            animation: camera.recording ? 'pulse 1.5s ease-in-out infinite' : 'none'
          }}
        >
          {camera.recording ? '■ Stop Recording' : '● Start Recording'}
        </button>
      </div>
    </div>
  )
}

export default CameraPanel