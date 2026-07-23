// plugins/Drilling-Control/DrillingControlView.js
(function () {
    class DrillingControlView {
        constructor(element, openmct) {
            this.element  = element;
            this.openmct  = openmct;

            // WebSocket
            this.ws               = null;
            this.reconnectInterval = null;
            this.wsConnected      = false;

            // Rover / drilling state
            this.currentRoverState = { rover_state: 'IDLE', active_mission: '' };
            this.last_known_height = 0.0;

            // UPDATED: Manual control state with speed and gate
            this.currentManualInputState = {
                direction: 0,       // -1 (down), 0 (idle), 1 (up)
                auger_on: false,
                gate_open: false,   // 0 (closed) or 1 (open)
                speed: 0.0,         // 0 to 20 m/s
                stop_enabled: false
            };

            // NEW: Track movement state for toggle behavior (not momentary)
            this.movementState = {
                isMoving: false,    // true if Up or Down is actively engaged
                currentDirection: 0 // -1, 0, or 1
            };

            // UPDATED: Drilling mission state (single combined topic)
            this.drillingMissionState = {
                location: 0.0,      // -25 to 35 cm
                servo_on: 0,        // 0 or 1
                load_cell_on: 0     // 0 or 1
            };

            // Track last published mission state to avoid redundant sends
            this.lastPublishedMissionState = {
                location: 0.0,
                servo_on: 0,
                load_cell_on: 0
            };

            // Debounce timer for location slider rapid updates
            this.locationSliderDebounceTimer = null;
            this.LOCATION_DEBOUNCE_MS = 150;

            // DOM refs — populated in initializeUI()
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

            // UPDATED: Drilling mission UI refs
            this.locationSlider          = null;
            this.locationSliderValue     = null;
            this.servoToggleSwitch       = null;
            this.loadCellToggleSwitch    = null;
        }

        // ─── WebSocket ──────────────────────────────────────────────────────

        initWS() {
            if (this.ws && this.ws.readyState !== WebSocket.CLOSED) return;

            this.ws = new WebSocket("ws://localhost:8080");

            this.ws.onopen = () => {
                console.log("[DrillingControlView] Connected to WS bridge");
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
                        case 'rover_status':
                            this.handleRoverStatus(data);
                            break;
                        case 'drilling_status':
                            this.handleDrillingStatus(data);
                            break;
                        case 'drilling_fsm_state':
                            this.handleFsmState(data);
                            break;
                        case 'camera_frame':
                            this.handleCameraFrame(data);
                            break;
                    }
                } catch (e) {
                    console.error("[DrillingControlView] Failed to parse message", e);
                }
            };

            this.ws.onclose = () => {
                console.warn("[DrillingControlView] Disconnected. Reconnecting in 3s...");
                this.wsConnected = false;
                this.updateConnectionStatus(false);
                this.stopWebcam();
                this.scheduleReconnect();
            };

            this.ws.onerror = (err) => {
                console.error("[DrillingControlView] WebSocket error", err);
                this.ws.close();
            };
        }

        scheduleReconnect() {
            if (this.reconnectInterval) return;
            this.reconnectInterval = setInterval(() => {
                console.log("[DrillingControlView] Attempting reconnect...");
                this.initWS();
            }, 3000);
        }

        // ─── Publish drilling command over WS ───────────────────────────────
        // UPDATED: Now sends Float64MultiArray [direction, auger, speed, stop]

        publishDrillingCommand() {
            // Allow manual controls during any active mission (teleoperation, drilling, etc.)
            if (!this.currentRoverState.active_mission || this.currentRoverState.active_mission.trim() === '') {
                console.warn('No active mission. Command not sent.');
                if (this.openmct && this.openmct.notifications) {
                    this.openmct.notifications.warn('Manual controls require an active mission.');
                }
                return;
            }

            if (!this.wsConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
                console.warn('[DrillingControlView] WS not connected. Command not sent.');
                return;
            }

            // Payload: [direction, auger, gate, speed, stop]
            const payload = {
                type: 'drilling_cmd',
                data: [
                    this.currentManualInputState.direction,  // -1 (down), 0 (idle), 1 (up)
                    this.currentManualInputState.auger_on ? 1 : 0,
                    this.currentManualInputState.gate_open ? 1 : 0,
                    this.currentManualInputState.speed,
                    this.currentManualInputState.stop_enabled ? 1 : 0
                ]
            };

            this.ws.send(JSON.stringify(payload));
            console.log('[DrillingControlView] Sent drilling command:', payload);
        }

        // UPDATED: Publish drilling mission commands (combined into single topic)
        // Sends [location, servo, load_cell] as Float64MultiArray

        publishDrillingMissionCommand() {
            if (!this.wsConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
                console.warn('[DrillingControlView] WS not connected. Mission command not sent.');
                return;
            }

            // Check if state has actually changed
            const stateChanged = 
                this.drillingMissionState.location !== this.lastPublishedMissionState.location ||
                this.drillingMissionState.servo_on !== this.lastPublishedMissionState.servo_on ||
                this.drillingMissionState.load_cell_on !== this.lastPublishedMissionState.load_cell_on;

            if (!stateChanged) {
                console.log('[DrillingControlView] Mission state unchanged, skipping publish');
                return;
            }

            const payload = {
                type: 'drilling_mission_cmd',
                data: [
                    this.drillingMissionState.location,     // -25 to 35 cm
                    this.drillingMissionState.servo_on,     // 0 or 1
                    this.drillingMissionState.load_cell_on  // 0 or 1
                ]
            };

            this.ws.send(JSON.stringify(payload));
            
            // Update last published state
            this.lastPublishedMissionState = {
                location: this.drillingMissionState.location,
                servo_on: this.drillingMissionState.servo_on,
                load_cell_on: this.drillingMissionState.load_cell_on
            };

            console.log('[DrillingControlView] Sent drilling mission command:', payload);
        }

        // ─── Inbound message handlers ───────────────────────────────────────

        handleRoverStatus(data) {
            this.currentRoverState = {
                rover_state:    data.rover_state    || 'UNKNOWN',
                active_mission: data.active_mission || ''
            };
            this.updateManualControlUIState();
        }

        handleDrillingStatus(data) {
            // Expects { current_height: float, current_weight: float }
            const height = parseFloat(data.current_height) || 0.0;
            const weight = parseFloat(data.current_weight) || 0.0;
            this.last_known_height = height;

            if (this.platformDepthDisplay) {
                this.platformDepthDisplay.textContent = height.toFixed(1);
            }
            if (this.sampleWeightDisplay) {
                this.sampleWeightDisplay.textContent = weight.toFixed(0);
            }
        }

        handleFsmState(data) {
            // Expects { data: "STATE_STRING" }  (std_msgs/String equivalent)
            const state = typeof data === 'string' ? data : (data.data || '');
            if (this.fsmStateDisplay) {
                this.fsmStateDisplay.textContent = state;
            }
        }

        handleCameraFrame(data) {
            // Expects { data: "<base64 jpeg>" }
            if (!data || !data.data) return;
            const src = `data:image/jpeg;base64,${data.data}`;
            if (this.webcamImageElement) {
                this.webcamImageElement.src          = src;
                this.webcamImageElement.style.display = 'block';
            }
            this.hideWebcamStatus();
            if (this.webcamSnapshotButton) {
                this.webcamSnapshotButton.style.display = 'flex';
            }
        }

        // ─── Webcam helpers ─────────────────────────────────────────────────

        stopWebcam() {
            if (this.webcamImageElement) {
                this.webcamImageElement.src           = '';
                this.webcamImageElement.style.display = 'none';
            }
            if (this.webcamSnapshotButton) {
                this.webcamSnapshotButton.style.display = 'none';
            }
            this.displayWebcamStatus('Webcam stream paused/stopped.', 'info');
        }

        takeWebcamSnapshot() {
            if (!this.webcamImageElement || !this.webcamImageElement.src) {
                if (this.openmct && this.openmct.notifications) {
                    this.openmct.notifications.warn('Webcam feed not available.');
                }
                return;
            }
            const link      = document.createElement('a');
            link.href       = this.webcamImageElement.src;
            link.download   = `drilling-snapshot-${Date.now()}.jpg`;
            link.click();

            if (this.openmct && this.openmct.notifications) {
                this.openmct.notifications.info('Snapshot captured!');
            }
        }

        displayWebcamStatus(message, type = 'info') {
            if (!this.webcamStatusMsgElement) return;
            this.webcamStatusMsgElement.textContent = message;
            this.webcamStatusMsgElement.className   = `drilling-webcam-status-message ${type}`;
            this.webcamStatusMsgElement.style.display = 'block';
        }

        hideWebcamStatus() {
            if (!this.webcamStatusMsgElement) return;
            this.webcamStatusMsgElement.style.display = 'none';
        }

        // ─── Render ─────────────────────────────────────────────────────────

        render() {
            fetch('./plugins/Drilling-Control/DrillingControlView.html')
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    return response.text();
                })
                .then(html => {
                    this.element.innerHTML = html;

                    const link  = document.createElement('link');
                    link.rel    = 'stylesheet';
                    link.href   = './plugins/Drilling-Control/DrillingControlView.css';
                    document.head.appendChild(link);

                    this.initializeUI();
                    this.initWS();

                    if (this.openmct && this.openmct.editor) {
                        this.openmct.editor.on('isEditing', this.handleEditModeChange);
                    }
                })
                .catch(error => {
                    console.error('Error loading DrillingControlView.html:', error);
                    this.element.innerHTML = `<p style="color:red;">Error loading drilling control UI.</p>`;
                });
        }

        // ─── UI init ────────────────────────────────────────────────────────

        initializeUI() {
            this.rosStatusDot         = this.element.querySelector('#drillingRosStatusDot');
            this.rosStatus            = this.element.querySelector('#drillingRosStatus');
            this.fsmStateDisplay      = this.element.querySelector('#drillingFsmState');
            this.platformDepthDisplay = this.element.querySelector('#drillingPlatformDepth');
            this.sampleWeightDisplay  = this.element.querySelector('#drillingSampleWeight');
            this.platformUpButton     = this.element.querySelector('#drillingPlatformUpButton');
            this.platformDownButton   = this.element.querySelector('#drillingPlatformDownButton');
            this.platformStopButton   = this.element.querySelector('#drillingPlatformStopButton');
            this.speedSlider          = this.element.querySelector('#drillingSpeedSlider');
            this.speedSliderValue     = this.element.querySelector('#drillingSpeedValue');
            this.augerToggleSwitch    = this.element.querySelector('#drillingAugerToggle');
            this.gateToggleSwitch     = this.element.querySelector('#drillingGateToggle');

            // UPDATED: Drilling mission UI refs
            this.locationSlider       = this.element.querySelector('#drillingLocationSlider');
            this.locationSliderValue  = this.element.querySelector('#drillingLocationValue');
            this.servoToggleSwitch    = this.element.querySelector('#drillingServoToggle');
            this.loadCellToggleSwitch = this.element.querySelector('#drillingLoadCellToggle');

            const webcamContainer = this.element.querySelector('#drillingWebcamContainer');
            if (webcamContainer) {
                this.webcamImageElement     = webcamContainer.querySelector('#drillingWebcamImage');
                this.webcamSnapshotButton   = webcamContainer.querySelector('#drillingSnapshotButton');
                this.webcamStatusMsgElement = webcamContainer.querySelector('#drillingWebcamStatusMessage');

                if (this.webcamImageElement)    this.webcamImageElement.style.display    = 'none';
                if (this.webcamSnapshotButton)  this.webcamSnapshotButton.style.display  = 'none';
                this.displayWebcamStatus('Waiting for WS connection...', 'info');
            }

            this.addEventListeners();
            this.updateManualControlUIState();
        }

        addEventListeners() {
            // UPDATED: Manual control buttons with TOGGLE behavior (not momentary)
            // Press Up → keeps moving up until Down or Stop pressed
            // Press Down → keeps moving down until Up or Stop pressed
            
            if (this.platformUpButton) {
                this.platformUpButton.addEventListener('click', () => {
                    if (!this.platformUpButton.disabled) {
                        // If Stop is enabled, disable it first
                        if (this.currentManualInputState.stop_enabled) {
                            this.currentManualInputState.stop_enabled = false;
                            this.platformStopButton.classList.toggle('active', false);
                        }
                        
                        // Toggle up movement
                        if (this.movementState.currentDirection === 1) {
                            // Already moving up, toggle it off
                            this.movementState.isMoving = false;
                            this.movementState.currentDirection = 0;
                            this.currentManualInputState.direction = 0;
                            this.platformUpButton.classList.toggle('active', false);
                            this.platformDownButton.classList.toggle('active', false);
                        } else {
                            // Start moving up (cancel down if it was active)
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
                        // If Stop is enabled, disable it first
                        if (this.currentManualInputState.stop_enabled) {
                            this.currentManualInputState.stop_enabled = false;
                            this.platformStopButton.classList.toggle('active', false);
                        }
                        
                        // Toggle down movement
                        if (this.movementState.currentDirection === -1) {
                            // Already moving down, toggle it off
                            this.movementState.isMoving = false;
                            this.movementState.currentDirection = 0;
                            this.currentManualInputState.direction = 0;
                            this.platformDownButton.classList.toggle('active', false);
                            this.platformUpButton.classList.toggle('active', false);
                        } else {
                            // Start moving down (cancel up if it was active)
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

            // NEW: Stop button toggle
            if (this.platformStopButton) {
                this.platformStopButton.addEventListener('click', () => {
                    if (!this.platformStopButton.disabled) {
                        // Toggle stop state
                        this.currentManualInputState.stop_enabled = !this.currentManualInputState.stop_enabled;
                        this.platformStopButton.classList.toggle('active', this.currentManualInputState.stop_enabled);
                        
                        // When stop is enabled, zero out movement
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

            // NEW: Speed slider listener (0-20 m/s, 0.5 step)
            if (this.speedSlider) {
                this.speedSlider.addEventListener('input', (e) => {
                    const value = parseFloat(e.target.value);
                    this.currentManualInputState.speed = value;
                    if (this.speedSliderValue) {
                        this.speedSliderValue.textContent = value.toFixed(1);
                    }
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

            // UPDATED: Location slider with debounce
            if (this.locationSlider) {
                this.locationSlider.addEventListener('input', (e) => {
                    const value = parseFloat(e.target.value);
                    this.drillingMissionState.location = value;
                    if (this.locationSliderValue) {
                        this.locationSliderValue.textContent = value.toFixed(1);
                    }

                    // Debounce the publish
                    clearTimeout(this.locationSliderDebounceTimer);
                    this.locationSliderDebounceTimer = setTimeout(() => {
                        this.publishDrillingMissionCommand();
                    }, this.LOCATION_DEBOUNCE_MS);
                });
            }

            // UPDATED: Servo toggle
            if (this.servoToggleSwitch) {
                this.servoToggleSwitch.addEventListener('change', () => {
                    this.drillingMissionState.servo_on = this.servoToggleSwitch.checked ? 1 : 0;
                    this.publishDrillingMissionCommand();
                });
            }

            // UPDATED: Load cell toggle
            if (this.loadCellToggleSwitch) {
                this.loadCellToggleSwitch.addEventListener('change', () => {
                    this.drillingMissionState.load_cell_on = this.loadCellToggleSwitch.checked ? 1 : 0;
                    this.publishDrillingMissionCommand();
                });
            }

            if (this.webcamSnapshotButton) {
                this.webcamSnapshotButton.addEventListener('click',      () => this.takeWebcamSnapshot());
                this.webcamSnapshotButton.addEventListener('mousedown',  () => {
                    this.webcamSnapshotButton.style.transform  = 'translateX(-50%) scale(0.95)';
                    this.webcamSnapshotButton.style.boxShadow  = '0 2px 4px rgba(0,0,0,0.2)';
                });
                this.webcamSnapshotButton.addEventListener('mouseup',    () => {
                    this.webcamSnapshotButton.style.transform  = 'translateX(-50%) scale(1)';
                    this.webcamSnapshotButton.style.boxShadow  = '0 4px 8px rgba(0,0,0,0.3)';
                });
                this.webcamSnapshotButton.addEventListener('mouseleave', () => {
                    this.webcamSnapshotButton.style.transform  = 'translateX(-50%) scale(1)';
                    this.webcamSnapshotButton.style.boxShadow  = '0 4px 8px rgba(0,0,0,0.3)';
                });
            }
        }

        handleEditModeChange = (isEditing) => {
            if (isEditing) {
                this.stopWebcam();
                this.displayWebcamStatus('Webcam: In edit mode. Stream paused.', 'info');
            }
            // Stream resumes automatically when new frames arrive after edit mode exits
        };

        // ─── UI state ───────────────────────────────────────────────────────

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
            // Enable manual controls if there's any active mission (not just teleoperation)
            const enabled = this.currentRoverState.active_mission && this.currentRoverState.active_mission.trim() !== '';

            [this.platformUpButton, this.platformDownButton, this.platformStopButton].forEach(btn => {
                if (!btn) return;
                btn.disabled = !enabled;
                btn.classList.toggle('disabled-manual-control', !enabled);
            });

            if (this.speedSlider) {
                this.speedSlider.disabled = !enabled;
                const sliderContainer = this.speedSlider.closest('.drilling-speed-slider-container');
                if (sliderContainer) sliderContainer.classList.toggle('disabled', !enabled);
            }

            [this.augerToggleSwitch, this.gateToggleSwitch].forEach(sw => {
                if (!sw) return;
                sw.disabled = !enabled;
                const container = sw.closest('.drilling-switch-container');
                if (container) container.classList.toggle('disabled', !enabled);
            });

            const note = this.element.querySelector('.drilling-control-section p');
            if (note) {
                if (enabled) {
                    note.textContent  = `These controls are active in ${this.currentRoverState.active_mission} mode.`;
                    note.style.color  = '#666';
                } else {
                    note.textContent  = `Manual controls disabled. No active mission.`;
                    note.style.color  = '#e74c3c';
                }
            }
        }

        // ─── Destroy ────────────────────────────────────────────────────────

        destroy() {
            console.log('[DrillingControlView] Destroying...');

            // Reset movement state to stop any ongoing movement
            this.movementState.isMoving = false;
            this.movementState.currentDirection = 0;
            this.currentManualInputState.direction = 0;

            if (this.reconnectInterval) clearInterval(this.reconnectInterval);
            if (this.locationSliderDebounceTimer) clearTimeout(this.locationSliderDebounceTimer);
            if (this.ws) this.ws.close();

            if (this.openmct && this.openmct.editor) {
                this.openmct.editor.off('isEditing', this.handleEditModeChange);
            }

            // Null out all refs
            this.ws = this.ros = this.openmct = null;
            this.platformUpButton = this.platformDownButton = this.platformStopButton = null;
            this.speedSlider = this.speedSliderValue = null;
            this.augerToggleSwitch = this.gateToggleSwitch = null;
            this.webcamImageElement = this.webcamStatusMsgElement = this.webcamSnapshotButton = null;
            this.rosStatusDot = this.rosStatus = this.fsmStateDisplay = null;
            this.platformDepthDisplay = this.sampleWeightDisplay = null;
            this.locationSlider = this.locationSliderValue = null;
            this.servoToggleSwitch = this.loadCellToggleSwitch = null;
            this.currentRoverState = null;
            this.movementState = null;

            this.element.innerHTML = '';
        }
    }

    window.DrillingControlView = DrillingControlView;
})();