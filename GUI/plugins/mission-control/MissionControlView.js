// plugins/mission-control/MissionControlView.js
(function () {
    'use strict';

    function MissionControlView(element) {
        this.element = element;
        this.ws = null;
        this.reconnectInterval = null;

        this.currentState  = 'IDLE';
        this.activeMission = 'None';
        this.isProcessing  = false;

        this.missions = ['Navigation', 'Sampling', 'Maintenance', 'Drilling', 'Teleoperation'];

        this.render();
        this.initWS();
    }

    // ─── WebSocket ────────────────────────────────────────────────────────────

    MissionControlView.prototype.initWS = function () {
        if (this.ws && this.ws.readyState !== WebSocket.CLOSED) return;

        this.ws = new WebSocket("ws://localhost:8080");

        this.ws.onopen = () => {
            console.log("MissionControlView: Connected to WS bridge");
            this.updateConnectionStatus(true);
            if (this.reconnectInterval) {
                clearInterval(this.reconnectInterval);
                this.reconnectInterval = null;
            }
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);

                if (msg.type === "rover_status") {
                    const data = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;
                    this.updateRoverStatus(data);
                }
            } catch (e) {
                console.error("MissionControlView: Failed to parse message", e);
            }
        };

        this.ws.onclose = () => {
            console.warn("MissionControlView: Disconnected. Reconnecting in 3s...");
            this.updateConnectionStatus(false);
            this.scheduleReconnect();
        };

        this.ws.onerror = (err) => {
            console.error("MissionControlView: WebSocket error", err);
            this.ws.close();
        };
    };

    MissionControlView.prototype.scheduleReconnect = function () {
        if (this.reconnectInterval) return;
        this.reconnectInterval = setInterval(() => {
            console.log("MissionControlView: Attempting reconnect...");
            this.initWS();
        }, 3000);
    };

    MissionControlView.prototype.sendCommand = function (requestType, missionName) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.addMessage('Not connected to bridge.', 'error');
            return;
        }

        this.isProcessing = true;
        this.updateButtonStates();
        this.addMessage(
            `Sending ${requestType.toUpperCase()} request${missionName ? ' for mission: ' + missionName : ''}...`,
            'info'
        );

        this.ws.send(JSON.stringify({
            type: "mission_cmd",
            command: requestType,
            mission: missionName || ''
        }));

        // The bridge doesn't send back a service response over WS,
        // so we resolve "processing" after a short grace period and
        // wait for the next rover_status broadcast to reflect the change.
        setTimeout(() => {
            this.isProcessing = false;
            this.updateButtonStates();
        }, 1000);
    };

    // ─── Render ───────────────────────────────────────────────────────────────

    MissionControlView.prototype.render = function () {
        this.element.innerHTML = `
            <div class="mission-control-panel">
                <div class="mission-control-header">
                    <h2>Mission Control Panel</h2>
                    <div class="connection-status">
                        <span class="status-indicator" id="ros-status">●</span>
                        <span id="connection-text">Connecting...</span>
                    </div>
                </div>

                <div class="mission-selection">
                    <label for="mission-select">Select Mission:</label>
                    <select id="mission-select" class="mission-dropdown">
                        ${this.missions.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>
                </div>

                <div class="control-buttons">
                    <button id="start-btn" class="control-button start-button">
                        <span class="button-icon">▶</span> START
                    </button>
                    <button id="stop-btn" class="control-button stop-button">
                        <span class="button-icon">⏹</span> STOP
                    </button>
                    <button id="reset-btn" class="control-button reset-button">
                        <span class="button-icon">↻</span> RESET
                    </button>
                </div>

                <div class="status-display">
                    <div class="status-item">
                        <label>Current State:</label>
                        <span id="rover-state" class="status-value">IDLE</span>
                    </div>
                    <div class="status-item">
                        <label>Active Mission:</label>
                        <span id="active-mission" class="status-value">None</span>
                    </div>
                </div>

                <div class="message-display">
                    <div id="message-area" class="message-area"></div>
                </div>
            </div>

            <style>
                .mission-control-panel { padding: 20px; font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; }
                .mission-control-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #ddd; padding-bottom: 10px; }
                .mission-control-header h2 { margin: 0; color: #333; }
                .connection-status { display: flex; align-items: center; gap: 8px; }
                .status-indicator { font-size: 20px; color: #ff6b6b; }
                .status-indicator.connected { color: #51cf66; }
                .mission-selection { margin-bottom: 20px; }
                .mission-selection label { display: block; margin-bottom: 5px; font-weight: bold; }
                .mission-dropdown { width: 100%; padding: 10px; font-size: 16px; border: 2px solid #ddd; border-radius: 5px; }
                .control-buttons { display: flex; gap: 15px; margin-bottom: 20px; justify-content: center; }
                .control-button { padding: 12px 24px; font-size: 16px; font-weight: bold; border: none; border-radius: 5px; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; gap: 8px; min-width: 100px; justify-content: center; }
                .start-button  { background-color: #51cf66; color: white; }
                .start-button:hover:not(:disabled)  { background-color: #40c057; }
                .stop-button   { background-color: #ff6b6b; color: white; }
                .stop-button:hover:not(:disabled)   { background-color: #ff5252; }
                .reset-button  { background-color: #ffd43b; color: #333; }
                .reset-button:hover:not(:disabled)  { background-color: #fcc419; }
                .control-button:disabled { opacity: 0.6; cursor: not-allowed; }
                .control-button.processing { opacity: 0.7; }
                .button-icon { font-size: 14px; }
                .status-display { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
                .status-item { display: flex; justify-content: space-between; margin-bottom: 10px; }
                .status-item:last-child { margin-bottom: 0; }
                .status-item label { font-weight: bold; }
                .status-value { padding: 4px 8px; background-color: white; border-radius: 3px; border: 1px solid #ddd; }
                .message-area { background-color: #f1f3f4; border: 1px solid #ddd; border-radius: 5px; padding: 10px; min-height: 100px; max-height: 200px; overflow-y: auto; font-family: monospace; font-size: 14px; }
                .message { margin-bottom: 5px; padding: 5px; border-radius: 3px; }
                .message.success { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
                .message.error   { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
                .message.info    { background-color: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
            </style>
        `;

        this.attachEventListeners();
        this.updateButtonStates();
    };

    // ─── Event Listeners ─────────────────────────────────────────────────────

    MissionControlView.prototype.attachEventListeners = function () {
        this.element.querySelector('#start-btn').addEventListener('click', () => {
            const mission = this.element.querySelector('#mission-select').value;
            this.sendCommand('start', mission);
        });

        this.element.querySelector('#stop-btn').addEventListener('click', () => {
            this.sendCommand('stop', '');
        });

        this.element.querySelector('#reset-btn').addEventListener('click', () => {
            this.sendCommand('reset', '');
        });
    };

    // ─── Status Updates ───────────────────────────────────────────────────────

    MissionControlView.prototype.updateRoverStatus = function (statusMessage) {
        this.currentState  = statusMessage.rover_state    || 'UNKNOWN';
        this.activeMission = statusMessage.active_mission || 'None';
        this.updateStatusDisplay();
    };

    MissionControlView.prototype.updateStatusDisplay = function () {
        const stateEl   = this.element.querySelector('#rover-state');
        const missionEl = this.element.querySelector('#active-mission');

        if (stateEl) {
            stateEl.textContent = this.currentState;
            stateEl.className   = `status-value state-${this.currentState.toLowerCase()}`;
        }
        if (missionEl) {
            missionEl.textContent = this.activeMission;
        }

        this.updateButtonStates();
    };

    MissionControlView.prototype.updateButtonStates = function () {
        const startBtn = this.element.querySelector('#start-btn');
        const stopBtn  = this.element.querySelector('#stop-btn');
        const resetBtn = this.element.querySelector('#reset-btn');
        if (!startBtn || !stopBtn || !resetBtn) return;

        [startBtn, stopBtn, resetBtn].forEach(b => b.classList.remove('processing'));

        if (this.isProcessing) {
            [startBtn, stopBtn, resetBtn].forEach(b => { b.classList.add('processing'); b.disabled = true; });
            return;
        }

        // STOP is always enabled — safety critical, never disable it
        stopBtn.disabled = false;

        switch (this.currentState) {
            case 'IDLE':
                startBtn.disabled = false; resetBtn.disabled = false; break;
            case 'RUNNING':
                startBtn.disabled = true;  resetBtn.disabled = false; break;
            case 'ERROR':
            case 'EMERGENCY_STOP':
                startBtn.disabled = true;  resetBtn.disabled = false; break;
            case 'PAUSED':
                startBtn.disabled = false; resetBtn.disabled = false; break;
            default:
                startBtn.disabled = false; resetBtn.disabled = false;
        }
    };

    MissionControlView.prototype.updateConnectionStatus = function (connected) {
        const indicator = this.element.querySelector('.status-indicator');
        const text      = this.element.querySelector('#connection-text');
        if (indicator) indicator.classList.toggle('connected', connected);
        if (text)      text.textContent = connected ? 'Connected to ROS' : 'Disconnected';
        this.updateButtonStates();
    };

    MissionControlView.prototype.addMessage = function (message, type = 'info') {
        const area = this.element.querySelector('#message-area');
        if (!area) return;

        const el = document.createElement('div');
        el.className = `message ${type}`;
        el.innerHTML = `<strong>[${new Date().toLocaleTimeString()}]</strong> ${message}`;
        area.appendChild(el);
        area.scrollTop = area.scrollHeight;

        const all = area.querySelectorAll('.message');
        if (all.length > 50) area.removeChild(all[0]);
    };

    // ─── Destroy ──────────────────────────────────────────────────────────────

    MissionControlView.prototype.destroy = function () {
        if (this.reconnectInterval) clearInterval(this.reconnectInterval);
        if (this.ws) this.ws.close();
        console.log('MissionControlView destroyed');
    };

    window.MissionControlView = MissionControlView;

})();