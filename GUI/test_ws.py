import asyncio
import websockets
import json

async def test_bridge():
    async with websockets.connect('ws://localhost:9091') as ws:
        msg = {
            "type": "joint_cmd_fk_custom",
            "arm_data": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0],
            "gripper_data": 8.0
        }
        await ws.send(json.dumps(msg))
        print("Sent message")
        # Wait a bit
        await asyncio.sleep(1)
        print("Done")

asyncio.run(test_bridge())
