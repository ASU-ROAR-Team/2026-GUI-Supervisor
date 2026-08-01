#!/bin/bash
set -e

# Configuration
IMAGE_NAME="supervisor-microros:latest"
CONTAINER_NAME="supervisor-microros_container"

echo "=============================================="
echo "          Starting Rover Environment          "
echo "=============================================="

# 1. Build the Docker image if it doesn't exist yet
if [[ "$(docker images -q $IMAGE_NAME 2> /dev/null)" == "" ]]; then
    echo "[+] Docker image '$IMAGE_NAME' not found. Building now..."
    docker build -t $IMAGE_NAME .
else
    echo "[+] Image '$IMAGE_NAME' ready."
fi

# 2. Clean up any existing container with the same name
if [ $(docker ps -aq -f name=^/${CONTAINER_NAME}$) ]; then
    echo "[+] Stopping and removing old container instance..."
    docker stop $CONTAINER_NAME >/dev/null 2>&1 || true
    docker rm $CONTAINER_NAME >/dev/null 2>&1 || true
fi

# 3. Launch the container
echo "[+] Launching Rover container..."
echo "----------------------------------------------"

docker run -it --rm \
  --name $CONTAINER_NAME \
  --net=host \
  --device=/dev/ttyUSB0 \
  $IMAGE_NAME