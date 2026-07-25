#!/usr/bin/env bash
# Free port 8080 and device locks
fuser -k 8080/tcp 2>/dev/null || true
pkill -f "python3.*web_camera_server.py" 2>/dev/null || true
pkill -f "ffmpeg.*udp://" 2>/dev/null || true
