/**
 * Eye Tracking Panel Component
 * Displays real-time gaze data and fatigue metrics
 */

import './EyeTrackingPanel.css'

interface GazeData {
  gaze: {
    x: number
    y: number
    raw_x: number
    raw_y: number
  }
  head_pose: {
    pitch: number
    yaw: number
    roll: number
  }
  eye_metrics: {
    ear: number
    perclos: number
    blink_rate: number
    is_closed: boolean
  }
  fixation: {
    duration: number
    saccade: number
    area: string | null
  }
  alert: {
    level: string
    status_text: string
    is_nodding: boolean
    nod_duration: number
  }
  distance_m: number
}

interface EyeTrackingPanelProps {
  gazeData: GazeData | null
  isTracking: boolean
  isCalibrated: boolean
  calibrationAccuracy: number
  alertLevel: 'normal' | 'warning' | 'danger' | 'critical'
}

function EyeTrackingPanel({
  gazeData,
  isTracking,
  isCalibrated,
  calibrationAccuracy,
  alertLevel
}: EyeTrackingPanelProps) {
  
  const getAlertColor = () => {
    switch (alertLevel) {
      case 'critical': return '#ff3366'
      case 'danger': return '#ff6b35'
      case 'warning': return '#ffaa00'
      default: return '#00ff88'
    }
  }

  const getAlertIcon = () => {
    switch (alertLevel) {
      case 'critical': return '🚨'
      case 'danger': return '⚠️'
      case 'warning': return '⚡'
      default: return '✓'
    }
  }

  return (
    <div className="eye-tracking-panel">
      <div className="panel-header">
        <div className="panel-title">Eye Tracking System</div>
        <div className="panel-status">
          {isCalibrated && (
            <span className="badge success">
              Calibrated {(calibrationAccuracy * 100).toFixed(0)}%
            </span>
          )}
          {isTracking && (
            <span className="badge info" style={{ animation: 'pulse 2s ease-in-out infinite' }}>
              Tracking Active
            </span>
          )}
        </div>
      </div>

      <div className="panel-grid">
        {/* Gaze Position */}
        <div className="metric-box">
          <div className="metric-label">Gaze Position</div>
          {gazeData ? (
            <div className="metric-value-large">
              X: {gazeData.gaze.x}px, Y: {gazeData.gaze.y}px
            </div>
          ) : (
            <div className="metric-value-dim">No data</div>
          )}
        </div>

        {/* Head Pose */}
        <div className="metric-box">
          <div className="metric-label">Head Pose</div>
          {gazeData ? (
            <div className="metric-grid-small">
              <div>
                <span className="metric-sub-label">Pitch:</span> {gazeData.head_pose.pitch.toFixed(1)}°
              </div>
              <div>
                <span className="metric-sub-label">Yaw:</span> {gazeData.head_pose.yaw.toFixed(1)}°
              </div>
              <div>
                <span className="metric-sub-label">Roll:</span> {gazeData.head_pose.roll.toFixed(1)}°
              </div>
            </div>
          ) : (
            <div className="metric-value-dim">No data</div>
          )}
        </div>

        {/* Eye Metrics */}
        <div className="metric-box">
          <div className="metric-label">Eye Metrics</div>
          {gazeData ? (
            <div className="metric-grid-small">
              <div>
                <span className="metric-sub-label">EAR:</span> {gazeData.eye_metrics.ear.toFixed(3)}
              </div>
              <div>
                <span className="metric-sub-label">PERCLOS:</span> {(gazeData.eye_metrics.perclos * 100).toFixed(1)}%
              </div>
              <div>
                <span className="metric-sub-label">Blinks:</span> {gazeData.eye_metrics.blink_rate} /min
              </div>
            </div>
          ) : (
            <div className="metric-value-dim">No data</div>
          )}
        </div>

        {/* Fixation */}
        <div className="metric-box">
          <div className="metric-label">Fixation Analysis</div>
          {gazeData ? (
            <div className="metric-grid-small">
              <div>
                <span className="metric-sub-label">Duration:</span> {gazeData.fixation.duration.toFixed(2)}s
              </div>
              <div>
                <span className="metric-sub-label">Saccade:</span> {gazeData.fixation.saccade.toFixed(1)}px
              </div>
              <div>
                <span className="metric-sub-label">Area:</span> {gazeData.fixation.area || 'none'}
              </div>
            </div>
          ) : (
            <div className="metric-value-dim">No data</div>
          )}
        </div>

        {/* Alert Status */}
        <div 
          className="metric-box alert-box" 
          style={{ 
            borderColor: getAlertColor(),
            background: `${getAlertColor()}15`
          }}
        >
          <div className="metric-label">Alert Status</div>
          {gazeData ? (
            <div className="alert-content">
              <div className="alert-icon" style={{ fontSize: '2rem' }}>
                {getAlertIcon()}
              </div>
              <div className="alert-level" style={{ color: getAlertColor() }}>
                {alertLevel.toUpperCase()}
              </div>
              <div className="alert-text">
                {gazeData.alert.status_text}
              </div>
              {gazeData.alert.is_nodding && (
                <div className="alert-detail">
                  Nodding: {gazeData.alert.nod_duration.toFixed(1)}s
                </div>
              )}
            </div>
          ) : (
            <div className="metric-value-dim">No data</div>
          )}
        </div>

        {/* Distance */}
        <div className="metric-box">
          <div className="metric-label">Distance</div>
          {gazeData ? (
            <div className="metric-value-large">
              {(gazeData.distance_m * 100).toFixed(1)} cm
            </div>
          ) : (
            <div className="metric-value-dim">No data</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default EyeTrackingPanel