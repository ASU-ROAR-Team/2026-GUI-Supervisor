// plugins/camera/camera_plugin.js

(function () {
    const CAMERA_KEY = 'camera';
    const MULTI_CAMERA_KEY = 'multi-camera';

    window.CameraPlugin = function CameraPlugin() {
        return function install(openmct) {
            // --- 1. Define single Camera object type ---
            openmct.types.addType(CAMERA_KEY, {
                name: 'Camera Stream',
                description: 'Displays a live video stream from a camera URL with quick lighting adjustments.',
                creatable: true,
                cssClass: 'icon-camera',
                initialize(domainObject) {
                    domainObject.cameraFeedUrl = domainObject.cameraFeedUrl || '';
                },
                form: [
                    {
                        key: 'cameraFeedUrl',
                        name: 'Camera Feed URL (e.g. http://localhost:9090/api/stream/2)',
                        control: 'textfield',
                        required: true,
                        cssClass: 'l-input'
                    }
                ]
            });

            // --- 2. Define 5-Camera Grid object type ---
            openmct.types.addType(MULTI_CAMERA_KEY, {
                name: '5-Camera Grid Dashboard',
                description: 'Displays live streams for all 5 USB cameras with interactive lighting controls.',
                creatable: true,
                cssClass: 'icon-camera',
                initialize(domainObject) {
                    domainObject.name = domainObject.name || '5-Camera Grid Dashboard';
                },
                form: []
            });

            // --- Quick Adjustments HTML Bar Generator ---
            function getControlBarHTML(host) {
                return `
                    <div class="cam-control-toolbar">
                        <div class="toolbar-section">
                            <span class="toolbar-title">⚡ Lighting Presets:</span>
                            <button class="btn-ctrl-preset" onclick="window.applyCamPreset('${host}', 'standard')">🏠 Standard</button>
                            <button class="btn-ctrl-preset" onclick="window.applyCamPreset('${host}', 'outdoor_sun')">☀️ Outdoor Sun</button>
                            <button class="btn-ctrl-preset" onclick="window.applyCamPreset('${host}', 'low_light')">🌙 Low Light</button>
                            <button class="btn-ctrl-preset" onclick="window.applyCamPreset('${host}', 'high_contrast')">⚡ High Contrast</button>
                        </div>
                        <div class="toolbar-section">
                            <label>Brightness: <input type="range" id="bSlider_${host}" min="0" max="100" value="50" onchange="window.updateCamControl('${host}')"></label>
                            <label>Contrast: <input type="range" id="cSlider_${host}" min="0" max="100" value="50" onchange="window.updateCamControl('${host}')"></label>
                            <label>Color: 
                                <select id="colorSel_${host}" onchange="window.updateCamControl('${host}')">
                                    <option value="gray">Grayscale</option>
                                    <option value="rgb">RGB</option>
                                </select>
                            </label>
                        </div>
                    </div>
                `;
            }

            // Expose global control functions for OpenMCT inline handlers
            window.applyCamPreset = function(host, presetName) {
                fetch(`http://${host}:9090/api/control?preset=${presetName}`)
                    .then(r => r.json())
                    .then(d => {
                        if (d.config) {
                            const bEl = document.getElementById(`bSlider_${host}`);
                            const cEl = document.getElementById(`cSlider_${host}`);
                            if (bEl) bEl.value = d.config.brightness;
                            if (cEl) cEl.value = d.config.contrast;
                        }
                    }).catch(e => console.error("Error applying preset:", e));
            };

            window.updateCamControl = function(host) {
                const bEl = document.getElementById(`bSlider_${host}`);
                const cEl = document.getElementById(`cSlider_${host}`);
                const colEl = document.getElementById(`colorSel_${host}`);

                const bVal = bEl ? bEl.value : 50;
                const cVal = cEl ? cEl.value : 50;
                const colorVal = colEl ? colEl.value : 'gray';

                fetch(`http://${host}:9090/api/control?brightness=${bVal}&contrast=${cVal}&global_color=${colorVal}`)
                    .catch(e => console.error("Error updating camera control:", e));
            };

            // --- 3. Single Camera View Provider ---
            openmct.objectViews.addProvider({
                key: 'camera-view',
                name: 'Camera View',
                canView: (domainObject) => domainObject.type === CAMERA_KEY,
                view: (domainObject) => {
                    let cameraElement = null;

                    return {
                        show(element) {
                            const host = window.location.hostname || 'localhost';
                            element.style.padding = '10px';
                            element.style.background = '#0f172a';
                            element.style.height = '100%';
                            element.style.display = 'flex';
                            element.style.flexDirection = 'column';
                            element.style.boxSizing = 'border-box';

                            let url = domainObject.cameraFeedUrl;
                            if (url && url.includes('localhost')) {
                                url = url.replace('localhost', host);
                            }

                            element.innerHTML = `
                                ${getControlBarHTML(host)}
                                <div class="cam-single-wrapper">
                                    ${url ? `<img id="singleCamImg" src="${url}" alt="Camera Feed" style="width:100%; height:100%; object-fit:contain;">` : '<div style="color: #cbd5e1; text-align: center; padding-top: 20px;">Camera Feed URL not configured.</div>'}
                                </div>
                            `;

                            cameraElement = element.querySelector('#singleCamImg');
                            if (cameraElement) {
                                cameraElement.onerror = () => {
                                    element.querySelector('.cam-single-wrapper').innerHTML = `<div style="color: #f87171; text-align: center; padding-top: 20px;">Unable to load camera stream from ${url}</div>`;
                                };
                            }
                        },
                        destroy() {
                            cameraElement = null;
                        }
                    };
                }
            });

            // --- 4. Multi-Camera 5-Grid View Provider ---
            openmct.objectViews.addProvider({
                key: 'multi-camera-view',
                name: '5-Camera Grid View',
                canView: (domainObject) => domainObject.type === MULTI_CAMERA_KEY,
                view: (domainObject) => {
                    return {
                        show(element) {
                            const host = window.location.hostname || 'localhost';
                            const camNums = [2, 4, 6, 8, 10];
                            const camLabels = [
                                "Cam 1 (Front - /dev/video2)",
                                "Cam 2 (Left - /dev/video4)",
                                "Cam 3 (Right - /dev/video6)",
                                "Cam 4 (Rear - /dev/video8)",
                                "Cam 5 (Arm/Tool - /dev/video10)"
                            ];

                            element.innerHTML = `
                                <div class="multi-cam-container">
                                    <div class="multi-cam-header">
                                        <h3>📹 Multi-Camera Real-Time Monitor</h3>
                                        <span class="multi-cam-badge">Host Laptop Webcam Excluded</span>
                                    </div>
                                    ${getControlBarHTML(host)}
                                    <div class="multi-cam-grid">
                                        ${camNums.map((num, i) => `
                                            <div class="cam-card">
                                                <div class="cam-card-title">${camLabels[i]}</div>
                                                <div class="cam-frame">
                                                    <img src="http://${host}:9090/api/stream/${num}" alt="${camLabels[i]}" 
                                                         onerror="this.onerror=null; this.src='http://${host}:9090/api/frame/${num}';">
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                                <style>
                                    .multi-cam-container {
                                        padding: 15px;
                                        background-color: #0f172a;
                                        color: #f8fafc;
                                        height: 100%;
                                        overflow-y: auto;
                                        box-sizing: border-box;
                                        font-family: system-ui, -apple-system, sans-serif;
                                    }
                                    .multi-cam-header {
                                        display: flex;
                                        justify-content: space-between;
                                        align-items: center;
                                        margin-bottom: 10px;
                                        padding-bottom: 8px;
                                        border-bottom: 1px solid #334155;
                                    }
                                    .multi-cam-header h3 { margin: 0; color: #38bdf8; font-size: 1.2rem; }
                                    .multi-cam-badge { background: #0284c7; padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; }
                                    
                                    .cam-control-toolbar {
                                        display: flex;
                                        flex-wrap: wrap;
                                        justify-content: space-between;
                                        align-items: center;
                                        background: #1e293b;
                                        padding: 10px 15px;
                                        border-radius: 8px;
                                        margin-bottom: 15px;
                                        gap: 10px;
                                        border: 1px solid #334155;
                                    }
                                    .toolbar-section {
                                        display: flex;
                                        align-items: center;
                                        gap: 10px;
                                        font-size: 0.85rem;
                                    }
                                    .toolbar-title { font-weight: bold; color: #38bdf8; }
                                    .btn-ctrl-preset {
                                        background: #334155;
                                        color: #fff;
                                        border: 1px solid #475569;
                                        padding: 4px 10px;
                                        border-radius: 5px;
                                        cursor: pointer;
                                        font-size: 0.8rem;
                                    }
                                    .btn-ctrl-preset:hover { background: #0284c7; border-color: #38bdf8; }
                                    
                                    .cam-single-wrapper { flex: 1; width: 100%; min-height: 0; background: #000; display: flex; align-items: center; justify-content: center; border-radius: 8px; overflow: hidden; }

                                    .multi-cam-grid {
                                        display: grid;
                                        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
                                        gap: 15px;
                                    }
                                    .cam-card {
                                        background: #1e293b;
                                        border: 1px solid #334155;
                                        border-radius: 8px;
                                        overflow: hidden;
                                    }
                                    .cam-card-title {
                                        padding: 8px 12px;
                                        background: #334155;
                                        font-size: 0.85rem;
                                        font-weight: 600;
                                        color: #e2e8f0;
                                    }
                                    .cam-frame {
                                        width: 100%;
                                        aspect-ratio: 4/3;
                                        background: #000;
                                        display: flex;
                                        align-items: center;
                                        justify-content: center;
                                    }
                                    .cam-frame img {
                                        width: 100%;
                                        height: 100%;
                                        object-fit: contain;
                                    }
                                </style>
                            `;
                        },
                        destroy() {
                            element.innerHTML = '';
                        }
                    };
                }
            });

            console.log('Camera Plugin with Quick Adjustments installed successfully.');
        };
    };
})();
