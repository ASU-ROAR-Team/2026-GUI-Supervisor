// plugins/Drilling-Control/Drilling26View.js
(function () {
    class Drilling26View{
        constructor(element, openmct) {
            this.element  = element;
            this.openmct  = openmct;

            this.ws                = null;
            this.reconnectInterval = null;
            this.wsConnected       = false;

            this.currentRoverState = { rover_state: 'IDLE', active_mission: '' };
            this.last_known_height = 0.0;

            this.currentManualInputState = {
                direction: 0,
                auger_on: false,
                gate_open: false,
                speed: 0.0,
                stop_enabled: false
            };

            // NEW: State for dual motors. 1 = CW, 0 = OFF, -1 = CCW
            this.dualMotorsState = {
                motor1: 0, 
                motor2: 0
            };

            this.movementState = {
                isMoving: false,
                currentDirection: 0
            };

            this.drillingMissionState = {
                location: 0.0,
                servo_on: 0,
                load_cell_on: 0
            };

            this.lastPublishedMissionState = { location: 0.0, servo_on: 0, load_cell_on: 0 };
            this.locationSliderDebounceTimer = null;
            this.LOCATION_DEBOUNCE_MS = 150;

            // DOM refs
            this.rosStatusDot            = null;
            this.rosStatus               = null;
            this.fsmStateDisplay         = null;
            this.platformDepthDisplay    = null;
            this.sampleWeightDisplay     = null;
            this.platformUpButton        = null;
            this.platformDownButton      = null;
            this.platformStopButton      = null;
            this.speedSlider             = null;
            this.speedSliderValue        = null;
            this.augerToggleSwitch       = null;
            this.gateToggleSwitch        = null;
            this.webcamImageElement      = null;
            this.webcamStatusMsgElement  = null;
            this.webcamSnapshotButton    = null;
            this.locationSlider          = null;
            this.locationSliderValue     = null;
            this.servoToggleSwitch       = null;
            this.loadCellToggleSwitch    = null;

            // NEW: Dual Motor DOM refs
            this.motor1Btns = { cw: null, off: null, ccw: null };
            this.motor2Btns = { cw: null, off: null, ccw: null };
            this.currentDisplay = null;
            this.encoderDisplay = null;
        }

        initWS() {
            if (this.ws && this.ws.readyState !== WebSocket.CLOSED) return;

            const wsHost = window.location.hostname || "localhost";
            this.ws = new WebSocket(`ws://${wsHost}:8080`);

            this.ws.onopen = () => {
                this.wsConnected = true;
                this.updateConnectionStatus(true);
                if (this.reconnectInterval) {
                    clearInterval(this.reconnectInterval);
                    this.reconnectInterval = null;
                }
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg  = JSON.parse(event.data);
                    const data = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;

                    switch (msg.type) {
                        case 'rover_status': this.handleRoverStatus(data); break;
                        case 'drilling_status': this.handleDrillingStatus(data); break;
                        case 'drilling_fsm_state': this.handleFsmState(data); break;
                        case 'camera_frame': this.handleCameraFrame(data); break;
                        
                        // NEW: Handle sensor feedback
                        case 'drilling_sensor_feedback': this.handleSensorFeedback(data); break;
                    }
                } catch (e) {
                    console.error("[Drilling26View] Failed to parse message", e);
                }
            };

            this.ws.onclose = () => {
                this.wsConnected = false;
                this.updateConnectionStatus(false);
                this.stopWebcam();
                this.scheduleReconnect();
            };

            this.ws.onerror = (err) => this.ws.close();
        }

        scheduleReconnect() {
            if (this.reconnectInterval) return;
            this.reconnectInterval = setInterval(() => this.initWS(), 3000);
        }

        publishDrillingCommand() {
            if (!this.currentRoverState.active_mission || this.currentRoverState.active_mission.trim() === '') return;
            if (!this.wsConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

            const payload = {
                type: 'drilling_cmd',
                data: [
                    this.currentManualInputState.direction,
                    this.currentManualInputState.auger_on ? 1 : 0,
                    this.currentManualInputState.gate_open ? 1 : 0,
                    this.currentManualInputState.speed,
                    this.currentManualInputState.stop_enabled ? 1 : 0
                ]
            };
            this.ws.send(JSON.stringify(payload));
        }
        
        // NEW: Publish Dual Motor states
        publishMotorCommand() {
            if (!this.wsConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

            const payload = {
                type: 'drilling_motors_cmd',
                data: [this.dualMotorsState.motor1, this.dualMotorsState.motor2]
            };
            this.ws.send(JSON.stringify(payload));
            console.log('[Drilling26View] Sent motor command:', payload);
        }

        publishDrillingMissionCommand() {
            if (!this.wsConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            
            const payload = {
                type: 'drilling_mission_cmd',
                data: [
                    this.drillingMissionState.location,
                    this.drillingMissionState.servo_on,
                    this.drillingMissionState.load_cell_on
                ]
            };

            this.ws.send(JSON.stringify(payload));
            this.lastPublishedMissionState = { ...this.drillingMissionState };
        }

        handleRoverStatus(data) {
            this.currentRoverState = {
                rover_state:    data.rover_state    || 'UNKNOWN',
                active_mission: data.active_mission || ''
            };
            this.updateManualControlUIState();
        }

        handleDrillingStatus(data) {
            const height = parseFloat(data.current_height) || 0.0;
            const weight = parseFloat(data.current_weight) || 0.0;
            if (this.platformDepthDisplay) this.platformDepthDisplay.textContent = height.toFixed(1);
            if (this.sampleWeightDisplay) this.sampleWeightDisplay.textContent = weight.toFixed(0);
        }

        handleFsmState(data) {
            const state = typeof data === 'string' ? data : (data.data || '');
            if (this.fsmStateDisplay) this.fsmStateDisplay.textContent = state;
        }

        // NEW: Map sensor telemetry to DOM
        handleSensorFeedback(data) {
            if (this.currentDisplay && data.current !== undefined) {
                this.currentDisplay.textContent = parseFloat(data.current).toFixed(2);
            }
            if (this.encoderDisplay && data.encoder !== undefined) {
                this.encoderDisplay.textContent = Math.round(data.encoder);
            }
        }

        handleCameraFrame(data) {
            if (!data || !data.data) return;
            const src = `data:image/jpeg;base64,${data.data}`;
            if (this.webcamImageElement) {
                this.webcamImageElement.src = src;
                this.webcamImageElement.style.display = 'block';
            }
            this.hideWebcamStatus();
            if (this.webcamSnapshotButton) this.webcamSnapshotButton.style.display = 'flex';
        }

        stopWebcam() {
            if (this.webcamImageElement) {
                this.webcamImageElement.src = '';
                this.webcamImageElement.style.display = 'none';
            }
            if (this.webcamSnapshotButton) this.webcamSnapshotButton.style.display = 'none';
            this.displayWebcamStatus('Webcam stream paused/stopped.', 'info');
        }

        takeWebcamSnapshot() {
            if (!this.webcamImageElement || !this.webcamImageElement.src) return;
            const link      = document.createElement('a');
            link.href       = this.webcamImageElement.src;
            link.download   = `drilling-snapshot-${Date.now()}.jpg`;
            link.click();
        }

        displayWebcamStatus(message, type = 'info') {
            if (!this.webcamStatusMsgElement) return;
            this.webcamStatusMsgElement.textContent = message;
            this.webcamStatusMsgElement.className   = `drilling-webcam-status-message ${type}`;
            this.webcamStatusMsgElement.style.display = 'block';
        }

        hideWebcamStatus() {
            if (this.webcamStatusMsgElement) this.webcamStatusMsgElement.style.display = 'none';
        }

        render() {
            fetch('./plugins/Drilling-26/Drilling26View.html')
                .then(r => r.text())
                .then(html => {
                    this.element.innerHTML = html;
                    const link  = document.createElement('link');
                    link.rel    = 'stylesheet';
                    link.href   = './plugins/Drilling-26/Drilling26View.css';
                    document.head.appendChild(link);
                    this.initializeUI();
                    this.initWS();
                })
                .catch(err => this.element.innerHTML = `<p style="color:red;">Error loading drilling UI.</p>`);
        }

        initializeUI() {
            this.rosStatusDot            = this.element.querySelector('#drillingRosStatusDot');
            this.rosStatus               = this.element.querySelector('#drillingRosStatus');
            this.fsmStateDisplay         = this.element.querySelector('#drillingFsmState');
            this.platformDepthDisplay    = this.element.querySelector('#drillingPlatformDepth');
            this.sampleWeightDisplay     = this.element.querySelector('#drillingSampleWeight');
            this.platformUpButton        = this.element.querySelector('#drillingPlatformUpButton');
            this.platformDownButton      = this.element.querySelector('#drillingPlatformDownButton');
            this.platformStopButton      = this.element.querySelector('#drillingPlatformStopButton');
            this.speedSlider             = this.element.querySelector('#drillingSpeedSlider');
            this.speedSliderValue        = this.element.querySelector('#drillingSpeedValue');
            this.augerToggleSwitch       = this.element.querySelector('#drillingAugerToggle');
            this.gateToggleSwitch        = this.element.querySelector('#drillingGateToggle');
            this.locationSlider          = this.element.querySelector('#drillingLocationSlider');
            this.locationSliderValue     = this.element.querySelector('#drillingLocationValue');
            this.servoToggleSwitch       = this.element.querySelector('#drillingServoToggle');
            this.loadCellToggleSwitch    = this.element.querySelector('#drillingLoadCellToggle');

            // NEW: Dual Motor & Sensor UI refs
            this.motor1Btns.cw  = this.element.querySelector('#motor1CW');
            this.motor1Btns.off = this.element.querySelector('#motor1OFF');
            this.motor1Btns.ccw = this.element.querySelector('#motor1CCW');
            
            this.motor2Btns.cw  = this.element.querySelector('#motor2CW');
            this.motor2Btns.off = this.element.querySelector('#motor2OFF');
            this.motor2Btns.ccw = this.element.querySelector('#motor2CCW');

            this.currentDisplay = this.element.querySelector('#drillingCurrent');
            this.encoderDisplay = this.element.querySelector('#drillingEncoder');

            const webcamContainer = this.element.querySelector('#drillingWebcamContainer');
            if (webcamContainer) {
                this.webcamImageElement     = webcamContainer.querySelector('#drillingWebcamImage');
                this.webcamSnapshotButton   = webcamContainer.querySelector('#drillingSnapshotButton');
                this.webcamStatusMsgElement = webcamContainer.querySelector('#drillingWebcamStatusMessage');
                if (this.webcamImageElement)    this.webcamImageElement.style.display    = 'none';
                if (this.webcamSnapshotButton)  this.webcamSnapshotButton.style.display  = 'none';
            }

            this.addEventListeners();
            this.updateManualControlUIState();
        }

        addEventListeners() {
            if (this.platformUpButton) {
                this.platformUpButton.addEventListener('click', () => {
                    if (!this.platformUpButton.disabled) {
                        if (this.currentManualInputState.stop_enabled) {
                            this.currentManualInputState.stop_enabled = false;
                            this.platformStopButton.classList.toggle('active', false);
                        }
                        if (this.movementState.currentDirection === 1) {
                            this.movementState.isMoving = false;
                            this.movementState.currentDirection = 0;
                            this.currentManualInputState.direction = 0;
                            this.platformUpButton.classList.toggle('active', false);
                        } else {
                            this.movementState.isMoving = true;
                            this.movementState.currentDirection = 1;
                            this.currentManualInputState.direction = 1;
                            this.platformUpButton.classList.toggle('active', true);
                            this.platformDownButton.classList.toggle('active', false);
                        }
                        this.publishDrillingCommand();
                    }
                });
            }

            if (this.platformDownButton) {
                this.platformDownButton.addEventListener('click', () => {
                    if (!this.platformDownButton.disabled) {
                        if (this.currentManualInputState.stop_enabled) {
                            this.currentManualInputState.stop_enabled = false;
                            this.platformStopButton.classList.toggle('active', false);
                        }
                        if (this.movementState.currentDirection === -1) {
                            this.movementState.isMoving = false;
                            this.movementState.currentDirection = 0;
                            this.currentManualInputState.direction = 0;
                            this.platformDownButton.classList.toggle('active', false);
                        } else {
                            this.movementState.isMoving = true;
                            this.movementState.currentDirection = -1;
                            this.currentManualInputState.direction = -1;
                            this.platformDownButton.classList.toggle('active', true);
                            this.platformUpButton.classList.toggle('active', false);
                        }
                        this.publishDrillingCommand();
                    }
                });
            }

            if (this.platformStopButton) {
                this.platformStopButton.addEventListener('click', () => {
                    if (!this.platformStopButton.disabled) {
                        this.currentManualInputState.stop_enabled = !this.currentManualInputState.stop_enabled;
                        this.platformStopButton.classList.toggle('active', this.currentManualInputState.stop_enabled);
                        
                        if (this.currentManualInputState.stop_enabled) {
                            this.movementState.isMoving = false;
                            this.movementState.currentDirection = 0;
                            this.currentManualInputState.direction = 0;
                            this.platformUpButton.classList.toggle('active', false);
                            this.platformDownButton.classList.toggle('active', false);
                        }
                        this.publishDrillingCommand();
                    }
                });
            }

            if (this.speedSlider) {
                this.speedSlider.addEventListener('input', (e) => {
                    const value = parseFloat(e.target.value);
                    this.currentManualInputState.speed = value;
                    if (this.speedSliderValue) this.speedSliderValue.textContent = value.toFixed(1);
                    this.publishDrillingCommand();
                });
            }

            if (this.augerToggleSwitch) {
                this.augerToggleSwitch.addEventListener('change', () => {
                    this.currentManualInputState.auger_on = this.augerToggleSwitch.checked;
                    this.publishDrillingCommand();
                });
            }

            if (this.gateToggleSwitch) {
                this.gateToggleSwitch.addEventListener('change', () => {
                    this.currentManualInputState.gate_open = this.gateToggleSwitch.checked;
                    this.publishDrillingCommand();
                });
            }

            if (this.locationSlider) {
                this.locationSlider.addEventListener('input', (e) => {
                    const value = parseFloat(e.target.value);
                    this.drillingMissionState.location = value;
                    if (this.locationSliderValue) this.locationSliderValue.textContent = value.toFixed(1);

                    clearTimeout(this.locationSliderDebounceTimer);
                    this.locationSliderDebounceTimer = setTimeout(() => {
                        this.publishDrillingMissionCommand();
                    }, this.LOCATION_DEBOUNCE_MS);
                });
            }

            if (this.servoToggleSwitch) {
                this.servoToggleSwitch.addEventListener('change', () => {
                    this.drillingMissionState.servo_on = this.servoToggleSwitch.checked ? 1 : 0;
                    this.publishDrillingMissionCommand();
                });
            }

            if (this.loadCellToggleSwitch) {
                this.loadCellToggleSwitch.addEventListener('change', () => {
                    this.drillingMissionState.load_cell_on = this.loadCellToggleSwitch.checked ? 1 : 0;
                    this.publishDrillingMissionCommand();
                });
            }

            // NEW: Motor 1 Listeners
            this.bindMotorButtons(this.motor1Btns, 'motor1');
            
            // NEW: Motor 2 Listeners
            this.bindMotorButtons(this.motor2Btns, 'motor2');

            if (this.webcamSnapshotButton) {
                this.webcamSnapshotButton.addEventListener('click', () => this.takeWebcamSnapshot());
            }
        }

        // NEW: Helper method to handle CW/OFF/CCW buttons dynamically
        bindMotorButtons(btns, motorKey) {
            const updateUI = (state) => {
                btns.cw.classList.toggle('active', state === 1);
                btns.off.classList.toggle('active', state === 0);
                btns.ccw.classList.toggle('active', state === 2);
            };

            if (btns.cw) {
                btns.cw.addEventListener('click', () => {
                    this.dualMotorsState[motorKey] = 1;
                    updateUI(1);
                    this.publishMotorCommand();
                });
            }
            if (btns.off) {
                btns.off.addEventListener('click', () => {
                    this.dualMotorsState[motorKey] = 0;
                    updateUI(0);
                    this.publishMotorCommand();
                });
            }
            if (btns.ccw) {
                btns.ccw.addEventListener('click', () => {
                    this.dualMotorsState[motorKey] = 2;
                    updateUI(-1);
                    this.publishMotorCommand();
                });
            }
        }

        updateConnectionStatus(connected) {
            if (this.rosStatusDot) this.rosStatusDot.classList.toggle('connected', connected);
            if (this.rosStatusDot) this.rosStatusDot.classList.toggle('error',     !connected);
            if (this.rosStatus) {
                this.rosStatus.textContent = connected ? 'Connected to ROS' : 'Disconnected';
                this.rosStatus.classList.toggle('connected', connected);
                this.rosStatus.classList.toggle('error',     !connected);
            }
        }

        updateManualControlUIState() {
            const enabled = this.currentRoverState.active_mission && this.currentRoverState.active_mission.trim() !== '';

            [this.platformUpButton, this.platformDownButton, this.platformStopButton].forEach(btn => {
                if (btn) {
                    btn.disabled = !enabled;
                    btn.classList.toggle('disabled-manual-control', !enabled);
                }
            });

            // Handle the dual motors disabling
            Object.values(this.motor1Btns).forEach(btn => { if(btn) btn.disabled = !enabled; });
            Object.values(this.motor2Btns).forEach(btn => { if(btn) btn.disabled = !enabled; });

            if (this.speedSlider) {
                this.speedSlider.disabled = !enabled;
                const sliderContainer = this.speedSlider.closest('.drilling-speed-slider-container');
                if (sliderContainer) sliderContainer.classList.toggle('disabled', !enabled);
            }

            [this.augerToggleSwitch, this.gateToggleSwitch].forEach(sw => {
                if (sw) {
                    sw.disabled = !enabled;
                    const container = sw.closest('.drilling-switch-container');
                    if (container) container.classList.toggle('disabled', !enabled);
                }
            });
        }

        destroy() {
            if (this.reconnectInterval) clearInterval(this.reconnectInterval);
            if (this.locationSliderDebounceTimer) clearTimeout(this.locationSliderDebounceTimer);
            if (this.ws) this.ws.close();

            this.ws = this.openmct = null;
            this.element.innerHTML = '';
        }
    }

    window.Drilling26View = Drilling26View;
})();