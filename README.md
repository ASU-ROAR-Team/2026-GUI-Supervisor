# 🚀 ROAR Supervisor & GUI System (Phase 3 Architecture)

This branch (`phase3`) migrates the system from a single-device deployment to a **decoupled Base Station / Rover architecture** communicating over the Omada local network.

- **Base Station (Laptop):** Hosts the OpenMCT GUI container.
- **Rover (Jetson AGX Xavier):** Hosts the ROS 2 Supervisor, WS Bridge, and Camera Server.

---

## 🏃 Step-by-Step Run Guide

### 1. Prerequisites
- **Docker** and **Docker Compose** must be installed on both the Jetson and the Base Station.
- Both machines must be connected to the **Omada local network**.
- The Jetson AGX Xavier must have the static IP: `192.168.0.100`.

### 2. Launching the Rover Environment (Jetson AGX Xavier)
This will launch the ROS 2 Supervisor, the Multi-Camera Web Server, and the WebSocket Bridge.
```bash
# Give execution permissions to the script (first time only)
chmod +x GUI/start_gui.sh

# Run the rover deployment configuration
./GUI/start_gui.sh --rover
```

### 3. Launching the Base Station Environment (Laptop)
This will launch the lightweight OpenMCT Mission Control GUI.
```bash
# Give execution permissions to the script (first time only)
chmod +x GUI/start_gui.sh

# Run the GUI deployment configuration
./GUI/start_gui.sh --gui
```

### 4. Accessing the GUI
Open a web browser on your Base Station and navigate to:
👉 **http://localhost:8081**

The GUI will automatically route backend connections to `192.168.0.100`.

---

## 🛠️ Troubleshooting

### 1. GUI Not Connecting to Rover (WebSocket `ERR_CONNECTION_REFUSED`)
- **Cause:** The Base Station cannot reach the Jetson on the network.
- **Fix:** 
  1. Ensure you are connected to the Omada network.
  2. Ping the Jetson from your laptop: `ping 192.168.0.100`. If it fails, check your Wi-Fi/Ethernet connection.
  3. Ensure the `ws_ros2_bridge` container is successfully running on the Jetson.

### 2. Cameras Not Showing Up or Blank Grid
- **Cause:** The Jetson cannot access the USB webcams, or the camera server crashed.
- **Fix:** 
  1. Verify the cameras are plugged into the Jetson.
  2. Check if the video nodes exist by running `ls /dev/video*` on the Jetson. The configuration expects `/dev/video0` and `/dev/video1`.
  3. Check the camera container logs: `docker logs web_camera_server`.

### 3. "Permission Denied" when running the start script
- **Cause:** Your user does not have permission to execute Docker commands.
- **Fix:** Run the script with `sudo`:
  ```bash
  sudo ./GUI/start_gui.sh --rover
  ```
  *(Alternatively, add your user to the `docker` group).*

### 4. Port Conflicts (Address Already In Use)
- **Cause:** Another process is using a required port.
- **Fix:** Check for existing processes and kill them.
  - Base Station requires port **8081**.
  - Jetson requires ports **9090** (Camera) and **9091** (WebSocket Bridge).
  - Use `sudo lsof -i :<PORT>` to find the conflicting process.
