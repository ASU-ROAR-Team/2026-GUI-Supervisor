# 📹 Camera Data Mode & Pre-Transmission Architecture Guide (Color Mode & Snapshot Setup)

## 📌 Overview

This document specifies the **Camera Stream Color Mode Architecture**, **Pre-Transmission Data Reduction**, and **Snapshot Picture Saving Capabilities** implemented in the ROAR Supervisor & Camera Dashboard system according to **REQ-1**.

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

### Method 1: Web GUI Pre-Start Configuration Control Panel (Port 9090)

The **Dedicated Camera Control Dashboard** (`http://localhost:9090` or `http://<rover-ip>:9090`) includes a **⚙️ Pre-Start Camera Data Stream Configuration** panel in the header:

1. **Select Data Mode**: Choose between:
   - `🏁 Grayscale (Pre-Transmission Data Saving)` *(Default)*
   - `🎨 RGB (Full Color)`
2. **Apply & Launch**: Click **`▶️ Start All Streams with Selected Mode`** to apply the configuration on the server before live stream data transmission begins.
3. **Pause Streams**: Click **`⏸ Pause All Streams`** to freeze streams at any time.

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
- `cam`: Camera index (e.g. `2`, `4`, or `all`).
- `folder`: Target disk folder path. Automatically creates the target directory if it does not exist.

### 2. GUI Snapshot Buttons
- **`💾 Save All to Folder`**: Saves snapshots for all active cameras into the specified folder path.
- **`💾 Save`**: Located on individual camera headers to save pictures per camera.
- **`📸 Snap` / `📸 Screenshot`**: HTML5 canvas composite generator with timestamp watermarks and direct browser downloads.

---

## 🔌 OpenMCT Plugin Integration

- **Single Camera View Toolbar**: Includes preset buttons (`Standard`, `Outdoor Sun`, `Low Light`, `High Contrast`), a Color Mode selector (`Grayscale` / `RGB`), and a `📸 Screenshot` button.
- **5-Camera Grid Dashboard**: Provides a `📸 Capture Grid View` button to generate a watermarked multi-camera summary matrix PNG.

---

## 🛠️ Verification & Testing

To verify the setup locally or on the Base Station:

1. Launch the camera web server:
   ```bash
   python3 GUI/web_camera_server.py --mode gray
   ```
2. Open the Dedicated Camera Dashboard:
   ```text
   http://localhost:9090
   ```
3. Confirm that the stream header displays `Grayscale (B&W)` and that frame data transmitted over `/api/frame/<cam>` is single-channel JPEG.
