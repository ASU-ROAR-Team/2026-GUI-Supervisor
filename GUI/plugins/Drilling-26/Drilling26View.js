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

            // Camera Host & Selection State
            this.cameraHost = window.location.hostname || "localhost";
            this.selectedCamNum = "10"; // Default to Cam 5 (Arm/Tool)

            // Camera Control DOM refs
            this.camSelectElement        = null;
            this.colorSelectElement      = null;
            this.brightnessSlider        = null;
            this.contrastSlider          = null;
            this.presetStandardBtn       = null;
            this.presetSunBtn            = null;
            this.presetNightBtn          = null;
            this.snapshotBtn             = null;
            this.saveDiskBtn             = null;

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

        startDirectCameraStream() {
            if (!this.webcamImageElement) return;
            const camNum = this.selectedCamNum || '10';
            const streamUrl = `http://${this.cameraHost}:9090/api/stream/${camNum}`;
            const fallbackUrl = `http://${this.cameraHost}:9090/api/frame/${camNum}`;

            this.webcamImageElement.src = `${streamUrl}?t=${Date.now()}`;
            this.webcamImageElement.style.display = 'block';
            this.hideWebcamStatus();

            this.webcamImageElement.onerror = () => {
                this.webcamImageElement.onerror = null;
                this.webcamImageElement.src = `${fallbackUrl}?t=${Date.now()}`;
            };
        }

        async fetchActiveCameras() {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1500);
                const res = await fetch(`http://${this.cameraHost}:9090/api/cameras`, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (!res.ok) return;
                const data = await res.json();
                if (data.cameras && data.cameras.length > 0 && this.camSelectElement) {
                    this.camSelectElement.innerHTML = '';
                    data.cameras.forEach(cam => {
                        const opt = document.createElement('option');
                        opt.value = cam.cam_num;
                        opt.textContent = `📷 ${cam.name} (${cam.device})`;
                        if (cam.cam_num === "10" || cam.cam_num === 10) opt.selected = true;
                        this.camSelectElement.appendChild(opt);
                    });
                    if (this.camSelectElement.value) {
                        this.selectedCamNum = this.camSelectElement.value;
                    }
                }
                this.startDirectCameraStream();
            } catch (e) {
                console.log("[Drilling26View] Could not fetch dynamic camera list, using defaults.");
                this.startDirectCameraStream();
            }
        }

        updateCameraControl() {
            const camNum = this.selectedCamNum || '10';
            const colorVal = this.colorSelectElement ? this.colorSelectElement.value : 'gray';
            const bVal = this.brightnessSlider ? this.brightnessSlider.value : 50;
            const cVal = this.contrastSlider ? this.contrastSlider.value : 50;

            fetch(`http://${this.cameraHost}:9090/api/control?cam=${camNum}&color=${colorVal}&brightness=${bVal}&contrast=${cVal}`)
                .catch(e => console.error("Error updating camera control:", e));
        }

        applyCameraPreset(presetName) {
            fetch(`http://${this.cameraHost}:9090/api/control?preset=${presetName}`)
                .then(r => r.json())
                .then(d => {
                    if (d.config) {
                        if (this.brightnessSlider) this.brightnessSlider.value = d.config.brightness;
                        if (this.contrastSlider) this.contrastSlider.value = d.config.contrast;
                    }
                })
                .catch(e => console.error("Error applying preset:", e));
        }

        handleCameraFrame(data) {
            if (!data || !data.data) return;
            const src = `data:image/jpeg;base64,${data.data}`;
            if (this.webcamImageElement) {
                this.webcamImageElement.src = src;
                this.webcamImageElement.style.display = 'block';
            }
            this.hideWebcamStatus();
        }

        stopWebcam() {
            if (this.webcamImageElement) {
                this.webcamImageElement.src = '';
                this.webcamImageElement.style.display = 'none';
            }
            this.displayWebcamStatus('Webcam stream paused/stopped.', 'info');
        }

        takeWebcamSnapshot() {
            const camNum = this.selectedCamNum || '10';
            const camName = this.camSelectElement && this.camSelectElement.options[this.camSelectElement.selectedIndex]
                ? this.camSelectElement.options[this.camSelectElement.selectedIndex].textContent
                : `Camera ${camNum}`;

            this.showToast(`📸 Capturing snapshot from ${camName}...`);
            const frameUrl = `http://${this.cameraHost}:9090/api/frame/${camNum}?t=${Date.now()}`;
            
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || 640;
                canvas.height = img.naturalHeight || 480;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                // Add watermark
                ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
                ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
                ctx.fillStyle = '#38bdf8';
                ctx.font = 'bold 16px system-ui, sans-serif';
                ctx.fillText(`📷 DRILLING VIEW: ${camName}`, 15, canvas.height - 14);

                const nowStr = new Date().toLocaleString();
                ctx.fillStyle = '#94a3b8';
                ctx.font = '12px system-ui, sans-serif';
                ctx.fillText(nowStr, canvas.width - 200, canvas.height - 14);

                const link = document.createElement('a');
                link.download = `drilling-cam-${camNum}-${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                this.showToast(`✅ Snapshot saved to browser downloads!`);
            };
            img.onerror = () => this.showToast(`⚠️ Could not capture snapshot frame`);
            img.src = frameUrl;
        }

        async saveToDiskFolder() {
            const camNum = this.selectedCamNum || '10';
            const folderPath = '/home/carol/2026-GUI-Supervisor/snapshots';
            this.showToast(`💾 Saving snapshot from Cam ${camNum} to disk...`);
            try {
                const res = await fetch(`http://${this.cameraHost}:9090/api/save_snapshot?cam=${camNum}&folder=${encodeURIComponent(folderPath)}`);
                const data = await res.json();
                if (data.status === 'ok') {
                    this.showToast(`✅ Saved image to ${folderPath}!`);
                } else {
                    this.showToast(`⚠️ Failed to save image to disk`);
                }
            } catch (e) {
                this.showToast(`❌ Error saving image to disk`);
            }
        }

        showToast(msg) {
            if (window.showCamToast) {
                window.showCamToast(msg);
            } else {
                console.log("[DrillingToast]", msg);
            }
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
                this.webcamStatusMsgElement = webcamContainer.querySelector('#drillingWebcamStatusMessage');
                
                this.camSelectElement       = webcamContainer.querySelector('#drillingCamSelect');
                this.colorSelectElement     = webcamContainer.querySelector('#drillingColorSelect');
                this.brightnessSlider       = webcamContainer.querySelector('#drillingBrightnessSlider');
                this.contrastSlider         = webcamContainer.querySelector('#drillingContrastSlider');
                this.presetStandardBtn      = webcamContainer.querySelector('#drillingPresetStandard');
                this.presetSunBtn           = webcamContainer.querySelector('#drillingPresetSun');
                this.presetNightBtn         = webcamContainer.querySelector('#drillingPresetNight');
                this.snapshotBtn            = webcamContainer.querySelector('#drillingSnapshotBtn');
                this.saveDiskBtn            = webcamContainer.querySelector('#drillingSaveDiskBtn');
            }

            this.addEventListeners();
            this.updateManualControlUIState();
            this.fetchActiveCameras();
        }

        addEventListeners() {
            if (this.camSelectElement) {
                this.camSelectElement.addEventListener('change', (e) => {
                    this.selectedCamNum = e.target.value;
                    this.startDirectCameraStream();
                    this.updateCameraControl();
                });
            }

            if (this.colorSelectElement) {
                this.colorSelectElement.addEventListener('change', () => this.updateCameraControl());
            }

            if (this.brightnessSlider) {
                this.brightnessSlider.addEventListener('change', () => this.updateCameraControl());
            }

            if (this.contrastSlider) {
                this.contrastSlider.addEventListener('change', () => this.updateCameraControl());
            }

            if (this.presetStandardBtn) {
                this.presetStandardBtn.addEventListener('click', () => this.applyCameraPreset('standard'));
            }

            if (this.presetSunBtn) {
                this.presetSunBtn.addEventListener('click', () => this.applyCameraPreset('outdoor_sun'));
            }

            if (this.presetNightBtn) {
                this.presetNightBtn.addEventListener('click', () => this.applyCameraPreset('low_light'));
            }

            if (this.snapshotBtn) {
                this.snapshotBtn.addEventListener('click', () => this.takeWebcamSnapshot());
            }

            if (this.saveDiskBtn) {
                this.saveDiskBtn.addEventListener('click', () => this.saveToDiskFolder());
            }

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