#!/usr/bin/env bash
# Ultra-Low Latency 5 Camera Sender Script
# Usage: 
#   ./start_sender.sh [RECEIVER_IP] [MODE]
# Modes:
#   h264  - Uses H.264 zerolatency compression (~1Mbps/cam). BEST FOR WI-FI & ZERO LAG! (Default)
#   mjpeg - Uses raw camera MJPEG passthrough (~10Mbps/cam). 0% CPU, best for Ethernet.

RECEIVER_IP="${1:-192.168.150.143}"
MODE="${2:-h264}"

CAMERAS=("/dev/video2" "/dev/video4" "/dev/video6" "/dev/video8" "/dev/video10")
PORTS=(5000 5002 5004 5006 5008)

echo "========================================================="
echo " Starting 5 Camera Streams -> $RECEIVER_IP (Mode: $MODE)"
echo "========================================================="

# Kill existing ffmpeg streaming processes if any
pkill -f "ffmpeg.*udp://" 2>/dev/null

for i in "${!CAMERAS[@]}"; do
    CAM="${CAMERAS[$i]}"
    PORT="${PORTS[$i]}"
    
    echo "Streaming $CAM -> udp://$RECEIVER_IP:$PORT..."
    
    if [ "$MODE" = "mjpeg" ]; then
        # Direct hardware MJPEG passthrough
        ffmpeg -loglevel warning \
            -f v4l2 -input_format mjpeg -framerate 30 -video_size 640x480 \
            -i "$CAM" \
            -c:v copy \
            -f mpegts "udp://$RECEIVER_IP:$PORT?pkt_size=1316&buffer_size=65536" &
    else
        # Ultra-fast zerolatency H.264 (cuts Wi-Fi bandwidth by 90% and eliminates lag)
        ffmpeg -loglevel warning \
            -f v4l2 -input_format mjpeg -framerate 30 -video_size 640x480 \
            -i "$CAM" \
            -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p \
            -b:v 1M -maxrate 1.2M -bufsize 2M -g 15 \
            -f mpegts "udp://$RECEIVER_IP:$PORT?pkt_size=1316&buffer_size=65536" &
    fi
done

echo ""
echo "✅ All 5 camera streams started in background!"
echo "To stop streams anytime, run: ./stop_sender.sh"
