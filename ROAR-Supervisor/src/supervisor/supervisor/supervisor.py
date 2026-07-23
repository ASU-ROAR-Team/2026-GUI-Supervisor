import json
from std_msgs.msg import String
import rclpy
import threading
import yaml
import os
import subprocess
import signal
import psutil
import time
from rclpy.node import Node
from rclpy.executors import MultiThreadedExecutor
from ament_index_python.packages import get_package_share_directory
from supervisor.MonitorNode import MonitorNode
from rcl_interfaces.msg import Log

# Directory to store log files
log_dir = "supervisor_logs"

# ── Rover state machine values ────────────────────────────────────────────────
STATE_IDLE          = "IDLE"
STATE_RUNNING       = "RUNNING"
STATE_ERROR         = "ERROR"
STATE_EMERGENCY_STOP = "EMERGENCY_STOP"


class Supervisor(Node):
    def __init__(self, executor):
        super().__init__("supervisor")

        self._executor      = executor
        self.missions, self.nodes = load_config("supervisor", "config.yaml")
        self.active_nodes   = {}
        self.log_dir        = log_dir
        self.log_files      = {}

        # ── Rover state ───────────────────────────────────────────────────────
        self.rover_state    = STATE_IDLE
        self.active_mission = ""
        self.supervisor_msg = "Supervisor started."

        # Latest resource data from MonitorNodes keyed by node_name
        # { node_name: { pid, status, cpu_percent, memory_mb, alive } }
        self.node_resource_data = {}
        # Subscriptions to each MonitorNode's resource topic, keyed by node_name
        self.resource_subscriptions = {}

        os.makedirs(self.log_dir, exist_ok=True)

        # ── ROS subscribers ───────────────────────────────────────────────────
        self.create_subscription(Log,    '/rosout',      self.log_callback,             1000)
        self.create_subscription(String, '/mission_cmd', self.mission_control_callback, 1000)

        # ── /rover_status publisher ───────────────────────────────────────────
        self.rover_status_pub = self.create_publisher(String, '/rover_status', 10)
        # Publish at 2 Hz so the UI stays fresh
        self.create_timer(0.5, self.publish_rover_status)

        self.get_logger().info("Supervisor running")

    # ── /rover_status publisher ───────────────────────────────────────────────

    def publish_rover_status(self):
        """Build and publish the rover status JSON to /rover_status."""
        node_statuses = []
        for node_name, data in self.node_resource_data.items():
            # Map psutil status strings → UI-friendly values
            raw_status = data.get("status", "unknown")
            if data.get("alive", False):
                if raw_status in ("running", "sleeping", "disk-sleep"):
                    ui_status = "RUNNING"
                elif raw_status in ("stopped", "tracing-stop"):
                    ui_status = "STOPPED"
                elif raw_status in ("zombie", "dead"):
                    ui_status = "ERROR"
                else:
                    ui_status = raw_status.upper()
            else:
                ui_status = "INACTIVE" if raw_status == "not_found" else "FAILED"

            node_statuses.append({
                "node_name":    node_name,
                "status":       ui_status,
                "cpu_usage":    data.get("cpu_percent",  0.0),
                "memory_usage": data.get("memory_mb",    0.0),
                "pid":          data.get("pid",          -1),
                "last_error":   data.get("last_error",   "")
            })

        payload = {
            "rover_state":       self.rover_state,
            "active_mission":    self.active_mission,
            "supervisor_message": self.supervisor_msg,
            "node_statuses":     node_statuses,
            "timestamp":         time.time()
        }

        msg      = String()
        msg.data = json.dumps(payload)
        try:
            self.rover_status_pub.publish(msg)
        except Exception as e:
            self.get_logger().warn(f"Failed to publish rover_status: {e}")

    # ── Resource data subscriber ──────────────────────────────────────────────

    def _make_resource_callback(self, node_name):
        """Return a callback that stores resource data for node_name."""
        def callback(msg: String):
            try:
                data = json.loads(msg.data)
                self.node_resource_data[node_name] = data
            except json.JSONDecodeError:
                pass
        return callback

    def _subscribe_to_resource_topic(self, node_name):
        """Subscribe to the MonitorNode's resource topic for node_name."""
        topic = f"resource_{node_name.replace(' ', '_')}"
        if node_name not in self.resource_subscriptions:
            sub = self.create_subscription(
                String,
                topic,
                self._make_resource_callback(node_name),
                10
            )
            self.resource_subscriptions[node_name] = sub
            self.get_logger().info(f"Subscribed to resource topic: {topic}")

    def _unsubscribe_resource_topic(self, node_name):
        """Unsubscribe from a MonitorNode's resource topic."""
        sub = self.resource_subscriptions.pop(node_name, None)
        if sub:
            try:
                self.destroy_subscription(sub)
            except Exception:
                pass
        self.node_resource_data.pop(node_name, None)

    # ── Mission control callback ──────────────────────────────────────────────

    def mission_control_callback(self, msg: String):
        """Handle mission commands: start / stop / reset / status."""
        try:
            data = json.loads(msg.data)
        except json.JSONDecodeError:
            self.get_logger().error("Invalid JSON received on /mission_cmd")
            return

        command = data.get("command", "").lower()
        mission = data.get("mission", "").lower()

        # --- INTEGRATION ADJUSTMENT ---
        # Fallback: If the frontend sends the task name in the 'command' field 
        # and leaves 'mission' blank, intercept it and format it correctly.
        if command and not mission and command not in ("stop", "reset", "status", "start"):
            mission = command
            command = "start"
        # ------------------------------

        if command == "status":
            print_status(self.active_nodes)
            return

        if command in ("stop", "reset"):
            self._stop_all_nodes()
            self.rover_state    = STATE_IDLE
            self.active_mission = ""
            self.supervisor_msg = f"Mission stopped via '{command}' command."
            self.get_logger().info(f"All missions {command}ped.")
            return

        if command == "start" and mission:
            if mission not in self.missions:
                self.get_logger().error(f"Unknown mission: {mission}")
                self.supervisor_msg = f"Unknown mission: {mission}"
                self.rover_state    = STATE_ERROR
                return

            # Stop any currently running mission first
            self._stop_all_nodes()

            # Launch nodes for the new mission
            failed = []
            for node_name in self.missions[mission]:
                file_path = self.nodes.get(node_name)
                if not file_path:
                    self.get_logger().error(f"No command configured for node '{node_name}'")
                    failed.append(node_name)
                    continue
                try:
                    node_info = start_process(
                        node_name, file_path, self._executor,
                        resource_topic=f"resource_{node_name}"
                    )
                    self.active_nodes[node_name] = node_info
                    self._subscribe_to_resource_topic(node_name)
                except Exception as e:
                    self.get_logger().error(f"Error launching {node_name}: {e}")
                    failed.append(node_name)

            if failed:
                self.rover_state    = STATE_ERROR
                self.supervisor_msg = f"Mission '{mission}' started with errors: {failed}"
            else:
                self.rover_state    = STATE_RUNNING
                self.active_mission = mission
                self.supervisor_msg = f"Mission '{mission}' running: {self.missions[mission]}"

            self.get_logger().info(self.supervisor_msg)

    def _stop_all_nodes(self):
        """Stop all active nodes and clean up resource subscriptions."""
        for node_name in list(self.active_nodes.keys()):
            self._unsubscribe_resource_topic(node_name)
        stop_all(self.active_nodes, self._executor)
        self.node_resource_data.clear()

    # ── Log callback ─────────────────────────────────────────────────────────

    def log_callback(self, msg: Log):
        log_file = self.get_log_file(msg.name)
        level    = self.level_to_string(msg.level)
        file     = os.path.basename(msg.file)
        log_file.write(
            f"[{msg.stamp.sec}.{msg.stamp.nanosec:09d}] "
            f"[{level}] "
            f"[{msg.name}::{msg.function} @ {file}:{msg.line}] "
            f"{msg.msg}\n"
        )
        log_file.flush()

    def get_log_file(self, node_name: str):
        if node_name not in self.log_files:
            path = os.path.join(self.log_dir, f"{node_name}.log")
            self.log_files[node_name] = open(path, "a")
        return self.log_files[node_name]

    def level_to_string(self, level: int) -> str:
        return {10: "DEBUG", 20: "INFO", 30: "WARN", 40: "ERROR", 50: "FATAL"}.get(level, "UNKNOWN")


# ── Process management helpers ────────────────────────────────────────────────

def load_config(package_name: str, file_name: str = "config.yaml"):
    config_path = os.path.join(get_package_share_directory(package_name), file_name)
    with open(config_path, "r") as f:
        config = yaml.safe_load(f)
    return config.get("missions", {}), config.get("nodes", {})


def start_process(node_name: str, cmd: str, executor: MultiThreadedExecutor,
                  interval: float = 2.0, resource_topic: str = "resource"):
    """Start an external process and attach a MonitorNode to it."""
    proc = subprocess.Popen(cmd.split(), preexec_fn=os.setsid)
    print(f"Launched process '{node_name}' with PID: {proc.pid}")

    monitor = MonitorNode(
        process_name=node_name,
        pid=proc.pid,          # now the real node's PID, not a shell's
        interval=interval,
        heartbeat_topic=f"heartbeat_{node_name}",
        resource_topic=resource_topic
    )
    executor.add_node(monitor)

    return {"monitor": monitor, "process": proc}


def stop_node(node_data: dict):
    process = node_data.get("process")
    monitor = node_data.get("monitor")

    if process:
        try:
            try:
                os.killpg(os.getpgid(process.pid), signal.SIGTERM)
            except Exception:
                process.terminate()
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(os.getpgid(process.pid), signal.SIGKILL)
            except Exception:
                process.kill()
        except Exception as e:
            print(f"Error terminating process: {e}")

    if monitor:
        try:
            monitor.destroy_node()
        except Exception:
            pass


def stop_all(active_nodes: dict, executor: MultiThreadedExecutor):
    for node_name, node_data in list(active_nodes.items()):
        monitor = node_data.get("monitor")
        if monitor:
            try:
                executor.remove_node(monitor)
            except Exception:
                pass
        stop_node(node_data)
    active_nodes.clear()


def print_status(active_nodes: dict):
    print("\n" + "=" * 80)
    print(f"{'Process':<20} {'PID':<10} {'Status':<15} {'CPU %':<10} {'Memory MB':<12}")
    print("=" * 80)
    for node_name, node_data in active_nodes.items():
        process = node_data.get("process")
        if process:
            try:
                proc   = psutil.Process(process.pid)
                status = proc.status()
                cpu    = proc.cpu_percent(interval=None)
                mem    = proc.memory_info().rss / (1024 * 1024)
                print(f"{node_name:<20} {process.pid:<10} {status:<15} {cpu:<10.2f} {mem:<12.2f}")
            except psutil.NoSuchProcess:
                print(f"{node_name:<20} {process.pid:<10} {'DEAD':<15} {'N/A':<10} {'N/A':<12}")
            except Exception as e:
                print(f"{node_name:<20} {process.pid:<10} {'ERROR':<15} {str(e):<10}")
    print("=" * 80 + "\n")


# ── Entry point ───────────────────────────────────────────────────────────────

def main(args=None):
    rclpy.init(args=args)

    executor         = MultiThreadedExecutor()
    supervisor_node  = Supervisor(executor)
    supervisor_monitor = MonitorNode(
        process_name="Supervisor",
        pid=os.getpid(),
        interval=5,
        heartbeat_topic="heartbeat_supervisor",
        resource_topic="resource_supervisor"
    )

    executor.add_node(supervisor_node)
    executor.add_node(supervisor_monitor)

    try:
        executor.spin()
    finally:
        supervisor_node._stop_all_nodes()
        try:
            executor.remove_node(supervisor_monitor)
            supervisor_monitor.destroy_node()
        except Exception:
            pass
        supervisor_node.destroy_node()
        for f in supervisor_node.log_files.values():
            try:
                f.close()
            except Exception:
                pass
        try:
            rclpy.shutdown()
        except RuntimeError:
            pass


if __name__ == "__main__":
    main()