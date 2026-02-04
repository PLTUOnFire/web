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
  isDeviceInUse
}: CameraPanelProps) {
  const camNumber = String(index + 1).padStart(2, '0')

  const handleDeviceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const deviceId = e.target.value
    onDeviceChange(deviceId)
    if (camera.active) {
      await onStartCamera(deviceId)
    }
  }

  return (
    <div 
      className="camera-panel" 
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <div className="camera-header">
        <div className="camera-id">CAM-{camNumber}</div>
        <div className="camera-status">
          <span className="badge info">{camera.fps} FPS</span>
          <span className={`badge ${camera.face ? 'success' : 'danger'}`}>
            {camera.face ? 'FACE ✓' : 'NO FACE'}
          </span>
        </div>
      </div>

      <div className="device-selector">
        <select 
          value={camera.selectedDeviceId || ''} 
          onChange={handleDeviceChange}
          className="device-select"
        >
          <option value="">Select Camera Device</option>
          {availableDevices.map(device => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
      </div>

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
      </div>

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
