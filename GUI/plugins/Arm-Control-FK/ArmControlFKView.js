// src/plugins/Arm-Control-FK/ArmControlFKView.js
(function () {
    'use strict';

    class ArmControlFKView {
        constructor(container, openmct, wsUrl = "ws://localhost:8080") {
            this.container = container;
            this.openmct   = openmct;
            this.wsUrl     = wsUrl;
            this.mode = "FK";

            // FK state - UPDATED TO YOUR SPECIFIC TOPICS
            this.jointNames = ['j0', 'j1', 'j2', 'j3', 'diff_m1', 'diff_m2', 'gripper_servo'];
            this.jointValues = {
                j0: 0, j1: 0, j2: 0,
                j3: 0, diff_m1: 0, diff_m2: 0, gripper_servo: 0
            };

            this.jointRanges = {
                j0: { min: -180, max: 180,  label: 'j0 (°)' },
                j1: { min: -180, max: 180,  label: 'j1 (°)' },
                j2: { min: -180, max: 180,  label: 'j2 (°)' },
                j3: { min: -180, max: 180,  label: 'j3 (°)' },
                diff_m1: { min: -180, max: 180,  label: 'diff_m1 (°)' },
                diff_m2: { min: -180, max: 180,  label: 'diff_m2 (°)' },
                gripper_servo: { min: 0, max: 180, label: 'Gripper (0-180)' }
            };

            // IK state - EXACTLY THE SAME AS V2
            this.ikValues = {
                x:     50,
                y:     0,
                z:     20,
                roll:  0,
                pitch: 0,
                yaw:   0
            };

            this.ikRanges = {
                x:     { min: 0,    max: 100,  label: 'X (cm)' },
                y:     { min: -50,  max: 50,   label: 'Y (cm)' },
                z:     { min: 0,    max: 100,  label: 'Z (cm)' },
                roll:  { min: -180, max: 180,  label: 'Roll (°)' },
                pitch: { min: -180, max: 180,  label: 'Pitch (°)' },
                yaw:   { min: -180, max: 180,  label: 'Yaw (°)' }
            };

            // Presets
            this.fkPresets = {
                home: { j0: 0, j1: 0,   j2: 0,  j3: 0, diff_m1: 0,  diff_m2: 0, gripper_servo: 0 },
                rest: { j0: 0, j1: -45, j2: 90, j3: 0, diff_m1: 45, diff_m2: 0, gripper_servo: 0 }
            };

            this.ikPresets = {
                home: { x: 50, y: 0,  z: 20, roll: 0, pitch: 0,   yaw: 0 },
                rest: { x: 30, y: 20, z: 10, roll: 0, pitch: -45, yaw: 0 }
            };

            // Lock orientation state
            this.lockOrientation = false;

            // WebSocket state
            this.ws                = null;
            this.reconnectInterval = null;

            // ROS
            this.ros            = null;
            this.jointPublisher = null;
            this.posePublisher  = null;

            // DOM refs
            this.fkSliders      = {};
            this.fkDisplaySpans = {};
            this.ikSliders      = {};
            this.ikDisplaySpans = {};

            // Keyboard tracking
            this.keysPressed = {};
        }

        // ─── WebSocket ──────────────────────────────────────────────────────

        initWS() {
            if (this.ws && this.ws.readyState !== WebSocket.CLOSED) return;

            this.ws = new WebSocket(this.wsUrl);

            this.ws.onopen = () => {
                console.log("[ArmControlFKView] Connected to WS bridge");
                this.updateConnectionStatus(true);
                if (this.reconnectInterval) {
                    clearInterval(this.reconnectInterval);
                    this.reconnectInterval = null;
                }
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    // Silent RX logger to prevent spam unless needed
                } catch (e) {
                    console.error("[ArmControlFKView] Failed to parse message", e);
                }
            };

            this.ws.onclose = () => {
                console.warn("[ArmControlFKView] Disconnected. Reconnecting in 3s...");
                this.updateConnectionStatus(false);
                this.scheduleReconnect();
            };

            this.ws.onerror = (err) => {
                console.error("[ArmControlFKView] WebSocket error", err);
                this.ws.close();
            };
        }

        scheduleReconnect() {
            if (this.reconnectInterval) return;
            this.reconnectInterval = setInterval(() => {
                this.initWS();
            }, 3000);
        }

        sendUpdate() {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

            if (this.mode === 'FK') {
                // MODIFIED: Custom payload splitting for Python backend routing
                const armData = [
                    this.jointValues['j0'], this.jointValues['j1'], 
                    this.jointValues['j2'], this.jointValues['j3'],
                    this.jointValues['diff_m1'], this.jointValues['diff_m2']
                ];
                const gripperData = this.jointValues['gripper_servo'];

                this.ws.send(JSON.stringify({
                    type: 'joint_cmd_fk_custom',
                    arm_data: armData,
                    gripper_data: gripperData
                }));
                this.publishJointStates();
            } else {
                const data = [
                    this.ikValues.x,
                    this.ikValues.y,
                    this.ikValues.z,
                    this.ikValues.roll,
                    this.ikValues.pitch,
                    this.ikValues.yaw
                ];
                this.ws.send(JSON.stringify({
                    type: 'joint_cmd',
                    mode: 'IK',
                    data
                }));
                this.publishPose();
            }
        }

        sendLockOrientation() {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            this.ws.send(JSON.stringify({
                type: 'lock_orientation',
                data: this.lockOrientation ? 'ON' : 'OFF'
            }));
        }

        // ─── Render ─────────────────────────────────────────────────────────

        render() {
            this.container.innerHTML = this.getHTML();
            this.statusElement = this.container.querySelector("#armStatus");
            this.statusDot     = this.container.querySelector(".status-dot");

            this.bindElements();
            this.initWS();
            this.tryConnectROS();
            this.updateModeUI();
            this.setupKeyboardListeners();
        }

        // ─── HTML ────────────────────────────────────────────────────────────

        getHTML() {
            return `
            <div class="arm-control-v2-container">
                <h2 class="section-header">Robotic Arm Control (FK + IK Modified)</h2>

                <div class="status-bar">
                    <div class="status-dot"></div>
                    <div id="armStatus">Connecting...</div>
                    <button id="lockOrientationButton" class="lock-orientation-btn">
                        🔓 Lock Orientation: OFF
                    </button>
                    <button id="modeSwitchButton">Switch to IK Mode</button>
                </div>

                <!-- FK Mode Section -->
                <div id="fk_container" style="display:none">
                    <h3 class="section-header">Forward Kinematics (FK)</h3>
                    <p>Adjust individual joint angles.</p>

                    <div class="controls-grid">
                        ${this.jointNames.map(joint => {
                            const range = this.jointRanges[joint];
                            return `
                                <div class="joint-control">
                                    <label>${range.label}</label>
                                    <div class="slider-row">
                                        <input type="range" id="fk_${joint}_slider"
                                               min="${range.min}" max="${range.max}" value="0" step="0.1">
                                        <span id="fk_${joint}_display">0</span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>

                    <div class="preset-buttons">
                        <button class="preset-button" id="fkHomeBtn">Home Position</button>
                        <button class="preset-button" id="fkRestBtn">Rest Position</button>
                    </div>

                    <div class="keyboard-shortcuts-section">
                        <h4 class="shortcut-header">Keyboard Shortcuts (FK Mode)</h4>
                        <div class="shortcuts-list">
                            <div class="shortcut-item"><span>j0</span><span>Q(-) / W(+)</span></div>
                            <div class="shortcut-item"><span>j1</span><span>A(-) / S(+)</span></div>
                            <div class="shortcut-item"><span>j2</span><span>Z(-) / X(+)</span></div>
                            <div class="shortcut-item"><span>j3</span><span>E(-) / R(+)</span></div>
                            <div class="shortcut-item"><span>diff_m1</span><span>D(-) / F(+)</span></div>
                            <div class="shortcut-item"><span>diff_m2</span><span>C(-) / V(+)</span></div>
                            <div class="shortcut-item"><span>gripper</span><span>T(-) / G(+)</span></div>
                        </div>
                    </div>
                </div>

                <!-- IK Mode Section -->
                <div id="ik_container" style="display:none">
                    <h3 class="section-header">Inverse Kinematics (IK)</h3>
                    <p>Control end-effector pose with sliders.</p>

                    <div class="controls-grid">
                        ${Object.keys(this.ikRanges).map(axis => {
                            const range = this.ikRanges[axis];
                            return `
                                <div class="ik-control">
                                    <label>${range.label}</label>
                                    <div class="slider-row">
                                        <input type="range" id="ik_${axis}_slider"
                                               min="${range.min}" max="${range.max}"
                                               value="${this.ikValues[axis]}" step="0.1">
                                        <span id="ik_${axis}_display">${this.ikValues[axis].toFixed(1)}</span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>

                    <div class="preset-buttons">
                        <button class="preset-button" id="ikHomeBtn">Home Position</button>
                        <button class="preset-button" id="ikRestBtn">Rest Position</button>
                    </div>

                    <div class="keyboard-shortcuts-section">
                        <h4 class="shortcut-header">Keyboard Shortcuts (IK Mode)</h4>
                        <div class="shortcuts-list">
                            <div class="shortcut-item"><span>X Axis</span><span>Q(-) / W(+)</span></div>
                            <div class="shortcut-item"><span>Y Axis</span><span>A(-) / S(+)</span></div>
                            <div class="shortcut-item"><span>Z Axis</span><span>Z(-) / X(+)</span></div>
                            <div class="shortcut-item"><span>Roll</span><span>E(-) / R(+)</span></div>
                            <div class="shortcut-item"><span>Pitch</span><span>D(-) / F(+)</span></div>
                            <div class="shortcut-item"><span>Yaw</span><span>C(-) / V(+)</span></div>
                        </div>
                    </div>
                </div>
            </div>
            `;
        }

        // ─── UI ──────────────────────────────────────────────────────────────

        updateModeUI() {
            const fkContainer = this.container.querySelector('#fk_container');
            const ikContainer = this.container.querySelector('#ik_container');
            const btn = this.container.querySelector('#modeSwitchButton');

            if (this.mode === 'FK') {
                fkContainer.style.display = 'block';
                ikContainer.style.display = 'none';
                btn.innerText = 'Switch to IK Mode';
            } else {
                fkContainer.style.display = 'none';
                ikContainer.style.display = 'block';
                btn.innerText = 'Switch to FK Mode';
            }
        }

        updateConnectionStatus(connected) {
            if (this.statusDot) this.statusDot.classList.toggle('connected', connected);
            if (this.statusElement) {
                this.statusElement.innerText = connected ? 'WS: Connected' : 'WS: Disconnected';
            }
        }

        updateLockOrientationButton() {
            const btn = this.container.querySelector('#lockOrientationButton');
            if (!btn) return;
            if (this.lockOrientation) {
                btn.innerText = '🔒 Lock Orientation: ON';
                btn.classList.add('lock-orientation-active');
            } else {
                btn.innerText = '🔓 Lock Orientation: OFF';
                btn.classList.remove('lock-orientation-active');
            }
        }

        bindElements() {
            // FK Sliders
            this.jointNames.forEach(joint => {
                const slider  = this.container.querySelector(`#fk_${joint}_slider`);
                const display = this.container.querySelector(`#fk_${joint}_display`);

                this.fkSliders[joint]      = slider;
                this.fkDisplaySpans[joint] = display;

                slider.oninput = () => {
                    let val = parseFloat(slider.value);
                    const range = this.jointRanges[joint];
                    val = Math.min(Math.max(val, range.min), range.max);
                    this.jointValues[joint] = val;
                    slider.value = val;
                    display.innerText = val.toFixed(1);
                    if (this.mode === 'FK') this.sendUpdate();
                };
            });

            // IK Sliders
            Object.keys(this.ikRanges).forEach(axis => {
                const slider  = this.container.querySelector(`#ik_${axis}_slider`);
                const display = this.container.querySelector(`#ik_${axis}_display`);

                this.ikSliders[axis]      = slider;
                this.ikDisplaySpans[axis] = display;

                slider.oninput = () => {
                    let val = parseFloat(slider.value);
                    const range = this.ikRanges[axis];
                    val = Math.min(Math.max(val, range.min), range.max);
                    this.ikValues[axis] = val;
                    slider.value = val;
                    display.innerText = val.toFixed(1);
                    if (this.mode === 'IK') this.sendUpdate();
                };
            });

            // Mode switch
            this.container.querySelector('#modeSwitchButton').onclick = () => {
                this.mode = this.mode === 'FK' ? 'IK' : 'FK';
                this.updateModeUI();
            };

            // Lock orientation toggle
            this.container.querySelector('#lockOrientationButton').onclick = () => {
                this.lockOrientation = !this.lockOrientation;
                this.updateLockOrientationButton();
                this.sendLockOrientation();
            };

            // FK presets
            this.container.querySelector('#fkHomeBtn').onclick = () => this.applyFKPreset('home');
            this.container.querySelector('#fkRestBtn').onclick = () => this.applyFKPreset('rest');

            // IK presets
            this.container.querySelector('#ikHomeBtn').onclick = () => this.applyIKPreset('home');
            this.container.querySelector('#ikRestBtn').onclick = () => this.applyIKPreset('rest');
        }

        // ─── Keyboard Shortcuts ──────────────────────────────────────────────

        setupKeyboardListeners() {
            this.keyDownHandler = (e) => this.handleKeyDown(e);
            this.keyUpHandler   = (e) => this.handleKeyUp(e);

            window.addEventListener('keydown', this.keyDownHandler, true);
            window.addEventListener('keyup',   this.keyUpHandler,   true);

            if (this.container) {
                this.container.addEventListener('keydown', this.keyDownHandler);
                this.container.addEventListener('keyup',   this.keyUpHandler);
                this.container.tabIndex = 0;
            }
        }

        handleKeyDown(e) {
            const key = e.key.toLowerCase();
            this.keysPressed[key] = true;

            if (key >= '1' && key <= '5') return;

            const keyMap = {
                'q': 0, 'w': 1,
                'a': 2, 's': 3,
                'z': 4, 'x': 5,
                'e': 6, 'r': 7,
                'd': 8, 'f': 9,
                'c': 10,'v': 11,
                't': 12,'g': 13
            };

            if (keyMap.hasOwnProperty(key)) {
                e.preventDefault();
                const mapValue   = keyMap[key];
                const isDecrement = (mapValue % 2) === 0;
                const axisIndex  = Math.floor(mapValue / 2);
                const currentIncrement = this.keysPressed['1'] ? 1 :
                                         this.keysPressed['2'] ? 2 :
                                         this.keysPressed['3'] ? 3 :
                                         this.keysPressed['4'] ? 4 :
                                         this.keysPressed['5'] ? 5 : 1;
                const delta = isDecrement ? -currentIncrement : currentIncrement;

                if (this.mode === 'FK') {
                    const joint = this.jointNames[axisIndex];
                    if (this.fkSliders[joint]) {
                        this.fkSliders[joint].value = this.jointValues[joint] + delta;
                        this.fkSliders[joint].dispatchEvent(new Event('input', { bubbles: true }));
                    }
                } else {
                    const axes = ['x', 'y', 'z', 'roll', 'pitch', 'yaw'];
                    const axis = axes[axisIndex];
                    if (this.ikSliders[axis]) {
                        this.ikSliders[axis].value = this.ikValues[axis] + delta;
                        this.ikSliders[axis].dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            }
        }

        handleKeyUp(e) {
            delete this.keysPressed[e.key.toLowerCase()];
        }

        // ─── Presets ────────────────────────────────────────────────────────

        applyFKPreset(type) {
            const preset = this.fkPresets[type];
            if (!preset) return;
            
            this.jointNames.forEach(joint => {
                const value = preset[joint];
                this.jointValues[joint] = value;
                
                if (this.fkSliders[joint]) {
                    this.fkSliders[joint].value = value;
                    this.fkDisplaySpans[joint].innerText = value.toFixed(1);
                    this.fkSliders[joint].dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
            this.sendUpdate();
        }

        applyIKPreset(type) {
            const preset = this.ikPresets[type];
            if (!preset) return;
            
            Object.keys(preset).forEach(axis => {
                const value = preset[axis];
                this.ikValues[axis] = value;
                
                if (this.ikSliders[axis]) {
                    this.ikSliders[axis].value = value;
                    this.ikDisplaySpans[axis].innerText = value.toFixed(1);
                    this.ikSliders[axis].dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
            this.sendUpdate();
        }

        // ─── ROS (optional) ─────────────────────────────────────────────────

        tryConnectROS() {
            if (typeof ROSLIB === 'undefined') {
                return;
            }

            this.ros = new ROSLIB.Ros({ url: 'ws://localhost:9090' });
            this.ros.on('connection', () => { this.setupROS(); });
            this.ros.on('error',      (e) => console.error("[ArmControlFKView] ROSLIB error", e));
        }

        setupROS() {
            this.jointPublisher = new ROSLIB.Topic({
                ros: this.ros,
                name: '/fk_joint_states',
                messageType: 'sensor_msgs/JointState'
            });

            this.posePublisher = new ROSLIB.Topic({
                ros: this.ros,
                name: '/ik_target_pose',
                messageType: 'std_msgs/Float64MultiArray'
            });
        }

        publishJointStates() {
            if (!this.jointPublisher) return;
            const pos = this.jointNames.map(j => this.jointValues[j] * Math.PI / 180);
            this.jointPublisher.publish({ name: this.jointNames, position: pos });
        }

        publishPose() {
            if (!this.posePublisher) return;
            const data = [
                this.ikValues.x,   this.ikValues.y,     this.ikValues.z,
                this.ikValues.roll, this.ikValues.pitch, this.ikValues.yaw
            ];
            this.posePublisher.publish({ data });
        }

        // ─── Destroy ────────────────────────────────────────────────────────

        destroy() {
            if (this.reconnectInterval) clearInterval(this.reconnectInterval);
            if (this.ws)  this.ws.close();
            if (this.ros) this.ros.close();

            if (this.keyDownHandler) window.removeEventListener('keydown', this.keyDownHandler, true);
            if (this.keyUpHandler)   window.removeEventListener('keyup',   this.keyUpHandler,   true);

            if (this.container) {
                if (this.keyDownHandler) this.container.removeEventListener('keydown', this.keyDownHandler);
                if (this.keyUpHandler)   this.container.removeEventListener('keyup',   this.keyUpHandler);
            }
        }
    }

    window.ArmControlFKView = ArmControlFKView;

})();