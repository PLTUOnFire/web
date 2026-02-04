// Application-wide constants

// Camera IDs
export const CAMERA_IDS = ['cam1', 'cam2', 'cam3'] as const

// Metric types
export const METRIC_TYPES = {
  DROWSY: 'drowsy',
  STRESS: 'stress',
  CONFIDENCE: 'confidence'
} as const

// Log types
export const LOG_TYPES = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error'
} as const

// Bounding box colors
export const BOX_COLORS = {
  DEFAULT: '#00ff88',
  FACE: '#0088ff',
  ALERT: '#ff3333'
} as const

// Canvas settings
export const CANVAS_SETTINGS = {
  FONT: 'bold 16px Rajdhani',
  LINE_WIDTH: 3,
  TEXT_COLOR: '#0a0d12',
  TEXT_BACKGROUND_COLOR: 'rgba(0, 255, 136, 0.8)'
} as const

// API endpoints
export const API_ENDPOINTS = {
  FRAME: '/ingest/frame',
  HEALTH: '/health',
  STATUS: '/status'
} as const

// WebSocket events
export const WS_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  MESSAGE: 'message',
  ERROR: 'error'
} as const
