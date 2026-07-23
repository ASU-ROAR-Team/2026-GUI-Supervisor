#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from std_msgs.msg import String
import json
import random
import math

class RoverSimNode(Node):
    def __init__(self):
        super().__init__('rover_sim_node')

        # Publishers
        self.status_pub = self.create_publisher(String, '/rover_status', 10)
        self.node_pub = self.create_publisher(String, '/node_status', 10)
        self.arm_pub = self.create_publisher(String, '/arm_status', 10)

        # Subscriber
        self.create_subscription(String, '/mission_cmd', self.mission_cmd_callback, 10)
        self.create_subscription(String, '/arm_cmd', self.arm_cmd_callback, 10)

        # Timers
        self.create_timer(1.0, self.publish_rover_status)
        self.create_timer(5.0, self.publish_node_status)
        self.create_timer(0.5, self.simulate_movement)  # update rover speeds
        self.create_timer(0.2, self.simulate_arm)       # update arm joint angles

        # Internal rover state
        self.rover_state = 'IDLE'
        self.active_mission = ''
        self.supervisor_message = 'Waiting for commands...'
        self.linear_speed_x = 0.0
        self.angular_speed_z = 0.0

        # Arm state
        self.arm_joints = {
            "shoulder": 0.0,  # degrees
            "elbow": 0.0,
            "wrist": 0.0
        }
        self.arm_target_joints = self.arm_joints.copy()
        self.arm_moving = False

        # Node statuses
        self.node_statuses = [
            {"node_name": "rover_control", "status": "running", "cpu_usage": 12.3, "memory_usage": 45.6, "pid": 1234, "last_error": ""},
            {"node_name": "arm_control", "status": "running", "cpu_usage": 5.6, "memory_usage": 30.2, "pid": 2345, "last_error": ""}
        ]

    def mission_cmd_callback(self, msg):
        try:
            data = json.loads(msg.data)
            cmd = data.get('command', '').upper()
            mission = data.get('mission', '')
            if cmd == 'START':
                self.active_mission = mission
                self.rover_state = 'RUNNING'
            elif cmd == 'RESET':
                self.active_mission = ''
                self.rover_state = 'IDLE'
            elif cmd == 'PAUSE':
                self.rover_state = 'PAUSED'
            self.supervisor_message = f"Received {cmd} command for mission: {mission}"
        except Exception as e:
            self.supervisor_message = f"Error processing command: {e}"
            self.rover_state = 'ERROR'

    def arm_cmd_callback(self, msg):
        """Receive target joint positions for the arm."""
        try:
            data = json.loads(msg.data)
            for joint in ['shoulder', 'elbow', 'wrist']:
                if joint in data:
                    self.arm_target_joints[joint] = float(data[joint])
            self.arm_moving = True
        except Exception as e:
            self.get_logger().warn(f"Error processing arm command: {e}")

    def simulate_movement(self):
        """Update rover speeds if running."""
        if self.rover_state == 'RUNNING':
            self.linear_speed_x = round(random.uniform(0.0, 1.0), 2)
            self.angular_speed_z = round(random.uniform(-0.5, 0.5), 2)
        else:
            self.linear_speed_x = 0.0
            self.angular_speed_z = 0.0

    def simulate_arm(self):
        """Smoothly move joints toward target angles."""
        for joint in self.arm_joints:
            current = self.arm_joints[joint]
            target = self.arm_target_joints[joint]
            step = 2.0  # degrees per update
            if abs(target - current) <= step:
                self.arm_joints[joint] = target
            elif target > current:
                self.arm_joints[joint] += step
            else:
                self.arm_joints[joint] -= step
        self.publish_arm_status()

    def publish_rover_status(self):
        status_msg = {
            "rover_state": self.rover_state,
            "active_mission": self.active_mission,
            "supervisor_message": self.supervisor_message,
            "linear_speed_x": self.linear_speed_x,
            "angular_speed_z": self.angular_speed_z,
            "node_statuses": self.node_statuses,
            "timestamp": self.get_clock().now().seconds_nanoseconds()[0]
        }
        msg = String()
        msg.data = json.dumps(status_msg)
        self.status_pub.publish(msg)

    def publish_node_status(self):
        msg = String()
        msg.data = json.dumps(self.node_statuses)
        self.node_pub.publish(msg)

    def publish_arm_status(self):
        msg = String()
        msg.data = json.dumps(self.arm_joints)
        self.arm_pub.publish(msg)

def main(args=None):
    rclpy.init(args=args)
    node = RoverSimNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    main()