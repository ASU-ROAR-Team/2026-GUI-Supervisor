# Walkthrough - Network Port Standardization, Camera 0 Addition & FK Arm Control Enhancements

Standardized network ports across the entire ROAR-Supervisor project, added `/dev/video0` camera feed, optimized camera capture latency, and added float64 multipliers and dynamic bounds controls to the Robotic Arm Control FK plugin.

---

## Standardized Port Schema

| Service | Port | Protocol | Access URL | Description |
|---|---|---|---|---|
| **Backend (ROS2 WebSocket Bridge)** | `8080` | WebSocket | `ws://<laptop_ip>:8080` | `GUI/ws_ros2_bridge.py` & `base_station.launch` |
| **Frontend (OpenMCT Web Application)** | `8081` | HTTP | `http://<laptop_ip>:8081` | `GUI/server.js` |
| **Camera Server (Multi-Camera MJPEG)** | `9090` | HTTP / MJPEG | `http://<laptop_ip>:9090` | `GUI/web_camera_server.py` |

---

## Key Changes Made

### 1. Camera Server & Latency Optimization (`GUI/web_camera_server.py`)
- **Added `/dev/video0`**: Expanded camera device list to include `/dev/video0` alongside existing `/dev/video2`, `/dev/video4`, `/dev/video6`, `/dev/video8`, `/dev/video10`.
- **Zero-Latency V4L2 Buffer Draining**: Refactored `capture_worker()` to continuously poll `cap.read()` without thread sleeping inside the capture loop. This prevents V4L2 kernel driver queue buildup and eliminates video stream lag.
- **HTML Dashboard Update**: Included Camera 0 in `camNums` array and UI grid cards.

### 2. Robotic Arm Control FK Plugin (`GUI/plugins/Arm-Control-FK/ArmControlFKView.js`)
- **Float64 Multipliers / Factors**: Added per-joint factor inputs (`j0`, `j1`, `j2`, `j3`, `diff_m1`, `diff_m2`, `gripper_servo`). Values sent via WebSocket (`type: 'joint_cmd_fk_custom'`) and published to `/fk_joint_states` now compute `jointValue * factor`.
- **Dynamic Bounds (Min / Max Inputs)**: Added `Min` and `Max` number input fields for each joint control card. Modifying these bounds updates slider limits dynamically.

### 3. OpenMCT Camera Plugins (`GUI/plugins/camera/camera_plugin.js` & `GUI/plugins/mission-control/plugin.js`)
- Integrated Camera 0 (`/dev/video0`) into single camera views, the multi-camera grid dashboard, and root folder composition tree.

---

## Verification Results

### Syntax & Config Verification
- `python3 -m py_compile GUI/web_camera_server.py scratch/web_camera_server.py`: **Passed**
- Code audit on `ArmControlFKView.js`: **Passed**
