# Drilling-26 ROS 2 Topic Specifications

This document details all ROS 2 topic names, message types, array formats, UI controls/buttons, and purposes for the **Drilling-26** plugin in `ROAR-Supervisor`.

---

## 📤 Published Command Topics (UI → ROS 2)

| UI Control / Section | Target ROS 2 Topic Name | ROS 2 Message Type | WebSocket Type | Array / Payload Specification | What It Is For |
|---|---|---|---|---|---|
| **Manual Platform Controls & Actuators** | `/drilling/command_to_actuators` | `std_msgs/msg/Float64MultiArray` | `drilling_cmd` | `[direction, auger_on, gate_open, speed, stop_enabled]`<br>• **direction**: `-1` (Down), `0` (Idle), `1` (Up)<br>• **auger_on**: `1` (ON), `0` (OFF)<br>• **gate_open**: `1` (Open), `0` (Closed)<br>• **speed**: `0.0` to `20.0` cm/s<br>• **stop_enabled**: `1` (Stop active), `0` (Inactive) | **Manual Actuator Control**: Triggered by **Platform Up**, **Platform Down**, **Stop** buttons, **Motor Speed Slider**, **Auger Switch**, and **Gate Switch**. Controls vertical drive direction, linear speed, emergency platform lock, and auxiliary hatch/auger states. |
| **Dual Motor Control** | `/drilling/motors_cmd` | `std_msgs/msg/Int32MultiArray` | `drilling_motors_cmd` | `[motor1_speed, motor2_speed]`<br>• Signed integer, `-1000` to `1000`<br>• `0` = Stop<br>• Positive = Clockwise (CW)<br>• Negative = Counter-Clockwise (CCW) | **Independent Dual Motor Control**: Triggered by the **Motor 1** and **Motor 2** speed sliders (published on release). Allows fine-grained signed speed control of individual drilling motors. |
| **Drilling Mission Parameters** | `/drilling/mission_cmd` | `std_msgs/msg/Float64MultiArray` | `drilling_mission_cmd` | `[location_cm, servo_state, load_cell_state]`<br>• **location_cm**: `-25.0` to `+35.0` cm (150ms debounced)<br>• **servo_state**: `1` (Enabled), `0` (Disabled)<br>• **load_cell_state**: `1` (Enabled), `0` (Disabled) | **Autonomous Drilling Mission Target**: Triggered by the **Drilling Location Slider**, **Servo Toggle**, and **Load Cell Toggle**. Sends target depth location and sensor subsystem activation flags to the drilling controller. |
| **Multi-Stage Drilling Depths** | `/drilling_depth` | `std_msgs/msg/Float32MultiArray` | `drilling_depth` | `[depth_1, depth_2, depth_3]` | **Multi-Stage Depth Command**: Transmits multi-tier target penetration depths for automated drilling routines. |

---

## 📥 Subscribed Telemetry Topics (ROS 2 → GUI Display)

| Target ROS 2 Topic Name | ROS 2 Message Type | WebSocket Type | UI Display Element | What It Represents / Displayed Data |
|---|---|---|---|---|
| `/drilling/feedback` | `std_msgs/msg/String` | `drilling_status` | **Platform Depth** & **Regolith Mass** | JSON string containing `current_height` (displayed in **cm**) and `current_weight` (displayed in **gm** from load cell). |
| `/drilling_fsm_state` | `std_msgs/msg/String` | `drilling_fsm_state` | **FSM State Badge** | Current state string of the drilling Finite State Machine (e.g., `IDLE`, `DRILLING`, `RETRACTING`, `COMPLETED`). |
| `/drilling/sensor_feedback` | `std_msgs/msg/Float32MultiArray` | `drilling_sensor_feedback` | **Motor Current** & **Auger Distance** | Array containing `[motor_current, encoder_ticks]`. `data[0]` updates **Motor Current (mA)** and `data[1]` updates **Auger Distance (cm)**. |
