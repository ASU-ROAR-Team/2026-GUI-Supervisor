#!/bin/bash
set -e

# 1. Source ROS 2 base environment
source /opt/ros/humble/setup.bash

# 2. Source micro-ROS workspace
if [ -f /uros_ws/install/setup.bash ]; then
    source /uros_ws/install/setup.bash
fi

# 3. Source Supervisor workspace
if [ -f /roar_ws/install/setup.bash ]; then
    source /roar_ws/install/setup.bash
fi

# Optional: Only run 'colcon build' at boot IF you mounted source code dynamically from host
# cd /roar_ws && colcon build && source /roar_ws/install/setup.bash

# 4. Start micro-ROS Agent in the background
SERIAL_DEV=""
if [ -c "/dev/ttyUSB0" ]; then
    SERIAL_DEV="/dev/ttyUSB0"
elif [ -c "/dev/ttyACM0" ]; then
    SERIAL_DEV="/dev/ttyACM0"
fi

if [ -n "$SERIAL_DEV" ]; then
    echo "Starting micro-ROS Agent on $SERIAL_DEV..."
    ros2 run micro_ros_agent micro_ros_agent serial -b 115200 --dev "$SERIAL_DEV" &
else
    echo "⚠️ Warning: No active micro-ROS serial device found (/dev/ttyUSB0 or /dev/ttyACM0)."
    echo "Starting micro-ROS Agent on default /dev/ttyUSB0 (waiting for device connection)..."
    ros2 run micro_ros_agent micro_ros_agent serial -b 115200 --dev /dev/ttyUSB0 &
fi

# 5. Wait a moment for the agent to initialize
sleep 2

# 6. Execute supervisor command (passed from CMD in Dockerfile or command in docker-compose)
echo "Starting Supervisor process..."
exec "$@"