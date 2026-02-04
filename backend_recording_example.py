"""
FastAPI backend for handling video recording from PLTU Monitoring System frontend.

This module provides endpoints for:
1. Starting/stopping recording sessions
2. Receiving frame data from multiple cameras
3. Saving frames to video files
4. Integrating with ML analysis results

Requires:
- fastapi
- opencv-python (cv2)
- python-multipart
- aiofiles (optional, for async file operations)

Installation:
    pip install fastapi opencv-python python-multipart uvicorn aiofiles

Usage:
    uvicorn backend:app --host 0.0.0.0 --port 8000 --reload
"""

import os
import json
import asyncio
from datetime import datetime
from typing import Optional
from pathlib import Path
from io import BytesIO

import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware  # ← TAMBAHAN INI
from pydantic import BaseModel

# ============================================================================
# Configuration
# ============================================================================

RECORDINGS_DIR = Path("recordings")
RECORDINGS_DIR.mkdir(exist_ok=True)

VIDEO_FPS = 15  # Target FPS for recorded video (lower = faster processing)
VIDEO_CODEC = "mp4v"  # MPEG-4 codec

# Session storage (in production, use database)
recording_sessions = {}


# ============================================================================
# Pydantic Models
# ============================================================================

class StartRecordingRequest(BaseModel):
    session_id: str


class StopRecordingRequest(BaseModel):
    session_id: str
    frame_count: int


class RecordingSession:
    """Manages a single recording session"""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.start_time = datetime.now()
        self.frames = {}  # {camera_id: [frame_data]}
        self.ml_data = {}  # {camera_id: [ml_results]}
        self.frame_count = {cam: 0 for cam in ["cam1", "cam2", "cam3"]}
        self.video_writers = {}  # {camera_id: cv2.VideoWriter}
        self.output_paths = {}  # {camera_id: path}

    def add_frame(self, camera_id: str, frame: np.ndarray, ml_data: Optional[dict] = None):
        """Add a frame to the session"""
        if camera_id not in self.frames:
            self.frames[camera_id] = []
            self.ml_data[camera_id] = []

        self.frames[camera_id].append(frame)
        if ml_data:
            self.ml_data[camera_id].append({
                "timestamp": datetime.now().isoformat(),
                **ml_data
            })

        self.frame_count[camera_id] += 1

    def create_video_writer(self, camera_id: str, frame_shape: tuple) -> cv2.VideoWriter:
        """Create a video writer for a camera"""
        height, width = frame_shape[:2]

        # Create output directory with camera ID
        output_dir = RECORDINGS_DIR / self.session_id / camera_id
        output_dir.mkdir(parents=True, exist_ok=True)

        # Output file path
        output_path = output_dir / f"{camera_id}_{self.start_time.strftime('%Y%m%d_%H%M%S')}.mp4"
        self.output_paths[camera_id] = str(output_path)

        # Create video writer with H.264 codec for compatibility
        fourcc = cv2.VideoWriter_fourcc(*VIDEO_CODEC)
        writer = cv2.VideoWriter(
            str(output_path),
            fourcc,
            VIDEO_FPS,
            (width, height)
        )

        return writer

    def finalize(self):
        """Finalize recording session and save videos"""
        results = {
            "session_id": self.session_id,
            "duration_seconds": (datetime.now() - self.start_time).total_seconds(),
            "cameras": {}
        }

        for camera_id, frames in self.frames.items():
            if not frames:
                continue

            # Get first frame to initialize writer
            first_frame = frames[0]
            writer = self.create_video_writer(camera_id, first_frame.shape)

            # Write all frames
            for frame in frames:
                # Resize frame if needed to match writer's expected size
                if writer.isOpened():
                    writer.write(frame)

            writer.release()

            # Save ML data if available
            ml_data = self.ml_data.get(camera_id, [])
            if ml_data:
                ml_file = Path(self.output_paths[camera_id]).parent / "ml_results.json"
                with open(ml_file, "w") as f:
                    json.dump(ml_data, f, indent=2)

            results["cameras"][camera_id] = {
                "video_path": self.output_paths[camera_id],
                "frame_count": len(frames),
                "ml_results_file": str(
                    Path(self.output_paths[camera_id]).parent / "ml_results.json") if ml_data else None
            }

        # Save session metadata
        metadata_file = RECORDINGS_DIR / self.session_id / "metadata.json"
        with open(metadata_file, "w") as f:
            json.dump({
                "session_id": self.session_id,
                "start_time": self.start_time.isoformat(),
                "end_time": datetime.now().isoformat(),
                "cameras": results["cameras"]
            }, f, indent=2)

        return results


# ============================================================================
# FastAPI Setup
# ============================================================================

app = FastAPI(
    title="PLTU Recording Service",
    description="Video recording backend for PLTU Monitoring System",
    version="1.0.0"
)

# ============================================================================
# CORS Configuration - TAMBAHAN INI!
# ============================================================================

# Development - allow semua origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Untuk development
    # Untuk production, ganti dengan URL spesifik:
    # allow_origins=["http://localhost:3000", "https://your-domain.com"],
    allow_credentials=True,
    allow_methods=["*"],  # Allow semua HTTP methods (GET, POST, PUT, DELETE, etc.)
    allow_headers=["*"],  # Allow semua headers
)

# ============================================================================
# Recording Endpoints
# ============================================================================

@app.post("/record/start")
async def start_recording(request: StartRecordingRequest):
    """
    Initialize a recording session

    Args:
        request: StartRecordingRequest with session_id

    Returns:
        JSON with session details
    """
    session_id = request.session_id

    if session_id in recording_sessions:
        return JSONResponse(
            status_code=400,
            content={"error": f"Session {session_id} already exists"}
        )

    session = RecordingSession(session_id)
    recording_sessions[session_id] = session

    print(f"[RECORDING] Started session: {session_id}")

    return {
        "status": "recording_started",
        "session_id": session_id,
        "timestamp": datetime.now().isoformat()
    }


@app.post("/record/frame")
async def record_frame(
        session_id: str = Form(...),
        camera_id: str = Form(...),
        frame_number: str = Form(...),
        frame: UploadFile = File(...),
        ml_data: Optional[str] = Form(None)
):
    """
    Receive and store a frame from a camera

    Args:
        session_id: Recording session ID
        camera_id: Camera identifier (cam1, cam2, cam3)
        frame_number: Frame sequence number
        frame: JPEG image file
        ml_data: Optional JSON string with ML analysis results

    Returns:
        JSON with status
    """
    if session_id not in recording_sessions:
        return JSONResponse(
            status_code=404,
            content={"error": f"Session {session_id} not found"}
        )

    session = recording_sessions[session_id]

    try:
        # Read image data
        contents = await frame.read()
        nparr = np.frombuffer(contents, np.uint8)
        frame_image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame_image is None:
            return JSONResponse(
                status_code=400,
                content={"error": "Failed to decode image"}
            )

        # Parse ML data if provided
        ml_dict = None
        if ml_data:
            try:
                ml_dict = json.loads(ml_data)
            except json.JSONDecodeError:
                print(f"Warning: Failed to parse ML data for {camera_id}")

        # Add frame to session
        session.add_frame(camera_id, frame_image, ml_dict)

        return {
            "status": "frame_received",
            "session_id": session_id,
            "camera_id": camera_id,
            "frame_number": int(frame_number)
        }

    except Exception as e:
        print(f"Error storing frame: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


@app.post("/record/stop")
async def stop_recording(request: StopRecordingRequest):
    """
    Finalize a recording session and save video files

    Args:
        request: StopRecordingRequest with session_id and frame_count

    Returns:
        JSON with paths to saved video files
    """
    session_id = request.session_id

    if session_id not in recording_sessions:
        return JSONResponse(
            status_code=404,
            content={"error": f"Session {session_id} not found"}
        )

    session = recording_sessions[session_id]

    try:
        # Process video files asynchronously
        print(f"[RECORDING] Finalizing session: {session_id}")
        results = await asyncio.to_thread(session.finalize)

        # Clean up session
        del recording_sessions[session_id]

        print(f"[RECORDING] Session {session_id} finalized successfully")

        return {
            "status": "recording_stopped",
            **results
        }

    except Exception as e:
        print(f"Error finalizing recording: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


# ============================================================================
# Health Check Endpoints
# ============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "PLTU Recording Service",
        "active_sessions": len(recording_sessions),
        "recordings_directory": str(RECORDINGS_DIR)
    }


@app.get("/recording/sessions")
async def get_active_sessions():
    """Get list of active recording sessions"""
    sessions = {}
    for session_id, session in recording_sessions.items():
        sessions[session_id] = {
            "start_time": session.start_time.isoformat(),
            "duration_seconds": (datetime.now() - session.start_time).total_seconds(),
            "cameras": {cam: session.frame_count[cam] for cam in session.frame_count}
        }
    return sessions


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    print("=" * 60)
    print("Starting PLTU Recording Service...")
    print(f"Recordings directory: {RECORDINGS_DIR.absolute()}")
    print("=" * 60)
    print()
    print("CORS Configuration:")
    print("  ✓ All origins allowed (Development mode)")
    print("  ✓ All methods allowed")
    print("  ✓ All headers allowed")
    print()
    print("Available at:")
    print("  → http://localhost:8000")
    print("  → http://0.0.0.0:8000")
    print()
    print("API Documentation:")
    print("  → http://localhost:8000/docs")
    print("=" * 60)

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )