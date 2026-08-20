#!/bin/bash

# Exit immediately if any command fails
set -e

# Navigate to project root (one directory up from where this script resides)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "==========================================="
echo "Starting ROS2 GUI Setup & Launch Script"
echo "==========================================="

# Determine which deployment configuration to execute based on arguments
if [ "$1" == "--rover" ]; then
    echo "Deploying Rover Configuration (ROS 2 Supervisor, WS Bridge, Camera Server)..."
    docker compose -f docker-compose-rover.yml up -d
elif [ "$1" == "--gui" ]; then
    echo "Deploying Base Station Configuration (OpenMCT GUI)..."
    docker compose -f docker-compose-gui.yml up -d
else
    echo "Usage: ./start_gui.sh [--rover | --gui]"
    echo "  --rover   : Deploys the Jetson AGX Xavier environment (Supervisor, Cameras, Bridge)"
    echo "  --gui     : Deploys the Base Station OpenMCT environment"
    exit 1
fi