#!/bin/bash

# Navigate to project root (one directory up from where this script resides)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "==========================================="
echo "  ROAR GUI Launcher"
echo "==========================================="

if [ "$1" == "--rover" ]; then
    # ── Rover / Jetson side ──────────────────────────────────────────────────
    # Auto-detect the first non-loopback, non-docker IPv4 address on this machine
    DETECTED_IP=$(hostname -I | tr ' ' '\n' \
        | grep -v '^127\.' \
        | grep -v '^172\.' \
        | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' \
        | head -1)

    echo ""
    echo "  Deploying Rover Configuration"
    echo "  (ROS 2 Supervisor, WS Bridge, Camera Server)"
    echo ""
    if [ -n "$DETECTED_IP" ]; then
        echo "  ✅ Rover IP detected: $DETECTED_IP"
        echo ""
        echo "  ➡  On the Base Station run:"
        echo "     ./GUI/start_gui.sh --gui $DETECTED_IP"
        echo ""
        echo "  ➡  Then open: http://localhost:8081/?host=$DETECTED_IP"
    else
        echo "  ⚠  Could not auto-detect IP. Run 'hostname -I' to find it."
    fi
    echo "==========================================="
    docker compose -f docker-compose-rover.yml down --remove-orphans
    docker compose -f docker-compose-rover.yml up -d

elif [ "$1" == "--gui" ]; then
    # ── Base Station side ────────────────────────────────────────────────────
    # Accept rover IP as second argument; fall back to .env / default
    ROVER_IP_ARG="${2:-}"

    if [ -n "$ROVER_IP_ARG" ]; then
        echo ""
        echo "  Deploying Base Station Configuration (OpenMCT GUI)"
        echo "  Rover IP: $ROVER_IP_ARG  (from command-line argument)"
        echo "==========================================="
        ROVER_IP="$ROVER_IP_ARG" docker compose -f docker-compose-gui.yml down --remove-orphans
        ROVER_IP="$ROVER_IP_ARG" docker compose -f docker-compose-gui.yml up -d
    else
        # No argument — use whatever ROVER_IP is set in .env
        FALLBACK_IP=$(grep '^ROVER_IP=' "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2)
        echo ""
        echo "  Deploying Base Station Configuration (OpenMCT GUI)"
        echo "  Rover IP: ${FALLBACK_IP:-not set}  (from .env — pass IP as 2nd arg to override)"
        echo "  Usage: ./GUI/start_gui.sh --gui <ROVER_IP>"
        echo "==========================================="
        docker compose -f docker-compose-gui.yml down --remove-orphans
        docker compose -f docker-compose-gui.yml up -d
    fi

else
    echo ""
    echo "  Usage:"
    echo "    On Jetson  : ./GUI/start_gui.sh --rover"
    echo "    On Base PC : ./GUI/start_gui.sh --gui <ROVER_IP>"
    echo ""
    echo "  Example:"
    echo "    ./GUI/start_gui.sh --gui 192.168.150.189"
    echo ""
    exit 1
fi