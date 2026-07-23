#!/bin/bash
set -e

# Setup ROS2 environment
source /opt/ros/humble/setup.bash

# Build the newly mounted workspace packages
cd /ros2_ws
colcon build

# Source the newly built workspace
source /ros2_ws/install/setup.bash

# Execute the command passed from docker-compose
exec "$@"