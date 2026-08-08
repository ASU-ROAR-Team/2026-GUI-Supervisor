# 📹 Camera Data Mode & Pre-Transmission Architecture Guide (Color Mode & Snapshot Setup)

## 📌 Overview

This document specifies the **Camera Stream Color Mode Architecture**, **Pre-Transmission Data Reduction**, and **Snapshot Picture Saving Capabilities** implemented in the ROAR Supervisor, Camera Dashboard, and **Drilling 26 Plugin** according to **REQ-1**.

---

## 🚀 Key Features

### 1. Pre-Transmission Grayscale Data Saving
To minimize bandwidth and CPU overhead during rover competition operations:
- **Grayscale mode (`gray`)** is the default setting across the entire multi-camera pipeline.
- The conversion from 3-channel color data ($640 \times 480 \times 3$) to **1-channel Grayscale data ($640 \times 480 \times 1$) occurs on the server immediately at frame capture (`cap.read()`)**.
- This conversion happens **BEFORE** any resizing, stereo cropping, contrast/brightness adjustments, or JPEG encoding.
- The HTTP stream (`/api/stream/<cam>` & `/api/frame/<cam>`) transmits compressed 1-channel JPEG payloads across the network, reducing data payload sizes by **~66%**.

---

## ⚙️ How to Configure Color Mode BEFORE Streaming

### Method 1: Pre-Start Configuration Control Panel in the GUI (OpenMCT, Drilling 26, & Port 9090)

The **Pre-Start Camera Data Stream Configuration** panel is available in **ALL** web interfaces:
1. **Dedicated Camera Control Dashboard** (`http://localhost:9090`)
2. **OpenMCT Rover Control GUI** (`http://localhost:8080` / `5-Camera Grid Dashboard` & Single Camera Views)
3. **Drilling 26 Panel** (`Drilling 26 View` in OpenMCT)

#### Steps to Configure in GUI:
1. **Select Pre-Start Data Mode**: Choose between:
   - `🏁 Grayscale (Pre-Transmission Data Saving)` *(Default)*
   - `🎨 RGB (Full Color)`
2. **Apply & Launch**: Click **`▶️ Start Streams`** to send the configuration to the server before live stream transmission starts.
3. **Pause Streams**: Click **`⏸ Pause Streams`** to pause camera streams at any time.

---

### Method 2: Command-Line Interface (CLI) Arguments

Pass the `--mode` flag when executing `web_camera_server.py`:

```bash
# Force Grayscale pre-transmission mode on startup (Default)
python3 GUI/web_camera_server.py --mode gray

# Launch in RGB mode
python3 GUI/web_camera_server.py --mode rgb
```

---

### Method 3: Environment Variable (`CAMERA_MODE`)

Configure `CAMERA_MODE` in shell profiles or `docker-compose.yml`:

```bash
export CAMERA_MODE=gray
python3 GUI/web_camera_server.py
```

In `docker-compose.yml`:
```yaml
environment:
  - CAMERA_MODE=gray
  - CAMERA_WIDTH=640
  - CAMERA_HEIGHT=480
  - CAMERA_FPS=30
```

---

## 📸 Snapshot & Picture Saving to Custom Folders

### 1. Server-Side Snapshot API (`/api/save_snapshot`)
A dedicated endpoint enables saving full-resolution JPEG frames directly to disk on the Base Station / Server:

```http
GET /api/save_snapshot?cam=2&folder=/home/carol/2026-GUI-Supervisor/snapshots
```

Parameters:
- `cam`: Camera index (e.g. `2`, `4`, `6`, `8`, `10`, or `all`).
- `folder`: Target disk folder path. Automatically creates the target directory if it does not exist.

### 2. GUI Snapshot Buttons
- **`💾 Save All to Folder`**: Saves snapshots for all active cameras into the specified folder path.
- **`💾 Save`**: Located on individual camera headers (and Drilling 26 Toolbar) to save pictures per camera directly to disk.
- **`📸 Snap` / `📸 Screenshot`**: HTML5 canvas composite generator with timestamp watermarks and direct browser downloads.

---

## 🔌 Drilling 26 Plugin Integration (`GUI/plugins/Drilling-26`)

The Drilling 26 Panel now features a full camera control toolbar:
- **a. Configurable Camera Selector Dropdown**: Dynamically detects active cameras (`/dev/video2`, `4`, `6`, `8`, `10`) and allows switching between any camera feed (defaults to Cam 5 - Arm/Tool).
- **b. Screenshot Capabilities**:
  - **`📸 Snap`**: Generates a browser download of the current frame with timestamp watermark and camera name.
  - **`💾 Save`**: Saves a high-res JPEG directly to disk (`/home/carol/2026-GUI-Supervisor/snapshots`).
- **c. Color Mode & Lighting Controls**:
  - **Mode Dropdown**: Toggle between `🏁 Grayscale` and `🎨 RGB`.
  - **Presets**: `🏠 Standard`, `☀️ Sun`, `🌙 Night`.
  - **Sliders**: Fine-tune Brightness & Contrast in real-time.

---

## 🛠️ Verification & Testing

To verify the setup locally or on the Base Station:

1. Launch the camera web server:
   ```bash
   python3 GUI/web_camera_server.py --mode gray
   ```
2. Open OpenMCT (`http://localhost:8080`).
3. Navigate to **Drilling 26 Panel**.
4. Use the **Select Camera** dropdown to switch between camera feeds, adjust color mode to `Grayscale` or `RGB`, and click **`📸 Snap`** or **`💾 Save`**.
