FROM ros:humble-ros-base
SHELL ["/bin/bash", "-c"]

# 1. Install build dependencies
RUN apt-get update && apt-get install -y \
    python3-colcon-common-extensions \
    ros-humble-rmw-cyclonedds-cpp \
    && rm -rf /var/lib/apt/lists/*

# 2. Clone micro-ROS setup tool
WORKDIR /uros_ws
RUN git clone -b humble https://github.com/micro-ROS/micro_ros_setup.git src/micro_ros_setup

# 3. Initialize and run rosdep
RUN source /opt/ros/humble/setup.bash && \
    apt-get update && \
    rosdep init || true && \
    rosdep update && \
    rosdep install --from-paths src --ignore-src -y

# 4. Build micro_ros_setup package
RUN source /opt/ros/humble/setup.bash && colcon build

# 5. Create micro-ROS agent workspace (downloads agent sources)
RUN source /opt/ros/humble/setup.bash && \
    source install/local_setup.bash && \
    ros2 run micro_ros_setup create_agent_ws.sh

# 6. Build micro-ROS agent executable
RUN source /opt/ros/humble/setup.bash && \
    source install/local_setup.bash && \
    ros2 run micro_ros_setup build_agent.sh

# 7. Build supervisor ROS 2 workspace
WORKDIR /roar_ws
COPY ./src ./src
RUN source /opt/ros/humble/setup.bash && colcon build

# 8. Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

# Default command: Runs your supervisor node if no command is passed
CMD ["ros2", "run", "supervisor", "supervisor"]