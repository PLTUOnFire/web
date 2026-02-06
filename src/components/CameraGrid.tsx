import CameraPanel from './CameraPanel'
import './CameraGrid.css'

interface CameraDevice {
  deviceId: string
  label: string
}

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

interface CameraGridProps {
  cameras: Record<string, Camera>
  availableDevices: CameraDevice[]
  videoRefs: Record<string, React.RefObject<HTMLVideoElement>>
  canvasRefs: Record<string, React.RefObject<HTMLCanvasElement>>
  onDeviceChange: (camId: string, deviceId: string) => void
  onStartCamera: (camId: string, deviceId?: string) => Promise<void>
  isDeviceInUse?: (deviceId: string) => string | null
  isRecording?: boolean
}

function CameraGrid({ 
  cameras, 
  availableDevices,
  videoRefs, 
  canvasRefs,
  onDeviceChange,
  onStartCamera,
  isDeviceInUse,
  isRecording
}: CameraGridProps) {
  return (
    <div className="camera-grid">
      {Object.keys(cameras).map((camId, index) => (
        <CameraPanel
          key={camId}
          camId={camId}
          camera={cameras[camId]}
          videoRef={videoRefs[camId]}
          canvasRef={canvasRefs[camId]}
          index={index}
          availableDevices={availableDevices}
          onDeviceChange={(deviceId) => onDeviceChange(camId, deviceId)}
          onStartCamera={(deviceId) => onStartCamera(camId, deviceId)}
          isDeviceInUse={isDeviceInUse}
          isRecording={isRecording}
        />
      ))}
    </div>
  )
}

export default CameraGrid