//plugins/mission-control/RoverStatusView.js
(function () {
    'use strict';

    function RoverStatusView(element) {
        this.element = element;
        this.ws = null;
        this.reconnectInterval = null;

        this.roverStatus = {
            rover_state:        'UNKNOWN',
            active_mission:     'None',
            supervisor_message: '',
            node_statuses:      [],
            timestamp:          0,
            linear_speed_x:     0.0,
            angular_speed_z:    0.0
        };

        this.render();
        this.initWS();
    }

    // ─── WebSocket ────────────────────────────────────────────────────────────

    RoverStatusView.prototype.initWS = function () {
        if (this.ws && this.ws.readyState !== WebSocket.CLOSED) return;

        this.ws = new WebSocket("ws://localhost:8080");

        this.ws.onopen = () => {
            console.log("RoverStatusView: Connected to WS bridge");
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
                        // Full payload from supervisor — includes node_statuses inside it
                        this.roverStatus.rover_state        = data.rover_state        || 'UNKNOWN';
                        this.roverStatus.active_mission     = data.active_mission     || 'None';
                        this.roverStatus.supervisor_message = data.supervisor_message || '';
                        this.roverStatus.node_statuses      = data.node_statuses      || [];
                        this.roverStatus.timestamp          = data.timestamp          || 0;
                        this.updateDisplay();
                        break;

                    case 'cmd_vel_echo':
                        // Live speed from /cmd_vel — published by joystick or autonomy
                        this.roverStatus.linear_speed_x  = data.linear  ? data.linear.x  : 0.0;
                        this.roverStatus.angular_speed_z = data.angular ? data.angular.z : 0.0;
                        this.updateSpeedDisplays();
                        break;
                }
            } catch (e) {
                console.error("RoverStatusView: Failed to parse message", e);
            }
        };

        this.ws.onclose = () => {
            console.warn("RoverStatusView: Disconnected. Reconnecting in 3s...");
            this.updateConnectionStatus(false);
            this.scheduleReconnect();
        };

        this.ws.onerror = (err) => {
            console.error("RoverStatusView: WebSocket error", err);
            this.ws.close();
        };
    };

    RoverStatusView.prototype.scheduleReconnect = function () {
        if (this.reconnectInterval) return;
        this.reconnectInterval = setInterval(() => {
            console.log("RoverStatusView: Attempting reconnect...");
            this.initWS();
        }, 3000);
    };

    // ─── Render ───────────────────────────────────────────────────────────────

    RoverStatusView.prototype.render = function () {
        this.element.innerHTML = `
            <div class="rover-status-display">
                <div class="status-header">
                    <h2>Rover Status Monitor</h2>
                    <div class="connection-status">
                        <span class="status-indicator" id="ros-status">●</span>
                        <span id="connection-text">Connecting...</span>
                    </div>
                </div>

                <div class="rover-overview">
                    <div class="overview-card">
                        <h3>Rover State</h3>
                        <div class="state-display">
                            <span id="rover-state" class="rover-state unknown">UNKNOWN</span>
                        </div>
                    </div>
                    <div class="overview-card">
                        <h3>Active Mission</h3>
                        <div class="mission-display">
                            <span id="active-mission">None</span>
                        </div>
                    </div>
                    <div class="overview-card">
                        <h3>Last Update</h3>
                        <div class="timestamp-display">
                            <span id="last-update">Never</span>
                        </div>
                    </div>
                    <div class="overview-card">
                        <h3>Linear Speed (X)</h3>
                        <div class="speed-display">
                            <span id="linear-speed-x">0.00</span> m/s
                        </div>
                    </div>
                    <div class="overview-card">
                        <h3>Angular Speed (Z)</h3>
                        <div class="speed-display">
                            <span id="angular-speed-z">0.00</span> rad/s
                        </div>
                    </div>
                </div>

                <div class="supervisor-message">
                    <h3>Supervisor Status</h3>
                    <div id="supervisor-msg" class="supervisor-msg">Waiting for data...</div>
                </div>

                <div class="nodes-section">
                    <h3>Node Status Monitor</h3>
                    <div class="nodes-grid" id="nodes-grid">
                        <div class="no-nodes">No node data available</div>
                    </div>
                </div>
            </div>

            <style>
                .rover-status-display { padding: 20px; font-family: Arial, sans-serif; background-color: #f8f9fa; min-height: 100%; }
                .status-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #ddd; }
                .status-header h2 { margin: 0; color: #333; }
                .connection-status { display: flex; align-items: center; gap: 8px; }
                .status-indicator { font-size: 20px; color: #ff6b6b; }
                .status-indicator.connected { color: #51cf66; }
                .rover-overview { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 20px; margin-bottom: 30px; }
                .overview-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
                .overview-card h3 { margin-top: 0; margin-bottom: 15px; color: #495057; font-size: 16px; }
                .state-display { font-size: 24px; font-weight: bold; }
                .speed-display { font-size: 20px; font-weight: bold; color: #007bff; }
                .rover-state { padding: 8px 16px; border-radius: 20px; text-transform: uppercase; }
                .rover-state.idle            { background-color: #e3f2fd; color: #1565c0; }
                .rover-state.running         { background-color: #e8f5e8; color: #2e7d2e; }
                .rover-state.paused          { background-color: #fff3e0; color: #f57c00; }
                .rover-state.error           { background-color: #ffebee; color: #c62828; }
                .rover-state.emergencystop   { background-color: #ffcdd2; color: #b71c1c; }
                .rover-state.unknown         { background-color: #f5f5f5; color: #757575; }
                .mission-display, .timestamp-display { font-size: 18px; font-weight: 500; color: #333; }
                .supervisor-message { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 30px; }
                .supervisor-message h3 { margin-top: 0; margin-bottom: 10px; color: #495057; }
                .supervisor-msg { padding: 10px; background-color: #f8f9fa; border-left: 4px solid #007bff; border-radius: 4px; font-family: monospace; }
                .nodes-section { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                .nodes-section h3 { margin-top: 0; margin-bottom: 20px; color: #495057; }
                .nodes-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; }
                .node-card { border: 1px solid #dee2e6; border-radius: 6px; padding: 15px; background-color: #fff; }
                .node-card.running           { border-left: 4px solid #28a745; }
                .node-card.stopped,
                .node-card.inactive          { border-left: 4px solid #ffc107; }
                .node-card.error,
                .node-card.failed            { border-left: 4px solid #dc3545; }
                .node-card.unknown           { border-left: 4px solid #6c757d; }
                .node-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
                .node-name { font-weight: bold; font-size: 16px; }
                .node-status { padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
                .node-status.running         { background-color: #d4edda; color: #155724; }
                .node-status.stopped,
                .node-status.inactive        { background-color: #fff3cd; color: #856404; }
                .node-status.error,
                .node-status.failed          { background-color: #f8d7da; color: #721c24; }
                .node-status.unknown         { background-color: #e2e3e5; color: #383d41; }
                .node-details { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 14px; }
                .detail-item { display: flex; justify-content: space-between; }
                .detail-label { color: #6c757d; }
                .detail-value { font-weight: 500; }
                .node-error { margin-top: 10px; padding: 8px; background-color: #f8d7da; color: #721c24; border-radius: 4px; font-size: 12px; font-family: monospace; }
                .no-nodes { text-align: center; color: #6c757d; font-style: italic; padding: 40px; }
            </style>
        `;
    };

    // ─── Display updates ──────────────────────────────────────────────────────

    RoverStatusView.prototype.updateDisplay = function () {
        this.updateRoverState();
        this.updateMissionInfo();
        this.updateTimestamp();
        this.updateSupervisorMessage();
        this.updateSpeedDisplays();
        this.updateNodesDisplay();
    };

    RoverStatusView.prototype.updateRoverState = function () {
        const el = this.element.querySelector('#rover-state');
        if (!el) return;
        const state = this.roverStatus.rover_state || 'UNKNOWN';
        el.textContent = state;
        el.className   = `rover-state ${state.toLowerCase().replace(/_/g, '')}`;
    };

    RoverStatusView.prototype.updateMissionInfo = function () {
        const el = this.element.querySelector('#active-mission');
        if (el) el.textContent = this.roverStatus.active_mission || 'None';
    };

    RoverStatusView.prototype.updateTimestamp = function () {
        const el = this.element.querySelector('#last-update');
        if (!el) return;
        const ts = this.roverStatus.timestamp;
        el.textContent = (ts && ts > 0)
            ? new Date(ts * 1000).toLocaleTimeString()
            : 'Never';
    };

    RoverStatusView.prototype.updateSupervisorMessage = function () {
        const el = this.element.querySelector('#supervisor-msg');
        if (el) el.textContent = this.roverStatus.supervisor_message || 'No message';
    };

    RoverStatusView.prototype.updateSpeedDisplays = function () {
        const lx = this.element.querySelector('#linear-speed-x');
        const az = this.element.querySelector('#angular-speed-z');
        if (lx) lx.textContent = (this.roverStatus.linear_speed_x  || 0).toFixed(2);
        if (az) az.textContent = (this.roverStatus.angular_speed_z || 0).toFixed(2);
    };

    RoverStatusView.prototype.updateNodesDisplay = function () {
        const grid = this.element.querySelector('#nodes-grid');
        if (!grid) return;

        const nodes = this.roverStatus.node_statuses || [];
        if (nodes.length === 0) {
            grid.innerHTML = '<div class="no-nodes">No node data available</div>';
            return;
        }

        grid.innerHTML = nodes.map(node => {
            const statusClass = (node.status || 'unknown').toLowerCase().replace(/_/g, '');
            const cpu         = node.cpu_usage    != null ? node.cpu_usage.toFixed(1)    : '0.0';
            const mem         = node.memory_usage != null ? node.memory_usage.toFixed(1) : '0.0';
            const pid         = node.pid && node.pid > 0  ? node.pid                     : 'N/A';

            return `
                <div class="node-card ${statusClass}">
                    <div class="node-header">
                        <span class="node-name">${node.node_name || 'Unknown'}</span>
                        <span class="node-status ${statusClass}">${node.status || 'UNKNOWN'}</span>
                    </div>
                    <div class="node-details">
                        <div class="detail-item">
                            <span class="detail-label">CPU:</span>
                            <span class="detail-value">${cpu}%</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Memory:</span>
                            <span class="detail-value">${mem} MB</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">PID:</span>
                            <span class="detail-value">${pid}</span>
                        </div>
                    </div>
                    ${node.last_error ? `<div class="node-error">Error: ${node.last_error}</div>` : ''}
                </div>
            `;
        }).join('');
    };

    RoverStatusView.prototype.updateConnectionStatus = function (connected) {
        const indicator = this.element.querySelector('.status-indicator');
        const text      = this.element.querySelector('#connection-text');
        if (indicator) indicator.classList.toggle('connected', connected);
        if (text)      text.textContent = connected ? 'Connected to ROS' : 'Disconnected';
    };

    // ─── Destroy ──────────────────────────────────────────────────────────────

    RoverStatusView.prototype.destroy = function () {
        if (this.reconnectInterval) clearInterval(this.reconnectInterval);
        if (this.ws) this.ws.close();
        this.element.innerHTML = '';
        console.log('RoverStatusView destroyed');
    };

    window.RoverStatusView = RoverStatusView;

})();