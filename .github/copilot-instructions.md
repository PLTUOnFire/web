# AI Coding Agent Instructions for PLTU Monitoring System (Frontend)

## Project Overview
**PLTU Monitoring System** is a React + TypeScript + Vite frontend for multi-camera ML-driven monitoring. It streams video from up to 3 cameras, communicates with a backend ML service via WebSocket for real-time analysis (drowsiness, stress detection, face detection), and displays results with metrics logging.

## Architecture & Data Flow

### Core Components
- **App.tsx**: Central orchestrator managing state (logs, recording) and coordinating hooks
- **Header.tsx**: Status display (system active, WebSocket connection, ML worker, device count)
- **CameraGrid.tsx**: Layout container for 3 camera panels with device selection
- **CameraPanel.tsx**: Individual camera feed with bounding boxes, metrics card, and device dropdown
- **ControlPanel.tsx**: Global buttons (Start/Stop cameras, Connect ML, Record toggle)
- **LogsPanel.tsx**: Real-time log stream with filtering by type (info/success/warning/error)

### Hook-Based Communication
- **useWebSocket.ts**: Manages WebSocket connection to backend (config.wsUrl), auto-reconnects with exponential backoff (max 5 attempts), parses ML results
- **useCamera.ts**: Manages MediaStream capture, canvas drawing, FPS calculation, device enumeration with AbortControllers for cleanup
- **useRecorder.ts**: Manages video recording sessions, batches frames for backend storage, includes ML metadata with frames
- **Data Flow**: useCamera captures frames → App draws to canvas → [WebSocket sends to ML] + [HTTP sends to recorder] → Results update metrics

### Recording System
- **Flow**: `startRecording()` creates session → frames sent via POST multipart/form-data → `stopRecording()` finalizes videos
- **Session Management**: Unique session ID generated per recording (`${Date.now()}-${randomString}`)
- **Frame Throttling**: Frames batched at 250ms intervals (~4 FPS sent) but saved at 15 FPS by backend
- **ML Integration**: Last ML result stored in ref, sent alongside frames to backend for metadata

## Key Conventions & Patterns

### Camera ID Management
- Fixed camera IDs: `cam1`, `cam2`, `cam3` (defined in `src/utils/constants.ts`)
- Store camera state as `Record<string, Camera>` object for easy iteration and updates
- Pass camera ID as `string` parameter to identify which camera in callbacks

### Environment Configuration
All runtime config via environment variables in `src/config.ts`:
- `VITE_WS_URL`: WebSocket backend URL (default: `ws://localhost:8000/ws`)
- `VITE_API_URL`: REST API base URL (default: `http://localhost:8000`)
- `VITE_CAMERA_WIDTH/HEIGHT`: Capture resolution (default: 1920x1080)
- `VITE_FRAME_SEND_INTERVAL`: Frame submission rate in ms (default: 250ms for 4 FPS)
- `VITE_MAX_CAMERAS`: Max simultaneous cameras (default: 3)
- `VITE_ENABLE_RECORDING`, `VITE_ENABLE_LOGS`: Feature flags

### TypeScript Patterns
- **MLResult Interface**: Backend response with camera_id, face/drowsy/stress (0-100), boxes array with coordinates
- **Camera Interface**: Stores `active`, `fps`, `metrics` object, `face` flag, `selectedDeviceId`
- **Refs for Imperative APIs**: `useRef` for video/canvas elements, AbortControllers, WebSocket connections (not state)

### Logging System
- Custom Log interface: `{ id, timestamp, message, type }`
- `addLog()` creates unique IDs via `${sessionIdRef}-${counter}` to prevent duplicates on remount
- Log types: `'info' | 'success' | 'warning' | 'error'` (defined in constants)
- Pass `onLog` callback to hooks to centralize logging in App

### WebSocket Auto-Reconnect Strategy
- On disconnect: exponential backoff starting at 1s, doubling up to 30s max
- Tracks `reconnectAttemptsRef` (max 5 attempts before requiring manual "Connect ML" button
- Clears timeout on cleanup to prevent stale reconnection timers
- Always close previous connection before creating new one

### Camera Capture & Device Enumeration
- `navigator.mediaDevices.getUserMedia()` with AbortController per camera to cancel pending requests
- `enumerateDevices()` filters `videoinput` kind only
- Device labels include index suffix to distinguish identical device names
- Check `isDeviceInUse()` before assigning to prevent duplicate device selection
- Streams stored in `streamsRef.current` for cleanup on stop

## Developer Workflows

### Build & Serve
```bash
npm run dev          # Start Vite dev server (HMR enabled)
npm run build        # TypeScript + Vite bundle for production
npm run preview      # Preview production build locally
```

### Code Quality
```bash
npm run lint         # Check TS/TSX with ESLint (zero warnings)
npm run lint:fix     # Auto-fix linting issues
npm run format       # Prettier format src/
npm run format:check # Verify formatting without changes
```

### Docker & Deployment
```bash
npm run docker:build        # Build Docker image (vision-nexus:latest)
npm run docker:compose      # Start with docker-compose
npm run docker:compose:logs # Stream container logs
npm run deploy:vercel       # Deploy to Vercel (with --prod flag)
npm run deploy:netlify      # Deploy to Netlify (with --prod flag)
```

## Integration Points

### Backend WebSocket Contract
- **Connection**: `ws://localhost:8000/ws` (or `VITE_WS_URL`)
- **Incoming**: JSON objects with `camera_id`, optional `face`, `drowsy`/`stress` (0-100), `boxes` array
- **Outgoing**: Canvas frame data (sent every `VITE_FRAME_SEND_INTERVAL` ms)

### MediaDevices API
- Uses `navigator.mediaDevices.getUserMedia()` for camera access
- Requires HTTPS in production (or localhost for dev)
- Throws on permissions denied; catch and log errors

### Canvas Drawing
- Draw ML bounding boxes with colors from `src/utils/constants.ts` BOX_COLORS
- Use `CANVAS_SETTINGS` for font/line width/text styling
- Coordinates are normalized (0-1); convert to pixels with `toPixel()` helper

## Common Task Patterns

## Recording System Implementation (v2.0 - Real-Time Streaming)

### Problem Fixed
**v1.0 issue**: Videos were 1 second long even with many frames
- Buffered all frames in memory
- Wrote to disk only at stop() time
- Fixed 15 FPS regardless of actual frame rate
- Result: Duration was wrong

**v2.0 solution**: Real-time streaming writes frames immediately
- No buffering - write as frames arrive
- Accurate FPS and duration
- WebSocket for efficient delivery
- HTTP fallback if WebSocket unavailable

### Key Files
- `src/hooks/useRecorder.ts` - Frontend recording hook
- `backend_streaming.py` - Backend streaming service
- `test_backend.py` - Testing script
- `SETUP_AND_TEST.md` - Full setup guide

### Frontend Flow
1. Call `startRecording(fps)` to initialize session
2. Backend creates RecordingSession and CameraWriter (lazy init)
3. Frames sent every 250ms (~4 FPS)
4. For each frame:
   - Send JSON: `{"type": "frame_info", "camera_id": "cam1", "ml_data": {...}}`
   - Send binary: JPEG frame data
5. Backend immediately writes to MP4 (real-time)
6. Call `stopRecording()` to finalize videos

### WebSocket Protocol
```javascript
// Initialize
Client → Server: {"type": "init", "fps": 30}
Server → Client: {"status": "ok", "message": "Initialized @ 30 FPS"}

// For each frame
Client → Server: {"type": "frame_info", "camera_id": "cam1", "ml_data": {...}}
Client → Server: Binary JPEG data
Server → Client: {"status": "ok", "message": "Frame recorded"}

// Close
Client closes connection
Server finalizes and saves videos
```

### Backend Components
- **CameraWriter**: Writes frames immediately to MP4, thread-safe
- **RecordingSession**: Manages up to 3 CameraWriters (one per camera)
- **WebSocket Handler**: Receives frame_info + binary, writes immediately

### Configuration
Backend defaults in `backend_streaming.py`:
```python
VIDEO_CODEC = "mp4v"        # MP4 codec
DEFAULT_FPS = 30            # Default FPS
FRAME_BUFFER_SIZE = 5       # Smoothness buffer
```

Frontend settings in `startRecording()`:
```typescript
const success = await startRecording(30)  // 30 FPS
```

### Video Output
```
recordings/{sessionId}/
├── metadata.json
├── cam1/
│   ├── cam1_20260204_103015.mp4  (real-time written)
│   └── ml_results.json
├── cam2/ ...
└── cam3/ ...
```

### Adding a New Metric Type
1. Add to `METRIC_TYPES` and `BOX_COLORS` in constants.ts
2. Update MLResult interface in App.tsx
3. Extend Camera.metrics object to include new metric
4. Update MetricCard.tsx to display new metric in dashboard

### Modifying WebSocket Behavior
- Edit `connectWebSocket()` callback in useWebSocket.ts
- Ensure `onLog` calls wrap errors/status changes
- Test reconnection with browser DevTools network throttling
- Verify exponential backoff logic with timers

### Adding a New Control Button
1. Add handler function in App.tsx
2. Pass to ControlPanel as prop
3. Create button in ControlPanel with appropriate class (btn-primary/btn-secondary/btn-danger)
4. Add corresponding log entry via onLog callback

## Performance Considerations
- Frame send interval (250ms default) directly controls load on backend—increase if overloaded
- 3 simultaneous cameras at 1920x1080 requires significant bandwidth
- AbortControllers prevent memory leaks from cancelled getUserMedia calls
- Exponential backoff prevents reconnection storms on persistent backend outages

## Testing Notes
- No test suite configured yet (`npm test` is placeholder)
- Manual testing via browser DevTools: Network tab for WebSocket, Console for error logs
- Use `VITE_` environment variables to test different backend URLs locally
