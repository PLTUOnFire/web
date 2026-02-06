/**
 * Application Configuration
 * Centralized config for API endpoints and app settings
 */

const config = {
  // API Base URL
  apiUrl: 'http://localhost:8000',
  
  // WebSocket URL
  wsUrl: 'ws://localhost:8000/ws',
  
  // API Endpoints
  endpoints: {
    // Recording
    recordStart: '/record/start',
    recordStop: '/record/stop',
    recordChunk: '/record/chunk',
    
    // Calibration
    calibrationStart: '/calibration/start',
    calibrationPoint: '/calibration/point',
    calibrationSample: '/calibration/sample',
    calibrationFinish: '/calibration/finish',
    
    // Eye Tracking
    trackingStart: '/tracking/start',
    trackingStop: '/tracking/stop',
    
    // Sessions
    sessions: '/sessions',
    gazeData: '/sessions/{session_id}/gaze_data',
    fatigueEvents: '/sessions/{session_id}/fatigue_events',
    
    // Health
    health: '/health',
    status: '/status',
    
    // Legacy ML
    ingestFrame: '/ingest/frame'
  },
  
  // Camera Settings
  camera: {
    defaultFps: 60,
    trackingFps: 10, // FPS for eye tracking (10 FPS is sufficient)
    recordingFps: 60, // FPS for video recording
    defaultWidth: 1920,
    defaultHeight: 1080
  },
  
  // WebSocket Settings
  ws: {
    reconnectAttempts: 5,
    reconnectDelay: 1000, // ms
    timeout: 60000 // ms
  }
}

export default config