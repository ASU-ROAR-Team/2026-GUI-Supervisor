# 🚀 ROAR Supervisor & GUI System

ROAR Supervisor and OpenMCT Mission Control GUI for Autonomous Mobile Robots.

---

## 🎥 Multi-Camera Web Server

For detailed setup, command-line arguments, RealSense/ZED camera integration, low-latency streaming configurations, and REST API docs, see:

📖 **[Multi-Camera Web Server Guide](GUI/CAMERA_SERVER_GUIDE.md)**

---

## 🚀 Quick Run

### Run Full System via Docker Compose:
```bash
docker compose up
```

### Run Camera Web Server Standalone (Grayscale Mode - Low Latency):
```bash
python3 GUI/web_camera_server.py
```
