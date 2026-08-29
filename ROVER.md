# ROVER 2026 - System Architecture & Documentation

This document provides a comprehensive technical overview of the decoupled Base Station/Rover GUI supervisor system. It details the plugin architecture, Docker deployment strategy, network connectivity, and the end-to-end communication workflow between the UI and the ROS 2 environment running on the Jetson Xavier.

---

## 1. System Architecture Overview

The system employs a decoupled, distributed architecture separating the user interface (Base Station) from the hardware execution and ROS 2 middleware (Rover/Jetson Xavier). 

*   **Base Station (Frontend)**: Hosts the Node.js/Express web server serving an OpenMCT-based GUI. It connects to the Rover's exposed endpoints to receive telemetry and send commands.
*   **Rover / Jetson Xavier (Backend)**: Hosts the core ROS 2 (Humble) environment, hardware controllers, camera discovery/streaming nodes, and a WebSocket bridge that translates frontend JSON packets into ROS 2 messages.

### System Workflow
1. **User Interaction**: The user interacts with an OpenMCT plugin widget (e.g., moves a joystick or toggles a switch).
2. **WebSocket Transmission**: The frontend sends a JSON-formatted payload to `ws://${ROVER_IP}:9091`.
3. **Bridge Translation**: `ws_ros2_bridge.py` on the Rover receives the JSON payload, instantiates the corresponding ROS 2 message (e.g., `std_msgs/String`, `geometry_msgs/Twist`), and publishes it to the appropriate ROS topic.
4. **Hardware Execution & Telemetry**: The ROS 2 supervisor or hardware nodes execute the command and publish telemetry back to ROS topics.
5. **UI Update**: The bridge subscribes to these topics, packages the telemetry into JSON, and sends it back to the frontend to update the displays.

---

## 2. Base Station-Xavier Connectivity

Seamless communication between the Base Station and the Rover is critical and managed through dynamic configuration rather than hardcoded IPs.

### Environment & Network Configuration
*   **`.env` File**: Manages environment variables. 
    *   `ROVER_IP`: Points the Base Station to the Jetson's current IP on the local Wi-Fi/Omada network.
    *   `ROS_DOMAIN_ID=42`: Prevents network collisions with other teams during competition.
    *   `ROS_LOCALHOST_ONLY`: Set to `0` for multi-machine (Base Station <-> Jetson) communication, or `1` for local testing.
*   **DDS Implementation**: CycloneDDS (`rmw_cyclonedds_cpp`) is used for robust multi-cast/unicast node discovery across the network.
*   **Dynamic Startup Script (`start_gui.sh`)**: Can automatically detect the local IP and set `ROVER_IP` before launching the Docker containers, supporting split deployments with `--gui` or `--rover` arguments.

### Communication Bridges
1.  **WebSocket ROS 2 Bridge (`ws_ros2_bridge.py`)**: Runs on port `9091`. Translates bidirectional telemetry and command traffic.
2.  **Web Camera Server (`web_camera_server.py`)**: Runs on port `9090`. Serves an HTTP API for camera discovery and MJPEG streams for video feeds.

---

## 3. Dockerization & Deployment Strategy

The deployment is split into two primary Docker Compose configurations to enforce the decoupled architecture:

### 1. Rover Stack (`docker-compose-rover.yml`)
Runs on the Jetson Xavier and requires hardware access. Uses `network_mode: host` and `privileged: true` to access `/dev` devices.
*   **`supervisor_container`**: Runs the core `supervisor.py` ROS 2 node, managing missions (Navigation, Drilling, etc.) and monitoring node CPU/Memory health using `psutil`.
*   **`web_camera_server`**: A Python FastAPI/Flask server utilizing OpenCV to discover `/dev/video*` devices. It dynamically detects ZED, RealSense, and Logitech cameras while filtering out internal laptop webcams.
*   **`ws_ros2_bridge`**: The Python WebSocket server bridging the frontend to ROS 2.

### 2. Base Station Stack (`docker-compose-gui.yml`)
Runs on the operator's machine. Uses `network_mode: host`.
*   **`gui_container`**: Node.js server (`server.js` + `static-server.js`) serving the OpenMCT framework and custom plugins. Injects the `ROVER_IP` into the frontend environment.
*   **Monitoring Stack (`GUI/monitoring/docker-compose.yml`)**: Deploys Prometheus (port `9098`) and Grafana (port `3000`) for visual metrics tracking, scraping Jetson metrics (e.g., via `node_exporter` on port `9100`).

---

## 4. GUI Plugin Architecture

The frontend is built on OpenMCT, with customized plugins tailored to the rover's hardware.

### Mission Control & Rover Status
*   **`MissionControlView.js`**: Allows the operator to Start, Stop, and Reset missions (e.g., Drilling, Navigation) via ROS 2 service calls. Evaluates `rover_state` to prevent illegal state transitions.
*   **`RoverStatusView.js`**: Displays a real-time grid of all active ROS 2 nodes, showing their PID, CPU usage, Memory, and state (Running/Error) as broadcasted by the Supervisor.
*   **`combo-start-plugin.js`**: A specialized combo widget that links OpenMCT timers to supervisor events (e.g., starting a timer when a mission starts) and provides fallback manual/automatic toggles.

### Robotic Arm (Arm-Control-FK)
*   **`ArmControlFKView.js`**: Handles both Forward Kinematics (FK) and Inverse Kinematics (IK) through a unified UI.
*   **Features**:
    *   Provides sliders with custom step-increment/decrement buttons for precision.
    *   Supports saving and deleting custom joint location presets directly to `localStorage`.
    *   Displays real-time joint feedback read from `/current_readings_topic`.
    *   Controls gripper, diff motors, and provides a distinct liquid sampling interface (Forward/Stop/Reverse).

### Drilling Module (Drilling-26)
*   **`Drilling26View.js`**: Controls the multi-axis drilling rig.
*   **Features**:
    *   **Dual Motor Proportional Control**: Replaced basic CW/CCW buttons with proportional duty cycle sliders ranging from `-1023` to `1023`.
    *   Global "Emergency Stop All Motors" and individual motor stops.
    *   Platform Up/Down/Stop controls with speed adjustment.
    *   Reads and displays telemetry for Platform Depth, Sample Weight, load cell data, and drill encoder feedback.
    *   Integrates a minimized camera view specific to the drill tool feed.

### Mobility & Teleoperation
*   **`Joystick26View.js`**: An on-screen HTML5 Canvas joystick. Translates X/Y coordinates into Linear (X) and Angular (Z) velocities. Contains internal kinematic calculations to transform `cmd_vel` equivalent data into Left/Right wheel radians per second (`/Wheel_RadPerSec`).
*   **`WheelControlView.js`**: A direct fallback interface for sending raw PWM values (slider -100 to 100) independently to the left and right wheel banks.

### Camera & Video Systems
*   **`camera_plugin.js`**: Registers both a single Camera View and a 5-Camera Grid Dashboard.
*   **Features**:
    *   Interacts directly with `web_camera_server.py` via HTTP GET requests (`/api/cameras`, `/api/stream`, `/api/control`).
    *   Allows pre-transmission configuration: choosing between Grayscale (bandwidth saving) and RGB.
    *   Controls lighting/quality presets (Standard, Outdoor, Night).
    *   Permits pausing streams and taking UI snapshots directly from the canvas feed.

### SLAM Visualization
*   **`SlamVisualizerPlugin.js`**: A highly custom 8-panel dashboard tailored for SLAM (Simultaneous Localization and Mapping) testing.
*   **Features**:
    *   Plots the 2D path of the rover (Filter vs. Ground Truth).
    *   Visualizes 3D Orientation (Roll, Pitch, Yaw) via dial gauges.
    *   Graphs ArUco detection timelines, position error margins, occupancy grids, and localization health scoring.

### UI Utilities
*   **`ThemeTogglePlugin.js`**: A simple widget utilizing `localStorage` to allow operators to quickly switch the OpenMCT theme between Light Mode (Snow) and Dark Mode (Espresso) without losing layout state.

---
*End of Documentation*
