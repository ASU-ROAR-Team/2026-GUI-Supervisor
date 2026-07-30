#!/usr/bin/env bash
# Ultra-Low Latency Receiver Script for 192.168.150.143
# Usage: 
#   ./start_receiver.sh 5win    # Opens 5 separate low-latency windows
#   ./start_receiver.sh grid    # Opens all 5 cameras in 1 combined grid window (default)

MODE="${1:-grid}"

PORTS=(5000 5002 5004 5006 5008)

# Common low-latency flags for ffplay
FFPLAY_FLAGS="-fflags nobuffer -flags low_delay -probesize 32 -analyzeduration 0 -framedrop -sync ext"

if [ "$MODE" = "5win" ]; then
    echo "Launching 5 separate zero-lag ffplay windows..."
    for PORT in "${PORTS[@]}"; do
        ffplay $FFPLAY_FLAGS -window_title "Camera Port $PORT" "udp://0.0.0.0:$PORT?listen&buffer_size=65536" &
    done
else
    echo "Launching 5 cameras combined into a single 3x2 grid window..."
    ffmpeg -loglevel warning \
        -fflags nobuffer -flags low_delay -probesize 32 -analyzeduration 0 \
        -f mpegts -i "udp://0.0.0.0:5000?listen&buffer_size=65536" \
        -f mpegts -i "udp://0.0.0.0:5002?listen&buffer_size=65536" \
        -f mpegts -i "udp://0.0.0.0:5004?listen&buffer_size=65536" \
        -f mpegts -i "udp://0.0.0.0:5006?listen&buffer_size=65536" \
        -f mpegts -i "udp://0.0.0.0:5008?listen&buffer_size=65536" \
        -filter_complex "
            nullsrc=size=1920x960 [base];
            [0:v] setpts=PTS-STARTPTS, scale=640x480 [cam1];
            [1:v] setpts=PTS-STARTPTS, scale=640x480 [cam2];
            [2:v] setpts=PTS-STARTPTS, scale=640x480 [cam3];
            [3:v] setpts=PTS-STARTPTS, scale=640x480 [cam4];
            [4:v] setpts=PTS-STARTPTS, scale=640x480 [cam5];
            [base][cam1] overlay=shortest=1:x=0:y=0 [tmp1];
            [tmp1][cam2] overlay=shortest=1:x=640:y=0 [tmp2];
            [tmp2][cam3] overlay=shortest=1:x=1280:y=0 [tmp3];
            [tmp3][cam4] overlay=shortest=1:x=320:y=480 [tmp4];
            [tmp4][cam5] overlay=shortest=1:x=960:y=480
        " \
        -f mpegts - | ffplay -window_title "5 Camera Realtime Grid" $FFPLAY_FLAGS -i -
fi
