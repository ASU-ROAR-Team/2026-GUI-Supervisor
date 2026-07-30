# Implementation Plan - Camera Streams & ROAR Supervisor OpenMCT Integration

Integrate the 5 multi-camera stream server into GUI/OpenMCT plugins, link the ROAR-Supervisor health monitor & mission node to OpenMCT views, resolve network port conflicts for remote laptop access, and configure root Docker Compose execution.

## User Review Required

> [!IMPORTANT]
> **Network & Port Allocation:**
> - **Port 8080**: Multi-camera stream server (`web_camera_server.py`) as specified by user (`http://<laptop_ip>:8080`).
> - **Port 8081**: OpenMCT web application (`node static-server.js`).
> - **Port 9090**: ROS2 WebSocket bridge (`ws_ros2_bridge.py`), avoiding port 8080 conflict.
> - All JavaScript plugins will be updated to dynamic hostname resolution (`window.location.hostname`) so remote laptops can connect without hardcoded `localhost` issues.

> [!NOTE]
> **USB Camera Permissions in Docker:**
> `gui_container` in `docker-compose.yml` requires `privileged: true` to access host `/dev/video*` camera devices (`/dev/video2`, `/dev/video4`, `/dev/video6`, `/dev/video8`, `/dev/video10`).

---

## Proposed Changes

### Camera Stream & Server (`scratch/web_camera_server.py` & `GUI/`)

#### [NEW] [web_camera_server.py](file:///home/carol/2026-GUI-Supervisor/GUI/web_camera_server.py)
- Copy and enhance camera server in `GUI/web_camera_server.py`.
- Add an MJPEG HTTP streaming endpoint `/api/stream/<cam_num>` alongside `/api/frame/<cam_num>` for direct `<img src="...">` rendering in standard HTML and OpenMCT elements.
- Configure server to run on port 8080.

#### [MODIFY] [camera_plugin.js](file:///home/carol/2026-GUI-Supervisor/GUI/plugins/camera/camera_plugin.js)
- Update Camera plugin to support both individual camera feeds (`/api/stream/2`, `/api/stream/4`, etc.) and a 5-Camera Grid View object in OpenMCT.
- Use dynamic hostname (`window.location.hostname || 'localhost'`).

---

### ROS2 WebSocket Bridge & JS Plugins (`GUI/`)

#### [MODIFY] [ws_ros2_bridge.py](file:///home/carol/2026-GUI-Supervisor/GUI/ws_ros2_bridge.py)
- Change WebSocket port `PORT = 9090` to avoid conflict with camera server on 8080.

#### [MODIFY] [RoverStatusView.js](file:///home/carol/2026-GUI-Supervisor/GUI/plugins/mission-control/RoverStatusView.js)
#### [MODIFY] [MissionControlView.js](file:///home/carol/2026-GUI-Supervisor/GUI/plugins/mission-control/MissionControlView.js)
#### [MODIFY] [ZEDPlugin.js](file:///home/carol/2026-GUI-Supervisor/GUI/plugins/ZED/ZEDPlugin.js)
#### [MODIFY] [ArmControlView.js](file:///home/carol/2026-GUI-Supervisor/GUI/plugins/Arm-Control/ArmControlView.js)
#### [MODIFY] [ArmControlV2View.js](file:///home/carol/2026-GUI-Supervisor/GUI/plugins/Arm-Control-v2/ArmControlV2View.js)
#### [MODIFY] [ArmControlFKView.js](file:///home/carol/2026-GUI-Supervisor/GUI/plugins/Arm-Control-FK/ArmControlFKView.js)
#### [MODIFY] [DrillingControlView.js](file:///home/carol/2026-GUI-Supervisor/GUI/plugins/Drilling-Control/DrillingControlView.js)
#### [MODIFY] [Drilling26View.js](file:///home/carol/2026-GUI-Supervisor/GUI/plugins/Drilling-26/Drilling26View.js)
#### [MODIFY] [JoystickView.js](file:///home/carol/2026-GUI-Supervisor/GUI/plugins/joystick-control/JoystickView.js)
#### [MODIFY] [Joystick26View.js](file:///home/carol/2026-GUI-Supervisor/GUI/plugins/joystick-26/Joystick26View.js)
#### [MODIFY] [WheelControlView.js](file:///home/carol/2026-GUI-Supervisor/GUI/plugins/Wheel-Control/WheelControlView.js)
#### [MODIFY] [CostmapPlugin.js](file:///home/carol/2026-GUI-Supervisor/GUI/plugins/display/CostmapPlugin.js)
- Replace hardcoded `"ws://localhost:8080"` with dynamic `"ws://" + (window.location.hostname || "localhost") + ":9090"`.

---

### Supervisor Folder & OpenMCT Root (`GUI/plugins/mission-control/plugin.js` & `GUI/index.html`)

#### [MODIFY] [plugin.js](file:///home/carol/2026-GUI-Supervisor/GUI/plugins/mission-control/plugin.js)
- Register a dedicated OpenMCT root folder **"ROAR Supervisor & System Monitor"**.
- Include child objects:
  1. **Rover Status & Node Health Monitor** (shows monitored nodes CPU, Memory, PID, state).
  2. **Mission Control Panel** (START/STOP/RESET mission control).
  3. **5-Camera Systems Stream Grid** & individual camera feeds.

#### [MODIFY] [index.html](file:///home/carol/2026-GUI-Supervisor/GUI/index.html)
- Ensure plugins and scripts are properly installed and initialized.

---

### Docker & Docker Compose (`Dockerfile` & `docker-compose.yml`)

#### [MODIFY] [Dockerfile](file:///home/carol/2026-GUI-Supervisor/GUI/Dockerfile)
- Install `python3-opencv`, `websockets`, `psutil`.
- Copy `web_camera_server.py` into container image.
- Expose ports `8080 8081 9090`.

#### [MODIFY] [docker-compose.yml](file:///home/carol/2026-GUI-Supervisor/docker-compose.yml)
- Set `privileged: true` for `gui_container` to grant access to `/dev/video*`.
- Update `gui_container` start command to run `ws_ros2_bridge.py`, `web_camera_server.py`, and `node static-server.js`.
- Keep `supervisor_container` running `ros2 launch supervisor multi_launch.py`.

---

## Verification Plan

### Automated Verification
- Run python syntax checks on `ws_ros2_bridge.py` and `web_camera_server.py`.
- Validate `docker-compose config` syntax.
- Verify HTTP endpoints `/api/frame/2` and `/api/stream/2` using curl.

### Manual Verification
- Test starting the environment via `docker compose up --build`.
- Open OpenMCT UI at `http://localhost:8081` (and `http://<ip>:8081` from remote browser).
- Verify the "ROAR Supervisor & System Monitor" folder appears in OpenMCT tree.
- Verify 5 camera feeds display correctly in OpenMCT.
- Verify Supervisor node health monitor displays active nodes and resource stats.
