# 🚀 ROAR Supervisor & GUI System - Context Overview

This document provides a detailed overview of the `2026-GUI-Supervisor` repository, outlining its core structure, key components, and the significant features introduced across three primary development branches: `start_gui_script`, `no_supervisor`, and `no_webcam`. 

This file is designed to be used as context for future development, debugging, and enhancements in the IDE and Gemini web interface.

---

## 🏗️ Repository Architecture

The repository serves as the mission control and autonomous supervision system for the ROAR (Robot Open Autonomous Racing / Rovers) mobile robots. It features a decoupled, multi-process architecture:

1. **OpenMCT Mission Control GUI**: A web-based frontend built on NASA's OpenMCT framework, providing a highly customizable dashboard for operators to control the rover, visualize data, and manage hardware.
2. **Multi-Camera Web Server (`web_camera_server.py`)**: A standalone Python server dedicated to discovering, fetching, and streaming real-time video feeds from attached cameras (e.g., RealSense, ZED, USB Webcams). It supports low-latency grayscale modes and multi-camera composite dashboards.
3. **ROS 2 Supervisor Node (`ROAR-Supervisor/`)**: A backend ROS 2 package responsible for orchestrating higher-level autonomous logic and bridging complex hardware states.
4. **WebSocket ROS 2 Bridge (`ws_ros2_bridge.py`)**: A Python-based WebSocket server that proxies communication between the OpenMCT frontend and the backend ROS 2 topics, allowing the web GUI to send actions and receive telemetry.

---

## 🌳 Branch Progression & Features

The recent development cycle progressed through a linear hierarchy of branches, each introducing critical capabilities to make the system more robust, standalone, and hardware-aware. 

### 1. `start_gui_script` Branch
**Focus:** Improved operator controls, initialization scripts, and drilling camera configurations.

- **Startup Automation**: Introduced and extended the `start_gui.sh` script to handle repository cloning, branch checkouts, and streamlined initialization directly from the execution directory.
- **Joystick Configuration Improvements**: Refactored the `joystick-26` plugin by removing duplicate speed sliders, limiting the UI to exactly two synced speed sliders, and increasing their maximum range bounds to 0-60.
- **Drilling Camera Interface**: Added a Pre-Start Camera Data Stream Configuration panel in the OpenMCT toolbar. This introduced color mode controls (RGB/Grayscale), lighting configurations, and a new server-side snapshot endpoint (`/api/save_snapshot`) to capture images directly from the drilling feed.
- **Documentation**: Introduced `color_mode.md` and `color_kode.md` to document the pre-transmission data reduction pipelines.

### 2. `no_supervisor` Branch
**Focus:** Decoupling the GUI from the backend ROS 2 Supervisor, allowing the GUI to operate as a standalone module.

- **Standalone Operation**: Ensured that the GUI and its plugins (e.g., Drilling-26 manual controls, multi-camera grids) can successfully connect and publish to ROS 2 topics without requiring the `supervisor` node to be active.
- **Dynamic Camera Discovery**: Replaced hardcoded camera IPs with a dynamic multi-camera grid that queries the API (`fetchActiveCameras`) to automatically discover and render active camera feeds.
- **Network Proxying & Resolution**: Hardcoded `getRoarHost` to leverage `window.location.hostname` instead of local storage, preventing stale IPs from breaking connections. Re-routed all WebSocket communication from port 8081 through a proxy to port 9091 (the bridge).
- **WebSocket Stability**: Replaced the deprecated `websockets 9.x` library in the bridge with a pure-asyncio WebSocket server compatible with Python 3.10, ensuring graceful connection handling and resolving `ERR_CONNECTION_REFUSED` errors.

### 3. `no_webcam` Branch (Current)
**Focus:** Optimizing camera hardware integration and eliminating false-positive frontend errors.

- **Webcam Filtering Mechanism**: Refactored the multi-camera server to specifically permit external Logitech USB webcams on `/dev/video0` and `/dev/video1`, while systematically blocking internal laptop webcams from cluttering the operator dashboard.
- **Notification Silence**: Modified GUI notifications (specifically inside `combo-start-plugin.js`) to suppress misleading "Supervisor offline" alerts that triggered prematurely on every startup. The system now accurately differentiates between a genuine lack of connectivity during a command action versus standard initialization.
- **Plugin Resilience**: Fixed `onerror` null reference exceptions within the `camera_plugin.js` component to ensure smooth DOM destruction when switching between OpenMCT dashboard views.

---

## 📁 Key Files & Directories

- **`GUI/`**: The core directory housing all frontend code, plugins, and standalone Python servers.
  - **`GUI/plugins/`**: Contains modular OpenMCT extensions for specific robot features:
    - `camera/`: Dynamic camera grid integration.
    - `joystick-26/` & `joystick-control/`: Manual teleoperation inputs.
    - `Arm-Control-FK/` & `Arm-Control-v2/`: Forward Kinematics robotic arm controllers.
    - `Drilling-26/`: Specialized drilling camera and snapshot interface.
    - `mission-control/`: Primary network status and system health overlays.
  - **`GUI/web_camera_server.py`**: The multi-threaded Python server that exposes camera streams over HTTP on port 9090.
  - **`GUI/ws_ros2_bridge.py`**: The asyncio WebSocket proxy that maps frontend JSON commands to ROS 2 topic messages on port 9091.
  - **`GUI/start_gui.sh`**: The master initialization script.
- **`ROAR-Supervisor/`**: The standard ROS 2 C++/Python package managing rover autonomy parameters.
- **`docker-compose.yml`**: Configures multi-container deployments (GUI, Supervisor, Web Camera Server) orchestrating port mappings and network resolution for full system launches.
- **Documentation (`*.md`)**: Files such as `JETSON_XAVIER_DEPLOYMENT.md`, `walkthrough.md`, and `DRILLING_TOPICS_GUIDE.md` offer hardware-specific deployment guidelines and detailed backend explanations.
