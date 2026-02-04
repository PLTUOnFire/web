# Video Recording Implementation Guide

## Overview

This guide describes the video recording functionality for the PLTU Monitoring System. The system captures video frames from up to 3 cameras in real-time and saves them as MP4 video files with associated ML analysis metadata.

### Key Improvement: Real-Time Streaming

The backend now writes video frames **in real-time** as they arrive, instead of buffering all frames and writing at the end. This solves the issue where videos were only 1 second long even with many frames.

**Problem**: Old approach buffered all frames in memory → wrote to disk only at `stop()` → VIDEO_FPS was fixed (15 FPS) but frames arrived at 4 FPS
**Solution**: New streaming approach writes frames immediately as received → accurate video duration and frame count

## Architecture

### Frontend Flow
```
┌─────────────────┐
│   Video Stream  │
└────────┬────────┘
         │
         v
    ┌─────────┐
    │ useCamera
    │ (capture frames)
    └────┬────┘
         │
    ┌────┴──────────────────┐
    │                       │
    v                       v
┌──────────┐         ┌──────────────┐
│useWebSocket        │useRecorder
│(ML analysis)       │(video stream)
└──────┬──────┘      └─────┬────────┘
       │                   │
       └─────────┬─────────┘
                 v
          ┌──────────────┐
          │ Backend      │
          │ WebSocket +  │
          │ HTTP REST    │
          └──────────────┘
```

### Backend Processing (Real-Time Streaming)

```
POST /record/start → Create session, initialize video writers
   ↓
WebSocket /ws/record/{sessionId} → Stream frames in real-time
   ↓
CameraWriter writes frames immediately to MP4 (no buffering)
   ↓
POST /record/stop → Finalize writers, save ML metadata, return results

Output:
recordings/
├── {session_id}/
│   ├── metadata.json
│   ├── cam1/
│   │   ├── cam1_20260204_103015.mp4  ← Written in real-time
│   │   └── ml_results.json
│   ├── cam2/
│   │   ├── cam2_20260204_103015.mp4  ← Written in real-time
│   │   └── ml_results.json
│   └── cam3/
│       ├── cam3_20260204_103015.mp4  ← Written in real-time
│       └── ml_results.json
```

## Frontend Implementation

### 1. useRecorder Hook (`src/hooks/useRecorder.ts`)

#### Key Features
- **Session Management**: Creates unique session ID on record start
- **Frame Batching**: Throttles uploads to prevent overwhelming backend
- **ML Integration**: Includes ML results with each frame (optional)
- **JPEG Compression**: Uses 85% quality to reduce file size

#### API
```typescript
const {
  isRecording,        // boolean - current recording state
  startRecording,     // async () => boolean
  stopRecording,      // async () => boolean
  sendFrame,          // (camId, videoElement, mlResult?) => void
  sessionId           // string | null
} = useRecorder({ onLog })
```

#### Usage Example
```typescript
// Start recording
const success = await startRecording()
if (success) {
  // Recording session created on backend
}

// Send frame (called automatically by App.tsx)
sendFrame('cam1', videoElement, mlResult)

// Stop recording
const success = await stopRecording()
if (success) {
  // Video files saved to backend
}
```

### 2. App.tsx Integration

The `App.tsx` has been updated to:

1. **Import useRecorder**
   ```typescript
   import { useRecorder } from './hooks/useRecorder'
   ```

2. **Initialize recorder**
   ```typescript
   const {
     isRecording,
     startRecording,
     stopRecording,
     sendFrame: sendRecorderFrame
   } = useRecorder({ onLog: addLog })
   ```

3. **Store ML results**
   ```typescript
   const lastMLResultRef = useRef<MLResult | null>(null)
   
   function handleMLResult(data: MLResult) {
     lastMLResultRef.current = data  // Store for recorder
     // ... existing logic
   }
   ```

4. **Send frames to both ML and recorder**
   ```typescript
   useEffect(() => {
     const interval = setInterval(() => {
       Object.keys(streamsRef.current).forEach(camId => {
         if (wsConnected) {
           sendFrame(camId, videoRef)  // To ML backend
         }
         
         if (isRecording) {
           sendRecorderFrame(camId, videoRef, lastMLResultRef.current)
         }
       })
     }, 200)
   }, [wsConnected, isRecording, ...])
   ```

5. **Handle recording toggle**
   ```typescript
   const handleToggleRecording = async () => {
     if (!isRecording) {
       await startRecording()
     } else {
       await stopRecording()
     }
   }
   ```

## Backend Implementation

### Requirements
```bash
pip install fastapi uvicorn opencv-python python-multipart aiofiles
```

### File: `backend_recording_example.py`

#### Key Components

**RecordingSession Class**
- Manages individual recording sessions
- Stores frames in memory (configurable for database)
- Handles video writer initialization
- Finalizes videos and saves metadata

**Endpoints**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/record/start` | POST | Initialize recording session |
| `/record/frame` | POST | Receive frame data |
| `/record/stop` | POST | Finalize and save videos |
| `/health` | GET | Health check |
| `/recording/sessions` | GET | List active sessions |

#### Configuration

Edit these variables in `backend_recording_example.py`:

```python
RECORDINGS_DIR = Path("recordings")  # Output directory
VIDEO_FPS = 15                       # Target FPS (lower = faster processing)
VIDEO_CODEC = "mp4v"                 # MPEG-4 codec (H.264 format)
```

### Output Structure

After recording stops, files are organized as:

```
recordings/{session_id}/
├── metadata.json           # Session metadata
├── cam1/
│   ├── cam1_20260204_103015.mp4
│   └── ml_results.json
├── cam2/
│   ├── cam2_20260204_103015.mp4
│   └── ml_results.json
└── cam3/
    ├── cam3_20260204_103015.mp4
    └── ml_results.json
```

### ML Results Format

Each `ml_results.json` contains an array of ML analysis results:

```json
[
  {
    "timestamp": "2026-02-04T10:30:15.123456",
    "camera_id": "cam1",
    "drowsy": 0.45,
    "stress": 0.32,
    "confidence": 0.98,
    "face": true,
    "boxes": [
      {
        "x": 0.35,
        "y": 0.25,
        "w": 0.30,
        "h": 0.35,
        "label": "face",
        "score": 0.98
      }
    ]
  },
  ...
]
```

## Environment Configuration

Update `.env` or configure these environment variables:

```bash
# Frontend
VITE_API_URL=http://localhost:8000

# Backend (optional, for CORS)
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

## Running the System

### 1. Start Backend Recording Service

```bash
# Option 1: Using the example backend
python backend_recording_example.py

# Option 2: Use existing FastAPI backend with recording endpoints added
uvicorn your_backend:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Start Frontend

```bash
npm run dev
```

### 3. Start Recording

- Click "Start Cameras" to begin capturing
- Click "Connect ML" to start ML analysis (optional)
- Click "Start Recording" to begin saving video files
- Frames will be captured at ~5 FPS and sent to backend
- Click "Stop Recording" to finalize videos

## Performance Considerations

### Frame Rate
- Default: Send frames every 250ms (~4 FPS)
- Recording saves at 15 FPS (interpolated from fewer frames)
- Adjust `VITE_FRAME_SEND_INTERVAL` in `config.ts` to balance latency and bandwidth

### Bandwidth
- 3 cameras × 1920x1080 JPEG at 85% quality ≈ 200-300 KB per second
- Adjust JPEG quality in `useRecorder.ts` (default: 0.85)

### Storage
- 1 hour of 3-camera recording at 15 FPS ≈ 3-5 GB
- Configure `RECORDINGS_DIR` to use high-capacity storage

### Memory
- Frames are buffered in memory during recording
- For long sessions (>1 hour), consider implementing streaming to disk
- Update `RecordingSession` to use file-based queues

## Troubleshooting

### Recording Start Fails
- Check backend is running: `curl http://localhost:8000/health`
- Check logs: `VITE_API_URL` is correct in frontend config
- Verify CORS if on different domains

### Frames Not Received
- Check Network tab in DevTools
- Verify `POST /record/frame` requests are sending
- Check backend logs for errors

### Video Files Not Saved
- Verify `RECORDINGS_DIR` exists and is writable
- Check disk space available
- Look for errors in backend logs

### Video Quality Issues
- Adjust `VIDEO_FPS` in backend
- Increase JPEG quality in `useRecorder.ts` (0.85 → 0.95)
- Ensure camera frames are being sent regularly

## Integration with ML Pipeline

The recording system integrates with ML results in two ways:

### 1. Attached to Frames
```typescript
sendFrame('cam1', videoElement, mlResult)
```
ML data is stored in `ml_results.json` alongside the video.

### 2. Frame Selection
```typescript
// In backend_recording_example.py
if ml_dict:
  ml_dict = json.loads(ml_data)
  # Can filter/process frames based on ML results
  # e.g., only save frames with faces, high drowsiness, etc.
```

### Example: Selective Recording
```python
# In recordFrame endpoint
if ml_dict and ml_dict.get('drowsy', 0) > 0.7:
  session.add_frame(camera_id, frame_image, ml_dict)
  # Only save high-drowsiness frames
```

## Next Steps

1. **Copy example backend** to your actual backend codebase
2. **Integrate endpoints** into existing FastAPI/Flask app
3. **Update frontend** configuration with actual backend URL
4. **Test** with single camera first, then multiple cameras
5. **Monitor** performance and adjust frame rate/quality as needed
6. **Database integration** - move from in-memory to proper storage
7. **Video processing** - add compression, transcoding, or analysis post-recording

## API Reference

### POST /record/start
Start a new recording session.

**Request:**
```json
{
  "session_id": "1707053415123-abc123def"
}
```

**Response:**
```json
{
  "status": "recording_started",
  "session_id": "1707053415123-abc123def",
  "timestamp": "2026-02-04T10:30:15.123456"
}
```

### POST /record/frame
Send a frame to be recorded.

**Request (multipart/form-data):**
- `session_id` (string)
- `camera_id` (string)
- `frame_number` (string)
- `frame` (file - JPEG)
- `ml_data` (string - optional JSON)

**Response:**
```json
{
  "status": "frame_received",
  "session_id": "1707053415123-abc123def",
  "camera_id": "cam1",
  "frame_number": 42
}
```

### POST /record/stop
Stop recording and save videos.

**Request:**
```json
{
  "session_id": "1707053415123-abc123def",
  "frame_count": 2500
}
```

**Response:**
```json
{
  "status": "recording_stopped",
  "session_id": "1707053415123-abc123def",
  "duration_seconds": 180.5,
  "cameras": {
    "cam1": {
      "video_path": "recordings/1707053415123-abc123def/cam1/cam1_20260204_103015.mp4",
      "frame_count": 2500,
      "ml_results_file": "recordings/1707053415123-abc123def/cam1/ml_results.json"
    }
  }
}
```
