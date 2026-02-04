"""
FastAPI backend dengan streaming WebSocket untuk video recording PLTU Monitoring System.

Features:
- Real-time frame streaming via WebSocket
- Simultaneous writing ke video file (tidak perlu buffer semua)
- Accurate FPS tracking
- ML metadata integration
- Scalable untuk multiple sessions dan cameras

Installation:
    pip install fastapi uvicorn opencv-python python-multipart websockets aiofiles

Usage:
    uvicorn backend_streaming:app --host 0.0.0.0 --port 8000 --reload
"""

import os
import json
import asyncio
from datetime import datetime
from typing import Optional, Dict, Set
from pathlib import Path
import base64
from threading import Thread, Lock

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, UploadFile, File, Form, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ============================================================================
# Configuration
# ============================================================================

RECORDINGS_DIR = Path("recordings")
RECORDINGS_DIR.mkdir(exist_ok=True)

# Video writer settings
VIDEO_CODEC = "mp4v"  # Use mp4v for MP4 files
DEFAULT_FPS = 30
FRAME_BUFFER_SIZE = 5  # Buffer beberapa frame sebelum write untuk smoothness

# ============================================================================
# Pydantic Models
# ============================================================================

class StartRecordingRequest(BaseModel):
    session_id: str
    fps: int = DEFAULT_FPS


class StopRecordingRequest(BaseModel):
    session_id: str


class FrameData(BaseModel):
    """Frame data structure"""
    camera_id: str
    timestamp: str
    ml_data: Optional[dict] = None


# ============================================================================
# Recording Session Manager
# ============================================================================

class CameraWriter:
    """Manages video writing untuk single camera dalam session"""
    
    def __init__(self, session_id: str, camera_id: str, fps: int = DEFAULT_FPS):
        self.session_id = session_id
        self.camera_id = camera_id
        self.fps = fps
        
        # Output paths
        self.output_dir = RECORDINGS_DIR / session_id / camera_id
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        timestamp_str = datetime.now().strftime('%Y%m%d_%H%M%S')
        self.video_path = self.output_dir / f"{camera_id}_{timestamp_str}.mp4"
        self.ml_path = self.output_dir / "ml_results.json"
        
        # Video writer (akan diinisialisasi saat frame pertama diterima)
        self.writer = None
        self.frame_size = None
        self.frame_count = 0
        self.ml_results = []
        
        # Thread safety
        self.lock = Lock()
        
    def write_frame(self, frame: np.ndarray, ml_data: Optional[dict] = None):
        """Write frame ke video file (thread-safe)"""
        with self.lock:
            # Initialize writer pada frame pertama
            if self.writer is None:
                self.frame_size = (frame.shape[1], frame.shape[0])  # (width, height)
                fourcc = cv2.VideoWriter_fourcc(*VIDEO_CODEC)
                
                self.writer = cv2.VideoWriter(
                    str(self.video_path),
                    fourcc,
                    self.fps,
                    self.frame_size
                )
                
                if not self.writer.isOpened():
                    raise RuntimeError(f"Failed to open video writer for {self.camera_id}")
                
                print(f"[{self.session_id}] {self.camera_id}: Video writer opened - {self.frame_size} @ {self.fps} FPS")
            
            # Ensure frame size matches
            if frame.shape[:2] != (self.frame_size[1], self.frame_size[0]):
                frame = cv2.resize(frame, self.frame_size)
            
            # Write frame
            if self.writer.isOpened():
                self.writer.write(frame)
                self.frame_count += 1
            
            # Store ML data
            if ml_data:
                self.ml_results.append({
                    "frame_number": self.frame_count,
                    "timestamp": datetime.now().isoformat(),
                    **ml_data
                })
    
    def finalize(self):
        """Release writer dan save metadata"""
        with self.lock:
            if self.writer and self.writer.isOpened():
                self.writer.release()
                print(f"[{self.session_id}] {self.camera_id}: Video saved - {self.frame_count} frames @ {self.fps} FPS")
            
            # Save ML results
            if self.ml_results:
                with open(self.ml_path, 'w') as f:
                    json.dump(self.ml_results, f, indent=2)
                print(f"[{self.session_id}] {self.camera_id}: ML results saved - {len(self.ml_results)} entries")


class RecordingSession:
    """Manages complete recording session (up to 3 cameras)"""
    
    def __init__(self, session_id: str, fps: int = DEFAULT_FPS):
        self.session_id = session_id
        self.fps = fps
        self.start_time = datetime.now()
        self.cameras: Dict[str, CameraWriter] = {}
        self.active = True
        self.lock = Lock()
        
    def get_or_create_camera_writer(self, camera_id: str) -> CameraWriter:
        """Get or create camera writer"""
        with self.lock:
            if camera_id not in self.cameras:
                self.cameras[camera_id] = CameraWriter(self.session_id, camera_id, self.fps)
            return self.cameras[camera_id]
    
    def write_frame(self, camera_id: str, frame: np.ndarray, ml_data: Optional[dict] = None):
        """Write frame dari camera"""
        if not self.active:
            return
        
        writer = self.get_or_create_camera_writer(camera_id)
        writer.write_frame(frame, ml_data)
    
    def finalize(self):
        """Finalize semua camera writers"""
        with self.lock:
            self.active = False
            duration = (datetime.now() - self.start_time).total_seconds()
            
            results = {
                "session_id": self.session_id,
                "duration_seconds": duration,
                "fps": self.fps,
                "cameras": {}
            }
            
            for camera_id, writer in self.cameras.items():
                writer.finalize()
                results["cameras"][camera_id] = {
                    "video_path": str(writer.video_path),
                    "frame_count": writer.frame_count,
                    "ml_results_file": str(writer.ml_path) if writer.ml_results else None
                }
            
            # Save session metadata
            metadata_path = RECORDINGS_DIR / self.session_id / "metadata.json"
            with open(metadata_path, 'w') as f:
                json.dump(results, f, indent=2)
            
            print(f"[{self.session_id}] Session finalized - Duration: {duration:.1f}s")
            
            return results


# ============================================================================
# Global Session Manager
# ============================================================================

session_manager: Dict[str, RecordingSession] = {}
session_lock = Lock()


def get_or_create_session(session_id: str, fps: int = DEFAULT_FPS) -> RecordingSession:
    """Get or create recording session (thread-safe)"""
    with session_lock:
        if session_id not in session_manager:
            session_manager[session_id] = RecordingSession(session_id, fps)
            print(f"Created recording session: {session_id} @ {fps} FPS")
        return session_manager[session_id]


def delete_session(session_id: str):
    """Delete session setelah finalize"""
    with session_lock:
        if session_id in session_manager:
            del session_manager[session_id]


# ============================================================================
# FastAPI App
# ============================================================================

app = FastAPI(
    title="PLTU Recording Service (Streaming)",
    description="Real-time video recording with WebSocket streaming",
    version="2.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# REST Endpoints (HTTP)
# ============================================================================

@app.post("/record/start")
async def start_recording(request: StartRecordingRequest):
    """Start recording session"""
    try:
        session = get_or_create_session(request.session_id, request.fps)
        return {
            "status": "recording_started",
            "session_id": request.session_id,
            "fps": request.fps,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return JSONResponse(
            status_code=400,
            content={"error": str(e)}
        )


@app.post("/record/frame")
async def record_frame(
    session_id: str = Form(...),
    camera_id: str = Form(...),
    frame_data: UploadFile = File(...),
    ml_data: Optional[str] = Form(None)
):
    """
    HTTP endpoint untuk frame upload (fallback jika WebSocket tidak tersedia).
    Biasanya menggunakan WebSocket lebih efisien untuk streaming.
    """
    if session_id not in session_manager:
        return JSONResponse(status_code=404, content={"error": "Session not found"})
    
    try:
        session = session_manager[session_id]
        
        # Read frame
        contents = await frame_data.read()
        nparr = np.frombuffer(contents, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            return JSONResponse(status_code=400, content={"error": "Invalid frame data"})
        
        # Parse ML data
        ml_dict = None
        if ml_data:
            try:
                ml_dict = json.loads(ml_data)
            except json.JSONDecodeError:
                pass
        
        # Write frame (async safe)
        session.write_frame(camera_id, frame, ml_dict)
        
        return {
            "status": "frame_received",
            "session_id": session_id,
            "camera_id": camera_id
        }
    
    except Exception as e:
        print(f"Error recording frame: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/record/stop")
async def stop_recording(request: StopRecordingRequest):
    """Stop recording dan finalize video files"""
    if request.session_id not in session_manager:
        return JSONResponse(status_code=404, content={"error": "Session not found"})
    
    try:
        session = session_manager[request.session_id]
        results = session.finalize()
        delete_session(request.session_id)
        
        return {
            "status": "recording_stopped",
            **results
        }
    
    except Exception as e:
        print(f"Error stopping recording: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


# ============================================================================
# WebSocket Endpoints (Real-time Streaming)
# ============================================================================

@app.websocket("/ws/record/{session_id}")
async def websocket_record(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint untuk real-time frame streaming.
    
    Protocol:
    Client → Server:
      1. JSON: {"type": "init", "fps": 30}
      2. For each frame:
         - JSON: {"type": "frame_info", "camera_id": "cam1", "frame_number": 1, "ml_data": {...}}
         - Binary: JPEG frame data
    
    Server → Client:
      - JSON: {"status": "ok|error", "message": "..."}
    """
    await websocket.accept()
    
    try:
        session = get_or_create_session(session_id)
        last_camera_id = None
        last_ml_data = None
        
        print(f"[WebSocket] Client connected: {session_id}")
        
        while True:
            try:
                # Receive message (bisa text atau binary)
                data = await websocket.receive()
                
                if "text" in data:
                    # JSON message (metadata atau init)
                    msg = json.loads(data["text"])
                    
                    if msg.get("type") == "init":
                        fps = msg.get("fps", DEFAULT_FPS)
                        session.fps = fps
                        print(f"[WebSocket] {session_id}: Initialized @ {fps} FPS")
                        try:
                            await websocket.send_json({"status": "ok", "message": f"Initialized @ {fps} FPS"})
                        except Exception as send_error:
                            print(f"[WebSocket] {session_id}: Failed to send init ack: {send_error}")
                    
                    elif msg.get("type") == "frame_info":
                        # Store frame info untuk frame binary berikutnya
                        last_camera_id = msg.get("camera_id")
                        last_ml_data = msg.get("ml_data")
                        print(f"[WebSocket] {session_id}: Frame info - {last_camera_id}")
                
                elif "bytes" in data:
                    # Binary frame data
                    if not last_camera_id:
                        print(f"[WebSocket] {session_id}: ERROR - Received frame without camera_id")
                        try:
                            await websocket.send_json({"status": "error", "message": "No camera_id specified"})
                        except Exception as send_error:
                            print(f"[WebSocket] {session_id}: Failed to send error: {send_error}")
                        continue
                    
                    frame_bytes = data["bytes"]
                    
                    # Decode frame
                    nparr = np.frombuffer(frame_bytes, np.uint8)
                    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                    
                    if frame is None:
                        print(f"[WebSocket] {session_id}: Failed to decode frame")
                        try:
                            await websocket.send_json({"status": "error", "message": "Failed to decode frame"})
                        except Exception as send_error:
                            print(f"[WebSocket] {session_id}: Failed to send error: {send_error}")
                        continue
                    
                    # Write frame to video file
                    try:
                        session.write_frame(last_camera_id, frame, last_ml_data)
                        print(f"[WebSocket] {session_id}: Frame recorded for {last_camera_id}")
                        try:
                            await websocket.send_json({
                                "status": "ok", 
                                "message": "Frame recorded",
                                "camera_id": last_camera_id
                            })
                        except Exception as send_error:
                            print(f"[WebSocket] {session_id}: Failed to send frame ack: {send_error}")
                    except Exception as write_error:
                        print(f"[WebSocket] {session_id}: Error writing frame: {write_error}")
                        try:
                            await websocket.send_json({"status": "error", "message": str(write_error)})
                        except Exception as send_error:
                            print(f"[WebSocket] {session_id}: Failed to send error: {send_error}")
            
            except json.JSONDecodeError as e:
                print(f"[WebSocket] {session_id}: JSON decode error: {e}")
                try:
                    await websocket.send_json({"status": "error", "message": f"Invalid JSON: {e}"})
                except Exception as send_error:
                    print(f"[WebSocket] {session_id}: Failed to send error: {send_error}")
            except Exception as e:
                print(f"[WebSocket] {session_id}: Error processing message: {e}")
                try:
                    await websocket.send_json({"status": "error", "message": str(e)})
                except Exception as send_error:
                    print(f"[WebSocket] {session_id}: Failed to send error: {send_error}")
    
    except WebSocketDisconnect:
        print(f"[WebSocket] Client disconnected: {session_id}")
        if session_id in session_manager:
            session = session_manager[session_id]
            results = session.finalize()
            delete_session(session_id)
            print(f"[WebSocket] Session finalized on disconnect: {session_id}")
    except Exception as e:
        print(f"[WebSocket] Fatal error in {session_id}: {e}")
        import traceback
        traceback.print_exc()


# ============================================================================
# Health & Status Endpoints
# ============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "PLTU Recording Service (Streaming)",
        "active_sessions": len(session_manager),
        "recordings_directory": str(RECORDINGS_DIR),
        "codec": VIDEO_CODEC,
        "default_fps": DEFAULT_FPS
    }


@app.get("/recording/sessions")
async def get_active_sessions():
    """List active recording sessions"""
    sessions_info = {}
    
    with session_lock:
        for session_id, session in session_manager.items():
            duration = (datetime.now() - session.start_time).total_seconds()
            camera_info = {}
            
            for cam_id, writer in session.cameras.items():
                camera_info[cam_id] = {
                    "frame_count": writer.frame_count,
                    "ml_entries": len(writer.ml_results)
                }
            
            sessions_info[session_id] = {
                "duration_seconds": duration,
                "fps": session.fps,
                "cameras": camera_info
            }
    
    return sessions_info


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    
    print("=" * 70)
    print("Starting PLTU Recording Service (Streaming)")
    print("=" * 70)
    print(f"Recordings directory: {RECORDINGS_DIR.absolute()}")
    print(f"Default FPS: {DEFAULT_FPS}")
    print(f"Codec: {VIDEO_CODEC}")
    print(f"")
    print(f"HTTP Endpoints:")
    print(f"  - POST /record/start (initialize session)")
    print(f"  - POST /record/frame (upload frame via HTTP)")
    print(f"  - POST /record/stop (finalize session)")
    print(f"  - GET /health (health check)")
    print(f"")
    print(f"WebSocket Endpoints:")
    print(f"  - WS /ws/record/{{session_id}} (real-time streaming)")
    print("=" * 70)
    print("")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
