#!/usr/bin/env bash
# Script to stop all active camera ffmpeg streams

echo "Stopping 5 camera streams..."
pkill -f "ffmpeg.*udp://"
echo "Done."
