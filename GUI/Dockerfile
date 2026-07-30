FROM ros:humble-ros-core

WORKDIR /app

# Install system dependencies & OpenCV
RUN apt-get update && apt-get install -y \
    python3-pip \
    curl \
    python3-opencv \
    ros-humble-rmw-cyclonedds-cpp \
 && rm -rf /var/lib/apt/lists/*

# Install Python packages
RUN pip3 install websockets psutil

# Install Node.js 18
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8080 8081 9090

CMD ["/bin/bash", "-c", "source /opt/ros/humble/setup.bash && python3 ws_ros2_bridge.py & python3 web_camera_server.py & node server.js"]