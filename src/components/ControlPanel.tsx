import './ControlPanel.css'

interface ControlPanelProps {
  wsConnected: boolean
  recording: boolean
  onStartCameras: () => void
  onStopCameras: () => void
  onConnectWS: () => void
  onToggleRecording: () => void
}

function ControlPanel({
  wsConnected,
  recording,
  onStartCameras,
  onStopCameras,
  onConnectWS,
  onToggleRecording
}: ControlPanelProps) {
  return (
    <div className="control-panel">
      <div className="control-header">System Controls</div>
      <div className="control-grid">
        <button className="btn-primary" onClick={onStartCameras}>
          <span>▶ Start Cameras</span>
        </button>
        <button className="btn-secondary" onClick={onConnectWS}>
          <span>🔌 Connect ML</span>
        </button>
        <button className="btn-secondary" onClick={onToggleRecording}>
          <span>{recording ? '⏸ Stop Recording' : '⏺ Start Recording'}</span>
        </button>
        <button className="btn-danger" onClick={onStopCameras}>
          <span>⏹ Stop All</span>
        </button>
      </div>
      <div className={`connection-status ${wsConnected ? 'connected' : 'disconnected'}`}>
        <div className="status-text">
          <span>{wsConnected ? '✓' : '⚠'}</span>
          <span>
            {wsConnected
              ? 'Connected to ML backend'
              : 'WebSocket disconnected. Click "Connect ML" to start.'}
          </span>
        </div>
      </div>
    </div>
  )
}

export default ControlPanel
