(function () {
    class Joystick26View {
        constructor(element, openmct) {
            this.element = element;
            this.openmct = openmct;

            this.canvas         = null;
            this.ctx            = null;
            this.joystickRadius = 0;
            this.thumbRadius    = 18;
            this.joystickCenterX = 0;
            this.joystickCenterY = 0;
            this.thumbX         = 0;
            this.thumbY         = 0;
            this.isDragging     = false;

            // DOM refs
            this.linearSpeedSlider     = null;
            this.angularSpeedSlider    = null;
            this.linearSpeedValueSpan  = null;
            this.angularSpeedValueSpan = null;
            this.joystickStatus        = null;
            this.joystickControlMsg    = null;
            this.telemetryLinearVel    = null;
            this.telemetryAngularVel   = null;

            // WebSocket
            this.ws                = null;
            this.reconnectInterval = null;
            this.wsConnected       = false;

            // Rover state (requires active mission to unlock, just like drilling)
            this.currentRoverState = { rover_state: 'IDLE', active_mission: '' };

            this.onMouseDown      = this.onMouseDown.bind(this);
            this.onMouseMove      = this.onMouseMove.bind(this);
            this.onMouseUp        = this.onMouseUp.bind(this);
            this.updateSpeedValues = this.updateSpeedValues.bind(this);
        }

        render() {
            fetch('./plugins/joystick-26/Joystick26View.html')
                .then(r => r.text())
                .then(html => {
                    this.element.innerHTML = html;
                    const link  = document.createElement('link');
                    link.rel    = 'stylesheet';
                    link.href   = './plugins/joystick-26/Joystick26View.css';
                    document.head.appendChild(link);
                    
                    this.initializeUI();
                    this.initWS();
                })
                .catch(err => {
                    console.error('[Joystick26View] Failed to load HTML:', err);
                    this.element.innerHTML = '<p style="color:red;">Error loading joystick UI.</p>';
                });
        }

        initWS() {
            if (this.ws && this.ws.readyState !== WebSocket.CLOSED) return;

            const wsHost = window.location.hostname || "localhost";
            this.ws = new WebSocket(`ws://${wsHost}:8080`);

            this.ws.onopen = () => {
                this.wsConnected = true;
                if (this.reconnectInterval) {
                    clearInterval(this.reconnectInterval);
                    this.reconnectInterval = null;
                }
                this.updateJoystickUIState();
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg  = JSON.parse(event.data);
                    const data = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;

                    if (msg.type === 'rover_status') {
                        this.currentRoverState = {
                            rover_state:    data.rover_state    || 'UNKNOWN',
                            active_mission: data.active_mission || ''
                        };
                        this.updateJoystickUIState();
                    } else if (msg.type === 'cmd_vel_echo') {
                        // Real-time feedback loop matching cmd_vel output
                        if (this.telemetryLinearVel && data.linear) {
                            this.telemetryLinearVel.textContent = parseFloat(data.linear.x || 0).toFixed(2);
                        }
                        if (this.telemetryAngularVel && data.angular) {
                            this.telemetryAngularVel.textContent = parseFloat(data.angular.z || 0).toFixed(2);
                        }
                    }
                } catch (e) {
                    console.error('[Joystick26View] Failed to parse message', e);
                }
            };

            this.ws.onclose = () => {
                this.wsConnected = false;
                this.updateJoystickUIState();
                this.scheduleReconnect();
            };

            this.ws.onerror = () => this.ws.close();
        }

        scheduleReconnect() {
            if (this.reconnectInterval) return;
            this.reconnectInterval = setInterval(() => this.initWS(), 3000);
        }

    publishTwist(normalizedX, normalizedY) {
    if (!this.wsConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const hasMission = this.currentRoverState.active_mission && this.currentRoverState.active_mission.trim() !== '';
    if (!hasMission) {
        console.warn('[Joystick26View] Warning: No active mission/supervisor. Publishing twist in fallback mode.');
    }

    const maxLinear  = parseFloat(this.linearSpeedSlider?.value  ?? 1.0);
    const maxAngular = parseFloat(this.angularSpeedSlider?.value ?? 0.5);
    
    // Read rover dimensions from GUI parameters
    const width  = parseFloat(this.roverWidthInput?.value  ?? 0.5); // Track width (distance between wheels)

    const v = normalizedY * maxLinear;       // Linear velocity (m/s)
    const omega = -normalizedX * maxAngular; // Angular velocity (rad/s)

    // Differential steering kinematic model
    const vRight = v + (omega * width / 2.0);
    const vLeft  = v - (omega * width / 2.0);

    // Send both /cmd_vel and the explicit wheel velocities over the WebSocket
    this.ws.send(JSON.stringify({
        type: 'rover_wheel_vel_cmd', // New message type for individual wheel speeds
        data: [vRight, vLeft]         // [right_wheel_vel, left_wheel_vel]
    }));

    // Optionally keep sending standard Twist if navigation stack expects it
    this.ws.send(JSON.stringify({
        type: 'cmd_vel',
        data: {
            linear:  { x: v, y: 0.0, z: 0.0 },
            angular: { x: 0.0, y: 0.0, z: omega }
        }
    }));
}

        initializeUI() {
            this.canvas             = this.element.querySelector('#joystickCanvas');
            this.ctx                = this.canvas.getContext('2d');
            this.linearSpeedSlider     = this.element.querySelector('#linearSpeed');
            this.angularSpeedSlider    = this.element.querySelector('#angularSpeed');
            this.linearSpeedValueSpan  = this.element.querySelector('#linearSpeedValue');
            this.angularSpeedValueSpan = this.element.querySelector('#angularSpeedValue');
            this.joystickStatus        = this.element.querySelector('#joystickStatus');
            this.joystickControlMsg    = this.element.querySelector('#joystickControlMessage');
            this.telemetryLinearVel    = this.element.querySelector('#telemetryLinearVel');
            this.telemetryAngularVel   = this.element.querySelector('#telemetryAngularVel');
            this.roverLengthInput = this.element.querySelector('#roverLength');
            this.roverWidthInput  = this.element.querySelector('#roverWidth');

            const wrapper      = this.canvas.parentElement;
            this.canvas.width  = wrapper.clientWidth;
            this.canvas.height = wrapper.clientHeight;
            this.joystickRadius = Math.min(this.canvas.width, this.canvas.height) / 2 - 10;
            this.joystickCenterX = this.canvas.width  / 2;
            this.joystickCenterY = this.canvas.height / 2;
            this.thumbX        = this.joystickCenterX;
            this.thumbY        = this.joystickCenterY;

            this.drawJoystick();
            this.addEventListeners();
            this.updateSpeedValues();
            this.updateJoystickUIState();
        }

        addEventListeners() {
            this.canvas.addEventListener('mousedown', this.onMouseDown);
            document.addEventListener('mousemove',    this.onMouseMove);
            document.addEventListener('mouseup',      this.onMouseUp);

            this.canvas.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.onMouseDown(e.touches[0]);
            }, { passive: false });
            document.addEventListener('touchmove', (e) => {
                e.preventDefault();
                this.onMouseMove(e.touches[0]);
            }, { passive: false });
            document.addEventListener('touchend',    this.onMouseUp);

            this.linearSpeedSlider?.addEventListener('input',  this.updateSpeedValues);
            this.angularSpeedSlider?.addEventListener('input', this.updateSpeedValues);
        }

        removeEventListeners() {
            if (this.canvas) this.canvas.removeEventListener('mousedown', this.onMouseDown);
            document.removeEventListener('mousemove',    this.onMouseMove);
            document.removeEventListener('mouseup',      this.onMouseUp);
            document.removeEventListener('touchend',     this.onMouseUp);
        }

        onMouseDown(event) {
            const hasMission = this.currentRoverState.active_mission && this.currentRoverState.active_mission.trim() !== '';
            if (!hasMission) {
                console.warn('[Joystick26View] Warning: Driving joystick without active mission/supervisor (fallback mode).');
            }

            this.isDragging        = true;
            this.canvas.style.cursor = 'grabbing';
            this.updateThumbPosition(event);
        }

        onMouseMove(event) {
            if (!this.isDragging) return;
            this.updateThumbPosition(event);
        }

        onMouseUp() {
            if (!this.isDragging) return;
            this.isDragging          = false;
            this.canvas.style.cursor = 'grab';
            this.thumbX              = this.joystickCenterX;
            this.thumbY              = this.joystickCenterY;
            this.drawJoystick();
            this.publishTwist(0, 0);
        }

        updateThumbPosition(event) {
            const rect = this.canvas.getBoundingClientRect();
            let dx     = event.clientX - rect.left  - this.joystickCenterX;
            let dy     = event.clientY - rect.top   - this.joystickCenterY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > this.joystickRadius) {
                const angle = Math.atan2(dy, dx);
                this.thumbX = this.joystickCenterX + this.joystickRadius * Math.cos(angle);
                this.thumbY = this.joystickCenterY + this.joystickRadius * Math.sin(angle);
            } else {
                this.thumbX = event.clientX - rect.left;
                this.thumbY = event.clientY - rect.top;
            }

            this.drawJoystick();

            const normX =  (this.thumbX - this.joystickCenterX) / this.joystickRadius;
            const normY = -(this.thumbY - this.joystickCenterY) / this.joystickRadius;
            this.publishTwist(normX, normY);
        }

        drawJoystick() {
            if (!this.ctx) return;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            // Base circle
            this.ctx.beginPath();
            this.ctx.arc(this.joystickCenterX, this.joystickCenterY, this.joystickRadius, 0, Math.PI * 2);
            this.ctx.strokeStyle = '#666';
            this.ctx.lineWidth   = 3;
            this.ctx.stroke();
            this.ctx.fillStyle   = 'rgba(0,0,0,0.2)';
            this.ctx.fill();

            // Thumb
            const hasMission = this.currentRoverState.active_mission && this.currentRoverState.active_mission.trim() !== '';
            this.ctx.beginPath();
            this.ctx.arc(this.thumbX, this.thumbY, this.thumbRadius, 0, Math.PI * 2);
            this.ctx.fillStyle   = hasMission ? '#4CAF50' : '#ff9800';
            this.ctx.strokeStyle = hasMission ? '#388E3C' : '#f57c00';
            this.ctx.fill();
            this.ctx.lineWidth   = 2;
            this.ctx.stroke();
        }

        updateSpeedValues() {
            if (this.linearSpeedValueSpan && this.linearSpeedSlider) {
                this.linearSpeedValueSpan.textContent = parseFloat(this.linearSpeedSlider.value).toFixed(1);
            }
            if (this.angularSpeedValueSpan && this.angularSpeedSlider) {
                this.angularSpeedValueSpan.textContent = parseFloat(this.angularSpeedSlider.value).toFixed(1);
            }
        }

        updateJoystickUIState() {
            const hasMission = this.currentRoverState.active_mission && this.currentRoverState.active_mission.trim() !== '';
            const isActive   = this.wsConnected;

            this.drawJoystick();

            if (this.joystickStatus) {
                if (!this.wsConnected) {
                    this.joystickStatus.textContent = 'Disconnected';
                    this.joystickStatus.className   = 'joystick-status error';
                } else if (hasMission) {
                    this.joystickStatus.textContent = `Active (${this.currentRoverState.active_mission})`;
                    this.joystickStatus.className   = 'joystick-status connected';
                } else {
                    this.joystickStatus.textContent = 'Active — Fallback Mode (No Supervisor)';
                    this.joystickStatus.className   = 'joystick-status connected';
                }
            }

            if (this.linearSpeedSlider)  this.linearSpeedSlider.disabled  = !isActive;
            if (this.angularSpeedSlider) this.angularSpeedSlider.disabled = !isActive;

            if (this.joystickControlMsg) {
                this.joystickControlMsg.textContent = isActive
                    ? (hasMission ? 'Use joystick to drive.' : 'Use joystick to drive (Supervisor Warning: No active mission).')
                    : 'Joystick controls disconnected.';
            }
        }

        destroy() {
            this.removeEventListeners();
            if (this.reconnectInterval) clearInterval(this.reconnectInterval);
            if (this.ws) {
                this.publishTwist(0, 0);
                this.ws.close();
            }
            this.element.innerHTML = '';
        }
    }

    window.Joystick26View = Joystick26View;
})();