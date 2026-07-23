FROM ros:humble-ros-base
SHELL ["/bin/bash", "-c"]

RUN apt-get update && apt-get install -y python3-pip curl \
    ros-humble-rmw-cyclonedds-cpp && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs

ENV RMW_IMPLEMENTATION=rmw_cyclonedds_cpp

RUN pip3 install websockets

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .

EXPOSE 8080 8081

# Updated CMD: Uses bash and sources ROS2 before running your bridge and server
CMD ["/bin/bash", "-c", "source /opt/ros/humble/setup.bash && python3 ws_ros2_bridge.py & node static-server.js"]