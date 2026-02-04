# PLTU Recording System - Setup & Test Guide

## Backend Setup & Running

### 1. Install Dependencies
```bash
pip install fastapi uvicorn opencv-python python-multipart websockets aiofiles aiohttp
```

### 2. Run Backend Service
```bash
# Terminal 1 - Backend
python backend_streaming.py

# Expected output:
# ======================================================================
# Starting PLTU Recording Service (Streaming)
# ======================================================================
# Recordings directory: C:\path\to\recordings
# Default FPS: 30
# Codec: mp4v
#
# HTTP Endpoints:
#   - POST /record/start (initialize session)
#   - POST /record/frame (upload frame via HTTP)
#   - POST /record/stop (finalize session)
#   - GET /health (health check)
#
# WebSocket Endpoints:
#   - WS /ws/record/{session_id} (real-time streaming)
# ======================================================================
```

### 3. Test Backend
```bash
# Terminal 2 - Test
python test_backend.py

# This will:
# 1. Test HTTP endpoints (/health, /record/start, /record/frame, /record/stop)
# 2. Test WebSocket streaming with real frames
# 3. Verify video files are created correctly
```

## Frontend Setup & Running

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Configure API URL
Edit `src/config.ts`:
```typescript
const config = {
  wsUrl: 'ws://localhost:8000/ws',  // WebSocket for ML
  apiUrl: 'http://localhost:8000',   // REST API for recording
  // ... rest of config
}
```

### 3. Run Frontend
```bash
# Terminal 3 - Frontend
npm run dev

# Expected output:
#   VITE v5.0.8  ready in 100 ms
#   ➜  Local:   http://localhost:5173/
#   ➜  press h to show help
```

### 4. Open in Browser
```
http://localhost:5173
```

## Using the Recording System

### Step 1: Start Cameras
1. Click "▶ Start Cameras"
2. Wait for video feeds to appear
3. Check logs for "All cameras started successfully"

### Step 2: Connect ML Backend (Optional)
1. Click "🔌 Connect ML" to connect to ML service
2. Check logs for "WebSocket connected successfully"
3. Bounding boxes will appear on videos

### Step 3: Start Recording
1. Click "⏺ Start Recording"
2. Check logs for "Recording started (Session: ...)"
3. Watch videos play in real-time
4. Frames are being sent to backend and written to disk

### Step 4: Stop Recording
1. Click "⏹ Stop All" or "⏸ Stop Recording"
2. Check logs for "Recording stopped. Duration: XXs, Total frames: YYY"
3. Videos are saved to `recordings/{session_id}/{camera_id}/`

## Verifying Recorded Videos

### Check Video Files
```bash
# Videos are saved in:
recordings/
├── {session_id}/
│   ├── metadata.json           # Session info
│   ├── cam1/
│   │   ├── cam1_20260204_103015.mp4  # Actual video
│   │   └── ml_results.json             # ML metadata
│   ├── cam2/
│   │   ├── cam2_20260204_103015.mp4
│   │   └── ml_results.json
│   └── cam3/
│       ├── cam3_20260204_103015.mp4
│       └── ml_results.json
```

### Play Video
```bash
# Windows
start recordings\{session_id}\cam1\cam1_*.mp4

# Linux/Mac
open recordings/{session_id}/cam1/cam1_*.mp4
```

### Check Video Info
```bash
# Using ffprobe (part of ffmpeg)
ffprobe -v quiet -show_format -show_streams recordings/{session_id}/cam1/cam1_*.mp4
```

## Troubleshooting

### WebSocket Connection Failed
**Error:** `WebSocket connection to 'ws://localhost:8000/ws/record/...' failed`

**Solutions:**
1. Make sure backend is running: `python backend_streaming.py`
2. Check `wsUrl` in `config.ts` is correct
3. Try HTTP fallback (will still work but slightly slower)
4. Check firewall/network settings

### Video File Not Created
**Error:** Recording stops but no video files in `recordings/` directory

**Solutions:**
1. Check `recordings/` directory exists and is writable
2. Check backend logs for errors
3. Verify session was started with `/record/start`
4. Make sure frames are being sent

### Video Duration is Wrong
**Error:** Video is too short or too long compared to actual recording time

**Solutions:**
1. This should NOT happen with v2.0 (streaming backend)
2. Check you're using `backend_streaming.py`, not old version
3. Verify frames are arriving at expected rate (~4/sec for 250ms interval)

### Frames Not Being Recorded
**Error:** Backend logs show "Frame info" but no frames written

**Solutions:**
1. Check frame binary data is being sent after frame_info
2. Verify camera_id in frame_info matches what's expected
3. Check backend logs for "Error writing frame"

## Architecture Summary

```
Frontend (React/TypeScript)
  ├── useCamera: Captures from video elements
  ├── useWebSocket: Sends to ML backend
  └── useRecorder: Streams to Recording backend
         │
         v
Backend (FastAPI)
  ├── HTTP /record/start   → Create session
  ├── WebSocket /ws/record/{id} → Stream frames
  │   └── CameraWriter → Writes immediately to MP4
  └── HTTP /record/stop    → Finalize videos
         │
         v
      Disk (recordings/)
  └── MP4 videos + metadata
```

## Performance Tips

1. **Bandwidth**: Lower `VITE_FRAME_SEND_INTERVAL` from 250ms if you have good network
2. **Quality**: Adjust JPEG quality in `useRecorder.ts` (0.85 = 85%)
3. **FPS**: Adjust `fps` parameter in `startRecording(fps)` call
4. **Storage**: High-res multi-camera records ~100MB per minute

## Known Limitations

1. **Sessions stored in memory**: Restart backend clears active sessions
2. **No authentication**: Anyone can start/stop recordings
3. **Single machine**: Backend must be on accessible network
4. **No database**: Use filesystem storage only

## Future Improvements

- [ ] Database backend for sessions (PostgreSQL/MongoDB)
- [ ] Authentication/authorization
- [ ] Video compression/transcoding
- [ ] Distributed backend (multiple recorders)
- [ ] Pause/resume recording
- [ ] Recording quality profiles

## Support

Check logs for errors:
- **Backend**: Terminal where `python backend_streaming.py` is running
- **Frontend**: Browser DevTools Console (F12)
- **Network**: Browser DevTools Network tab (check WebSocket requests)
