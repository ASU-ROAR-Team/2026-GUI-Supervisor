#!/bin/bash

# Exit immediately if any command fails
set -e

echo "==========================================="
echo "Starting ROS2 GUI Setup & Launch Script"
echo "==========================================="

# Function to check command presence
has_command() {
    command -v "$1" >/dev/null 2>&1
}

# Helper function to run commands with sudo if necessary and available
run_with_privilege() {
    if [ "$(id -u)" -ne 0 ]; then
        if has_command sudo; then
            sudo "$@"
        else
            echo "Error: Root privileges are required, but 'sudo' is not installed." >&2
            exit 1
        fi
    else
        "$@"
    fi
}

# --- Locate or Clone GUI Folder ---
# Make this script try to locate the GUI folder in the working directory in /roar_ws/GUI.
# If not found then clone the repo from https://github.com/ASU-ROAR-Team/2026-GUI-Supervisor.git and go to branch called gui_updated.
GUI_DIR=""
if [ -d "$(pwd)/roar_ws/supervisor_gui/GUI" ]; then
    echo "Found GUI folder at $(pwd)/roar_ws/supervisor_gui/GUI"
    GUI_DIR="$(pwd)/roar_ws/supervisor_gui/GUI"
elif [ -d "$(pwd)/supervisor_gui/GUI" ]; then
    echo "Found GUI folder in working directory at $(pwd)/supervisor_gui/GUI"
    GUI_DIR="$(pwd)/supervisor_gui/GUI"
elif [ -d "GUI" ]; then
    echo "Found GUI folder in working directory at $(pwd)/GUI"
    GUI_DIR="$(pwd)/GUI"
else
    echo "GUI folder not found. Cloning repository..."
    # Ensure git is installed before cloning
    if ! has_command git; then
        echo "git is missing. Installing git..."
        run_with_privilege apt-get update
        run_with_privilege apt-get install -y git
    fi

    # Try to use /roar_ws if possible
    if [ ! -d "$(pwd)/roar_ws" ]; then
        if run_with_privilege mkdir -p "$(pwd)/roar_ws" 2>/dev/null; then
            run_with_privilege chown "$(id -u):$(id -g)" "$(pwd)/roar_ws" 2>/dev/null || true
        fi
    fi

    if [ -d "$(pwd)/roar_ws" ] && [ -w "$(pwd)/roar_ws" ] && [ -z "$(ls -A "$(pwd)/roar_ws" 2>/dev/null)" ]; then
        echo "Cloning repository to $(pwd)/roar_ws..."
        git clone -b gui_updated https://github.com/ASU-ROAR-Team/2026-GUI-Supervisor.git "$(pwd)/roar_ws/supervisor_gui"
        GUI_DIR="$(pwd)/roar_ws/supervisor_gui/GUI"
    else
        echo "Cloning repository locally to supervisor_gui..."
        git clone -b gui_updated https://github.com/ASU-ROAR-Team/2026-GUI-Supervisor.git supervisor_gui
        GUI_DIR="$(pwd)/supervisor_gui/GUI"
    fi

    # Explicitly checkout gui_updated branch in the cloned repo
    echo "Ensuring start_gui_script branch is active..."
    cd "$GUI_DIR/.."
    git checkout start_gui_script
    cd - > /dev/null
fi

# Go to the root of the repository
cd "$GUI_DIR/.."

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

