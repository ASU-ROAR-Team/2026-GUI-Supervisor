// plugins/display/SlamVisualizerPlugin.js
(function () {
    'use strict';

    const SLAM_VISUALIZER_KEY = 'slam-visualizer';

    window.SlamVisualizerPlugin = function SlamVisualizerPlugin() {
        return function install(openmct) {
            openmct.types.addType(SLAM_VISUALIZER_KEY, {
                name: 'SLAM Live Dashboard',
                description: 'Live 8-panel dashboard for the ROAR SLAM test.',
                creatable: true,
                cssClass: 'icon-line-graph',
                initialize(domainObject) {
                    domainObject.name = domainObject.name || 'SLAM Live Dashboard';
                }
            });

            openmct.objectViews.addProvider({
                key: 'slam-visualizer-view',
                name: 'SLAM Live Dashboard View',
                canView: (domainObject) => domainObject.type === SLAM_VISUALIZER_KEY,
                view: (domainObject) => {
                    let component = null;
                    return {
                        show(element) {
                            component = new SlamVisualizerComponent(element, openmct);
                            component.render();
                        },
                        destroy() {
                            if (component) {
                                component.destroy();
                                component = null;
                            }
                        }
                    };
                }
            });
        };
    };

    class SlamVisualizerComponent {
        constructor(parentElement, openmct) {
            this.parentElement = parentElement;
            this.openmct = openmct;

            this.ws = null;
            this.reconnectInterval = null;

            // Live state
            this.filterPath = [];
            this.gtPath = [];
            this.errorHist = [];
            this.timeHist = [];
            this.covHist = [];
            this.arucoEvents = [];

            this.fx = 0.0; this.fy = 0.0; this.fz = 0.0;
            this.roll = 0.0; this.pitch = 0.0; this.yaw = 0.0;
            this.gx = 0.0; this.gy = 0.0;
            this.cov = new Array(36).fill(0.0);
            this.diag = [0, 0, 0, 0, 1.0, 1.0]; // [received, applied, zupt, cov_tr, kQ, kV]
            this.occGrid = null;

            this.t0 = null;
            this.historyLen = 1500;

            // Static waypoint overlays matching default scenario
            this.waypoints = [
                { id: 0, x: 15.1159, y: -3.0854 },
                { id: 1, x: 6.8073, y: 10.3746 },
                { id: 2, x: 25.2349, y: 2.0235 },
                { id: 3, x: 17.9612, y: 2.8924 }
            ];
            this.startXY = { x: 0.0, y: 0.0 };

            this.animationFrameId = null;
        }

        render() {
            this.parentElement.innerHTML = `
                <div class="slam-dashboard">
                    <div class="slam-grid">
                        <div class="slam-panel col-2 row-2" id="panel-path">
                            <div class="panel-header">2D Path — Filter vs GT</div>
                            <canvas id="canvas-path"></canvas>
                        </div>
                        <div class="slam-panel col-1 row-2" id="panel-3d">
                            <div class="panel-header">Rover Orientation</div>
                            <canvas id="canvas-3d"></canvas>
                        </div>
                        <div class="slam-panel col-1 row-2" id="panel-readout">
                            <div class="panel-header">Readout</div>
                            <div class="readout-content" id="readout-text">Waiting for telemetry...</div>
                        </div>
                        <div class="slam-panel col-2 row-1" id="panel-error">
                            <div class="panel-header">Position error vs GT</div>
                            <canvas id="canvas-error"></canvas>
                        </div>
                        <div class="slam-panel col-2 row-1" id="panel-aruco">
                            <div class="panel-header">ArUco Detections Timeline</div>
                            <canvas id="canvas-aruco"></canvas>
                        </div>
                        <div class="slam-panel col-2 row-1" id="panel-map">
                            <div class="panel-header">Occupancy Map</div>
                            <canvas id="canvas-map"></canvas>
                        </div>
                        <div class="slam-panel col-1 row-1" id="panel-fis">
                            <div class="panel-header">FIS Scaling</div>
                            <canvas id="canvas-fis"></canvas>
                        </div>
                        <div class="slam-panel col-1 row-1" id="panel-scoreboard">
                            <div class="panel-header">Localization Health</div>
                            <div class="scoreboard-content" id="scoreboard-text">Waiting for diagnostics...</div>
                        </div>
                    </div>
                </div>
                <style>
                    .slam-dashboard {
                        width: 100%;
                        height: 100%;
                        background-color: #0d0d1a;
                        color: #ffffff;
                        font-family: 'Courier New', Courier, monospace;
                        box-sizing: border-box;
                        padding: 10px;
                        overflow-y: auto;
                    }
                    .slam-grid {
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        grid-gap: 15px;
                        width: 100%;
                        height: auto;
                    }
                    .slam-panel {
                        background-color: #1a1a2e;
                        border: 1px solid #2e2e4f;
                        border-radius: 6px;
                        display: flex;
                        flex-direction: column;
                        min-height: 220px;
                        position: relative;
                        padding: 10px;
                    }
                    .col-2 { grid-column: span 2; }
                    .row-2 { grid-row: span 2; min-height: 450px; }
                    .panel-header {
                        font-size: 13px;
                        font-weight: bold;
                        color: #ffffff;
                        margin-bottom: 8px;
                        border-bottom: 1px solid #2e2e4f;
                        padding-bottom: 4px;
                    }
                    .slam-panel canvas {
                        flex-grow: 1;
                        width: 100%;
                        height: 100%;
                        background-color: #1a1a2e;
                    }
                    .readout-content, .scoreboard-content {
                        flex-grow: 1;
                        font-size: 11px;
                        line-height: 1.5;
                        white-space: pre-wrap;
                        color: #3498db;
                        overflow-y: auto;
                    }
                </style>
            `;

            this.initWS();
            this.startAnimationLoop();
        }

        initWS() {
            if (this.ws && this.ws.readyState !== WebSocket.CLOSED) return;

            const wsHost = (window.getRoarHost ? window.getRoarHost() : window.location.hostname) || 'localhost';
            this.ws = new WebSocket(`ws://${(window.getRoarHost ? window.getRoarHost() : window.location.hostname) || 'localhost'}:9091`);

            this.ws.onopen = () => {
                console.log('[SlamVisualizerPlugin] Connected to WebSocket bridge');
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    const data = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;

                    switch (msg.type) {
                        case 'robot_pose':
                            this.handleRobotPose(data);
                            break;
                        case 'ground_truth_pose':
                            this.handleGTPose(data);
                            break;
                        case 'aruco_detections':
                            this.handleArucoDetections(data);
                            break;
                        case 'ieskf_diagnostics':
                            this.handleDiagnostics(data);
                            break;
                        case 'active_map_occupancy':
                            this.handleOccupancy(data);
                            break;
                    }
                } catch (e) {
                    console.error('[SlamVisualizerPlugin] WS handling error:', e);
                }
            };

            this.ws.onclose = () => {
                this.scheduleReconnect();
            };

            this.ws.onerror = () => {
                this.ws.close();
            };
        }

        scheduleReconnect() {
            if (this.reconnectInterval) return;
            this.reconnectInterval = setInterval(() => {
                this.initWS();
            }, 3000);
        }

        handleRobotPose(data) {
            const p = data.pose.pose.position;
            const q = data.pose.pose.orientation;
            this.fx = p.x;
            this.fy = p.y;
            this.fz = p.z;

            // Quaternion to Roll, Pitch, Yaw
            const x = q.x, y = q.y, z = q.z, w = q.w;
            this.roll = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)) * 180 / Math.PI;
            this.pitch = Math.asin(Math.max(-1.0, Math.min(1.0, 2 * (w * y - z * x)))) * 180 / Math.PI;
            this.yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)) * 180 / Math.PI;

            if (data.pose.covariance) {
                this.cov = data.pose.covariance;
            }

            const t = Date.now() * 1e-3;
            if (this.t0 === null) this.t0 = t;
            const tRel = t - this.t0;

            const err = Math.hypot(p.x - this.gx, p.y - this.gy);

            this.filterPath.push({ x: p.x, y: p.y });
            this.gtPath.push({ x: this.gx, y: this.gy });
            this.covHist.push([...this.cov]);
            this.errorHist.push(err);
            this.timeHist.push(tRel);

            if (this.filterPath.length > this.historyLen) {
                this.filterPath.shift();
                this.gtPath.shift();
                this.covHist.shift();
                this.errorHist.shift();
                this.timeHist.shift();
            }
        }

        handleGTPose(data) {
            const p = data.pose.pose.position;
            this.gx = p.x;
            this.gy = p.y;
        }

        handleArucoDetections(data) {
            const t = Date.now() * 1e-3;
            const tRel = this.t0 === null ? 0.0 : (t - this.t0);
            if (data.detections) {
                data.detections.forEach(d => {
                    this.arucoEvents.push({ t: tRel, id: d.id });
                });
            }
            if (this.arucoEvents.length > 5000) {
                this.arucoEvents.shift();
            }
        }

        handleDiagnostics(data) {
            if (data.data && data.data.length >= 6) {
                this.diag = data.data.slice(0, 6);
            }
        }

        handleOccupancy(data) {
            this.occGrid = data;
        }

        startAnimationLoop() {
            const loop = () => {
                this.drawDashboard();
                this.animationFrameId = requestAnimationFrame(loop);
            };
            this.animationFrameId = requestAnimationFrame(loop);
        }

        drawDashboard() {
            this.draw2DPath();
            this.drawOrientation();
            this.drawErrorPlot();
            this.drawArucoTimeline();
            this.drawFisBars();
            this.drawOccupancyGrid();
            this.updateTextReadout();
            this.updateScoreboard();
        }

        draw2DPath() {
            const canvas = document.getElementById('canvas-path');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width = canvas.clientWidth;
            const h = canvas.height = canvas.clientHeight;

            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, w, h);

            let minX = -10, maxX = 30, minY = -10, maxY = 20;
            const allPoints = [...this.waypoints, ...this.filterPath, ...this.gtPath];
            if (allPoints.length > 0) {
                const xs = allPoints.map(p => p.x);
                const ys = allPoints.map(p => p.y);
                minX = Math.min(...xs) - 5;
                maxX = Math.max(...xs) + 5;
                minY = Math.min(...ys) - 5;
                maxY = Math.max(...ys) + 5;
            }

            const scaleX = w / (maxX - minX);
            const scaleY = h / (maxY - minY);
            const scale = Math.min(scaleX, scaleY) * 0.9;

            const toPixel = (x, y) => {
                const px = w / 2 + (x - (minX + maxX) / 2) * scale;
                const py = h / 2 - (y - (minY + maxY) / 2) * scale;
                return { x: px, y: py };
            };

            ctx.strokeStyle = '#2e2e4f';
            ctx.lineWidth = 1;
            for (let x = Math.floor(minX); x <= Math.ceil(maxX); x += 5) {
                const p1 = toPixel(x, minY);
                const p2 = toPixel(x, maxY);
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
            for (let y = Math.floor(minY); y <= Math.ceil(maxY); y += 5) {
                const p1 = toPixel(minX, y);
                const p2 = toPixel(maxX, y);
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }

            const startP = toPixel(this.startXY.x, this.startXY.y);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(startP.x, startP.y, 6, 0, 2 * Math.PI);
            ctx.fill();

            this.waypoints.forEach(wp => {
                const wpP = toPixel(wp.x, wp.y);
                ctx.fillStyle = '#f1c40f';
                ctx.beginPath();
                ctx.arc(wpP.x, wpP.y, 5, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillStyle = '#f1c40f';
                ctx.font = '9px monospace';
                ctx.fillText(`WP${wp.id}`, wpP.x + 8, wpP.y - 4);
            });

            if (this.filterPath.length > 1) {
                ctx.strokeStyle = '#3498db';
                ctx.lineWidth = 2;
                ctx.beginPath();
                const start = toPixel(this.filterPath[0].x, this.filterPath[0].y);
                ctx.moveTo(start.x, start.y);
                for (let i = 1; i < this.filterPath.length; i++) {
                    const pt = toPixel(this.filterPath[i].x, this.filterPath[i].y);
                    ctx.lineTo(pt.x, pt.y);
                }
                ctx.stroke();
            }

            if (this.gtPath.length > 1) {
                ctx.strokeStyle = '#2ecc71';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                const start = toPixel(this.gtPath[0].x, this.gtPath[0].y);
                ctx.moveTo(start.x, start.y);
                for (let i = 1; i < this.gtPath.length; i++) {
                    const pt = toPixel(this.gtPath[i].x, this.gtPath[i].y);
                    ctx.lineTo(pt.x, pt.y);
                }
                ctx.stroke();
                ctx.setLineDash([]);
            }

            if (this.filterPath.length > 0) {
                const currF = toPixel(this.fx, this.fy);
                ctx.fillStyle = '#3498db';
                ctx.beginPath();
                ctx.arc(currF.x, currF.y, 6, 0, 2 * Math.PI);
                ctx.fill();
            }
            if (this.gtPath.length > 0) {
                const currG = toPixel(this.gx, this.gy);
                ctx.fillStyle = '#2ecc71';
                ctx.fillRect(currG.x - 5, currG.y - 5, 10, 10);
            }

            if (this.cov && this.cov.length >= 36) {
                const xx = this.cov[0];
                const xy = this.cov[1];
                const yy = this.cov[7];

                const trace = xx + yy;
                const det = xx * yy - xy * xy;
                const diff = xx - yy;
                const term = Math.sqrt(diff * diff + 4 * xy * xy);
                const lambda1 = (trace + term) / 2;
                const lambda2 = (trace - term) / 2;

                const r1 = 3.0 * Math.sqrt(Math.max(0, lambda1));
                const r2 = 3.0 * Math.sqrt(Math.max(0, lambda2));

                const angle = 0.5 * Math.atan2(2 * xy, diff);

                ctx.save();
                const currF = toPixel(this.fx, this.fy);
                ctx.translate(currF.x, currF.y);
                ctx.rotate(-angle);
                ctx.strokeStyle = '#e74c3c';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([2, 2]);
                ctx.beginPath();
                ctx.ellipse(0, 0, r1 * scale, r2 * scale, 0, 0, 2 * Math.PI);
                ctx.stroke();
                ctx.restore();
            }
        }

        drawOrientation() {
            const canvas = document.getElementById('canvas-3d');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width = canvas.clientWidth;
            const h = canvas.height = canvas.clientHeight;

            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, w, h);

            const r = this.roll;
            const p = this.pitch;
            const y = this.yaw;

            const drawDial = (cx, cy, radius, value, label, color) => {
                ctx.strokeStyle = '#2e2e4f';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
                ctx.stroke();

                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                const angle = (value - 90) * Math.PI / 180;
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
                ctx.stroke();

                ctx.fillStyle = '#ffffff';
                ctx.font = '10px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(`${label}: ${value.toFixed(1)}°`, cx, cy + radius + 15);
            };

            const size = Math.min(w / 3.2, h / 2.2);
            drawDial(w / 4, h / 2, size * 0.7, r, 'Roll', '#e74c3c');
            drawDial(w / 2, h / 2, size * 0.7, p, 'Pitch', '#2ecc71');
            drawDial(3 * w / 4, h / 2, size * 0.7, y, 'Yaw', '#e056fd');
        }

        drawErrorPlot() {
            const canvas = document.getElementById('canvas-error');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width = canvas.clientWidth;
            const h = canvas.height = canvas.clientHeight;

            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, w, h);

            if (this.errorHist.length < 2) return;

            const tMin = this.timeHist[0];
            const tMax = this.timeHist[this.timeHist.length - 1];
            const eMax = Math.max(...this.errorHist, 0.40);

            const toPixel = (t, e) => {
                const px = 40 + (t - tMin) / (tMax - tMin) * (w - 60);
                const py = h - 30 - (e / eMax) * (h - 50);
                return { x: px, y: py };
            };

            const drawThreshold = (val, label, color) => {
                const p = toPixel(tMin, val);
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.setLineDash([2, 4]);
                ctx.beginPath();
                ctx.moveTo(40, p.y);
                ctx.lineTo(w - 20, p.y);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = color;
                ctx.font = '8px monospace';
                ctx.fillText(label, 42, p.y - 4);
            };

            drawThreshold(0.05, '5 cm', '#2ecc71');
            drawThreshold(0.15, '15 cm', '#f39c12');
            drawThreshold(0.30, '30 cm target', '#e74c3c');

            ctx.lineWidth = 2;
            for (let i = 1; i < this.errorHist.length; i++) {
                const p1 = toPixel(this.timeHist[i - 1], this.errorHist[i - 1]);
                const p2 = toPixel(this.timeHist[i], this.errorHist[i]);
                const val = this.errorHist[i];
                ctx.strokeStyle = (val < 0.05 ? '#2ecc71' : val < 0.15 ? '#f39c12' : '#e74c3c');
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
        }

        drawArucoTimeline() {
            const canvas = document.getElementById('canvas-aruco');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width = canvas.clientWidth;
            const h = canvas.height = canvas.clientHeight;

            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, w, h);

            const tMax = this.timeHist.length > 0 ? this.timeHist[this.timeHist.length - 1] : 30.0;
            const tMin = Math.max(0.0, tMax - 30.0);

            const ids = [0, 1, 2, 3, 4, 5, 6, 7];
            const rowHeight = (h - 40) / ids.length;

            ctx.strokeStyle = '#2e2e4f';
            ctx.lineWidth = 1;
            ids.forEach((id, idx) => {
                const y = 20 + idx * rowHeight;
                ctx.beginPath();
                ctx.moveTo(50, y);
                ctx.lineTo(w - 20, y);
                ctx.stroke();
                ctx.fillStyle = '#e056fd';
                ctx.font = '9px monospace';
                ctx.fillText(`id ${id}`, 10, y + 4);
            });

            this.arucoEvents.forEach(evt => {
                if (evt.t >= tMin && evt.t <= tMax) {
                    const idx = ids.indexOf(evt.id);
                    if (idx !== -1) {
                        const x = 50 + (evt.t - tMin) / 30.0 * (w - 70);
                        const y = 20 + idx * rowHeight;
                        ctx.fillStyle = '#e056fd';
                        ctx.beginPath();
                        ctx.arc(x, y, 4, 0, 2 * Math.PI);
                        ctx.fill();
                    }
                }
            });
        }

        drawFisBars() {
            const canvas = document.getElementById('canvas-fis');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width = canvas.clientWidth;
            const h = canvas.height = canvas.clientHeight;

            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, w, h);

            const kQ = this.diag[4];
            const kV = this.diag[5];

            const kQ_norm = Math.min(1.0, (kQ - 1.0) / 9.0);
            const kV_norm = Math.min(1.0, (kV - 1.0) / 99.0);

            const drawBar = (y, val, label, valRaw, color) => {
                ctx.fillStyle = '#ffffff';
                ctx.font = '10px monospace';
                ctx.fillText(label, 15, y - 8);

                ctx.fillStyle = '#2e2e4f';
                ctx.fillRect(15, y, w - 30, 16);

                ctx.fillStyle = color;
                ctx.fillRect(15, y, (w - 30) * val, 16);

                ctx.fillStyle = '#ffffff';
                ctx.fillText(valRaw.toFixed(2), w - 50, y - 8);
            };

            drawBar(h / 3, kQ_norm, 'k_Q (process)', kQ, '#f39c12');
            drawBar(2 * h / 3, kV_norm, 'k_V (observation)', kV, '#e056fd');
        }

        drawOccupancyGrid() {
            const canvas = document.getElementById('canvas-map');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width = canvas.clientWidth;
            const h = canvas.height = canvas.clientHeight;

            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, w, h);

            if (!this.occGrid) {
                ctx.fillStyle = '#ffffff';
                ctx.font = '11px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('waiting for /active_map/occupancy', w / 2, h / 2);
                return;
            }

            const data = this.occGrid.data;
            const info = this.occGrid.info;

            const gridW = info.width;
            const gridH = info.height;

            const scaleX = w / gridW;
            const scaleY = h / gridH;
            const scale = Math.min(scaleX, scaleY);

            const startX = (w - gridW * scale) / 2;
            const startY = (h - gridH * scale) / 2;

            const imgData = ctx.createImageData(w, h);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
                    imgData.data[idx] = 26;
                    imgData.data[idx + 1] = 26;
                    imgData.data[idx + 2] = 46;
                    imgData.data[idx + 3] = 255;
                }
            }

            for (let gy = 0; gy < gridH; gy++) {
                for (let gx = 0; gx < gridW; gx++) {
                    const val = data[gy][gx];
                    if (val === -1) continue;

                    const screenX = Math.floor(startX + gx * scale);
                    const screenY = Math.floor(startY + (gridH - 1 - gy) * scale);

                    const color = val > 50 ? 0 : 255;
                    for (let dy = 0; dy < Math.ceil(scale); dy++) {
                        for (let dx = 0; dx < Math.ceil(scale); dx++) {
                            const px = screenX + dx;
                            const py = screenY + dy;
                            if (px >= 0 && px < w && py >= 0 && py < h) {
                                const idx = (py * w + px) * 4;
                                imgData.data[idx] = color;
                                imgData.data[idx + 1] = color;
                                imgData.data[idx + 2] = color;
                            }
                        }
                    }
                }
            }
            ctx.putImageData(imgData, 0, 0);
        }

        updateTextReadout() {
            const el = document.getElementById('readout-text');
            if (!el) return;

            const err = this.errorHist.length > 0 ? this.errorHist[this.errorHist.length - 1] : 0.0;
            const errColor = (err < 0.05 ? '#2ecc71' : err < 0.15 ? '#f39c12' : '#e74c3c');

            const lines = [
                '<span style="color:#ffffff; font-weight:bold; font-size:12px;">IESKF OUTPUT</span>',
                `x  = ${this.fx.toFixed(3).padStart(8)} m`,
                `y  = ${this.fy.toFixed(3).padStart(8)} m`,
                `z  = ${this.fz.toFixed(3).padStart(8)} m`,
                `R  = ${this.roll.toFixed(1).padStart(6)}°  P=${this.pitch.toFixed(1).padStart(6)}°  Y=${this.yaw.toFixed(1).padStart(6)}°`,
                '',
                '<span style="color:#ffffff; font-weight:bold; font-size:12px;">GROUND TRUTH</span>',
                `x  = ${this.gx.toFixed(3).padStart(8)} m`,
                `y  = ${this.gy.toFixed(3).padStart(8)} m`,
                '',
                `<span style="color:${errColor}; font-weight:bold; font-size:13px;">ERROR  = ${(err * 100).toFixed(2).padStart(6)} cm</span>`,
                '',
                '<span style="color:#ffffff; font-weight:bold; font-size:11px;">COUNTERS</span>',
                `ArUco received : ${String(Math.floor(this.diag[0])).padStart(5)}`,
                `ArUco applied  : ${String(Math.floor(this.diag[1])).padStart(5)}`,
                `ZUPT fired     : ${String(Math.floor(this.diag[2])).padStart(5)}`,
                `cov(p) trace   : ${this.diag[3].toExponential(2)} m²`
            ];

            el.innerHTML = lines.join('\n');
        }

        updateScoreboard() {
            const el = document.getElementById('scoreboard-text');
            if (!el) return;

            let avg = 0.0, max = 0.0;
            if (this.errorHist.length > 0) {
                avg = this.errorHist.reduce((a, b) => a + b, 0) / this.errorHist.length;
                max = Math.max(...this.errorHist);
            }

            const received = this.diag[0];
            const applied = this.diag[1];
            const util = received === 0 ? 0.0 : (100.0 * applied / received);

            const col = (v, t) => (v <= 0.5 * t ? '#2ecc71' : v <= 2.0 * t ? '#f39c12' : '#e74c3c');

            const lines = [
                '<span style="color:#ffffff; font-weight:bold; font-size:12px;">LOCALIZATION HEALTH</span>',
                '',
                `<span style="color:${col(avg, 0.30)}; font-weight:bold;">avg error     ${(avg * 100).toFixed(2).padStart(6)} cm  (target &le; 30)</span>`,
                `<span style="color:${col(max, 0.60)};">max error     ${(max * 100).toFixed(2).padStart(6)} cm</span>`,
                '',
                `<span style="color:#e056fd;">ArUco util    ${util.toFixed(1).padStart(5)}%  (${Math.floor(applied)}/${Math.floor(received)})</span>`,
                `<span style="color:#f39c12;">ZUPT fires    ${String(Math.floor(this.diag[2])).padStart(5)}</span>`
            ];

            el.innerHTML = lines.join('\n');
        }

        destroy() {
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
            }
            if (this.reconnectInterval) {
                clearInterval(this.reconnectInterval);
            }
            if (this.ws) {
                this.ws.close();
            }
            console.log('[SlamVisualizerPlugin] View destroyed.');
        }
    }
})();