# Walkthrough - Network Port Standardization & OpenMCT Integration

Standardized network ports across the entire ROAR-Supervisor project, eliminating port conflicts and enabling dynamic network host resolution for remote laptop and multi-container access.

---

## Standardized Port Schema

| Service | Port | Protocol | Access URL | Description |
|---|---|---|---|---|
| **Backend (ROS2 WebSocket Bridge)** | `8080` | WebSocket | `ws://<laptop_ip>:8080` | `GUI/ws_ros2_bridge.py` & `base_station.launch` |
| **Frontend (OpenMCT Web Application)** | `8081` | HTTP | `http://<laptop_ip>:8081` | `GUI/server.js` |
| **Camera Server (Multi-Camera MJPEG)** | `9090` | HTTP / MJPEG | `http://<laptop_ip>:9090` | `GUI/web_camera_server.py` |

---

## Key Changes Made

### 1. Backend ROS2 WebSocket Bridge (`GUI/ws_ros2_bridge.py` & `GUI/ros/base_station.launch`)
- Configured ROS2 WebSocket bridge to run on port **8080**.
- Updated `base_station.launch` rosbridge websocket port argument to **8080**.

### 2. Camera MJPEG Stream Server (`GUI/web_camera_server.py`)
- Standardized camera HTTP MJPEG streaming server on port **9090**.
- Supports 5 video feeds (`/dev/video2`, `/dev/video4`, `/dev/video6`, `/dev/video8`, `/dev/video10`) at `/api/stream/<num>` and `/api/frame/<num>`.
- Updated `free_video_devices()` and `cleanup.sh` to clear port `9090/tcp`.

### 3. OpenMCT Frontend Application (`GUI/server.js` & `index.html`)
- Serves OpenMCT GUI on port **8081**.
- Updated costmap image resource URLs in `index.html` to reference port **8081**.

### 4. Dynamic Host Connection Logic in OpenMCT Plugins
Migrated all hardcoded port references in JavaScript plugins to dynamic hostname resolution (`window.location.hostname || 'localhost'`):

- **Backend ROS Bridge (Port 8080)**:
  - `GUI/plugins/mission-control/RoverStatusView.js`
  - `GUI/plugins/mission-control/MissionControlView.js`
  - `GUI/plugins/Arm-Control/ArmControlView.js`
  - `GUI/plugins/Arm-Control-FK/ArmControlFKView.js`
  - `GUI/plugins/Arm-Control-v2/ArmControlV2View.js`
  - `GUI/plugins/Wheel-Control/WheelControlView.js`
  - `GUI/plugins/Drilling-Control/DrillingControlView.js`
  - `GUI/plugins/Drilling-26/Drilling26View.js`
  - `GUI/plugins/joystick-control/JoystickView.js`
  - `GUI/plugins/joystick-26/Joystick26View.js`
  - `GUI/plugins/display/CostmapPlugin.js`
  - `GUI/plugins/ZED/ZEDPlugin.js`
  - `GUI/turtlebot-plugin.js`
  - `GUI/actions/combo-start-plugin.js`

- **Camera MJPEG Stream Server (Port 9090)**:
  - `GUI/plugins/camera/camera_plugin.js`
  - `GUI/plugins/mission-control/plugin.js`

---

## Verification Results

### Syntax & Config Verification
- `python3 -m py_compile GUI/web_camera_server.py GUI/ws_ros2_bridge.py`: **Passed**
- `docker compose config`: **Passed**
- Codebase Grep Audit: **Passed** — 0 mismatched port references remain.
