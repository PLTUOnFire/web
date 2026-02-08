/**
 * Eye Tracking Panel Component
 * Displays real-time gaze data and fatigue metrics per camera
 */

import type { GazeData } from '../hooks/useEyeTracking'
import './EyeTrackingPanel.css'

interface EyeTrackingPanelProps {
  gazeDataMap: Record<string, GazeData>
  isTracking: boolean
  isCalibrated: boolean
  calibrationAccuracy: number
  alertLevel: 'normal' | 'warning' | 'danger' | 'critical'
}

const ALERT_COLORS: Record<string, string> = {
  critical: '#ff3366',
  danger: '#ff6b35',
  warning: '#ffaa00',
  normal: '#00ff88'
}

const ALERT_ICONS: Record<string, string> = {
  critical: '🚨',
  danger: '⚠️',
  warning: '⚡',
  normal: '✓'
}

function CameraGazeCard({ cameraId, data }: { cameraId: string; data: GazeData }) {
  const alertColor = ALERT_COLORS[data.alert.level] || ALERT_COLORS.normal
  const alertIcon = ALERT_ICONS[data.alert.level] || ALERT_ICONS.normal
  const camLabel = cameraId.replace('cam', 'CAM-0')

  return (
    <div className="camera-gaze-card">
      <div className="camera-gaze-header">
        <span className="camera-gaze-label">{camLabel}</span>
        <span
          className="camera-gaze-alert-badge"
          style={{ background: `${alertColor}25`, color: alertColor, borderColor: alertColor }}
        >
          {alertIcon} {data.alert.level.toUpperCase()}
        </span>
      </div>

      <div className="camera-gaze-grid">
        {/* Gaze */}
        <div className="gaze-metric">
          <div className="gaze-metric-label">Gaze</div>
          <div className="gaze-metric-value">
            X: {data.gaze.x}px, Y: {data.gaze.y}px
          </div>
        </div>

        {/* Head Pose */}
        <div className="gaze-metric">
          <div className="gaze-metric-label">Head Pose</div>
          <div className="gaze-metric-value">
            P: {data.head_pose.pitch.toFixed(1)}° Y: {data.head_pose.yaw.toFixed(1)}° R: {data.head_pose.roll.toFixed(1)}°
          </div>
        </div>

        {/* Eye Metrics */}
        <div className="gaze-metric">
          <div className="gaze-metric-label">EAR / PERCLOS</div>
          <div className="gaze-metric-value">
            {data.eye_metrics.ear.toFixed(3)} / {(data.eye_metrics.perclos * 100).toFixed(1)}%
          </div>
        </div>

        {/* Blink */}
        <div className="gaze-metric">
          <div className="gaze-metric-label">Blink Rate</div>
          <div className="gaze-metric-value">
            {data.eye_metrics.blink_rate} /min {data.eye_metrics.is_closed ? '(Closed)' : ''}
          </div>
        </div>

        {/* Fixation */}
        <div className="gaze-metric">
          <div className="gaze-metric-label">Fixation</div>
          <div className="gaze-metric-value">
            {data.fixation.duration.toFixed(2)}s | {data.fixation.area || 'none'}
          </div>
        </div>

        {/* Distance */}
        <div className="gaze-metric">
          <div className="gaze-metric-label">Distance</div>
          <div className="gaze-metric-value">
            {(data.distance_m * 100).toFixed(1)} cm
          </div>
        </div>
      </div>

      {/* Alert Status */}
      <div className="camera-gaze-status" style={{ borderColor: alertColor, background: `${alertColor}10` }}>
        <span style={{ color: alertColor, fontWeight: 700 }}>{data.alert.status_text}</span>
        {data.alert.is_nodding && (
          <span className="nodding-badge">Nodding: {data.alert.nod_duration.toFixed(1)}s</span>
        )}
      </div>
    </div>
  )
}

function EyeTrackingPanel({
  gazeDataMap,
  isTracking,
  isCalibrated,
  calibrationAccuracy,
  alertLevel
}: EyeTrackingPanelProps) {
  const cameraEntries = Object.entries(gazeDataMap)
  const hasData = cameraEntries.length > 0

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
          {isTracking && hasData && (
            <span
              className="badge"
              style={{
                background: `${ALERT_COLORS[alertLevel]}25`,
                color: ALERT_COLORS[alertLevel],
                border: `1px solid ${ALERT_COLORS[alertLevel]}`
              }}
            >
              {ALERT_ICONS[alertLevel]} {alertLevel.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {hasData ? (
        <div className="camera-gaze-cards">
          {cameraEntries.map(([cameraId, data]) => (
            <CameraGazeCard key={cameraId} cameraId={cameraId} data={data} />
          ))}
        </div>
      ) : (
        <div className="panel-no-data">
          {isTracking ? 'Waiting for tracking data...' : 'Start eye tracking to see real-time data'}
        </div>
      )}
    </div>
  )
}

export default EyeTrackingPanel
