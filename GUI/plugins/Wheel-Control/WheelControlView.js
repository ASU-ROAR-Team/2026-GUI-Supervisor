// src/plugins/Wheel-Control/WheelControlView.js
(function () {
    'use strict';

    class WheelControlView {
        constructor(container, openmct, wsUrl = `ws://${window.location.hostname || 'localhost'}:8080`) {
            this.container = container;
            this.openmct   = openmct;
            this.wsUrl     = wsUrl;

            // State
            this.rightPWM = 0;
            this.leftPWM  = 0;

            // WebSocket
            this.ws = null;
            this.reconnectInterval = null;
        }

        initWS() {
            if (this.ws && this.ws.readyState !== WebSocket.CLOSED) return;

            this.ws = new WebSocket(this.wsUrl);

            this.ws.onopen = () => {
                console.log("[WheelControlView] Connected to WS bridge");
                this.updateConnectionStatus(true);
                if (this.reconnectInterval) {
                    clearInterval(this.reconnectInterval);
                    this.reconnectInterval = null;
                }
            };

            this.ws.onclose = () => {
                console.warn("[WheelControlView] Disconnected. Reconnecting in 3s...");
                this.updateConnectionStatus(false);
                this.scheduleReconnect();
            };

            this.ws.onerror = (err) => {
                console.error("[WheelControlView] WebSocket error", err);
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

            // Format matches Python expectation: [right, left]
            const data = [this.rightPWM, this.leftPWM];
            this.ws.send(JSON.stringify({
                type: 'wheel_duty',
                data: data
            }));
        }

        render() {
            this.container.innerHTML = this.getHTML();
            this.statusElement = this.container.querySelector("#wheelStatus");
            this.statusDot     = this.container.querySelector(".status-dot");

            this.bindElements();
            this.initWS();
        }

        getHTML() {
            return `
            <style>
                .wheel-control-container {
                    padding: 20px;
                    font-family: 'Inter', sans-serif;
                    color: #333;
                    background-color: #f9fafb;
                    border-radius: 12px;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    max-width: 600px;
                    margin: 20px auto;
                }
                .section-header { font-size: 1.5rem; font-weight: 700; margin-bottom: 15px; color: #1a202c; }
                .status-bar { display: flex; align-items: center; gap: 10px; padding: 10px 15px; background: #fff; border-radius: 8px; margin-bottom: 20px; font-weight: bold; }
                .status-dot { width: 12px; height: 12px; border-radius: 50%; background-color: #ccc; }
                .status-dot.connected { background-color: #4caf50; }
                .controls-grid { display: grid; gap: 20px; }
                .wheel-control-card { background: #fff; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
                .slider-container { display: flex; align-items: center; gap: 15px; margin-top: 10px; }
                input[type="range"] { flex-grow: 1; -webkit-appearance: none; height: 8px; background: #e0e0e0; border-radius: 4px; outline: none; }
                input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; background: #4a90e2; border-radius: 50%; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                .val-display { width: 50px; text-align: right; font-weight: bold; font-family: monospace; font-size: 1.1rem; }
                .stop-btn { width: 100%; background: #e74c3c; color: white; padding: 12px; border: none; border-radius: 8px; font-weight: bold; font-size: 1.1rem; cursor: pointer; margin-top: 20px; transition: background 0.2s; }
                .stop-btn:hover { background: #c0392b; }
            </style>

            <div class="wheel-control-container">
                <h2 class="section-header">Direct Wheel Control</h2>
                
                <div class="status-bar">
                    <div class="status-dot"></div>
                    <div id="wheelStatus">Connecting...</div>
                </div>

                <div class="controls-grid">
                    <div class="wheel-control-card">
                        <label><strong>Left Wheels PWM</strong></label>
                        <div class="slider-container">
                            <span>-100</span>
                            <input type="range" id="left_slider" min="-100" max="100" value="0" step="1">
                            <span>100</span>
                            <span class="val-display" id="left_display">0</span>
                        </div>
                    </div>

                    <div class="wheel-control-card">
                        <label><strong>Right Wheels PWM</strong></label>
                        <div class="slider-container">
                            <span>-100</span>
                            <input type="range" id="right_slider" min="-100" max="100" value="0" step="1">
                            <span>100</span>
                            <span class="val-display" id="right_display">0</span>
                        </div>
                    </div>
                </div>

                <button id="stopButton" class="stop-btn">🛑 EMERGENCY STOP</button>
            </div>
            `;
        }

        updateConnectionStatus(connected) {
            if (this.statusDot) this.statusDot.classList.toggle('connected', connected);
            if (this.statusElement) {
                this.statusElement.innerText = connected ? 'WS: Connected' : 'WS: Disconnected';
            }
        }

        bindElements() {
            const leftSlider = this.container.querySelector('#left_slider');
            const rightSlider = this.container.querySelector('#right_slider');
            const leftDisplay = this.container.querySelector('#left_display');
            const rightDisplay = this.container.querySelector('#right_display');
            const stopBtn = this.container.querySelector('#stopButton');

            leftSlider.oninput = () => {
                this.leftPWM = parseFloat(leftSlider.value);
                leftDisplay.innerText = this.leftPWM;
                this.sendUpdate();
            };

            rightSlider.oninput = () => {
                this.rightPWM = parseFloat(rightSlider.value);
                rightDisplay.innerText = this.rightPWM;
                this.sendUpdate();
            };

            stopBtn.onclick = () => {
                this.leftPWM = 0;
                this.rightPWM = 0;
                leftSlider.value = 0;
                rightSlider.value = 0;
                leftDisplay.innerText = "0";
                rightDisplay.innerText = "0";
                this.sendUpdate();
            };
        }

        destroy() {
            if (this.reconnectInterval) clearInterval(this.reconnectInterval);
            if (this.ws) this.ws.close();
        }
    }

    window.WheelControlView = WheelControlView;

})();