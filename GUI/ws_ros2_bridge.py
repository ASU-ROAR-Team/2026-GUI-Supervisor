#!/usr/bin/env python3
# ws_ros2_bridge.py

import rclpy
from rclpy.node import Node
from rclpy.executors import MultiThreadedExecutor
from std_msgs.msg import String, Float64MultiArray, Float32MultiArray, Int32, Float32, Int32MultiArray
from sensor_msgs.msg import JointState, CompressedImage
from geometry_msgs.msg import Twist
from nav_msgs.msg import Odometry, Path, OccupancyGrid
from geometry_msgs.msg import Twist, PoseWithCovarianceStamped
try:
    from roar_msgs.msg import ArucoDetectionArray
    ARUCO_AVAILABLE = True
except ImportError:
    print("WARNING: roar_msgs.msg.ArucoDetectionArray not found. ArUco functionality will be disabled.")
from visualization_msgs.msg import Marker
import json
import asyncio
import threading
import base64
import websockets
from rclpy.qos import QoSProfile, ReliabilityPolicy

PORT = 9091


class WSROS2Bridge(Node):
    def __init__(self):
        super().__init__('ws_ros2_bridge')

        # ---------------- ROS2 Publishers ----------------
        qos = QoSProfile(depth=10, reliability=ReliabilityPolicy.BEST_EFFORT)
        self.joint_pub = self.create_publisher(JointState, '/fk_joint_states', qos)
        self.pose_pub = self.create_publisher(Float64MultiArray, '/ik_target_pose', qos)
        self.fk_arm_pub = self.create_publisher(Float32MultiArray, '/roar_robot_arm/joint_cmd', qos)
        self.fk_gripper_pub = self.create_publisher(Float32, '/roar_robot_ee/joint_cmd', qos)

        self.create_subscription(Float32, '/roar_robot_ee/joint_feedback', self.gripper_feedback_cb, 10)
        self.lock_orientation_pub = self.create_publisher(String, '/lock_orientation', 10)

        self.mission_pub = self.create_publisher(String, '/mission_cmd', 10)
        self.drilling_pub = self.create_publisher(Float64MultiArray, '/drilling/command_to_actuators', 10)
        self.drilling_mission_pub = self.create_publisher(Float64MultiArray, '/drilling/mission_cmd', 10)
        self.drilling_depth_pub = self.create_publisher(Float32MultiArray, '/drilling_depth', 10)
        self.drilling_motors_pub = self.create_publisher(Int32MultiArray, '/drilling/motors_cmd', 10)
        
        self.cmd_vel_pub = self.create_publisher(Twist, '/cmd_vel', 10)
        self.wheel_duty_pub = self.create_publisher(Float32MultiArray, '/Wheel_Duty_Cycle', qos)
        
        # Publisher for individual wheel velocities: [right_wheel, left_wheel]
        self.wheel_vel_pub = self.create_publisher(Float32MultiArray, '/rover/wheel_velocities_cmd', 10)

        # ---------------- ROS2 Subscribers ----------------
        self.create_subscription(String, '/rover_status', self.rover_status_cb, 10)
        self.create_subscription(String, '/node_status', self.node_status_cb, 10)
        self.create_subscription(String, '/drilling/feedback', self.drilling_status_cb, 10)
        self.create_subscription(String, '/drilling_fsm_state', self.drilling_fsm_cb, 10)
        self.create_subscription(Float32MultiArray, '/drilling/sensor_feedback', self.sensor_feedback_cb, 10)
        self.create_subscription(Twist, '/cmd_vel', self.cmd_vel_echo_cb, 10)

        self.create_subscription(CompressedImage, '/logitech_1/image_raw/compressed', self.logitech_camera_cb, 10)
        self.create_subscription(CompressedImage, '/zed2i/zed_node/depth/depth_registered/color_mapped_image/compressed_for_web', self.zed_camera_cb, 10)

        self.create_subscription(Odometry, '/filtered_state', self.robot_pose_cb, 10)
        self.create_subscription(Path, '/Path', self.global_path_cb, 10)
        self.create_subscription(Path, '/traversed_path', self.traversed_path_cb, 10)
        self.create_subscription(Marker, '/obstacles', self.obstacle_cb, 10)

        self.create_subscription(PoseWithCovarianceStamped, '/ground_truth/pose', self.ground_truth_pose_cb, 10)
        if ARUCO_AVAILABLE:
            self.create_subscription(ArucoDetectionArray, '/aruco/detections', self.aruco_detections_cb, 10)
        self.create_subscription(Float64MultiArray, '/roar/ieskf_diagnostics', self.ieskf_diagnostics_cb, 10)
        self.create_subscription(OccupancyGrid, '/active_map/occupancy', self.active_map_occupancy_cb, 1)

        # ---------------- Internal ----------------
        self.ws_clients = set()
        self.loop = asyncio.new_event_loop()
        self.ws_thread = threading.Thread(target=self._run_loop, daemon=True)
        self.ws_thread.start()

    def _run_loop(self):
        asyncio.set_event_loop(self.loop)
        self.loop.run_until_complete(self._ws_server())

    async def _ws_server(self):
        async with websockets.serve(self._handler, "0.0.0.0", PORT):
            self.get_logger().info(f"WebSocket server running on ws://0.0.0.0:{PORT}")
            await asyncio.Future()

    async def _handler(self, websocket):
        self.ws_clients.add(websocket)
        self.get_logger().info(f"Client connected: {websocket.remote_address}")
        try:
            async for message in websocket:
                await self._handle_message(message)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.ws_clients.discard(websocket)
            self.get_logger().info(f"Client disconnected: {websocket.remote_address}")

    async def _handle_message(self, message):
        try:
            msg = json.loads(message)
            msg_type = msg.get("type")

            if msg_type == "joint_cmd":
                mode = msg.get("mode")
                data = msg.get("data", [])
                if mode == "FK" and len(data) == 6:
                    joint_msg = JointState()
                    joint_msg.name = []
                    joint_msg.position = [float(x) for x in data]
                    joint_msg.effort = []
                    self.joint_pub.publish(joint_msg)
                elif mode == "IK":
                    pose_msg = Float64MultiArray()
                    pose_msg.data = [float(x) for x in data]
                    self.pose_pub.publish(pose_msg)

            elif msg_type == "mission_cmd":
                out = String()
                out.data = json.dumps({"command": msg.get("command", ""), "mission": msg.get("mission", "")})
                self.mission_pub.publish(out)

            elif msg_type == "drilling_cmd":
                data = msg.get("data", [])
                if len(data) >= 5:
                    drilling_msg = Float64MultiArray()
                    drilling_msg.data = [float(x) for x in data[:5]]
                    self.drilling_pub.publish(drilling_msg)

            elif msg_type == "drilling_mission_cmd":
                data = msg.get("data", [])
                if len(data) >= 3:
                    mission_msg = Float64MultiArray()
                    mission_msg.data = [float(x) for x in data[:3]]
                    self.drilling_mission_pub.publish(mission_msg)

            elif msg_type == "drilling_depth":
                data = msg.get("data", [])
                if len(data) >= 3:
                    depth_msg = Float32MultiArray()
                    depth_msg.data = [float(x) for x in data[:3]]
                    self.drilling_depth_pub.publish(depth_msg)

            elif msg_type == "cmd_vel":
                data = msg.get("data", {})
                linear = data.get("linear", {})
                angular = data.get("angular", {})
                twist = Twist()
                twist.linear.x = float(linear.get("x", 0.0))
                twist.linear.y = float(linear.get("y", 0.0))
                twist.linear.z = float(linear.get("z", 0.0))
                twist.angular.x = float(angular.get("x", 0.0))
                twist.angular.y = float(angular.get("y", 0.0))
                twist.angular.z = float(angular.get("z", 0.0))
                self.cmd_vel_pub.publish(twist)

            elif msg_type == "lock_orientation":
                out = String()
                out.data = msg.get("data", "OFF")
                self.lock_orientation_pub.publish(out)

            elif msg_type == "wheel_duty":
                data = msg.get("data", [])
                if len(data) >= 2:
                    wheel_msg = Float32MultiArray()
                    wheel_msg.data = [float(data[0]), float(data[1])]
                    self.wheel_duty_pub.publish(wheel_msg)

            elif msg_type == "joint_cmd_fk_custom":
                arm_data = msg.get("arm_data", [])
                gripper_data = msg.get("gripper_data", 0.0)
                if len(arm_data) == 6:
                    arm_msg = Float32MultiArray()
                    arm_msg.data = [float(x) for x in arm_data]
                    self.fk_arm_pub.publish(arm_msg)

                    joint_msg = JointState()
                    joint_msg.name = ['j0', 'j1', 'j2', 'j3', 'diff_m1', 'diff_m2', 'gripper_servo']
                    joint_msg.position = [float(x) for x in arm_data] + [float(gripper_data)]
                    joint_msg.effort = []
                    self.joint_pub.publish(joint_msg)

                gripper_msg = Float32()
                gripper_msg.data = float(gripper_data)
                self.fk_gripper_pub.publish(gripper_msg)

            elif msg_type == "drilling_motors_cmd":
                data = msg.get("data", [])
                if len(data) >= 2:
                    motor_msg = Int32MultiArray()
                    motor_msg.data = [int(x) for x in data[:2]]
                    self.drilling_motors_pub.publish(motor_msg)

            elif msg_type == "rover_wheel_vel_cmd":
                data = msg.get("data", [])
                if len(data) >= 2:
                    wheel_msg = Float32MultiArray()
                    wheel_msg.data = [float(data[0]), float(data[1])]
                    self.wheel_vel_pub.publish(wheel_msg)
                    self.get_logger().info(f"Wheel Velocities Cmd -> Right: {data[0]:.2f} m/s, Left: {data[1]:.2f} m/s")

        except Exception as e:
            self.get_logger().error(f"Failed to handle WS message: {e}")

    def broadcast(self, payload: str):
        if not self.ws_clients:
            return
        asyncio.run_coroutine_threadsafe(self._broadcast(payload), self.loop)

    async def _broadcast(self, payload: str):
        dead = set()
        for client in self.ws_clients:
            try:
                await client.send(payload)
            except Exception:
                dead.add(client)
        self.ws_clients -= dead

    def rover_status_cb(self, msg):
        self.broadcast(json.dumps({"type": "rover_status", "data": msg.data}))

    def node_status_cb(self, msg):
        self.broadcast(json.dumps({"type": "node_status", "data": msg.data}))

    def drilling_status_cb(self, msg):
        self.broadcast(json.dumps({"type": "drilling_status", "data": msg.data}))

    def drilling_fsm_cb(self, msg):
        self.broadcast(json.dumps({"type": "drilling_fsm_state", "data": json.dumps({"data": msg.data})}))

    def cmd_vel_echo_cb(self, msg):
        payload = {
            "linear": {"x": msg.linear.x, "y": msg.linear.y, "z": msg.linear.z},
            "angular": {"x": msg.angular.x, "y": msg.angular.y, "z": msg.angular.z}
        }
        self.broadcast(json.dumps({"type": "cmd_vel_echo", "data": json.dumps(payload)}))

    def logitech_camera_cb(self, msg):
        if not self.ws_clients:
            return
        b64 = base64.b64encode(bytes(msg.data)).decode('utf-8')
        self.broadcast(json.dumps({"type": "camera_frame", "data": json.dumps({"data": b64})}))

    def zed_camera_cb(self, msg):
        if not self.ws_clients:
            return
        b64 = base64.b64encode(bytes(msg.data)).decode('utf-8')
        self.broadcast(json.dumps({"type": "zed_frame", "data": json.dumps({"data": b64})}))

    def robot_pose_cb(self, msg):
        pos = msg.pose.pose.position
        ori = msg.pose.pose.orientation
        payload = {
            "pose": {
                "pose": {
                    "position": {"x": pos.x, "y": pos.y, "z": pos.z},
                    "orientation": {"x": ori.x, "y": ori.y, "z": ori.z, "w": ori.w}
                }
            }
        }
        self.broadcast(json.dumps({"type": "robot_pose", "data": json.dumps(payload)}))

    def global_path_cb(self, msg):
        poses = [{"pose": {"position": {"x": p.pose.position.x, "y": p.pose.position.y, "z": p.pose.position.z}}} for p in msg.poses]
        self.broadcast(json.dumps({"type": "global_path", "data": json.dumps({"poses": poses})}))

    def traversed_path_cb(self, msg):
        poses = [{"pose": {"position": {"x": p.pose.position.x, "y": p.pose.position.y, "z": p.pose.position.z}}} for p in msg.poses]
        self.broadcast(json.dumps({"type": "traversed_path", "data": json.dumps({"poses": poses})}))

    def obstacle_cb(self, msg):
        payload = {
            "id": msg.id,
            "pose": {"position": {"x": msg.pose.position.x, "y": msg.pose.position.y, "z": msg.pose.position.z}},
            "scale": {"x": msg.scale.x, "y": msg.scale.y, "z": msg.scale.z}
        }
        self.broadcast(json.dumps({"type": "obstacle", "data": json.dumps(payload)}))

    def gripper_feedback_cb(self, msg):
        self.broadcast(json.dumps({"type": "gripper_feedback", "data": msg.data}))

    def sensor_feedback_cb(self, msg):
        if not self.ws_clients:
            return
        if len(msg.data) >= 2:
            payload = {"current": msg.data[0], "encoder": msg.data[1]}
            self.broadcast(json.dumps({"type": "drilling_sensor_feedback", "data": json.dumps(payload)}))

    def ground_truth_pose_cb(self, msg):
        pos = msg.pose.pose.position
        ori = msg.pose.pose.orientation
        payload = {
            "pose": {
                "pose": {
                    "position": {"x": pos.x, "y": pos.y, "z": pos.z},
                    "orientation": {"x": ori.x, "y": ori.y, "z": ori.z, "w": ori.w}
                }
            }
        }
        self.broadcast(json.dumps({"type": "ground_truth_pose", "data": json.dumps(payload)}))

    def aruco_detections_cb(self, msg):
        detections = [{"id": d.id} for d in msg.detections]
        self.broadcast(json.dumps({"type": "aruco_detections", "data": json.dumps({"detections": detections})}))

    def ieskf_diagnostics_cb(self, msg):
        self.broadcast(json.dumps({"type": "ieskf_diagnostics", "data": json.dumps({"data": list(msg.data)})}))

    def active_map_occupancy_cb(self, msg):
        import numpy as np
        grid = np.array(msg.data, dtype=np.int8).reshape(msg.info.height, msg.info.width)
        occ_ys, occ_xs = np.where(grid > 50)
        if occ_xs.size > 0:
            margin = 30
            x_lo = int(max(0, occ_xs.min() - margin))
            x_hi = int(min(msg.info.width, occ_xs.max() + margin))
            y_lo = int(max(0, occ_ys.min() - margin))
            y_hi = int(min(msg.info.height, occ_ys.max() + margin))
            sub = grid[y_lo:y_hi, x_lo:x_hi].tolist()
            origin_x = msg.info.origin.position.x + x_lo * msg.info.resolution
            origin_y = msg.info.origin.position.y + y_lo * msg.info.resolution
            width = x_hi - x_lo
            height = y_hi - y_lo
        else:
            sub = grid.tolist()
            origin_x = msg.info.origin.position.x
            origin_y = msg.info.origin.position.y
            width = msg.info.width
            height = msg.info.height

        payload = {
            "data": sub,
            "info": {
                "width": width,
                "height": height,
                "resolution": msg.info.resolution,
                "origin": {
                    "position": {"x": origin_x, "y": origin_y}
                }
            }
        }
        self.broadcast(json.dumps({"type": "active_map_occupancy", "data": json.dumps(payload)}))



def main(args=None):
    rclpy.init(args=args)
    node = WSROS2Bridge()
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    try:
        executor.spin()
    except KeyboardInterrupt:
        pass
    finally:
      node.destroy_node()
      rclpy.shutdown()


if __name__ == "__main__":
    main()