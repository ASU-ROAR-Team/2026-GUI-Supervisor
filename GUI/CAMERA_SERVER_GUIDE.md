# 🎥 Multi-Camera Web Server Guide

A high-performance, dynamic video capture and streaming server designed for mobile robots (NVIDIA Jetson Xavier / Linux hosts) running USB Webcams, Intel RealSense depth sensors, and Stereolabs ZED stereo cameras.

---

## 🌟 Key Features

- **Dynamic Hardware Discovery**: Automatically detects active `/dev/video*` devices on startup (no hardcoded device paths).
- **Multi-Camera Compatibility**: Fully supports standard USB webcams, Intel RealSense (RGB + Depth colormaps + IR), and Stereolabs ZED wide stereo cameras.
- **Low-Latency Architecture**: Zero-latency V4L2 kernel buffer draining using non-blocking `cap.grab()` and continuous HTTP socket teardown (`Connection: close`).
- **Default Grayscale Mode**: Boots up in 1-channel Grayscale mode by default to reduce network payload sizes by ~50% and minimize transmission latency over Wi-Fi / Ethernet.
- **Per-Camera & Global Runtime Controls**: Real-time toggles for RGB vs. Grayscale, stream enable/pause, dynamic resolution (640x480, 480x360, 320x240), and compression quality (20–90%).
- **OpenMCT Dashboard Integration**: REST API endpoints for single JPEG frames (`/api/frame/<cam>`), MJPEG streams (`/api/stream/<cam>`), and active camera metadata (`/api/cameras`).

---

## 🚀 Quick Start

### 1. Run via Docker Compose (Recommended for ROAR Supervisor)
```bash
docker compose up gui_container
```

### 2. Run Directly on Host Machine (Python 3)

Ensure dependencies are installed:
```bash
pip install opencv-python numpy
```

Launch server with default settings (**Grayscale mode**, Port 9090):
```bash
python3 GUI/web_camera_server.py
```

---

## ⚙️ Command-Line Options

You can customize the initial startup color mode, resolution, quality, and port using command-line flags:

| Flag | Options / Format | Default | Description |
| :--- | :--- | :--- | :--- |
| `--mode`, `--color-mode` | `gray`, `rgb` | `gray` | Initial streaming color mode (grayscale for low latency) |
| `--zed-mode` | `left`, `right`, `full` | `left` | ZED camera view mode (single left lens, right lens, or stereo pair) |
| `--port` | Integer | `9090` | Web server TCP port |
| `--width` | Integer | `640` | Initial stream width in pixels |
| `--height` | Integer | `480` | Initial stream height in pixels |
| `--quality` | `10` – `95` | `50` | Initial JPEG compression quality |
| `--fps` | Integer | `30` | Target FPS cap per camera stream |

### Usage Examples

- **Start in Grayscale mode with ZED Left Lens only (default, lowest latency):**
  ```bash
  python3 GUI/web_camera_server.py
  ```

- **Start with ZED Right Lens only:**
  ```bash
  python3 GUI/web_camera_server.py --zed-mode right
  ```

- **Start with Full ZED Stereo Pair (both lenses side-by-side):**
  ```bash
  python3 GUI/web_camera_server.py --zed-mode full
  ```

- **Start in Full RGB Color mode:**
  ```bash
  python3 GUI/web_camera_server.py --mode rgb
  ```

- **Start with custom port (e.g., 8080) and low-latency resolution (320x240):**
  ```bash
  python3 GUI/web_camera_server.py --port 8080 --width 320 --height 240 --quality 40
  ```

---

## 🌐 Web Dashboard & API Endpoints

Once running, access the interactive dashboard in your browser:
👉 **`http://<robot-ip>:9090/`** or **`http://localhost:9090/`**

### REST API Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `GET /` | `HTML` | Interactive Web Dashboard |
| `GET /api/cameras` | `JSON` | List of all active camera nodes, model names, and states |
| `GET /api/frame/<cam_num>` | `JPEG` | Single latest JPEG frame (e.g. `/api/frame/0`) |
| `GET /api/stream/<cam_num>` | `MJPEG` | Continuous MJPEG stream for standard `<img>` tags |
| `GET /api/control?<params>` | `JSON` | Dynamic stream control query endpoint |

#### Control Query Examples:
- Set ZED mode to Left lens: `/api/control?zed_mode=left`
- Set ZED mode to Right lens: `/api/control?zed_mode=right`
- Set ZED mode to Stereo Pair: `/api/control?zed_mode=full`
- Toggle single camera mode to RGB: `/api/control?cam=0&color=rgb`
- Toggle single camera mode to Grayscale: `/api/control?cam=0&color=gray`
- Pause / Enable single camera: `/api/control?cam=0&enabled=0` (or `enabled=1`)
- Set global resolution & quality: `/api/control?res=480&quality=40&global_color=gray`

---

## 📷 Supported Cameras & Special Formats

1. **Standard USB Webcams**: Automatically configured via V4L2 MJPG codec.
2. **Intel RealSense Depth Cameras (D435 / D455 / etc.)**:
   - RGB streams captured as standard video.
   - 16-bit depth maps (`Z16`) are automatically converted and colormapped (`COLORMAP_JET`) into thermal-style depth visuals.
   - 1-channel Infrared (IR) streams rendered cleanly as grayscale.
3. **Stereolabs ZED Stereo Cameras (ZED 2i / ZED / ZED Mini)**:
   - Stereolabs ZED cameras output a wide composite stereo frame (e.g., 2560x720).
   - By default (`--zed-mode left`), the web server crops the frame to the **Left Lens only**, delivering a standard single-camera video feed over the network and cutting bandwidth in half.
   - You can switch to `--zed-mode right` (Right Lens) or `--zed-mode full` (Stereo Pair) via CLI flags or live from the Web Dashboard.

---

## 🛠 Troubleshooting

- **No cameras detected on Linux:**
  Ensure video device nodes exist (`ls /dev/video*`) and user has permissions (`sudo usermod -aG video $USER`).
- **Port 9090 already in use:**
  Use `--port 8080` or kill stale processes with `fuser -k 9090/tcp`.
- **High latency on Wi-Fi:**
  Launch in default Grayscale mode (`--mode gray`) and drop resolution to 480x360 or 320x240 (`--width 480 --height 360`).
