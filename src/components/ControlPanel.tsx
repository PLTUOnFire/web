import './ControlPanel.css'

interface ControlPanelProps {
  recording: boolean
  systemActive: boolean
  isCalibrating: boolean
  calibrationComplete: boolean
  isTracking: boolean
  onStartCameras: () => void
  onStopCameras: () => void
  onToggleRecording: () => void
  onStartCalibration: () => void
  onStartTracking: () => void
  onStopTracking: () => void
}

function ControlPanel({
  recording,
  systemActive,
  isCalibrating,
  calibrationComplete,
  isTracking,
  onStartCameras,
  onStopCameras,
  onToggleRecording,
  onStartCalibration,
  onStartTracking,
  onStopTracking
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
          className={recording ? 'btn-danger' : 'btn-secondary'}
          onClick={onToggleRecording}
          disabled={!systemActive}
          style={recording ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}}
        >
          <span>{recording ? '⏹ Stop Recording' : '⏺ Start Recording'}</span>
        </button>
        <button 
          className="btn-secondary" 
          onClick={onStartCalibration}
          disabled={!systemActive || isCalibrating || calibrationComplete}
          title={calibrationComplete ? 'Calibration already complete' : !systemActive ? 'Start camera first' : ''}
        >
          <span>🎯 {calibrationComplete ? 'Calibrated ✓' : isCalibrating ? 'Calibrating...' : 'Calibration'}</span>
        </button>
        <button 
          className="btn-secondary" 
          onClick={isTracking ? onStopTracking : onStartTracking}
          disabled={!calibrationComplete}
          title={!calibrationComplete ? 'Complete calibration first' : ''}
        >
          <span>{isTracking ? '👁 Stop Eye Tracking' : '👁 Start Eye Tracking'}</span>
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
      {recording && (
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
                RECORDING @ 60 FPS
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-mid)', marginTop: '4px' }}>
                Multi-camera recording active
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Calibration Status */}
      {calibrationComplete && (
        <div 
          className="connection-status connected" 
          style={{ 
            marginTop: '10px',
            borderLeftColor: '#00ff88',
            background: 'rgba(0, 255, 136, 0.05)'
          }}
        >
          <div className="status-text">
            <span style={{ color: '#00ff88' }}>✓</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-mid)' }}>
              Eye tracking calibrated and ready • {isTracking ? '👁 Tracking active' : 'Ready to start tracking'}
            </span>
          </div>
        </div>
      )}

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
              <strong>Per-Camera System:</strong> Multi-operator eye tracking with independent calibration per camera
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default ControlPanel