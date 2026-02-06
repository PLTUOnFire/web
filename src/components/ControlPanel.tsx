import './ControlPanel.css'

interface ControlPanelProps {
  wsConnected: boolean
  recording: boolean
  systemActive: boolean
  onStartCameras: () => void
  onStopCameras: () => void
  onConnectWS: () => void
  onToggleRecording: () => void
  recordingSessionId?: string | null
}

function ControlPanel({
  wsConnected,
  recording,
  systemActive,
  onStartCameras,
  onStopCameras,
  onConnectWS,
  onToggleRecording,
  recordingSessionId
}: ControlPanelProps) {
  return (
    <div className="control-panel">
      <div className="control-header">System Controls</div>
      <div className="control-grid">
        <button 
          className="btn-primary" 
          onClick={onStartCameras}
          disabled={systemActive}
        >
          <span>▶ Start Cameras</span>
        </button>
        <button 
          className="btn-secondary" 
          onClick={onConnectWS}
          disabled={!systemActive}
        >
          <span>🔌 {wsConnected ? 'Disconnect' : 'Connect'} ML</span>
        </button>
        <button 
          className={recording ? 'btn-danger' : 'btn-secondary'}
          onClick={onToggleRecording}
          disabled={!systemActive}
          style={recording ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}}
        >
          <span>{recording ? '⏹ Stop Recording' : '⏺ Start Recording'}</span>
        </button>
        <button 
          className="btn-danger" 
          onClick={onStopCameras}
          disabled={!systemActive}
        >
          <span>⏹ Stop All</span>
        </button>
      </div>

      {/* Recording Status Banner */}
      {recording && recordingSessionId && (
        <div 
          className="connection-status connected" 
          style={{ 
            marginTop: '15px',
            borderLeftColor: '#ff3366',
            background: 'rgba(255, 51, 102, 0.1)'
          }}
        >
          <div className="status-text">
            <span style={{ color: '#ff3366' }}>⏺</span>
            <div>
              <div style={{ fontWeight: 700, color: '#ff3366' }}>
                RECORDING @ 60 FPS (Stream-Based)
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-mid)', marginTop: '4px' }}>
                Session: {recordingSessionId.slice(0, 16)}... • WebM format • Browser-native encoding
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WebSocket Connection Status */}
      <div className={`connection-status ${wsConnected ? 'connected' : 'disconnected'}`}>
        <div className="status-text">
          <span>{wsConnected ? '✓' : '⚠'}</span>
          <span>
            {wsConnected
              ? 'ML backend connected (inference active)'
              : 'ML backend disconnected. Click "Connect ML" for live inference.'}
          </span>
        </div>
      </div>

      {/* Info Banner */}
      {!recording && systemActive && (
        <div 
          className="connection-status" 
          style={{ 
            marginTop: '10px',
            borderLeftColor: 'var(--accent-info)',
            background: 'rgba(0, 204, 255, 0.05)'
          }}
        >
          <div className="status-text">
            <span style={{ color: 'var(--accent-info)' }}>ℹ</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-mid)' }}>
              <strong>60 FPS Recording:</strong> Uses MediaRecorder API for efficient capture. 
              No manual frame processing needed - browser handles video encoding automatically.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default ControlPanel