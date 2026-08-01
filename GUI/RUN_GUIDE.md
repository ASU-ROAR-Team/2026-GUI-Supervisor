# ROAR Supervisor & Multi-Camera Setup Guide

This guide provides concise, step-by-step instructions to run the **Multi-Camera Web Server**, **ROS 2 WebSocket Bridge**, and **OpenMCT GUI** across a dual-machine network setup (NVIDIA Jetson Xavier + Operator PC connected via Ethernet).

---

## 🔌 Architecture & Port Mapping

| Component | Runs On | Port | Protocol | Purpose |
|---|---|---|---|---|
| **Web Camera Server** | Xavier | `9090` | HTTP | High-performance multi-camera streaming (ZED 2i, RealSense, Webcams) |
| **ROS 2 WebSocket Bridge** | Xavier | `8080` | WebSocket | Real-time telemetry, node health, & mission control commands |
| **OpenMCT Web GUI** | Xavier / PC | `8081` | HTTP | OpenMCT Web Dashboard UI |

---

## ⚡ Prerequisites

On the **Xavier**, ensure system dependencies and Python packages are installed:

```bash
# Install Python WebSocket dependency
sudo apt update && sudo apt install -y python3-websockets
```

---

## 🚀 Step 1: Start Backend Services on Xavier

Open two separate terminals on the **Xavier**:

### Terminal 1: Launch Multi-Camera Server (Port 9090)
```bash
python3 GUI/web_camera_server.py --port 9090 --zed-mode right --mode gray --quality 50
```

### Terminal 2: Launch ROS 2 WebSocket Bridge (Port 8080)
```bash
source /opt/ros/humble/setup.bash
python3 GUI/ws_ros2_bridge.py
```

### Get the Xavier's IP Address
Find the Ethernet IP address of the Xavier:
```bash
hostname -I
```
*(Example IP: `192.168.1.100`)*

---

## 💻 Step 2: Access GUI from Operator PC

Connect your PC to the Xavier via an Ethernet cable, then choose **Option A** or **Option B**:

### Option A: Hosting OpenMCT on Xavier (Recommended)
Launch the GUI server on the Xavier:
```bash
cd GUI && npm start
```
Then open a browser on your PC and navigate to:
```text
http://<XAVIER_IP>:8081
```
*(Example: `http://192.168.1.100:8081`)*

### Option B: Running OpenMCT (`npm start`) locally on PC
Launch the GUI server locally on your PC:
```bash
cd GUI && npm start
```
Then open a browser on your PC and supply the Xavier IP via the `?host` query parameter:
```text
http://localhost:8081/?host=<XAVIER_IP>
```
*(Example: `http://localhost:8081/?host=192.168.1.100`)*

> 💡 **Note:** Passing `?host=192.168.1.100` automatically saves the Xavier IP to your browser's `localStorage` for future page reloads.

---

## 🛠️ Troubleshooting

- **`ModuleNotFoundError: No module named 'rclpy'`**:
  Source ROS 2 before running the bridge: `source /opt/ros/humble/setup.bash`.
- **`ModuleNotFoundError: No module named 'websockets'`**:
  Install websockets: `sudo apt install -y python3-websockets`.
- **`ERR_CONNECTION_REFUSED` on port 9090**:
  Ensure `web_camera_server.py` is running on the Xavier and you have supplied `?host=<XAVIER_IP>` in your browser URL.
- **`ERR_CONNECTION_RESET` on port 8080**:
  Ensure `ws_ros2_bridge.py` is actively running on the Xavier and not blocked by a local firewall.
