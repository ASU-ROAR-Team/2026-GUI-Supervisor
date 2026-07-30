# Walkthrough - Network Port Standardization, Camera 0 Addition & Low-Latency Stream Optimizations

Standardized network ports across the entire ROAR-Supervisor project, added `/dev/video0` camera feed, resolved browser console syntax/MIME type errors, implemented an asynchronous fetch-loop stream architecture for zero-latency camera delivery, and added float64 multipliers and dynamic bounds controls to the Robotic Arm Control FK plugin.

---

## Standardized Port Schema

| Service | Port | Protocol | Access URL | Description |
|---|---|---|---|---|
| **Backend (ROS2 WebSocket Bridge)** | `8080` | WebSocket | `ws://<laptop_ip>:8080` | `GUI/ws_ros2_bridge.py` & `base_station.launch` |
| **Frontend (OpenMCT Web Application)** | `8081` | HTTP | `http://<laptop_ip>:8081` | `GUI/server.js` |
| **Camera Server (Multi-Camera MJPEG)** | `9090` | HTTP / MJPEG | `http://<laptop_ip>:9090` | `GUI/web_camera_server.py` |

---

## Key Bug Fixes & Latency Optimizations

### 1. Browser Error Fixes (`GUI/index.html` & `GUI/plugins/camera/camera_plugin.js`)
- **CSS MIME Type Error Fixed**: Removed non-existent stylesheet reference `plugins/Arm-Control-v3/ArmControlV3View.css` from `index.html` which caused Express to return 404 HTML and throw a stylesheet MIME check error.
- **JavaScript Syntax Error Fixed**: Fixed unclosed template literal in `camera_plugin.js` at line 122 where raw `<style>` tags caused `SyntaxError: Unexpected token '.'` and prevented `window.CameraPlugin` initialization.

### 2. Zero-Latency Camera Fetch Loop (`camera_plugin.js` & `web_camera_server.py`)
- **Asynchronous Blob Fetch Loop**: Replaced native browser HTML `<img>` MJPEG streaming with an asynchronous `fetch()` loop querying `/api/frame/<cam_num>?t=TIMESTAMP`.
  - **Eliminated Socket Pool Saturation**: Standard browser connection pools saturate when multiple continuous MJPEG HTTP streams run concurrently. The frame polling approach releases sockets immediately.
  - **Eliminated Stream Queueing / Backlog**: The client always requests the single most recent server-side frame. If network throughput drops momentarily, frame backlogs are dropped automatically, guaranteeing real-time zero-latency playback.
- **CORS & Cache Invalidation**: Added `Access-Control-Allow-Origin: *`, `Cache-Control: no-cache, no-store, must-revalidate`, `Pragma: no-cache`, and `Expires: 0` headers to `/api/frame/<cam_num>` in `web_camera_server.py`.

### 3. Robotic Arm Control FK Plugin (`GUI/plugins/Arm-Control-FK/ArmControlFKView.js`)
- **Float64 Multipliers / Factors**: Added per-joint factor inputs (`j0`, `j1`, `j2`, `j3`, `diff_m1`, `diff_m2`, `gripper_servo`). Output joint angles sent via WebSocket (`type: 'joint_cmd_fk_custom'`) and published to `/fk_joint_states` compute `rawAngle * factor`.
- **Dynamic Bounds (Min / Max Inputs)**: Added `Min` and `Max` number input fields for each joint control card. Modifying these bounds updates slider limits dynamically.

---

## Git Branch Updates

All fixes have been committed and pushed to both target branches:
- **`camera`**: Commit `6d8afcf` (`fix: resolve CSS MIME & JS syntax errors, optimize client camera stream fetch loop for zero latency`)
- **`start_gui_script`**: Commit `47a9740` (`merge: camera plugin bug fixes and zero-latency fetch loop`)
