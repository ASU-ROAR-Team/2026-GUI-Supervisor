// plugins/mission-control/ArmControlView.js
(function () {
    'use strict';

    class ArmControlView {
        constructor(container, openmct, wsUrl = "ws://localhost:8080") {
            this.container = container;
            this.openmct   = openmct;
            this.wsUrl     = wsUrl;
            this.orientationLocked = false;
            this.lockPublisher     = null;
            this.mode = "FK";

            this.jointNames = ['joint1', 'joint2', 'joint3', 'joint4', 'joint5', 'joint6'];

            this.jointValues = {
                joint1: 0, joint2: 0, joint3: 0,
                joint4: 0, joint5: 0, joint6: 0
            };

            // NEW: Relative IK state
            this.currentEEPose = { x: 50, y: 0, z: 20, yaw: 0, pitch: 0, roll: 0 };
            this.relativeDistance = 1; // cm
            this.relativeDirection = { dx: 0, dy: 0, dz: 0, dyaw: 0, dpitch: 0, droll: 0 };

            this.ikValues = { x: 50, y: 0, z: 20, yaw: 0, pitch: 0, roll: 0 };

            this.fkPresets = {
                home: { joint1: 0,  joint2: 0,   joint3: 0,  joint4: 0, joint5: 0,  joint6: 0 },
                rest: { joint1: 0,  joint2: -45,  joint3: 90, joint4: 0, joint5: 45, joint6: 0 }
            };

            this.ikPresets = {
                home: { x: 50, y: 0,  z: 20, yaw: 0, pitch: 0,   roll: 0 },
                rest: { x: 30, y: 20, z: 10, yaw: 0, pitch: -45, roll: 0 }
            };

            // WebSocket state
            this.ws               = null;
            this.reconnectInterval = null;

            // ROS (optional direct ROSLIB path)
            this.ros            = null;
            this.jointPublisher = null;
            this.posePublisher  = null;

            // DOM refs populated in bindElements()
            this.sliders      = {};
            this.numberInputs = {};
            this.ikInputs     = {};

            // NEW: Keyboard tracking
            this.keysPressed = {};
        }

        // ─── WebSocket ──────────────────────────────────────────────────────

        initWS() {
            if (this.ws && this.ws.readyState !== WebSocket.CLOSED) return;

            this.ws = new WebSocket(this.wsUrl);

            this.ws.onopen = () => {
                console.log("[ArmControlView] Connected to WS bridge");
                this.updateConnectionStatus(true);
                if (this.reconnectInterval) {
                    clearInterval(this.reconnectInterval);
                    this.reconnectInterval = null;
                }
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    // Handle any inbound messages from the bridge if needed
                    console.log("[ArmControlView] RX:", msg);
                } catch (e) {
                    console.error("[ArmControlView] Failed to parse message", e);
                }
            };

            this.ws.onclose = () => {
                console.warn("[ArmControlView] Disconnected. Reconnecting in 3s...");
                this.updateConnectionStatus(false);
                this.scheduleReconnect();
            };

            this.ws.onerror = (err) => {
                console.error("[ArmControlView] WebSocket error", err);
                this.ws.close();
            };
        }

        scheduleReconnect() {
            if (this.reconnectInterval) return;
            this.reconnectInterval = setInterval(() => {
                console.log("[ArmControlView] Attempting reconnect...");
                this.initWS();
            }, 3000);
        }

        sendWSUpdate() {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

            const data = this.mode === 'FK'
                ? Object.values(this.jointValues)
                : Object.values(this.ikValues);

            if (data.some(v => isNaN(v))) return;

            this.ws.send(JSON.stringify({
                type: 'joint_cmd',
                mode: this.mode,
                data
            }));
        }

        // NEW: Send relative IK move
        sendRelativeIKMove() {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                console.warn("[ArmControlView] WS not connected");
                return;
            }

            // Calculate new pose by adding deltas to current pose
            const newPose = {
                x: this.currentEEPose.x + this.relativeDirection.dx * this.relativeDistance,
                y: this.currentEEPose.y + this.relativeDirection.dy * this.relativeDistance,
                z: this.currentEEPose.z + this.relativeDirection.dz * this.relativeDistance,
                yaw: this.currentEEPose.yaw + this.relativeDirection.dyaw * this.relativeDistance,
                pitch: this.currentEEPose.pitch + this.relativeDirection.dpitch * this.relativeDistance,
                roll: this.currentEEPose.roll + this.relativeDirection.droll * this.relativeDistance
            };

            // Update current pose
            this.currentEEPose = newPose;

            // Send as IK command
            const data = Object.values(newPose);

            this.ws.send(JSON.stringify({
                type: 'joint_cmd',
                mode: 'IK',
                data
            }));

            console.log('[ArmControlView] Sent relative IK move:', newPose);

            // Reset direction after sending
            this.relativeDirection = { dx: 0, dy: 0, dz: 0, dyaw: 0, dpitch: 0, droll: 0 };
            this.updateCommandPreview();
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
            <div class="arm-control-container">
                <h2 class="section-header">Robotic Arm Control</h2>

                <div class="status-bar">
                    <div class="status-dot"></div>
                    <div id="armStatus">Connecting...</div>
                    <button id="modeSwitchButton">Switch to IK Mode</button>
                </div>

                <div class="controls-grid">
                    <div id="fk_container" class="joint-control">
                        <p>Adjust individual joint angles manually.</p>
                        ${this.jointNames.map(joint => `
                            <div class="joint-slider-container">
                                <label style="width:80px">${joint.toUpperCase()}</label>
                                <input type="range" id="${joint}_slider" min="-180" max="180" value="0">
                                <span id="${joint}_val_display">0°</span>
                                <input type="number" id="${joint}_number" value="0" style="display:none">
                            </div>
                        `).join('')}
                    </div>

                    <div id="ik_container" class="pose-control" style="display:none">
                        <p>Control end-effector with relative movements.</p>
                        
                        <!-- Relative Move Direction Controls -->
                        <div class="relative-move-panel">
                            <h3 class="relative-title">Relative Motion Control</h3>
                            
                            <!-- Direction Buttons -->
                            <div class="direction-controls">
                                <div class="direction-row">
                                    <button class="dir-btn" id="moveForward" title="W (+Y)">↑ Forward (W)</button>
                                </div>
                                <div class="direction-row">
                                    <button class="dir-btn" id="moveLeft" title="A (-X)">← Left (A)</button>
                                    <button class="dir-btn" id="moveBack" title="S (-Y)">↓ Back (S)</button>
                                    <button class="dir-btn" id="moveRight" title="D (+X)">→ Right (D)</button>
                                </div>
                                <div class="direction-row">
                                    <button class="dir-btn" id="moveUp" title="Q (+Z)">⬆ Up (Q)</button>
                                    <button class="dir-btn" id="moveDown" title="E (-Z)">⬇ Down (E)</button>
                                </div>
                            </div>

                            <!-- Distance Input -->
                            <div class="distance-input-container">
                                <label for="distanceInput">Distance (cm):</label>
                                <input type="number" id="distanceInput" value="1" min="0.1" max="100" step="0.1">
                                <div class="quick-distance-buttons">
                                    <button class="quick-dist-btn" data-distance="1">1</button>
                                    <button class="quick-dist-btn" data-distance="5">5</button>
                                    <button class="quick-dist-btn" data-distance="10">10</button>
                                    <button class="quick-dist-btn" data-distance="50">50</button>
                                </div>
                            </div>

                            <!-- Command Preview -->
                            <div class="command-preview">
                                <strong>Command Preview:</strong>
                                <div id="previewText" class="preview-text">No movement</div>
                            </div>

                            <!-- Execute Button -->
                            <button id="executeRelativeMove" class="execute-button">Execute Move</button>

                            <!-- Current Pose Display -->
                            <div class="current-pose-display">
                                <strong>Current EE Pose:</strong>
                                <div class="pose-values">
                                    <span>X: <span id="currentX">50.0</span> cm</span>
                                    <span>Y: <span id="currentY">0.0</span> cm</span>
                                    <span>Z: <span id="currentZ">20.0</span> cm</span>
                                </div>
                            </div>
                        </div>

                        <!-- Lock/Home/Unlock Controls -->
                        <div class="control-strip">
                            <button id="lockBtn" class="control-strip-btn lock-btn" title="Lock (C)">🔒 Lock</button>
                            <button id="homeBtn2" class="control-strip-btn home-btn" title="Home (H)">🏠 Home</button>
                            <button id="unlockBtn" class="control-strip-btn unlock-btn" title="Unlock (U)">🔓 Unlock</button>
                        </div>
                    </div>
                </div>

                <div class="preset-buttons">
                    <button class="preset-button" id="homeBtn">Home Position</button>
                    <button class="preset-button" id="restBtn">Rest Position</button>
                    <button class="preset-button" id="lockOrientationBtn">Lock Orientation: OFF</button>
                </div>
            </div>
            `;
        }

        // ─── UI ──────────────────────────────────────────────────────────────

        updateModeUI() {
            const fk  = this.container.querySelector('#fk_container');
            const ik  = this.container.querySelector('#ik_container');
            const btn = this.container.querySelector('#modeSwitchButton');

            if (this.mode === 'FK') {
                fk.style.display  = 'flex';
                ik.style.display  = 'none';
                btn.innerText     = 'Switch to IK Mode';
            } else {
                fk.style.display  = 'none';
                ik.style.display  = 'flex';
                btn.innerText     = 'Switch to FK Mode';
            }
        }

        updateConnectionStatus(connected) {
            if (this.statusDot) this.statusDot.classList.toggle('connected', connected);
            if (this.statusElement) {
                this.statusElement.innerText = connected ? 'WS: Connected' : 'WS: Disconnected';
            }
        }

        // NEW: Update command preview text
        updateCommandPreview() {
            const previewEl = this.container.querySelector('#previewText');
            if (!previewEl) return;

            const { dx, dy, dz, dyaw, dpitch, droll } = this.relativeDirection;
            const dist = this.relativeDistance;

            // Build readable preview
            const moves = [];
            if (dx !== 0) moves.push(`X ${dx > 0 ? '+' : ''}${(dx * dist).toFixed(1)} cm`);
            if (dy !== 0) moves.push(`Y ${dy > 0 ? '+' : ''}${(dy * dist).toFixed(1)} cm`);
            if (dz !== 0) moves.push(`Z ${dz > 0 ? '+' : ''}${(dz * dist).toFixed(1)} cm`);
            if (dyaw !== 0) moves.push(`Yaw ${dyaw > 0 ? '+' : ''}${(dyaw * dist).toFixed(1)}°`);
            if (dpitch !== 0) moves.push(`Pitch ${dpitch > 0 ? '+' : ''}${(dpitch * dist).toFixed(1)}°`);
            if (droll !== 0) moves.push(`Roll ${droll > 0 ? '+' : ''}${(droll * dist).toFixed(1)}°`);

            previewEl.innerText = moves.length > 0 ? moves.join(", ") : "No movement";
        }

        // NEW: Update current pose display
        updatePoseDisplay() {
            const xEl = this.container.querySelector('#currentX');
            const yEl = this.container.querySelector('#currentY');
            const zEl = this.container.querySelector('#currentZ');

            if (xEl) xEl.innerText = this.currentEEPose.x.toFixed(1);
            if (yEl) yEl.innerText = this.currentEEPose.y.toFixed(1);
            if (zEl) zEl.innerText = this.currentEEPose.z.toFixed(1);
        }

        bindElements() {
            // FK sliders
            this.jointNames.forEach(joint => {
                const s = this.container.querySelector(`#${joint}_slider`);
                const n = this.container.querySelector(`#${joint}_number`);

                this.sliders[joint]      = s;
                this.numberInputs[joint] = n;

                const handler = val => {
                    val = Number(val);
                    this.jointValues[joint] = val;
                    s.value = val;
                    n.value = val;
                    this.container.querySelector(`#${joint}_val_display`).innerText = `${val}°`;

                    if (this.mode === 'FK') this.publishJointStates();
                    this.sendWSUpdate();
                };

                s.oninput = () => handler(s.value);
                n.oninput = () => handler(n.value);
            });

            // Mode switch
            this.container.querySelector('#modeSwitchButton').onclick = () => {
                this.mode = this.mode === 'FK' ? 'IK' : 'FK';
                this.updateModeUI();
            };

            // Preset buttons
            this.container.querySelector('#homeBtn').onclick = () => this.applyPreset('home');
            this.container.querySelector('#restBtn').onclick = () => this.applyPreset('rest');

            // Lock Orientation Toggle
            this.container.querySelector('#lockOrientationBtn').onclick = () => {
                this.orientationLocked = !this.orientationLocked;
                const btn = this.container.querySelector('#lockOrientationBtn');
                const state = this.orientationLocked ? "ON" : "OFF";
                btn.innerText = `Lock Orientation: ${state}`;
                this.publishLockState(state);
                this.sendWSLockState(state);
            };

            // NEW: Relative move direction buttons
            const directionMap = {
                'moveForward': { dx: 0, dy: 1, dz: 0, dyaw: 0, dpitch: 0, droll: 0 },
                'moveBack':    { dx: 0, dy: -1, dz: 0, dyaw: 0, dpitch: 0, droll: 0 },
                'moveLeft':    { dx: -1, dy: 0, dz: 0, dyaw: 0, dpitch: 0, droll: 0 },
                'moveRight':   { dx: 1, dy: 0, dz: 0, dyaw: 0, dpitch: 0, droll: 0 },
                'moveUp':      { dx: 0, dy: 0, dz: 1, dyaw: 0, dpitch: 0, droll: 0 },
                'moveDown':    { dx: 0, dy: 0, dz: -1, dyaw: 0, dpitch: 0, droll: 0 }
            };

            Object.keys(directionMap).forEach(btnId => {
                const btn = this.container.querySelector(`#${btnId}`);
                if (btn) {
                    btn.onclick = () => {
                        this.relativeDirection = directionMap[btnId];
                        this.updateCommandPreview();
                    };
                }
            });

            // NEW: Distance input
            const distInput = this.container.querySelector('#distanceInput');
            if (distInput) {
                distInput.oninput = () => {
                    this.relativeDistance = parseFloat(distInput.value) || 1;
                    this.updateCommandPreview();
                };
            }

            // NEW: Quick distance buttons
            const quickDistBtns = this.container.querySelectorAll('.quick-dist-btn');
            quickDistBtns.forEach(btn => {
                btn.onclick = () => {
                    const dist = parseFloat(btn.dataset.distance);
                    this.relativeDistance = dist;
                    distInput.value = dist;
                    this.updateCommandPreview();
                };
            });

            // NEW: Execute button
            const executeBtn = this.container.querySelector('#executeRelativeMove');
            if (executeBtn) {
                executeBtn.onclick = () => this.sendRelativeIKMove();
            }

            // NEW: Lock/Home/Unlock buttons
            const lockBtn = this.container.querySelector('#lockBtn');
            if (lockBtn) {
                lockBtn.onclick = () => {
                    this.orientationLocked = true;
                    this.publishLockState('ON');
                    this.sendWSLockState('ON');
                };
            }

            const homeBtn2 = this.container.querySelector('#homeBtn2');
            if (homeBtn2) {
                homeBtn2.onclick = () => this.applyPreset('home');
            }

            const unlockBtn = this.container.querySelector('#unlockBtn');
            if (unlockBtn) {
                unlockBtn.onclick = () => {
                    this.orientationLocked = false;
                    this.publishLockState('OFF');
                    this.sendWSLockState('OFF');
                };
            }

            this.updatePoseDisplay();
        }

        // NEW: Setup keyboard listeners
        setupKeyboardListeners() {
            console.log("[ArmControlView] Setting up keyboard listeners...");
            
            // Store bound handlers for later cleanup
            this.keyDownHandler = (e) => this.handleKeyDown(e);
            this.keyUpHandler = (e) => this.handleKeyUp(e);
            
            // Attach to window to ensure we catch all keyboard events
            window.addEventListener('keydown', this.keyDownHandler, true);
            window.addEventListener('keyup', this.keyUpHandler, true);
            
            // Also attach to container in case it has focus
            if (this.container) {
                this.container.addEventListener('keydown', this.keyDownHandler);
                this.container.addEventListener('keyup', this.keyUpHandler);
                this.container.tabIndex = 0; // Make container focusable
            }
            
            console.log("[ArmControlView] Keyboard listeners attached to window");
        }

        // NEW: Handle keyboard input
        handleKeyDown(e) {
            const key = e.key.toLowerCase();
            console.log(`[ArmControlView] Key pressed: ${key}, Mode: ${this.mode}`);

            if (this.mode !== 'IK') {
                console.log(`[ArmControlView] Not in IK mode, skipping. Current mode: ${this.mode}`);
                return;
            }

            this.keysPressed[key] = true;

            const directionMap = {
                'w': { dx: 0, dy: 1, dz: 0, dyaw: 0, dpitch: 0, droll: 0 },   // Forward
                's': { dx: 0, dy: -1, dz: 0, dyaw: 0, dpitch: 0, droll: 0 },  // Back
                'a': { dx: -1, dy: 0, dz: 0, dyaw: 0, dpitch: 0, droll: 0 },  // Left
                'd': { dx: 1, dy: 0, dz: 0, dyaw: 0, dpitch: 0, droll: 0 },   // Right
                'q': { dx: 0, dy: 0, dz: 1, dyaw: 0, dpitch: 0, droll: 0 },   // Up
                'e': { dx: 0, dy: 0, dz: -1, dyaw: 0, dpitch: 0, droll: 0 },  // Down
            };

            if (directionMap[key]) {
                console.log(`[ArmControlView] Direction mapped: ${key}`, directionMap[key]);
                e.preventDefault();
                this.relativeDirection = directionMap[key];
                this.updateCommandPreview();
            }

            // Execute on Space or Enter
            if (key === ' ' || key === 'enter') {
                console.log(`[ArmControlView] Execute triggered`);
                e.preventDefault();
                this.sendRelativeIKMove();
            }

            // Lock/Home/Unlock
            if (key === 'c') {
                console.log(`[ArmControlView] Lock triggered`);
                e.preventDefault();
                this.orientationLocked = true;
                this.publishLockState('ON');
                this.sendWSLockState('ON');
            }
            if (key === 'h') {
                console.log(`[ArmControlView] Home triggered`);
                e.preventDefault();
                this.applyPreset('home');
            }
            if (key === 'u') {
                console.log(`[ArmControlView] Unlock triggered`);
                e.preventDefault();
                this.orientationLocked = false;
                this.publishLockState('OFF');
                this.sendWSLockState('OFF');
            }
        }

        handleKeyUp(e) {
            const key = e.key.toLowerCase();
            delete this.keysPressed[key];
        }

        // ─── Presets ────────────────────────────────────────────────────────

        applyPreset(type) {
            if (this.mode === 'FK') {
                const preset = this.fkPresets[type];
                this.jointNames.forEach(j => {
                    const v = preset[j];
                    this.jointValues[j] = v;
                    this.sliders[j].value      = v;
                    this.numberInputs[j].value = v;
                    this.container.querySelector(`#${j}_val_display`).innerText = `${v}°`;
                });
                this.publishJointStates();
            } else {
                const preset = this.ikPresets[type];
                this.currentEEPose = { ...preset };
                this.updatePoseDisplay();
                
                const data = Object.values(preset);
                this.ws.send(JSON.stringify({
                    type: 'joint_cmd',
                    mode: 'IK',
                    data
                }));
            }
        }

        // ─── ROS (optional direct ROSLIB path) ──────────────────────────────

        tryConnectROS() {
            if (typeof ROSLIB === 'undefined') {
                console.info("[ArmControlView] ROSLIB not found — using WS bridge only");
                return;
            }

            this.ros = new ROSLIB.Ros({ url: 'ws://localhost:9090' });

            this.ros.on('connection', () => {
                console.log("[ArmControlView] ROSLIB connected");
                this.setupROS();
            });

            this.ros.on('error', (e) => console.error("[ArmControlView] ROSLIB error", e));
            this.ros.on('close', ()  => console.warn("[ArmControlView] ROSLIB closed"));
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
            this.lockPublisher = new ROSLIB.Topic({
                ros: this.ros,
                name: '/lock_orientation',
                messageType: 'std_msgs/String'
            });
        }

        publishJointStates() {
            if (!this.jointPublisher) return;
            const pos = this.jointNames.map(j => this.jointValues[j] * Math.PI / 180);
            this.jointPublisher.publish({ name: this.jointNames, position: pos });
        }

        publishPose() {
            if (!this.posePublisher) return;
            this.posePublisher.publish({ data: Object.values(this.ikValues) });
        }

        publishLockState(state) {
            if (!this.lockPublisher) return;
            this.lockPublisher.publish({ data: state });
            console.log("[ArmControlView] Lock Orientation:", state);
        }

        sendWSLockState(state) {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                console.warn("[ArmControlView] WS not connected");
                return;
            }

            const message = {
                type: "lock_orientation",
                data: state
            };

            console.log("[ArmControlView] Sending WS:", message);
            this.ws.send(JSON.stringify(message));
        }

        // ─── Destroy ────────────────────────────────────────────────────────

        destroy() {
            if (this.reconnectInterval) clearInterval(this.reconnectInterval);
            if (this.ws)  this.ws.close();
            if (this.ros) this.ros.close();
            
            // Remove keyboard listeners using stored handlers
            if (this.keyDownHandler) window.removeEventListener('keydown', this.keyDownHandler, true);
            if (this.keyUpHandler) window.removeEventListener('keyup', this.keyUpHandler, true);
            
            if (this.container) {
                if (this.keyDownHandler) this.container.removeEventListener('keydown', this.keyDownHandler);
                if (this.keyUpHandler) this.container.removeEventListener('keyup', this.keyUpHandler);
            }
            
            console.log('[ArmControlView] destroyed');
        }
    }

    window.ArmControlView = ArmControlView;

})();