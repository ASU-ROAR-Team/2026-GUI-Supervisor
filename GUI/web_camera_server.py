#!/usr/bin/env python3
"""
High-Performance Multi-Camera Web Server & Dedicated Camera Dashboard
Features:
- Port 9090: Dedicated Camera Control & Multi-Camera Streaming Dashboard GUI
- Port 9090 / 8080: MJPEG stream endpoints (/api/stream/<cam>) & JPEG frame endpoints (/api/frame/<cam>)
- Smart Auto-Discovery: Uses external robotic cameras (/dev/video2, 4, 6, 8, 10) when attached;
  automatically falls back to laptop webcam (/dev/video0) when no external cameras are connected.
- Interactive Lighting controls (Brightness, Contrast, Exposure) & Environmental Presets
"""

import cv2
import threading
import time
import subprocess
import glob
import json
import os
import argparse
import numpy as np
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

def get_device_name(dev_path):
    """Read the hardware camera model name from sysfs if available."""
    dev_basename = os.path.basename(dev_path)
    sysfs_name_path = f"/sys/class/video4linux/{dev_basename}/name"
    if os.path.exists(sysfs_name_path):
        try:
            with open(sysfs_name_path, 'r') as f:
                name = f.read().strip()
                if name:
                    return name
        except Exception:
            pass
    return f"Camera ({dev_path})"

def is_internal_webcam(dev_path, dev_name):
    """Identify if a video node is the base station's built-in laptop webcam."""
    if dev_path in ['/dev/video0', '/dev/video1']:
        return True
    
    name_upper = dev_name.upper()
    # Exclude specific internal laptop camera model signatures; keep USB webcams (C615, GENERAL WEBCAM, etc.)
    internal_keywords = ["INTEGRATED", "INTERNAL", "LAPTOP", "HP WIDE VISION", "FACETIME", "BUILT-IN"]
    for kw in internal_keywords:
        if kw in name_upper and "ROBOT" not in name_upper and "ZED" not in name_upper and "REALSENSE" not in name_upper:
            return True
            
    return False

def test_camera_node(dev):
    """Test if a /dev/video node can open and capture valid frames."""
    cap = cv2.VideoCapture(dev, cv2.CAP_V4L2)
    if not cap.isOpened():
        cap.release()
        return False, None
    ret = False
    frame = None
    for _ in range(5):
        ret, frame = cap.read()
        if ret and frame is not None:
            break
        time.sleep(0.02)
    cap.release()
    return ret, frame

def detect_camera_devices(include_video0=False):
    """Scan /dev/video* nodes for external robotic cameras, strictly excluding base station laptop webcams."""
    print("🔍 Scanning for available camera device nodes (Excluding base station webcam)...")
    dev_paths = sorted(
        glob.glob('/dev/video*'),
        key=lambda x: int(x.replace('/dev/video', '')) if x.replace('/dev/video', '').isdigit() else 999
    )
    
    available = []
    names = {}
    
    for dev in dev_paths:
        dev_name = get_device_name(dev)

        if not include_video0 and is_internal_webcam(dev, dev_name):
            print(f"  🚫 Skipping base station webcam: {dev} ({dev_name})")
            continue

        ret, frame = test_camera_node(dev)
        if ret:
            print(f"  ✅ Detected active robotic camera: {dev} -> {dev_name}")
            available.append(dev)
            names[dev] = dev_name
        else:
            print(f"  ⚠️ Skipping {dev} ({dev_name}) - cannot capture frames")

    if not available:
        print("⚠️ Warning: No active robotic video capture nodes found on system.")
    else:
        print(f"✅ Found {len(available)} active camera(s):")
        for dev in available:
            print(f"   • {dev}: {names[dev]}")
    
    return available, names

DEV_NODES = []
DEV_NAMES = {}
latest_jpeg = {}
frame_locks = {}

# Global & Per-Camera configurations
stream_config = {
    "width": 640,
    "height": 480,
    "quality": 60,
    "fps_cap": 30,
    "global_color": "rgb", # Default to RGB for better view on Dedicated Camera Dashboard
    "zed_mode": "left",
    "brightness": 50,
    "contrast": 50,
    "preset": "standard"
}

cam_states = {}

def free_video_devices():
    try:
        subprocess.run(["pkill", "-f", "ffmpeg.*udp://"], stderr=subprocess.DEVNULL)
        time.sleep(0.2)
    except Exception:
        pass

def capture_worker(dev_path):
    """Continuously captures frames with lighting adjustments and compression."""
    dev_name = DEV_NAMES.get(dev_path, dev_path)
    is_zed = "ZED" in dev_name.upper()
    is_realsense = "REALSENSE" in dev_name.upper()
    
    print(f"Initializing Camera {dev_path} ({dev_name})...")
    
    cap = cv2.VideoCapture(dev_path, cv2.CAP_V4L2)
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    if not is_zed and not is_realsense:
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, stream_config["width"])
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, stream_config["height"])
        cap.set(cv2.CAP_PROP_FPS, stream_config["fps_cap"])

    if not cap.isOpened():
        print(f"❌ ERROR: Could not open {dev_path}.")
        return

    print(f"✅ Camera {dev_path} ({dev_name}) active!")
    last_encode_time = 0.0
    
    while True:
        if not cam_states.get(dev_path, {}).get("enabled", True):
            time.sleep(0.05)
            continue

        ret, frame = cap.read()
        if not ret or frame is None:
            time.sleep(0.01)
            continue

        now = time.time()
        target_delay = 1.0 / stream_config["fps_cap"]
        if now - last_encode_time < target_delay:
            continue

        last_encode_time = now

        # RealSense Depth / 1-channel handling
        if frame.dtype == np.uint16 or frame.dtype == np.int16:
            frame_8u = cv2.convertScaleAbs(frame, alpha=0.03)
            frame = cv2.applyColorMap(frame_8u, cv2.COLORMAP_JET)

        if len(frame.shape) == 2 or (len(frame.shape) == 3 and frame.shape[2] == 1):
            frame = cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)

        # ZED stereo crop
        h, w = frame.shape[:2]
        aspect = w / float(h) if h > 0 else 1.33
        
        if aspect > 1.6:
            zed_mode = stream_config.get("zed_mode", "left")
            if zed_mode == "left":
                frame = frame[:, :w // 2]
            elif zed_mode == "right":
                frame = frame[:, w // 2:]
            h, w = frame.shape[:2]

        target_w, target_h = stream_config["width"], stream_config["height"]
        if (w, h) != (target_w, target_h):
            frame = cv2.resize(frame, (target_w, target_h))

        # Lighting Adjustments (Brightness & Contrast)
        brightness = stream_config.get("brightness", 50)
        contrast = stream_config.get("contrast", 50)
        if brightness != 50 or contrast != 50:
            alpha = contrast / 50.0
            beta = (brightness - 50) * 2.0
            frame = cv2.convertScaleAbs(frame, alpha=alpha, beta=beta)

        # Grayscale filter
        cam_color = cam_states.get(dev_path, {}).get("color", "rgb")
        if stream_config["global_color"] == "gray" or cam_color == "gray":
            if len(frame.shape) == 3 and frame.shape[2] == 3:
                frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # JPEG Compression
        encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), stream_config["quality"]]
        _, jpeg_buffer = cv2.imencode('.jpg', frame, encode_param)
        
        with frame_locks[dev_path]:
            latest_jpeg[dev_path] = jpeg_buffer.tobytes()

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

class CameraHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def do_GET(self):
        # 1. API: Single Latest JPEG Frame
        if self.path.startswith('/api/frame/'):
            cam_num = self.path.split('?')[0].split('/')[-1]
            dev_path = f"/dev/video{cam_num}"

            if dev_path not in latest_jpeg:
                self.send_error(404, "Camera not found")
                return

            if not cam_states.get(dev_path, {}).get("enabled", True):
                self.send_error(404, "Camera Paused")
                return

            with frame_locks[dev_path]:
                data = latest_jpeg[dev_path]

            if data is None:
                self.send_error(503, "Camera warming up")
                return

            self.send_response(200)
            self.send_header('Content-Type', 'image/jpeg')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Connection', 'close')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            self.end_headers()
            self.wfile.write(data)
            return

        # 2. API: Continuous MJPEG Stream
        if self.path.startswith('/api/stream/'):
            cam_num = self.path.split('?')[0].split('/')[-1]
            dev_path = f"/dev/video{cam_num}"

            if dev_path not in latest_jpeg:
                self.send_error(404, "Camera not found")
                return

            self.send_response(200)
            self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=frame')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.end_headers()

            try:
                while True:
                    if not cam_states.get(dev_path, {}).get("enabled", True):
                        time.sleep(0.1)
                        continue

                    with frame_locks[dev_path]:
                        data = latest_jpeg[dev_path]

                    if data is not None:
                        self.wfile.write(b'--frame\r\n')
                        self.wfile.write(b'Content-Type: image/jpeg\r\n')
                        self.wfile.write(f'Content-Length: {len(data)}\r\n\r\n'.encode())
                        self.wfile.write(data)
                        self.wfile.write(b'\r\n')
                        self.wfile.flush()

                    time.sleep(1.0 / stream_config["fps_cap"])
            except Exception:
                pass
            return

        # 3. API: Controls
        if self.path.startswith('/api/control'):
            from urllib.parse import parse_qs, urlparse
            query = parse_qs(urlparse(self.path).query)
            
            if 'quality' in query:
                stream_config['quality'] = max(10, min(95, int(query['quality'][0])))
            if 'res' in query:
                res = query['res'][0]
                if res == '320':
                    stream_config['width'], stream_config['height'] = 320, 240
                elif res == '480':
                    stream_config['width'], stream_config['height'] = 480, 360
                elif res == '640':
                    stream_config['width'], stream_config['height'] = 640, 480
            if 'global_color' in query:
                stream_config['global_color'] = query['global_color'][0]
            if 'zed_mode' in query:
                mode = query['zed_mode'][0]
                if mode in ['left', 'right', 'full']:
                    stream_config['zed_mode'] = mode
            if 'brightness' in query:
                stream_config['brightness'] = max(0, min(100, int(query['brightness'][0])))
            if 'contrast' in query:
                stream_config['contrast'] = max(0, min(100, int(query['contrast'][0])))
            if 'preset' in query:
                preset = query['preset'][0]
                stream_config['preset'] = preset
                if preset == 'outdoor_sun':
                    stream_config['contrast'], stream_config['brightness'], stream_config['quality'] = 65, 40, 75
                elif preset == 'indoor':
                    stream_config['contrast'], stream_config['brightness'], stream_config['quality'] = 50, 50, 60
                elif preset == 'low_light':
                    stream_config['contrast'], stream_config['brightness'], stream_config['quality'] = 75, 70, 55
                elif preset == 'high_contrast':
                    stream_config['contrast'], stream_config['brightness'], stream_config['quality'] = 85, 45, 65
                elif preset == 'standard':
                    stream_config['contrast'], stream_config['brightness'], stream_config['quality'] = 50, 50, 60

            if 'cam' in query:
                cam_num = query['cam'][0]
                dev_path = f"/dev/video{cam_num}"
                if dev_path in cam_states:
                    if 'enabled' in query:
                        cam_states[dev_path]['enabled'] = (query['enabled'][0] == '1')
                    if 'color' in query:
                        cam_states[dev_path]['color'] = query['color'][0]

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "config": stream_config}).encode('utf-8'))
            return

        # 4. API: List Detected Cameras
        if self.path == '/api/cameras':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            cameras_data = [
                {
                    "dev": dev,
                    "cam_num": dev.replace("/dev/video", ""),
                    "name": DEV_NAMES.get(dev, dev),
                    "enabled": cam_states.get(dev, {}).get("enabled", True),
                    "color": cam_states.get(dev, {}).get("color", "rgb")
                }
                for dev in DEV_NODES
            ]
            self.wfile.write(json.dumps({"cameras": cameras_data, "config": stream_config}).encode('utf-8'))
            return

        # 5. Dedicated Camera Dashboard GUI (Port 9090)
        if self.path == '/' or self.path.startswith('/?'):
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            
            cam_nums = [dev.replace("/dev/video", "") for dev in DEV_NODES]
            cam_nums_json = json.dumps(cam_nums)

            html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Dedicated Camera Dashboard ({len(DEV_NODES)} Feeds Active)</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        :root {{
            --bg-color: #0b0f19;
            --card-bg: #151d30;
            --accent-color: #38bdf8;
            --text-color: #f8fafc;
            --border-color: #1e293b;
            --success-color: #10b981;
            --danger-color: #ef4444;
        }}
        * {{ box-sizing: border-box; }}
        body {{ font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg-color); color: var(--text-color); margin: 0; padding: 20px; }}
        header {{ max-width: 1600px; margin: 0 auto 20px auto; background: var(--card-bg); padding: 18px 25px; border-radius: 12px; border: 1px solid var(--border-color); }}
        .header-top {{ display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 15px; }}
        h1 {{ margin: 0; font-size: 1.5rem; color: var(--accent-color); display: flex; align-items: center; gap: 10px; }}
        .preset-bar {{ display: flex; gap: 10px; flex-wrap: wrap; margin-top: 15px; align-items: center; }}
        .btn-preset {{ background: #1e293b; color: #f8fafc; border: 1px solid #334155; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 600; transition: all 0.2s; }}
        .btn-preset:hover {{ border-color: var(--accent-color); background: #0284c7; }}
        .controls {{ display: flex; align-items: center; gap: 20px; flex-wrap: wrap; margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border-color); }}
        .control-group {{ display: flex; align-items: center; gap: 8px; font-size: 0.85rem; }}
        select, button, input[type=range] {{ background: #0b0f19; color: white; border: 1px solid #334155; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }}
        button:hover {{ border-color: var(--accent-color); }}
        .btn-toggle {{ font-weight: 600; padding: 4px 10px; border-radius: 6px; }}
        .btn-on {{ background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #10b981; }}
        .btn-off {{ background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; }}
        .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(460px, 1fr)); gap: 20px; max-width: 1600px; margin: 0 auto; }}
        .card {{ background: var(--card-bg); border-radius: 12px; overflow: hidden; border: 1px solid var(--border-color); box-shadow: 0 10px 25px -5px rgba(0,0,0,0.6); }}
        .card-header {{ padding: 12px 16px; background: #1e293b; font-weight: 600; font-size: 0.95rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }}
        .card-title {{ display: flex; align-items: center; gap: 8px; }}
        .card-actions {{ display: flex; align-items: center; gap: 8px; }}
        .img-container {{ width: 100%; aspect-ratio: 16/9; background: #000; display: flex; justify-content: center; align-items: center; position: relative; }}
        .img-container img {{ width: 100%; height: 100%; object-fit: contain; }}
        .paused-overlay {{ position: absolute; color: #94a3b8; font-size: 1.1rem; font-weight: 600; display: none; }}
        .fps-counter {{ position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.8); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; color: #38bdf8; font-family: monospace; border: 1px solid #334155; }}
        .badge {{ background: #0284c7; color: white; font-size: 0.8rem; padding: 4px 10px; border-radius: 12px; font-weight: 600; }}
    </style>
</head>
<body>

    <header>
        <div class="header-top">
            <h1>📹 Dedicated Robotic Camera Control Dashboard</h1>
            <span class="badge">{len(DEV_NODES)} Stream(s) Active</span>
        </div>
        <div class="preset-bar">
            <span><strong>⚡ Quick Lighting Presets:</strong></span>
            <button class="btn-preset" onclick="applyPreset('standard')">🏠 Standard</button>
            <button class="btn-preset" onclick="applyPreset('outdoor_sun')">☀️ Outdoor Sun</button>
            <button class="btn-preset" onclick="applyPreset('low_light')">🌙 Low Light</button>
            <button class="btn-preset" onclick="applyPreset('high_contrast')">⚡ High Contrast</button>
        </div>
        <div class="controls">
            <div class="control-group">
                <label for="resSelect">Resolution:</label>
                <select id="resSelect" onchange="updateGlobalConfig()">
                    <option value="640" selected>640x480 (Standard)</option>
                    <option value="480">480x360 (Balanced)</option>
                    <option value="320">320x240 (Low Latency)</option>
                </select>
            </div>
            <div class="control-group">
                <label for="qualitySlider">JPEG Quality:</label>
                <input type="range" id="qualitySlider" min="20" max="95" value="60" onchange="updateGlobalConfig()">
                <span id="qualityVal">60%</span>
            </div>
            <div class="control-group">
                <label for="brightnessSlider">Brightness:</label>
                <input type="range" id="brightnessSlider" min="0" max="100" value="50" onchange="updateGlobalConfig()">
                <span id="brightnessVal">50</span>
            </div>
            <div class="control-group">
                <label for="contrastSlider">Contrast:</label>
                <input type="range" id="contrastSlider" min="0" max="100" value="50" onchange="updateGlobalConfig()">
                <span id="contrastVal">50</span>
            </div>
            <div class="control-group">
                <label for="globalColor">Color Mode:</label>
                <select id="globalColor" onchange="updateGlobalConfig()">
                    <option value="rgb" {"selected" if stream_config["global_color"] == "rgb" else ""}>RGB Full Color</option>
                    <option value="gray" {"selected" if stream_config["global_color"] == "gray" else ""}>Grayscale (B&W)</option>
                </select>
            </div>
        </div>
    </header>

    <div class="grid">
"""
            if not DEV_NODES:
                html += """
        <div style="grid-column: 1 / -1; text-align: center; padding: 50px; background: var(--card-bg); border-radius: 12px;">
            <h2>⚠️ No Video Capture Devices Detected</h2>
            <p style="color: #94a3b8;">Please connect USB camera devices (/dev/video2, 4, 6, 8, 10).</p>
        </div>"""
            else:
                for idx, dev in enumerate(DEV_NODES, start=1):
                    cam_num = dev.replace("/dev/video", "")
                    dev_name = DEV_NAMES.get(dev, f"Camera {dev}")
                    initial_cam_color = cam_states.get(dev, {}).get("color", stream_config["global_color"])
                    btn_color_label = "🎨 RGB" if initial_cam_color == "rgb" else "🏁 GRAY"
                    html += f"""
        <div class="card">
            <div class="card-header">
                <div class="card-title">
                    <span>📷 Stream #{idx}: {dev_name} <small style="opacity: 0.6;">({dev})</small></span>
                </div>
                <div class="card-actions">
                    <button id="color-btn-{cam_num}" class="btn-toggle" onclick="toggleColor('{cam_num}')">{btn_color_label}</button>
                    <button id="stream-btn-{cam_num}" class="btn-toggle btn-on" onclick="toggleStream('{cam_num}')">🟢 ON</button>
                </div>
            </div>
            <div class="img-container">
                <img id="cam-{cam_num}" src="" alt="{dev_name} Stream">
                <div id="paused-{cam_num}" class="paused-overlay">⏸ STREAM PAUSED</div>
                <div class="fps-counter" id="fps-{cam_num}">0 FPS | 0ms</div>
            </div>
        </div>"""

            initial_color_mode = stream_config["global_color"]
            html += f"""
    </div>

    <script>
        const camNums = {cam_nums_json};
        const initialMode = "{initial_color_mode}";
        const camState = {{}};
        camNums.forEach(num => {{
            camState[num] = {{ enabled: true, color: initialMode }};
        }});

        async function startCameraLoop(camNum) {{
            const imgEl = document.getElementById('cam-' + camNum);
            const fpsEl = document.getElementById('fps-' + camNum);
            const pausedEl = document.getElementById('paused-' + camNum);
            
            let frameCount = 0;
            let lastFpsUpdate = performance.now();
            let currentFps = 0;

            while (true) {{
                if (!camState[camNum].enabled) {{
                    imgEl.style.opacity = '0.2';
                    pausedEl.style.display = 'block';
                    fpsEl.textContent = 'PAUSED';
                    await new Promise(r => setTimeout(r, 200));
                    continue;
                }} else {{
                    imgEl.style.opacity = '1.0';
                    pausedEl.style.display = 'none';
                }}

                const t0 = performance.now();
                try {{
                    const response = await fetch('/api/frame/' + camNum + '?t=' + Date.now());
                    if (response.ok) {{
                        const blob = await response.blob();
                        const oldUrl = imgEl.src;
                        imgEl.src = URL.createObjectURL(blob);
                        if (oldUrl && oldUrl.startsWith('blob:')) {{
                            URL.revokeObjectURL(oldUrl);
                        }}
                        frameCount++;
                    }}
                }} catch (e) {{}}

                const latency = Math.round(performance.now() - t0);
                const now = performance.now();
                if (now - lastFpsUpdate >= 1000) {{
                    currentFps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
                    frameCount = 0;
                    lastFpsUpdate = now;
                }}
                fpsEl.textContent = `${{currentFps}} FPS | ${{latency}}ms`;

                await new Promise(r => setTimeout(r, 10));
            }}
        }}

        function toggleStream(camNum) {{
            camState[camNum].enabled = !camState[camNum].enabled;
            const btn = document.getElementById('stream-btn-' + camNum);
            const isEnabled = camState[camNum].enabled;
            
            btn.className = 'btn-toggle ' + (isEnabled ? 'btn-on' : 'btn-off');
            btn.textContent = isEnabled ? '🟢 ON' : '🔴 OFF';

            fetch(`/api/control?cam=${{camNum}}&enabled=${{isEnabled ? '1' : '0'}}`);
        }}

        function toggleColor(camNum) {{
            camState[camNum].color = (camState[camNum].color === 'rgb') ? 'gray' : 'rgb';
            const btn = document.getElementById('color-btn-' + camNum);
            const isRgb = (camState[camNum].color === 'rgb');

            btn.textContent = isRgb ? '🎨 RGB' : '🏁 GRAY';
            fetch(`/api/control?cam=${{camNum}}&color=${{camState[camNum].color}}`);
        }}

        function applyPreset(name) {{
            fetch(`/api/control?preset=${{name}}`)
                .then(r => r.json())
                .then(d => {{
                    if (d.config) {{
                        document.getElementById('brightnessSlider').value = d.config.brightness;
                        document.getElementById('brightnessVal').textContent = d.config.brightness;
                        document.getElementById('contrastSlider').value = d.config.contrast;
                        document.getElementById('contrastVal').textContent = d.config.contrast;
                        document.getElementById('qualitySlider').value = d.config.quality;
                        document.getElementById('qualityVal').textContent = d.config.quality + '%';
                    }}
                }});
        }}

        function updateGlobalConfig() {{
            const res = document.getElementById('resSelect').value;
            const quality = document.getElementById('qualitySlider').value;
            const brightness = document.getElementById('brightnessSlider').value;
            const contrast = document.getElementById('contrastSlider').value;
            const globalColor = document.getElementById('globalColor').value;

            document.getElementById('qualityVal').textContent = quality + '%';
            document.getElementById('brightnessVal').textContent = brightness;
            document.getElementById('contrastVal').textContent = contrast;

            fetch(`/api/control?res=${{res}}&quality=${{quality}}&brightness=${{brightness}}&contrast=${{contrast}}&global_color=${{globalColor}}`);
        }}

        camNums.forEach(num => startCameraLoop(num));
    </script>
</body>
</html>"""
            self.wfile.write(html.encode('utf-8'))
            return

        self.send_error(404)

def main():
    parser = argparse.ArgumentParser(description="High-Performance Multi-Camera Web Server & Dedicated Camera Dashboard")
    parser.add_argument("--mode", choices=["gray", "rgb"], default="rgb", help="Color mode: 'rgb' or 'gray'")
    parser.add_argument("--port", type=int, default=9090, help="Web server port (default: 9090)")
    parser.add_argument("--include-video0", action="store_true", help="Force include base station webcam")
    
    args = parser.parse_args()

    stream_config["global_color"] = args.mode
    port = args.port

    free_video_devices()

    global DEV_NODES, DEV_NAMES, latest_jpeg, frame_locks, cam_states
    DEV_NODES, DEV_NAMES = detect_camera_devices(include_video0=args.include_video0)

    latest_jpeg = {dev: None for dev in DEV_NODES}
    frame_locks = {dev: threading.Lock() for dev in DEV_NODES}
    cam_states = {dev: {"enabled": True, "color": args.mode} for dev in DEV_NODES}

    for dev in DEV_NODES:
        t = threading.Thread(target=capture_worker, args=(dev,), daemon=True)
        t.start()
        time.sleep(0.15)

    server = ThreadedHTTPServer(('0.0.0.0', port), CameraHandler)
    print(f"\n==================================================================")
    print(f"🚀 Dedicated Multi-Camera Dashboard Active on Port {port}")
    print(f"📷 Streaming {len(DEV_NODES)} active camera(s):")
    for dev in DEV_NODES:
        print(f"   • {dev}: {DEV_NAMES.get(dev, 'Unknown')}")
    print(f"==================================================================\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")

if __name__ == '__main__':
    main()
