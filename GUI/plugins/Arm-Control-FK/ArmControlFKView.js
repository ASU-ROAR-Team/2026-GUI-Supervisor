// src/plugins/Arm-Control-FK/ArmControlFKView.js
(function () {
    'use strict';

    class ArmControlFKView {
        constructor(container, openmct, wsUrl = `ws://${(window.getRoarHost ? window.getRoarHost() : window.location.hostname) || 'localhost'}:9091`) {
            this.container = container;
            this.openmct   = openmct;
            this.wsUrl     = wsUrl;
            this.mode = "FK";
            this.liquidSamplingValue = 0;

            // FK state - UPDATED TO YOUR SPECIFIC TOPICS
            this.jointNames = ['j0', 'j1', 'j2', 'j3', 'diff_m1', 'diff_m2', 'gripper_servo'];
            this.jointValues = {
                j0: 0, j1: 0, j2: 0,
                j3: 0, diff_m1: 0, diff_m2: 0, gripper_servo: 0
            };

            this.jointMultipliers = {
                j0: 1.0, j1: 1.0, j2: 1.0,
                j3: 1.0, diff_m1: 1.0, diff_m2: 1.0, gripper_servo: 1.0
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
            this.customPresets = this.loadCustomPresets();


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
            this.fkMinInputs     = {};
            this.fkMaxInputs     = {};
            this.fkFactorInputs  = {};
            this.ikSliders      = {};
            this.ikDisplaySpans = {};

            // Keyboard tracking
            this.keysPressed = {};
        }

        // ─── Custom Presets ──────────────────────────────────────────────────

        loadCustomPresets() {
            try {
                const stored = localStorage.getItem('ArmControlFK_customPresets');
                if (stored) {
                    return JSON.parse(stored);
                }
            } catch (e) {
                console.error("[ArmControlFKView] Failed to load custom presets from localStorage", e);
            }
            return {};
        }

        saveCustomPresets() {
            try {
                localStorage.setItem('ArmControlFK_customPresets', JSON.stringify(this.customPresets));
            } catch (e) {
                console.error("[ArmControlFKView] Failed to save custom presets to localStorage", e);
            }
        }

        renderPresetButtonsHTML() {
            let html = `
                <button class="preset-button" id="fkHomeBtn">Home Position</button>
                <button class="preset-button" id="fkRestBtn">Rest Position</button>
            `;

            Object.keys(this.customPresets).forEach(key => {
                const name = this.customPresets[key].name || key;
                html += `
                    <div class="custom-preset-chip" style="display: inline-flex; align-items: center; background: rgba(30, 41, 59, 0.9); border: 1px solid #3b82f6; border-radius: 6px; overflow: hidden; margin-right: 6px; margin-bottom: 6px;">
                        <button class="preset-button custom-fk-preset-btn" data-preset-key="${key}" style="border: none; border-radius: 0; background: transparent; padding: 6px 10px; font-weight: 500;">
                            📍 ${name}
                        </button>
                        <button class="delete-fk-preset-btn" data-preset-key="${key}" title="Delete location preset" style="background: transparent; color: #ef4444; border: none; border-left: 1px solid #334155; padding: 6px 8px; cursor: pointer; font-size: 0.85rem; font-weight: bold; line-height: 1; transition: background 0.15s ease;">
                            ✕
                        </button>
                    </div>
                `;
            });

            return html;
        }

        updatePresetButtonsUI() {
            const container = this.container.querySelector('#fkPresetButtonsContainer');
            if (container) {
                container.innerHTML = this.renderPresetButtonsHTML();
                this.bindPresetButtons();
            }
        }

        bindPresetButtons() {
            const homeBtn = this.container.querySelector('#fkHomeBtn');
            const restBtn = this.container.querySelector('#fkRestBtn');

            if (homeBtn) homeBtn.onclick = () => this.applyFKPreset('home');
            if (restBtn) restBtn.onclick = () => this.applyFKPreset('rest');

            const customBtns = this.container.querySelectorAll('.custom-fk-preset-btn');
            customBtns.forEach(btn => {
                btn.onclick = () => {
                    const key = btn.getAttribute('data-preset-key');
                    this.applyCustomFKPreset(key);
                };
            });

            const deleteBtns = this.container.querySelectorAll('.delete-fk-preset-btn');
            deleteBtns.forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const key = btn.getAttribute('data-preset-key');
                    this.deleteCustomPreset(key);
                };
            });
        }

        applyCustomFKPreset(key) {
            const preset = this.customPresets[key];
            if (!preset || !preset.values) return;

            this.jointNames.forEach(joint => {
                if (preset.values[joint] !== undefined) {
                    const value = parseFloat(preset.values[joint]) || 0;
                    this.jointValues[joint] = value;

                    if (this.fkSliders[joint]) {
                        this.fkSliders[joint].value = value;
                        const factor = this.jointMultipliers[joint] !== undefined ? this.jointMultipliers[joint] : 1.0;
                        const scaledVal = value * factor;
                        if (this.fkDisplaySpans[joint]) {
                            this.fkDisplaySpans[joint].innerHTML = `${value.toFixed(1)} <span style="color:#64748b; font-size:0.75rem; text-shadow:none; font-weight:normal;">(x${factor.toFixed(2)}=${scaledVal.toFixed(1)})</span>`;
                        }
                        this.fkSliders[joint].dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            });
            this.sendUpdate();
        }

        deleteCustomPreset(key) {
            if (this.customPresets[key]) {
                delete this.customPresets[key];
                this.saveCustomPresets();
                this.updatePresetButtonsUI();
            }
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
                    if (msg.type === "current_readings") {
                        const display = this.container.querySelector('#currentReadingsDisplay');
                        if (display) {
                            display.innerHTML = msg.data.map(v => {
                                const isWarning = v >= 6 || v <= -6;
                                const style = isWarning ? 'color: #ef4444; font-weight: 900; background-color: rgba(239, 68, 68, 0.2); padding: 0 4px; border-radius: 4px;' : 'color: inherit;';
                                return `<span style="${style}">${v.toFixed(2)}</span>`;
                            }).join(', ');
                        }
                    } else if (msg.type === "arm_joint_feedback") {
                        const display = this.container.querySelector('#armJointFeedbackDisplay');
                        if (display) display.innerText = msg.data.map(v => v.toFixed(2)).join(', ');
                    } else if (msg.type === "rock_storage") {
                        const display = this.container.querySelector('#rockStorageDisplay');
                        if (display) display.innerText = parseFloat(msg.data).toFixed(2);
                    }
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

            // Start continuous IK publisher loop
            if (!this.ikPublishInterval) {
                this.ikPublishInterval = setInterval(() => {
                    if (this.mode === 'IK') {
                        this.sendUpdate();
                    }
                }, 100); // 10Hz
            }
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
                const getVal = (j) => (this.jointValues[j] || 0) * (this.jointMultipliers[j] !== undefined ? this.jointMultipliers[j] : 1.0);

                const armData = [
                    getVal('j0'), getVal('j1'), 
                    getVal('j2'), getVal('j3'),
                    getVal('diff_m1') + getVal('diff_m2'),
                    getVal('diff_m1') + getVal('diff_m2'),
                    this.liquidSamplingValue
                ];
                const gripperData = getVal('gripper_servo');

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

                <!-- Feedback Display Section -->
                <div class="feedback-section" style="margin-top: 16px; margin-bottom: 16px; background: rgba(30, 41, 59, 0.4); border: 1px solid #334155; border-radius: 8px; padding: 14px;">
                    <h4 style="margin-top: 0; color: #38bdf8; font-size: 0.95rem; margin-bottom: 10px;">Arm Feedback & Readings</h4>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #94a3b8; font-size: 0.85rem; font-family: monospace;">/current_readings_topic:</span>
                            <span id="currentReadingsDisplay" style="color: #34d399; font-family: monospace; font-weight: bold;">Waiting...</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #94a3b8; font-size: 0.85rem; font-family: monospace;">/roar_robot_arm/joint_feedback:</span>
                            <span id="armJointFeedbackDisplay" style="color: #34d399; font-family: monospace; font-weight: bold;">Waiting...</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #94a3b8; font-size: 0.85rem; font-family: monospace;">rock storage (/load__cell2_topic):</span>
                            <span id="rockStorageDisplay" style="color: #34d399; font-family: monospace; font-weight: bold;">Waiting...</span>
                        </div>
                    </div>
                </div>

                <!-- FK Mode Section -->
                <div id="fk_container" style="display:none">
                    <h3 class="section-header">Forward Kinematics (FK)</h3>
                    <p>Adjust individual joint angles.</p>

                    <div class="controls-grid">
                        ${this.jointNames.map(joint => {
                            const range = this.jointRanges[joint];
                            const factor = this.jointMultipliers[joint] !== undefined ? this.jointMultipliers[joint] : 1.0;
                            return `
                                <div class="joint-control" style="background: rgba(30, 41, 59, 0.6); padding: 12px; border-radius: 8px; border: 1px solid #334155; margin-bottom: 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                                        <label style="font-weight: 600; color: #38bdf8; font-size: 0.95rem;">${range.label}</label>
                                        <div style="display: flex; gap: 10px; align-items: center; font-size: 0.8rem; color: #94a3b8;">
                                            <label>Min:
                                                <input type="number" id="fk_${joint}_min" value="${range.min}" step="any" style="width: 55px; background: #0f172a; color: #fff; border: 1px solid #475569; border-radius: 4px; padding: 2px 4px;">
                                            </label>
                                            <label>Max:
                                                <input type="number" id="fk_${joint}_max" value="${range.max}" step="any" style="width: 55px; background: #0f172a; color: #fff; border: 1px solid #475569; border-radius: 4px; padding: 2px 4px;">
                                            </label>
                                            <label>Factor:
                                                <input type="number" id="fk_${joint}_factor" value="${factor}" step="any" style="width: 60px; background: #0f172a; color: #34d399; border: 1px solid #475569; border-radius: 4px; padding: 2px 4px; font-weight: 600;">
                                            </label>
                                        </div>
                                    </div>
                                    <div class="slider-row" style="display: flex; align-items: center; gap: 8px;">
                                        <button id="fk_${joint}_dec" style="padding: 2px 8px; cursor: pointer; border-radius: 4px; border: 1px solid #475569; background: #1e293b; color: #fff; font-weight: bold;">-</button>
                                        <input type="range" id="fk_${joint}_slider"
                                               min="${range.min}" max="${range.max}" value="0" step="0.1" style="flex: 1;">
                                        <button id="fk_${joint}_inc" style="padding: 2px 8px; cursor: pointer; border-radius: 4px; border: 1px solid #475569; background: #1e293b; color: #fff; font-weight: bold;">+</button>
                                        <input type="number" id="fk_${joint}_step" value="1" step="0.1" style="width: 50px; background: #0f172a; color: #fff; border: 1px solid #475569; border-radius: 4px; padding: 2px 4px; text-align: center;" title="Step size">
                                        <span id="fk_${joint}_display" style="display: inline-flex; justify-content: flex-end; align-items: baseline; gap: 6px; background: #020617; border: 1px solid #0ea5e9; border-radius: 6px; padding: 4px 8px; min-width: 170px; text-align: right; box-shadow: 0 0 10px rgba(14, 165, 233, 0.2), inset 0 2px 5px rgba(0,0,0,0.8); font-family: 'Courier New', Courier, monospace; color: #38bdf8; font-size: 1rem; font-weight: bold; text-shadow: 0 0 8px rgba(56, 189, 248, 0.6); letter-spacing: 0.5px;">0.0 <span style="color:#64748b; font-size:0.75rem; text-shadow:none; font-weight:normal;">(x1.00=0.0)</span></span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>

                    <div class="preset-section" style="margin-top: 16px; margin-bottom: 16px; background: rgba(30, 41, 59, 0.4); border: 1px solid #334155; border-radius: 8px; padding: 14px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
                            <label style="font-weight: 600; color: #38bdf8; font-size: 0.95rem;">Preset Joint Locations</label>
                            <button id="fkSaveLocationBtn" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: #ffffff; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: all 0.15s ease;">
                                ➕ Save Location
                            </button>
                        </div>
                        <div class="preset-buttons" id="fkPresetButtonsContainer" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
                            ${this.renderPresetButtonsHTML()}
                        </div>
                    </div>

                    <!-- Save Location Modal -->
                    <div id="saveLocationModal" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(4px); z-index: 99999; justify-content: center; align-items: center;">
                        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 22px; max-width: 480px; width: 90%; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.6); color: #f8fafc;">
                            <h3 style="margin-top: 0; color: #38bdf8; font-size: 1.15rem; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                                💾 Save Joint Location Preset
                            </h3>
                            
                            <div style="margin-bottom: 14px;">
                                <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #94a3b8; margin-bottom: 6px;">Preset Name</label>
                                <input type="text" id="presetNameInput" placeholder="e.g. Pick Position, Home 2..." style="width: 100%; box-sizing: border-box; background: #0f172a; color: #fff; border: 1px solid #475569; border-radius: 6px; padding: 8px 12px; font-size: 0.9rem;">
                            </div>

                            <div style="margin-bottom: 16px;">
                                <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #94a3b8; margin-bottom: 6px;">Joint Values Source</label>
                                <div style="display: flex; gap: 16px;">
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 0.85rem; color: #e2e8f0;">
                                        <input type="radio" name="presetSource" value="current" checked style="accent-color: #38bdf8;"> Save Current State
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 0.85rem; color: #e2e8f0;">
                                        <input type="radio" name="presetSource" value="manual" style="accent-color: #38bdf8;"> Manual Entry
                                    </label>
                                </div>
                            </div>

                            <div id="manualEntrySection" style="display: none; background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                                    ${this.jointNames.map(joint => `
                                        <div style="display: flex; align-items: center; justify-content: space-between;">
                                            <label style="font-size: 0.8rem; font-family: monospace; color: #38bdf8;">${joint}:</label>
                                            <input type="number" id="manual_preset_${joint}" value="0" step="0.1" style="width: 80px; background: #1e293b; color: #fff; border: 1px solid #475569; border-radius: 4px; padding: 4px 6px; font-size: 0.85rem; text-align: right;">
                                        </div>
                                    `).join('')}
                                </div>
                            </div>

                            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                                <button id="cancelSavePresetBtn" style="background: #334155; color: #f1f5f9; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 500;">Cancel</button>
                                <button id="confirmSavePresetBtn" style="background: #2563eb; color: #fff; border: none; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 600;">Save Location</button>
                            </div>
                        </div>
                    </div>

                    <div class="preset-section" style="margin-top: 16px; margin-bottom: 16px; background: rgba(30, 41, 59, 0.4); border: 1px solid #334155; border-radius: 8px; padding: 14px;">
                        <h4 style="margin-top: 0; color: #38bdf8; font-size: 0.95rem; margin-bottom: 10px;">Liquid Sampling</h4>
                        <div style="display: flex; gap: 10px;">
                            <button id="liquidSamplingNegBtn" style="flex: 1; padding: 10px; background: #eab308; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">Reverse (-1)</button>
                            <button id="liquidSamplingZeroBtn" style="flex: 1; padding: 10px; background: #ef4444; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">Stop (0)</button>
                            <button id="liquidSamplingPosBtn" style="flex: 1; padding: 10px; background: #22c55e; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">Sample (+1)</button>
                        </div>
                    </div>

                    <div class="keyboard-shortcuts-section">
                        <h4 class="shortcut-header">Keyboard Shortcuts (FK Mode)</h4>
                        <div class="shortcuts-list">
                            <div class="shortcut-item"><span>j0</span><span>J(-) / L(+)</span></div>
                            <div class="shortcut-item"><span>j1</span><span>K(-) / I(+)</span></div>
                            <div class="shortcut-item"><span>j2</span><span>U(-) / O(+)</span></div>
                            <div class="shortcut-item"><span>j3</span><span>A(-) / D(+)</span></div>
                            <div class="shortcut-item"><span>diff_m1</span><span>S(-) / W(+)</span></div>
                            <div class="shortcut-item"><span>diff_m2</span><span>Q(-) / E(+)</span></div>
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
                                    <div class="slider-row" style="display: flex; align-items: center; gap: 8px;">
                                        <button id="ik_${axis}_dec" style="padding: 2px 8px; cursor: pointer; border-radius: 4px; border: 1px solid #475569; background: #1e293b; color: #fff; font-weight: bold;">-</button>
                                        <input type="range" id="ik_${axis}_slider"
                                               min="${range.min}" max="${range.max}"
                                               value="${this.ikValues[axis]}" step="0.1" style="flex: 1;">
                                        <button id="ik_${axis}_inc" style="padding: 2px 8px; cursor: pointer; border-radius: 4px; border: 1px solid #475569; background: #1e293b; color: #fff; font-weight: bold;">+</button>
                                        <input type="number" id="ik_${axis}_step" value="1" step="0.1" style="width: 50px; background: #0f172a; color: #fff; border: 1px solid #475569; border-radius: 4px; padding: 2px 4px; text-align: center;" title="Step size">
                                        <span id="ik_${axis}_display" style="display: inline-block; background: #020617; border: 1px solid #10b981; border-radius: 6px; padding: 4px 8px; min-width: 70px; text-align: right; box-shadow: 0 0 10px rgba(16, 185, 129, 0.2), inset 0 2px 5px rgba(0,0,0,0.8); font-family: 'Courier New', Courier, monospace; color: #34d399; font-size: 1rem; font-weight: bold; text-shadow: 0 0 8px rgba(52, 211, 153, 0.6); letter-spacing: 0.5px;">${this.ikValues[axis].toFixed(1)}</span>
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
                            <div class="shortcut-item"><span>X Axis</span><span>J(-) / L(+)</span></div>
                            <div class="shortcut-item"><span>Y Axis</span><span>K(-) / I(+)</span></div>
                            <div class="shortcut-item"><span>Z Axis</span><span>U(-) / O(+)</span></div>
                            <div class="shortcut-item"><span>Roll</span><span>A(-) / D(+)</span></div>
                            <div class="shortcut-item"><span>Pitch</span><span>S(-) / W(+)</span></div>
                            <div class="shortcut-item"><span>Yaw</span><span>Q(-) / E(+)</span></div>
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
            // FK Sliders, Bounds, and Factor Inputs
            this.jointNames.forEach(joint => {
                const slider      = this.container.querySelector(`#fk_${joint}_slider`);
                const display     = this.container.querySelector(`#fk_${joint}_display`);
                const minInput    = this.container.querySelector(`#fk_${joint}_min`);
                const maxInput    = this.container.querySelector(`#fk_${joint}_max`);
                const factorInput = this.container.querySelector(`#fk_${joint}_factor`);
                const decBtn      = this.container.querySelector(`#fk_${joint}_dec`);
                const incBtn      = this.container.querySelector(`#fk_${joint}_inc`);
                const stepInput   = this.container.querySelector(`#fk_${joint}_step`);

                this.fkSliders[joint]      = slider;
                this.fkDisplaySpans[joint] = display;
                this.fkMinInputs[joint]    = minInput;
                this.fkMaxInputs[joint]    = maxInput;
                this.fkFactorInputs[joint] = factorInput;

                const updateJointState = () => {
                    let minVal = parseFloat(minInput.value);
                    if (isNaN(minVal)) minVal = -180;
                    let maxVal = parseFloat(maxInput.value);
                    if (isNaN(maxVal)) maxVal = 180;
                    if (minVal > maxVal) { const temp = minVal; minVal = maxVal; maxVal = temp; }

                    this.jointRanges[joint].min = minVal;
                    this.jointRanges[joint].max = maxVal;
                    slider.min = minVal;
                    slider.max = maxVal;

                    let factorVal = parseFloat(factorInput.value);
                    if (isNaN(factorVal)) factorVal = 1.0;
                    this.jointMultipliers[joint] = factorVal;

                    let rawVal = parseFloat(slider.value);
                    if (isNaN(rawVal)) rawVal = 0;
                    rawVal = Math.min(Math.max(rawVal, minVal), maxVal);
                    this.jointValues[joint] = rawVal;
                    slider.value = rawVal;

                    const scaledVal = rawVal * factorVal;
                    display.innerHTML = `${rawVal.toFixed(1)} <span style="color:#64748b; font-size:0.75rem; text-shadow:none; font-weight:normal;">(x${factorVal.toFixed(2)}=${scaledVal.toFixed(1)})</span>`;

                    if (this.mode === 'FK') this.sendUpdate();
                };

                slider.oninput = updateJointState;
                if (minInput) minInput.onchange = updateJointState;
                if (maxInput) maxInput.onchange = updateJointState;
                if (factorInput) factorInput.oninput = updateJointState;
                
                if (decBtn) {
                    decBtn.onclick = () => {
                        let step = parseFloat(stepInput.value) || 1;
                        let val = parseFloat(slider.value) - step;
                        slider.value = val;
                        updateJointState();
                    };
                }
                if (incBtn) {
                    incBtn.onclick = () => {
                        let step = parseFloat(stepInput.value) || 1;
                        let val = parseFloat(slider.value) + step;
                        slider.value = val;
                        updateJointState();
                    };
                }
            });

            // IK Sliders
            Object.keys(this.ikRanges).forEach(axis => {
                const slider  = this.container.querySelector(`#ik_${axis}_slider`);
                const display = this.container.querySelector(`#ik_${axis}_display`);
                const decBtn  = this.container.querySelector(`#ik_${axis}_dec`);
                const incBtn  = this.container.querySelector(`#ik_${axis}_inc`);
                const stepInput = this.container.querySelector(`#ik_${axis}_step`);

                this.ikSliders[axis]      = slider;
                this.ikDisplaySpans[axis] = display;

                const updateIKState = () => {
                    let val = parseFloat(slider.value);
                    const range = this.ikRanges[axis];
                    val = Math.min(Math.max(val, range.min), range.max);
                    this.ikValues[axis] = val;
                    slider.value = val;
                    display.innerText = val.toFixed(1);
                    if (this.mode === 'IK') this.sendUpdate();
                };

                slider.oninput = updateIKState;
                
                if (decBtn) {
                    decBtn.onclick = () => {
                        let step = parseFloat(stepInput.value) || 1;
                        let val = parseFloat(slider.value) - step;
                        slider.value = val;
                        updateIKState();
                    };
                }
                if (incBtn) {
                    incBtn.onclick = () => {
                        let step = parseFloat(stepInput.value) || 1;
                        let val = parseFloat(slider.value) + step;
                        slider.value = val;
                        updateIKState();
                    };
                }
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

            // FK Presets & Custom Presets
            this.bindPresetButtons();

            // Save Location Modal Controls
            const modal = this.container.querySelector('#saveLocationModal');
            const saveBtn = this.container.querySelector('#fkSaveLocationBtn');
            const cancelBtn = this.container.querySelector('#cancelSavePresetBtn');
            const confirmBtn = this.container.querySelector('#confirmSavePresetBtn');
            const nameInput = this.container.querySelector('#presetNameInput');
            const manualSection = this.container.querySelector('#manualEntrySection');
            const sourceRadios = this.container.querySelectorAll('input[name="presetSource"]');

            if (saveBtn && modal) {
                saveBtn.onclick = () => {
                    if (nameInput) nameInput.value = '';
                    this.jointNames.forEach(joint => {
                        const input = this.container.querySelector(`#manual_preset_${joint}`);
                        if (input) input.value = (this.jointValues[joint] || 0).toFixed(1);
                    });
                    const currentRadio = this.container.querySelector('input[name="presetSource"][value="current"]');
                    if (currentRadio) currentRadio.checked = true;
                    if (manualSection) manualSection.style.display = 'none';
                    modal.style.display = 'flex';
                };
            }

            sourceRadios.forEach(radio => {
                radio.onchange = () => {
                    if (manualSection) {
                        manualSection.style.display = radio.value === 'manual' ? 'block' : 'none';
                    }
                };
            });

            if (cancelBtn && modal) {
                cancelBtn.onclick = () => {
                    modal.style.display = 'none';
                };
            }

            if (confirmBtn && modal) {
                confirmBtn.onclick = () => {
                    let name = nameInput ? nameInput.value.trim() : '';
                    if (!name) {
                        name = `Preset ${Object.keys(this.customPresets).length + 1}`;
                    }

                    const selectedSource = this.container.querySelector('input[name="presetSource"]:checked');
                    const isManual = selectedSource && selectedSource.value === 'manual';

                    const values = {};
                    this.jointNames.forEach(joint => {
                        if (isManual) {
                            const input = this.container.querySelector(`#manual_preset_${joint}`);
                            let val = input ? parseFloat(input.value) : 0;
                            if (isNaN(val)) val = 0;
                            values[joint] = val;
                        } else {
                            values[joint] = this.jointValues[joint] || 0;
                        }
                    });

                    const key = 'preset_' + Date.now();
                    this.customPresets[key] = {
                        name: name,
                        values: values
                    };

                    this.saveCustomPresets();
                    this.updatePresetButtonsUI();
                    modal.style.display = 'none';
                };
            }

            // Liquid Sampling Controls
            const btnNeg = this.container.querySelector('#liquidSamplingNegBtn');
            const btnZero = this.container.querySelector('#liquidSamplingZeroBtn');
            const btnPos = this.container.querySelector('#liquidSamplingPosBtn');
            
            const updateLiquidSamplingUI = () => {
                if (btnNeg) btnNeg.style.opacity = this.liquidSamplingValue === -1 ? '1' : '0.5';
                if (btnZero) btnZero.style.opacity = this.liquidSamplingValue === 0 ? '1' : '0.5';
                if (btnPos) btnPos.style.opacity = this.liquidSamplingValue === 1 ? '1' : '0.5';
            };
            
            if (btnNeg) btnNeg.onclick = () => { this.liquidSamplingValue = -1; updateLiquidSamplingUI(); this.sendUpdate(); };
            if (btnZero) btnZero.onclick = () => { this.liquidSamplingValue = 0; updateLiquidSamplingUI(); this.sendUpdate(); };
            if (btnPos) btnPos.onclick = () => { this.liquidSamplingValue = 1; updateLiquidSamplingUI(); this.sendUpdate(); };
            
            updateLiquidSamplingUI();

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
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
                return;
            }

            const key = e.key.toLowerCase();
            this.keysPressed[key] = true;

            if (key >= '1' && key <= '5') return;

            const keyMap = {
                'j': 0, 'l': 1,
                'k': 2, 'i': 3,
                'u': 4, 'o': 5,
                'a': 6, 'd': 7,
                's': 8, 'w': 9,
                'q': 10,'e': 11,
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
                    const factor = this.jointMultipliers[joint] !== undefined ? this.jointMultipliers[joint] : 1.0;
                    const scaledVal = value * factor;
                    if (this.fkDisplaySpans[joint]) {
                        this.fkDisplaySpans[joint].innerHTML = `${value.toFixed(1)} <span style="color:#64748b; font-size:0.75rem; text-shadow:none; font-weight:normal;">(x${factor.toFixed(2)}=${scaledVal.toFixed(1)})</span>`;
                    }
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

            this.ros = new ROSLIB.Ros({ url: `ws://${(window.getRoarHost ? window.getRoarHost() : window.location.hostname) || 'localhost'}:9091` });
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
            const pos = this.jointNames.map(j => (this.jointValues[j] * (this.jointMultipliers[j] !== undefined ? this.jointMultipliers[j] : 1.0)) * Math.PI / 180);
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
            if (this.ikPublishInterval) clearInterval(this.ikPublishInterval);
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