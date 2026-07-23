# supervisor/my_second_node.py  (and my_second_node.py, my_third_node.py — just change NODE_NAME)
import rclpy
from rclpy.node import Node
from std_msgs.msg import String

NODE_NAME = "my_second_node"

class DummyTaskNode(Node):
    def __init__(self):
        super().__init__(NODE_NAME)
        self.pub = self.create_publisher(String, f'/{NODE_NAME}/status', 10)
        self.create_timer(1.0, self.tick)
        self.get_logger().info(f"{NODE_NAME} started")

    def tick(self):
        msg = String()
        msg.data = f"{NODE_NAME} alive"
        self.pub.publish(msg)

def main(args=None):
    rclpy.init(args=args)
    node = DummyTaskNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()

if __name__ == "__main__":
    main()