# Jetson Xavier & Base Station PC Multi-Camera Deployment Guide

This guide explains how to stream real-time camera feeds from a **Jetson Xavier** (robot) to a **Base Station PC** running the OpenMCT GUI over a shared local network.

---

## 🌐 Network Architecture Overview

```
 +----------------------------------+          Local Network          +----------------------------------+
 |          JETSON XAVIER           |       (Ethernet / Wi-Fi)        |         BASE STATION PC          |
 |    (Cameras & Camera Server)     |<------------------------------->|         (OpenMCT GUI)            |
 |                                  |                                 |                                  |
 |  • Connected: 5 USB/ZED Cameras  |                                 |  • OpenMCT GUI: Port 8081        |
 |  • Camera Server: Port 9090      |                                 |  • Browser: http://localhost:8081|
 |  • IP Address: 192.168.1.100     |                                 |  • IP Address: 192.168.1.200     |
 +----------------------------------+                                 +----------------------------------+
```

---

## 📋 Prerequisites

1. **Jetson Xavier** and **Base Station PC** are connected to the same local network subnet (e.g. router Wi-Fi or direct Ethernet link).
2. Find the IP address of your Jetson Xavier:
   ```bash
   # Run this on the Jetson Xavier terminal:
   hostname -I
   # Example output: 192.168.1.100
   ```

---

## 🚀 Step-by-Step Setup

### Step 1: Run the Camera Server on Jetson Xavier

On the **Jetson Xavier**:
1. Connect all USB, ZED, or RealSense cameras into the USB ports.
2. In the repository directory, launch Docker Compose:
   ```bash
   docker compose up --build
   ```
3. Verify the camera server output on the Xavier terminal:
   ```text
   🔍 Scanning for available camera device nodes (Excluding base station webcam)...
   ✅ Found 5 active camera(s):
      • /dev/video2: USB Camera (Front)
      • /dev/video4: USB Camera (Left)
      • /dev/video6: USB Camera (Right)
      • /dev/video8: USB Camera (Rear)
      • /dev/video10: USB Camera (Arm/Tool)
   🚀 Dedicated Multi-Camera Dashboard Active on Port 9090
   ```

---

### Step 2: Run and Access the GUI on Base Station PC

On the **Base Station PC**:
1. Launch Docker Compose (or start the GUI server):
   ```bash
   docker compose up
   ```
2. Open your web browser on the Base Station PC.

#### Option A: View OpenMCT GUI with Jetson Xavier Cameras (Recommended)
Navigate to:
```text
http://localhost:8081/?host=192.168.1.100
```
*(Replace `192.168.1.100` with your Jetson Xavier's actual IP address)*

> **How it works**: Passing `?host=<Xavier_IP>` automatically instructs all OpenMCT camera widgets and ROS 2 telemetry plugins to connect directly to the Jetson Xavier over the network.

#### Option B: Dedicated Full-Screen Camera Dashboard
Open a separate browser tab on your Base Station PC and navigate to:
```text
http://192.168.1.100:9090
```
*(Replace `192.168.1.100` with your Jetson Xavier's actual IP address)*

> **Features**: This opens the dedicated multi-camera dashboard running directly on the Xavier. You can monitor all 5 camera feeds in full-screen high resolution, adjust Brightness and Contrast sliders, toggle Grayscale/RGB modes, and monitor live FPS stats.

---

## 🔧 ROS 2 Network Synchronization (Optional)

If both Jetson Xavier and Base Station PC are running ROS 2 nodes in Docker, verify that environment variables in `docker-compose.yml` match on both machines:

```yaml
environment:
  - ROS_DOMAIN_ID=42
  - ROS_LOCALHOST_ONLY=0
  - RMW_IMPLEMENTATION=rmw_cyclonedds_cpp
```

- `ROS_DOMAIN_ID=42`: Ensures both devices share the same ROS 2 domain.
- `ROS_LOCALHOST_ONLY=0`: Enables network discovery across Ethernet/Wi-Fi.

---

## 🔍 Troubleshooting & Network Diagnostics

1. **Ping Test**:
   From the Base Station PC, test connectivity to the Jetson Xavier:
   ```bash
   ping 192.168.1.100
   ```
2. **Camera Stream HTTP Test**:
   From the Base Station PC, check if the Xavier camera API responds:
   ```bash
   curl -I http://192.168.1.100:9090/api/cameras
   ```
3. **Firewall check**:
   If the browser cannot load `http://192.168.1.100:9090`, ensure firewall rules on the Xavier allow port 9090 and 8081:
   ```bash
   sudo ufw allow 9090/tcp
   sudo ufw allow 8081/tcp
   sudo ufw allow 9091/tcp
   ```
