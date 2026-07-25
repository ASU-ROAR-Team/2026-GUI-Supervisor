#!/usr/bin/env python3
"""
High-Performance Multi-Camera Web Server (Version 2)
Features:
- Individual Camera ON/OFF toggles
- Per-Camera & Global Grayscale / RGB color toggles
- Dynamic Resolution & Compression Quality controls
- Real-time FPS & Latency stats
"""

import cv2
import threading
import time
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

DEV_NODES = ["/dev/video2", "/dev/video4", "/dev/video6", "/dev/video8", "/dev/video10"]

# Shared thread-safe frame buffer
latest_jpeg = {dev: None for dev in DEV_NODES}
frame_locks = {dev: threading.Lock() for dev in DEV_NODES}

# Global & Per-Camera configurations
stream_config = {
    "width": 640,
    "height": 480,
    "quality": 60,
    "fps_cap": 30,
    "global_color": "rgb"  # "rgb" or "gray"
}

# Per-camera settings: enabled status & color mode
cam_states = {
    dev: {"enabled": True, "color": "rgb"} for dev in DEV_NODES
}

def free_video_devices():
    """Ensure no background processes are locking camera devices or port 8080."""
    print("Checking for background processes holding camera devices...")
    try:
        subprocess.run(["pkill", "-f", "ffmpeg.*udp://"], stderr=subprocess.DEVNULL)
        subprocess.run(["fuser", "-k", "8080/tcp"], stderr=subprocess.DEVNULL)
        time.sleep(0.5)
    except Exception:
        pass

def capture_worker(dev_path):
    """Continuously captures frames from a camera device."""
    cam_id = dev_path.replace("/dev/video", "")
    print(f"Initializing Camera {dev_path}...")
    
    cap = cv2.VideoCapture(dev_path, cv2.CAP_V4L2)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, stream_config["width"])
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, stream_config["height"])

    if not cap.isOpened():
        print(f"❌ ERROR: Could not open {dev_path}.")
        return

    print(f"✅ Camera {dev_path} active!")
    last_time = time.time()
    
    while True:
        target_delay = 1.0 / stream_config["fps_cap"]
        
        # Check if camera stream is active/enabled
        if not cam_states[dev_path]["enabled"]:
            time.sleep(0.1)
            continue

        ret, frame = cap.read()
        if ret:
            # 1. Resize if required
            h, w = frame.shape[:2]
            if w != stream_config["width"] or h != stream_config["height"]:
                frame = cv2.resize(frame, (stream_config["width"], stream_config["height"]))

            # 2. Apply Grayscale if requested globally or per-camera
            cam_color = cam_states[dev_path]["color"]
            if stream_config["global_color"] == "gray" or cam_color == "gray":
                frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            # 3. JPEG Compression
            encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), stream_config["quality"]]
            _, jpeg_buffer = cv2.imencode('.jpg', frame, encode_param)
            
            with frame_locks[dev_path]:
                latest_jpeg[dev_path] = jpeg_buffer.tobytes()
        else:
            time.sleep(0.01)

        elapsed = time.time() - last_time
        if elapsed < target_delay:
            time.sleep(target_delay - elapsed)
        last_time = time.time()

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

            if not cam_states[dev_path]["enabled"]:
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
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()
            self.wfile.write(data)
            return

        # 2. API: Dynamic Settings Control Endpoint
        if self.path.startswith('/api/control'):
            from urllib.parse import parse_qs, urlparse
            query = parse_qs(urlparse(self.path).query)
            
            # Global Quality & Resolution
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

            # Per-Camera Controls (cam=X&enabled=1/0&color=rgb/gray)
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
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
            return

        # 3. HTML5 Dashboard with Per-Camera Toggles
        if self.path == '/' or self.path.startswith('/?'):
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            
            html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>5 Camera Realtime Control Dashboard</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        :root {
            --bg-color: #0f172a;
            --card-bg: #1e293b;
            --accent-color: #38bdf8;
            --text-color: #f8fafc;
            --border-color: #334155;
            --success-color: #10b981;
            --danger-color: #ef4444;
        }
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg-color); color: var(--text-color); margin: 0; padding: 20px; }
        header { max-width: 1400px; margin: 0 auto 20px auto; background: var(--card-bg); padding: 18px 25px; border-radius: 12px; border: 1px solid var(--border-color); }
        .header-top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 15px; }
        h1 { margin: 0; font-size: 1.5rem; color: var(--accent-color); }
        .controls { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border-color); }
        .control-group { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; }
        select, button, input[type=range] { background: #0f172a; color: white; border: 1px solid var(--border-color); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
        button:hover { border-color: var(--accent-color); }
        .btn-toggle { font-weight: 600; padding: 4px 10px; border-radius: 6px; }
        .btn-on { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #10b981; }
        .btn-off { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 20px; max-width: 1400px; margin: 0 auto; }
        .card { background: var(--card-bg); border-radius: 12px; overflow: hidden; border: 1px solid var(--border-color); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5); }
        .card-header { padding: 12px 16px; background: #334155; font-weight: 600; font-size: 0.95rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
        .card-title { display: flex; align-items: center; gap: 8px; }
        .card-actions { display: flex; align-items: center; gap: 8px; }
        .img-container { width: 100%; aspect-ratio: 4/3; background: #000; display: flex; justify-content: center; align-items: center; position: relative; }
        .img-container img { width: 100%; height: 100%; object-fit: contain; }
        .paused-overlay { position: absolute; color: #94a3b8; font-size: 1.1rem; font-weight: 600; display: none; }
        .fps-counter { position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.75); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; color: #38bdf8; font-family: monospace; }
        .badge { background: #3b82f6; color: white; font-size: 0.75rem; padding: 4px 8px; border-radius: 4px; font-weight: normal; }
    </style>
</head>
<body>

    <header>
        <div class="header-top">
            <h1>🎥 5 Camera Control Dashboard</h1>
            <span class="badge">JPEG Compressed</span>
        </div>
        <div class="controls">
            <div class="control-group">
                <label for="resSelect">Global Resolution:</label>
                <select id="resSelect" onchange="updateGlobalConfig()">
                    <option value="640" selected>640x480 (Standard)</option>
                    <option value="480">480x360 (Balanced)</option>
                    <option value="320">320x240 (Low Latency)</option>
                </select>
            </div>
            <div class="control-group">
                <label for="qualitySlider">Global Quality:</label>
                <input type="range" id="qualitySlider" min="20" max="90" value="60" onchange="updateGlobalConfig()">
                <span id="qualityVal">60%</span>
            </div>
            <div class="control-group">
                <label for="globalColor">Global Mode:</label>
                <select id="globalColor" onchange="updateGlobalConfig()">
                    <option value="rgb" selected>RGB Color</option>
                    <option value="gray">Grayscale (B&W)</option>
                </select>
            </div>
        </div>
    </header>

    <div class="grid">
"""
            for idx, dev in enumerate(DEV_NODES, start=1):
                cam_num = dev.replace("/dev/video", "")
                html += f"""
        <div class="card">
            <div class="card-header">
                <div class="card-title">
                    <span>Camera #{idx} ({dev})</span>
                </div>
                <div class="card-actions">
                    <button id="color-btn-{cam_num}" class="btn-toggle" onclick="toggleColor('{cam_num}')">🎨 RGB</button>
                    <button id="stream-btn-{cam_num}" class="btn-toggle btn-on" onclick="toggleStream('{cam_num}')">🟢 ON</button>
                </div>
            </div>
            <div class="img-container">
                <img id="cam-{cam_num}" src="" alt="Camera {dev} Stream">
                <div id="paused-{cam_num}" class="paused-overlay">⏸ STREAM PAUSED</div>
                <div class="fps-counter" id="fps-{cam_num}">0 FPS | 0ms</div>
            </div>
        </div>"""

            html += """
    </div>

    <script>
        const camNums = ["2", "4", "6", "8", "10"];
        const camState = {
            "2": { enabled: true, color: "rgb" },
            "4": { enabled: true, color: "rgb" },
            "6": { enabled: true, color: "rgb" },
            "8": { enabled: true, color: "rgb" },
            "10": { enabled: true, color: "rgb" }
        };

        async function startCameraLoop(camNum) {
            const imgEl = document.getElementById('cam-' + camNum);
            const fpsEl = document.getElementById('fps-' + camNum);
            const pausedEl = document.getElementById('paused-' + camNum);
            
            let frameCount = 0;
            let lastFpsUpdate = performance.now();
            let currentFps = 0;

            while (true) {
                if (!camState[camNum].enabled) {
                    imgEl.style.opacity = '0.2';
                    pausedEl.style.display = 'block';
                    fpsEl.textContent = 'PAUSED';
                    await new Promise(r => setTimeout(r, 200));
                    continue;
                } else {
                    imgEl.style.opacity = '1.0';
                    pausedEl.style.display = 'none';
                }

                const t0 = performance.now();
                try {
                    const response = await fetch('/api/frame/' + camNum + '?t=' + Date.now());
                    if (response.ok) {
                        const blob = await response.blob();
                        const oldUrl = imgEl.src;
                        imgEl.src = URL.createObjectURL(blob);
                        if (oldUrl && oldUrl.startsWith('blob:')) {
                            URL.revokeObjectURL(oldUrl);
                        }
                        frameCount++;
                    }
                } catch (e) {}

                const latency = Math.round(performance.now() - t0);
                const now = performance.now();
                if (now - lastFpsUpdate >= 1000) {
                    currentFps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
                    frameCount = 0;
                    lastFpsUpdate = now;
                }
                fpsEl.textContent = `${currentFps} FPS | ${latency}ms`;

                await new Promise(r => setTimeout(r, 10));
            }
        }

        function toggleStream(camNum) {
            camState[camNum].enabled = !camState[camNum].enabled;
            const btn = document.getElementById('stream-btn-' + camNum);
            const isEnabled = camState[camNum].enabled;
            
            btn.className = 'btn-toggle ' + (isEnabled ? 'btn-on' : 'btn-off');
            btn.textContent = isEnabled ? '🟢 ON' : '🔴 OFF';

            fetch(`/api/control?cam=${camNum}&enabled=${isEnabled ? '1' : '0'}`);
        }

        function toggleColor(camNum) {
            camState[camNum].color = (camState[camNum].color === 'rgb') ? 'gray' : 'rgb';
            const btn = document.getElementById('color-btn-' + camNum);
            const isRgb = (camState[camNum].color === 'rgb');

            btn.textContent = isRgb ? '🎨 RGB' : '🏁 GRAY';
            fetch(`/api/control?cam=${camNum}&color=${camState[camNum].color}`);
        }

        function updateGlobalConfig() {
            const res = document.getElementById('resSelect').value;
            const quality = document.getElementById('qualitySlider').value;
            const globalColor = document.getElementById('globalColor').value;
            document.getElementById('qualityVal').textContent = quality + '%';
            fetch(`/api/control?res=${res}&quality=${quality}&global_color=${globalColor}`);
        }

        // Initialize loops
        camNums.forEach(num => startCameraLoop(num));
    </script>
</body>
</html>"""
            self.wfile.write(html.encode('utf-8'))
            return

        self.send_error(404)

def main():
    port = 8080
    free_video_devices()

    # Start capture threads for each camera
    for dev in DEV_NODES:
        t = threading.Thread(target=capture_worker, args=(dev,), daemon=True)
        t.start()

    server = ThreadedHTTPServer(('0.0.0.0', port), CameraHandler)
    print(f"\n==================================================================")
    print(f"🚀 Multi-Camera Web Server Restored (Version 2) Active on Port {port}")
    print(f"👉 Open on Receiver Laptop Web Browser: http://192.168.150.237:{port}")
    print(f"==================================================================\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")

if __name__ == '__main__':
    main()
