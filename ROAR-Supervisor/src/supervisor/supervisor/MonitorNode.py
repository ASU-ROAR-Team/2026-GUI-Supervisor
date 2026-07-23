#MonitorNode.py
import rclpy
from rclpy.node import Node
from std_msgs.msg import String
import psutil
import json


class MonitorNode(Node):
    def __init__(self, process_name, heartbeat_topic="heartbeat", resource_topic="resource", interval=1.0, pid=None):
        """
        topic:     topic name to publish heartbeat and/or resource usage
        heartbeat_topic: topic name for heartbeat messages
        resource_topic:  topic name for resource usage messages
        interval:  publish frequency in seconds
        pid:       process ID to monitor CPU/mem usage
        """
        super().__init__(f"heartbeat_node_{process_name.replace(' ', '_')}")
        self.heartbeat_publisher = self.create_publisher(String, heartbeat_topic, 10)
        self.resource_publisher = self.create_publisher(String, resource_topic, 10)
        self.pid = pid
        self.process_name = process_name
        self.process = None
        self.timer = self.create_timer(interval, self.timer_callback)

        self.get_logger().info(
            f"Monitoring started for {process_name}, PID={pid}, interval={interval}s"
        )

    def timer_callback(self):
        """Called periodically to publish both heartbeat and resource usage."""

        try:
            self.publish_heartbeat()
            self.publish_resource_usage()
        except Exception as e:
            # Log once and stop timer to avoid repeated errors during shutdown
            try:
                self.get_logger().warning(f"Monitor publish error: {e}")
            except Exception:
                pass
            try:
                if self.timer:
                    self.timer.cancel()
            except Exception:
                pass

    def publish_heartbeat(self):
        """Publish a simple heartbeat message."""
        msg = String()
        msg.data = self.process_name
        try:
            self.heartbeat_publisher.publish(msg)
            self.get_logger().debug(f"Heartbeat: {msg.data}")
        except Exception:
            # Publishing can fail during shutdown; ignore to avoid crashes
            pass

    def publish_resource_usage(self):
        """Publish CPU, memory, and process state (including child processes)."""
        msg = String()

        # Initialize process if needed
        if self.process is None:
            try:
                self.process = psutil.Process(self.pid)
            except psutil.NoSuchProcess:
                data = {
                    "process_name": self.process_name,
                    "pid": self.pid,
                    "status": "not_found",
                    "cpu_percent": 0.0,
                    "memory_mb": 0.0,
                    "alive": False
                }
                msg.data = json.dumps(data)
                self.resource_publisher.publish(msg)
                return

        try:
            # Collect parent + all child processes
            procs = [self.process] + self.process.children(recursive=True)

            # STATUS (from parent)
            status = self.process.status()

            # CPU: sum CPU percent of parent + children
            cpu_percent = sum(p.cpu_percent(interval=0.1) for p in procs)

            # MEMORY: sum RSS of parent + children
            memory_mb = sum(p.memory_info().rss for p in procs) / (1024 * 1024)

            data = {
                "process_name": self.process_name,
                "pid": self.pid,
                "status": status,
                "cpu_percent": round(cpu_percent, 2),
                "memory_mb": round(memory_mb, 2),
                "alive": True,
                "num": len(procs)
            }

            msg.data = json.dumps(data)

        except (psutil.NoSuchProcess, psutil.AccessDenied):
            # If parent died, clean up
            data = {
                "process_name": self.process_name,
                "pid": self.pid,
                "status": "terminated",
                "cpu_percent": 0.0,
                "memory_mb": 0.0,
                "alive": False
            }
            msg.data = json.dumps(data)
            self.process = None

        self.resource_publisher.publish(msg)


    def shutdown(self):
        if self.timer:
            self.timer.cancel()
        try:
            self.destroy_node()
        except Exception:
            pass