# Walkthrough - Camera Streams & ROAR Supervisor OpenMCT Integration

Integrated the 5 multi-camera stream server into OpenMCT plugins, created the ROAR Supervisor & System Monitor dashboard inside OpenMCT, eliminated network port conflicts for remote laptop access, and updated Docker Compose for host device streaming.

---

## Key Changes Made

### 1. Multi-Camera Stream Server (`GUI/web_camera_server.py`)
- Created `GUI/web_camera_server.py` supporting all 5 USB camera video devices (`/dev/video2`, `/dev/video4`, `/dev/video6`, `/dev/video8`, `/dev/video10`).
- Added a high-performance, low-latency MJPEG HTTP stream endpoint (`/api/stream/<cam_num>`) alongside frame polling (`/api/frame/<cam_num>`).
- Set HTTP camera server port to `8080` (accessible from remote laptops via `http://<laptop_ip>:8080`).

### 2. ROS2 WebSocket Bridge & Dynamic Host Resolution (`GUI/ws_ros2_bridge.py` & JS Plugins)
- Moved `ws_ros2_bridge.py` to port `9090` to resolve the port 8080 conflict with `web_camera_server.py`.
- Updated all OpenMCT JS plugins (`RoverStatusView.js`, `MissionControlView.js`, `ZEDPlugin.js`, `ArmControlView.js`, `JoystickView.js`, `WheelControlView.js`, `CostmapPlugin.js`, etc.) to dynamically construct WebSocket URLs using `window.location.hostname || 'localhost'` on port `9090`.

### 3. OpenMCT ROAR Supervisor & Camera Plugins (`camera_plugin.js` & `plugin.js`)
- Updated OpenMCT plugin architecture to feature a **🚀 ROAR Supervisor & System Monitor** root folder containing:
  - **Rover Status & Node Health Display** (displays state, messages, and live CPU/Memory/PID status of monitored ROS2 nodes published by Supervisor).
  - **Mission Control Panel** (START/STOP/RESET buttons sending commands to ROS2 supervisor node).
  - **📹 5-Camera Grid Dashboard** (displays all 5 live camera streams simultaneously in a responsive grid).
  - **Individual Camera Streams** (Camera 1 Front, Camera 2 Left, Camera 3 Right, Camera 4 Rear, Camera 5 Arm/Tool).

### 4. Docker & Root Docker Compose Configuration (`Dockerfile` & `docker-compose.yml`)
- Updated `GUI/Dockerfile` with OpenCV, python dependencies (`websockets`, `psutil`), and multi-server launch command.
- Updated root `docker-compose.yml`:
  - Added `privileged: true` to `gui_container` for host USB video device access.
  - Set startup command: `python3 ws_ros2_bridge.py & python3 web_camera_server.py & node server.js`.
  - Maintained `supervisor_container` running `ros2 launch supervisor multi_launch.py`.

---

## Verification Results

### Syntax & Config Verification
- `python3 -m py_compile GUI/web_camera_server.py GUI/ws_ros2_bridge.py`: **Passed**
- `docker compose config`: **Passed**

### Access Ports Overview
| Service | Port | Protocol | Access URL |
|---|---|---|---|
| OpenMCT Dashboard | `8081` | HTTP | `http://<laptop_ip>:8081` |
| Web Camera Server | `8080` | HTTP / MJPEG | `http://<laptop_ip>:8080` |
| ROS2 Bridge | `9090` | WebSocket | `ws://<laptop_ip>:9090` |
