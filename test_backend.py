#!/usr/bin/env python3
"""
Simple test script untuk PLTU Recording Service backend.

Menguji:
1. HTTP endpoints (/record/start, /record/stop, /record/frame)
2. WebSocket streaming
3. Video file creation

Usage:
    python test_backend.py
"""

import asyncio
import json
import time
import cv2
import numpy as np
import websockets
import aiohttp
from pathlib import Path

BASE_URL = "http://localhost:8000"
WS_URL = "ws://localhost:8000"

async def test_http_endpoints():
    """Test HTTP endpoints"""
    print("\n" + "="*70)
    print("Testing HTTP Endpoints")
    print("="*70)
    
    async with aiohttp.ClientSession() as session:
        # 1. Health check
        print("\n[1] Health Check")
        async with session.get(f"{BASE_URL}/health") as resp:
            health = await resp.json()
            print(f"Status: {health['status']}")
            print(f"Service: {health['service']}")
            print(f"Active sessions: {health['active_sessions']}")
        
        # 2. Start recording
        print("\n[2] Start Recording Session")
        session_id = f"test-{int(time.time())}"
        start_payload = {
            "session_id": session_id,
            "fps": 30
        }
        async with session.post(
            f"{BASE_URL}/record/start",
            json=start_payload
        ) as resp:
            result = await resp.json()
            print(f"Response: {json.dumps(result, indent=2)}")
        
        # 3. Generate and send test frame
        print("\n[3] Send Test Frame (HTTP fallback)")
        frame = np.random.randint(0, 255, (1080, 1920, 3), dtype=np.uint8)
        ret, jpeg = cv2.imencode('.jpg', frame)
        
        data = aiohttp.FormData()
        data.add_field('session_id', session_id)
        data.add_field('camera_id', 'cam1')
        data.add_field('frame_data', jpeg.tobytes(), filename='frame.jpg')
        data.add_field('ml_data', json.dumps({"drowsy": 0.5, "stress": 0.3}))
        
        async with session.post(
            f"{BASE_URL}/record/frame",
            data=data
        ) as resp:
            print(f"Response status: {resp.status}")
            result = await resp.json()
            print(f"Response: {json.dumps(result, indent=2)}")
        
        # 4. Stop recording
        print("\n[4] Stop Recording Session")
        stop_payload = {"session_id": session_id}
        async with session.post(
            f"{BASE_URL}/record/stop",
            json=stop_payload
        ) as resp:
            result = await resp.json()
            print(f"Response: {json.dumps(result, indent=2)}")
        
        # 5. Check recorded files
        print("\n[5] Check Recorded Files")
        recordings_dir = Path("recordings") / session_id
        if recordings_dir.exists():
            print(f"Session directory: {recordings_dir}")
            for camera_dir in recordings_dir.iterdir():
                if camera_dir.is_dir():
                    print(f"  Camera: {camera_dir.name}")
                    for file in camera_dir.iterdir():
                        print(f"    - {file.name} ({file.stat().st_size} bytes)")
        else:
            print(f"Session directory not found: {recordings_dir}")


async def test_websocket_streaming():
    """Test WebSocket streaming"""
    print("\n" + "="*70)
    print("Testing WebSocket Streaming")
    print("="*70)
    
    session_id = f"ws-test-{int(time.time())}"
    
    # First, start the session via HTTP
    print("\n[1] Start Recording Session (HTTP)")
    async with aiohttp.ClientSession() as session:
        start_payload = {
            "session_id": session_id,
            "fps": 15
        }
        async with session.post(
            f"{BASE_URL}/record/start",
            json=start_payload
        ) as resp:
            result = await resp.json()
            print(f"Session created: {result['session_id']}")
    
    # Connect via WebSocket
    print(f"\n[2] Connect WebSocket")
    ws_url = f"{WS_URL}/ws/record/{session_id}"
    print(f"Connecting to: {ws_url}")
    
    try:
        async with websockets.connect(ws_url) as websocket:
            print("WebSocket connected!")
            
            # Send initialization
            print("\n[3] Send Initialization")
            init_msg = {"type": "init", "fps": 15}
            await websocket.send(json.dumps(init_msg))
            response = await websocket.recv()
            print(f"Response: {response}")
            
            # Send test frames
            print("\n[4] Send Test Frames")
            for i in range(5):
                # Create test frame
                frame = np.random.randint(0, 255, (1080, 1920, 3), dtype=np.uint8)
                ret, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                
                # Send frame_info
                frame_info = {
                    "type": "frame_info",
                    "camera_id": "cam1",
                    "frame_number": i + 1,
                    "ml_data": {"drowsy": 0.1 * (i+1), "stress": 0.05 * (i+1)}
                }
                await websocket.send(json.dumps(frame_info))
                
                # Send binary frame
                await websocket.send(jpeg.tobytes())
                
                # Get response
                response = await websocket.recv()
                print(f"  Frame {i+1}: {response}")
                
                await asyncio.sleep(0.2)
            
            print("\nClosing WebSocket...")
    
    except Exception as e:
        print(f"WebSocket error: {e}")
    
    # Stop recording via HTTP
    print("\n[5] Stop Recording Session (HTTP)")
    async with aiohttp.ClientSession() as session:
        stop_payload = {"session_id": session_id}
        async with session.post(
            f"{BASE_URL}/record/stop",
            json=stop_payload
        ) as resp:
            result = await resp.json()
            print(f"Session stopped")
            print(f"Duration: {result['duration_seconds']:.1f}s")
            for cam_id, cam_data in result['cameras'].items():
                print(f"  {cam_id}: {cam_data['frame_count']} frames -> {cam_data['video_path']}")


async def main():
    """Run all tests"""
    print("\n" + "="*70)
    print("PLTU Recording Service - Backend Tests")
    print("="*70)
    
    try:
        # Test HTTP endpoints
        await test_http_endpoints()
        
        # Test WebSocket streaming
        await test_websocket_streaming()
        
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n" + "="*70)
    print("Tests completed!")
    print("="*70 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
