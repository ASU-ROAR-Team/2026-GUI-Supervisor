// plugins/camera/camera_plugin.js

(function () {
    const CAMERA_KEY = 'camera';
    const MULTI_CAMERA_KEY = 'multi-camera';

    window.CameraPlugin = function CameraPlugin() {
        return function install(openmct) {
            // --- 1. Define single Camera object type ---
            openmct.types.addType(CAMERA_KEY, {
                name: 'Camera Stream',
                description: 'Displays a live video stream from a camera URL.',
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
                description: 'Displays live streams for all 5 USB cameras simultaneously.',
                creatable: true,
                cssClass: 'icon-camera',
                initialize(domainObject) {
                    domainObject.name = domainObject.name || '5-Camera Grid Dashboard';
                },
                form: []
            });

            // --- 3. Single Camera View Provider ---
            openmct.objectViews.addProvider({
                key: 'camera-view',
                name: 'Camera View',
                canView: (domainObject) => domainObject.type === CAMERA_KEY,
                view: (domainObject) => {
                    let cameraElement = null;

                    return {
                        show(element) {
                            element.style.padding = '10px';
                            element.style.background = '#0f172a';
                            element.style.height = '100%';
                            element.style.boxSizing = 'border-box';

                            const host = window.location.hostname || 'localhost';
                            let url = domainObject.cameraFeedUrl;
                            if (url && url.includes('localhost')) {
                                url = url.replace('localhost', host);
                            }

                            if (!url) {
                                element.innerHTML = '<div style="color: #cbd5e1; text-align: center; padding-top: 20px;">Camera Feed URL not configured.</div>';
                                return;
                            }

                            cameraElement = document.createElement('img');
                            cameraElement.style.width = '100%';
                            cameraElement.style.height = '100%';
                            cameraElement.style.objectFit = 'contain';
                            cameraElement.src = url;

                            cameraElement.onerror = () => {
                                element.innerHTML = `<div style="color: #f87171; text-align: center; padding-top: 20px;">Unable to load camera stream from ${url}</div>`;
                            };

                            element.appendChild(cameraElement);
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
                                        <span class="multi-cam-badge">5 Feeds Active</span>
                                    </div>
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
                                        margin-bottom: 15px;
                                        padding-bottom: 10px;
                                        border-bottom: 1px solid #334155;
                                    }
                                    .multi-cam-header h3 { margin: 0; color: #38bdf8; font-size: 1.2rem; }
                                    .multi-cam-badge { background: #0284c7; padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; }
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

            console.log('Camera Plugin installed successfully.');
        };
    };
})();
