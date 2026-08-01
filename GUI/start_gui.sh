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
    echo "Ensuring gui_updated branch is active..."
    cd "$GUI_DIR/.."
    git checkout gui_updated
    cd - > /dev/null
fi

# 1. Update package list if we need to install anything
need_apt_update=false

# Check and install curl (needed for NodeSource setup)
if ! has_command curl; then
    echo "[Dependency] curl is missing."
    need_apt_update=true
fi

# Check and install Python3 and Pip
if ! has_command python3; then
    echo "[Dependency] python3 is missing."
    need_apt_update=true
fi
if ! has_command pip3; then
    echo "[Dependency] pip3 is missing."
    need_apt_update=true
fi

# Check Node.js (needs v18+)
need_node_install=false
if ! has_command node; then
    echo "[Dependency] Node.js is missing."
    need_node_install=true
    need_apt_update=true
else
    NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VER" -lt 18 ]; then
        echo "[Dependency] Node.js version is $NODE_VER. Version >= 18 is required."
        need_node_install=true
        need_apt_update=true
    fi
fi

# Check ROS2 Humble Cyclonedds RMW
if [ ! -d "/opt/ros/humble/share/rmw_cyclonedds_cpp" ]; then
    echo "[Dependency] ros-humble-rmw-cyclonedds-cpp is missing."
    need_apt_update=true
fi

# Apply updates and install missing system dependencies
if [ "$need_apt_update" = true ]; then
    echo "Updating system package repositories..."
    run_with_privilege apt-get update
fi

if ! has_command curl; then
    echo "Installing curl..."
    run_with_privilege apt-get install -y curl
fi

if ! has_command python3; then
    echo "Installing python3..."
    run_with_privilege apt-get install -y python3
fi

if ! has_command pip3; then
    echo "Installing python3-pip..."
    run_with_privilege apt-get install -y python3-pip
fi

if [ "$need_node_install" = true ]; then
    echo "Removing conflicting legacy Node.js packages..."
    # Purge base nodejs along with libnode72
    run_with_privilege apt-get remove --purge -y nodejs libnode72 libnode-dev nodejs-doc 2>/dev/null || true
    run_with_privilege apt-get autoremove -y 2>/dev/null || true

    echo "Installing Node.js 18..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | run_with_privilege bash -
    # Pass force-overwrite flag to dpkg to bypass file collisions safely
    run_with_privilege apt-get install -y -o Dpkg::Options::="--force-overwrite" nodejs
fi

if [ ! -d "/opt/ros/humble/share/rmw_cyclonedds_cpp" ]; then
    echo "Installing ros-humble-rmw-cyclonedds-cpp..."
    run_with_privilege apt-get install -y ros-humble-rmw-cyclonedds-cpp
fi

# 2. Check and install Python websockets
if ! python3 -c "import websockets" >/dev/null 2>&1; then
    echo "Installing python 'websockets' library..."
    pip3 install websockets
else
    echo "✓ Python library 'websockets' is installed."
fi

echo "✓ All system and python dependencies verified/installed."

# 3. Source ROS2 Humble before npm install to ensure rclnodejs can build
if [ -f "/opt/ros/humble/setup.bash" ]; then
    echo "Sourcing ROS2 Humble at /opt/ros/humble/setup.bash..."
    source /opt/ros/humble/setup.bash
else
    echo "WARNING: ROS2 setup.bash not found at /opt/ros/humble/setup.bash!"
fi

# 4. Check and install Node.js dependencies
echo "Checking Node.js dependencies..."
cd "$GUI_DIR"

if [ ! -d "node_modules" ]; then
    echo "node_modules not found. Running npm install..."
    npm install
else
    echo "node_modules found. Checking/updating npm packages..."
    npm install
fi

echo "✓ Node.js dependencies installed."

# 5. Start the GUI and the ROS2 bridge
echo "==========================================="
echo "Launching GUI and Bridge..."
echo "==========================================="

# Setup environment variables matching the docker-compose config
# export ROS_LOCALHOST_ONLY=1
# export RMW_IMPLEMENTATION=rmw_cyclonedds_cpp
# export PYTHONUNBUFFERED=1

# if [ -f "$GUI_DIR/../cyclonedds.xml" ]; then
#     export CYCLONEDDS_URI="file://$GUI_DIR/../cyclonedds.xml"
# elif [ -f "$GUI_DIR/cyclonedds.xml" ]; then
#     export CYCLONEDDS_URI="file://$GUI_DIR/cyclonedds.xml"
# fi

cleanup() {
    echo "Stopping processes..."
    kill $NPM_PID $BRIDGE_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start the Node.js static server
echo "Starting Node.js static server on port 8081..."
npm start &
NPM_PID=$!

# Start the Python websocket-ROS2 bridge
echo "Starting Python WS-ROS2 bridge on port 8080..."
python3 ws_ros2_bridge.py &
BRIDGE_PID=$!

# Wait for both processes
wait $NPM_PID $BRIDGE_PID
