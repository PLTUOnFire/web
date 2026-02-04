// Configuration utility to manage environment variables
// This centralizes all configuration in one place

const config = {
  // Backend URLs
  wsUrl: import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws',
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  
  // Camera Settings
  camera: {
    width: parseInt(import.meta.env.VITE_CAMERA_WIDTH as string) || 1920,
    height: parseInt(import.meta.env.VITE_CAMERA_HEIGHT as string) || 1080,
    frameSendInterval: parseInt(import.meta.env.VITE_FRAME_SEND_INTERVAL as string) || 250, // Adjusted for 1080p multi-camera
    maxCameras: parseInt(import.meta.env.VITE_MAX_CAMERAS as string) || 3,
  },
  
  // Feature Flags
  features: {
    enableRecording: import.meta.env.VITE_ENABLE_RECORDING !== 'false',
    enableLogs: import.meta.env.VITE_ENABLE_LOGS !== 'false',
  },
  
  // Development mode check
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,
}

export default config
