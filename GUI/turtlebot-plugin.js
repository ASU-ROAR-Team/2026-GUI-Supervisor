function TurtlebotPlugin() {
    return function install(openmct) {
        const ros = new ROSLIB.Ros({ url: 'ws://localhost:9090' });
        
        // ROS Connection Management
        ros.on('connection', () => {
            console.log('[ROS] Connected to Xavier via ROSBridge');
            updateConnectionStatus(true);
        });

        ros.on('error', (error) => {
            console.error('[ROS] Connection Error:', error);
            updateConnectionStatus(false);
        });

        ros.on('close', () => {
            console.warn('[ROS] Connection lost. Reconnecting...');
            updateConnectionStatus(false);
            setTimeout(() => ros.connect('ws://localhost:9090'), 3000);
        });

        // Connection status indicator
        function updateConnectionStatus(connected) {
            const statusEl = document.getElementById('ros-status');
            if (statusEl) {
                statusEl.textContent = connected ? '🟢 Connected' : '🔴 Disconnected';
                statusEl.className = connected ? 'status-connected' : 'status-disconnected';
            }
        }

        // Enhanced Camera Configuration
        const CAMERA_OBJECTS = {
            'camera1': {
                name: 'Front Camera',
                key: 'camera1',
                topic: '/rover/camera1/image_raw',
                position: 'front',
                streamUrl: 'http://localhost:8081/stream_viewer?topic=/rover/camera1/image_raw/compressed&type=mjpeg&quality=medium'
            },
            'camera2': {
                name: 'Left Camera', 
                key: 'camera2',
                topic: '/rover/camera2/image_raw',
                position: 'left',
                streamUrl: 'http://localhost:8081/stream_viewer?topic=/rover/camera2/image_raw/compressed&type=mjpeg&quality=medium'
            },
            'camera3': {
                name: 'Right Camera',
                key: 'camera3', 
                topic: '/rover/camera3/image_raw',
                position: 'right',
                streamUrl: 'http://localhost:8081/stream_viewer?topic=/rover/camera3/image_raw/compressed&type=mjpeg&quality=medium'
            },
            'camera4': {
                name: 'Rear Camera',
                key: 'camera4',
                topic: '/rover/camera4/image_raw', 
                position: 'rear',
                streamUrl: 'http://localhost:8081/stream_viewer?topic=/rover/camera4/image_raw/compressed&type=mjpeg&quality=medium'
            }
        };

        // Telemetry objects (existing)
        const TELEMETRY_OBJECTS = {
            'linear.x': {
                name: 'Linear Velocity (X)',
                key: 'linear.x',
                units: 'm/s'
            },
            'angular.z': {
                name: 'Angular Velocity (Z)', 
                key: 'angular.z',
                units: 'rad/s'
            },
            'battery.voltage': {
                name: 'Battery Voltage',
                key: 'battery.voltage',
                units: 'V'
            },
            'system.temperature': {
                name: 'System Temperature',
                key: 'system.temperature', 
                units: '°C'
            }
        };

        // ROS Services for camera control
        const cameraSelectService = new ROSLIB.Service({
            ros: ros,
            name: '/primary_camera_select',
            serviceType: 'topic_tools/MuxSelect'
        });

        // Enhanced Object Provider
        const objectProvider = {
            get: (identifier) => {
                console.log('[OpenMCT] Fetching:', identifier.key);

                // Main Rover Folder
                if (identifier.key === 'rover') {
                    return Promise.resolve({
                        identifier: { namespace: 'rover.namespace', key: 'rover' },
                        name: '🚀 European Rover Challenge - Control Center',
                        type: 'folder',
                        location: 'ROOT',
                        composition: [
                            { namespace: 'rover.namespace', key: 'cameras' },
                            { namespace: 'rover.namespace', key: 'telemetry' },
                            { namespace: 'rover.namespace', key: 'status' }
                        ],
                        persisted: true
                    });
                }

                // Camera Folder
                if (identifier.key === 'cameras') {
                    return Promise.resolve({
                        identifier: { namespace: 'rover.namespace', key: 'cameras' },
                        name: '📹 Camera Systems',
                        type: 'folder',
                        location: { namespace: 'rover.namespace', key: 'rover' },
                        composition: Object.keys(CAMERA_OBJECTS).map(key => ({
                            namespace: 'rover.namespace',
                            key: key
                        })),
                        persisted: true
                    });
                }

                // Telemetry Folder  
                if (identifier.key === 'telemetry') {
                    return Promise.resolve({
                        identifier: { namespace: 'rover.namespace', key: 'telemetry' },
                        name: '📊 Telemetry Data',
                        type: 'folder',
                        location: { namespace: 'rover.namespace', key: 'rover' },
                        composition: Object.keys(TELEMETRY_OBJECTS).map(key => ({
                            namespace: 'rover.namespace',
                            key: key
                        })),
                        persisted: true
                    });
                }

                // Individual Camera Objects
                if (CAMERA_OBJECTS[identifier.key]) {
                    const cameraConfig = CAMERA_OBJECTS[identifier.key];
                    return Promise.resolve({
                        identifier: { namespace: 'rover.namespace', key: identifier.key },
                        name: cameraConfig.name,
                        type: 'rover.camera',
                        streamUrl: cameraConfig.streamUrl,
                        topic: cameraConfig.topic,
                        position: cameraConfig.position,
                        location: { namespace: 'rover.namespace', key: 'cameras' }
                    });
                }

                // Individual Telemetry Objects
                if (TELEMETRY_OBJECTS[identifier.key]) {
                    const objConfig = TELEMETRY_OBJECTS[identifier.key];
                    return Promise.resolve({
                        identifier: { namespace: 'rover.namespace', key: identifier.key },
                        name: objConfig.name,
                        type: 'rover.telemetry',
                        telemetry: {
                            values: [
                                {
                                    key: 'utc',
                                    name: 'Timestamp',
                                    source: 'timestamp', 
                                    format: 'utc',
                                    hints: { domain: 1 }
                                },
                                {
                                    key: 'value',
                                    name: 'Value',
                                    units: objConfig.units,
                                    hints: { range: 1 }
                                }
                            ]
                        },
                        location: { namespace: 'rover.namespace', key: 'telemetry' }
                    });
                }

                return Promise.reject(new Error('Unknown identifier'));
            }
        };

        // Register providers
        openmct.objects.addProvider('rover.namespace', objectProvider);
        openmct.objects.addRoot({ namespace: 'rover.namespace', key: 'rover' });

        // Enhanced Camera View Provider
        openmct.objectViews.addProvider({
            name: 'Enhanced Camera View',
            key: 'rover.camera.enhanced',
            cssClass: 'icon-camera',
            canView: (domainObject) => domainObject.type === 'rover.camera',
            view: (domainObject) => {
                let currentQuality = 'medium';
                
                return {
                    show: (element) => {
                        const cameraConfig = CAMERA_OBJECTS[domainObject.identifier.key];
                        
                        element.innerHTML = `
                            <div class="camera-container" style="padding: 15px; height: 100%; display: flex; flex-direction: column; background: #1a1a1a;">
                                <!-- Header Controls -->
                                <div class="camera-header" style="margin-bottom: 15px; display: flex; justify-content: between; align-items: center; background: #2d2d2d; padding: 10px; border-radius: 8px;">
                                    <div style="display: flex; align-items: center;">
                                        <h3 style="margin: 0; color: #fff; margin-right: 20px;">📹 ${domainObject.name}</h3>
                                        <span class="position-badge" style="background: #0078d4; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                                            ${cameraConfig.position.toUpperCase()}
                                        </span>
                                    </div>
                                    
                                    <div class="camera-controls" style="display: flex; gap: 10px;">
                                        <select id="quality-select-${domainObject.identifier.key}" style="padding: 5px; border-radius: 4px; border: 1px solid #555; background: #333; color: white;">
                                            <option value="low">Low Quality</option>
                                            <option value="medium" selected>Medium Quality</option>  
                                            <option value="high">High Quality</option>
                                            <option value="max">Maximum Quality</option>
                                        </select>
                                        
                                        <button id="fullscreen-btn-${domainObject.identifier.key}" 
                                                style="padding: 8px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                            ⛶ Fullscreen
                                        </button>
                                        
                                        <button id="snapshot-btn-${domainObject.identifier.key}" 
                                                style="padding: 8px 12px; background: #0078d4; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                            📸 Snapshot
                                        </button>
                                        
                                        <button id="primary-btn-${domainObject.identifier.key}"
                                                style="padding: 8px 12px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                            ★ Set Primary
                                        </button>
                                    </div>
                                </div>

                                <!-- Stream Display -->
                                <div class="stream-wrapper" style="flex: 1; display: flex; justify-content: center; align-items: center; background: #000; border-radius: 8px; overflow: hidden; position: relative;">
                                    <img id="camera-stream-${domainObject.identifier.key}" 
                                         src="${domainObject.streamUrl}" 
                                         style="max-width: 100%; max-height: 100%; object-fit: contain;"
                                         alt="Camera feed loading..." 
                                         onerror="this.alt='❌ Camera feed unavailable'; this.style.background='#333'; this.style.color='white'; this.style.padding='50px';" />
                                    
                                    <!-- Stream Info Overlay -->
                                    <div class="stream-info" style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.7); color: white; padding: 8px; border-radius: 4px; font-size: 12px;">
                                        <div>Topic: ${cameraConfig.topic}</div>
                                        <div>Quality: <span id="quality-indicator-${domainObject.identifier.key}">Medium</span></div>
                                        <div id="fps-indicator-${domainObject.identifier.key}">FPS: --</div>
                                    </div>
                                </div>

                                <!-- Status Bar -->
                                <div class="status-bar" style="margin-top: 10px; padding: 8px; background: #2d2d2d; border-radius: 4px; display: flex; justify-content: space-between; color: #ccc; font-size: 12px;">
                                    <span>Last Update: <span id="last-update-${domainObject.identifier.key}">--</span></span>
                                    <span id="ros-status">🔴 Disconnected</span>
                                </div>
                            </div>
                        `;
                        
                        // Event Handlers
                        const qualitySelect = element.querySelector(`#quality-select-${domainObject.identifier.key}`);
                        const snapshotBtn = element.querySelector(`#snapshot-btn-${domainObject.identifier.key}`);
                        const fullscreenBtn = element.querySelector(`#fullscreen-btn-${domainObject.identifier.key}`);
                        const primaryBtn = element.querySelector(`#primary-btn-${domainObject.identifier.key}`);
                        const streamImg = element.querySelector(`#camera-stream-${domainObject.identifier.key}`);
                        const qualityIndicator = element.querySelector(`#quality-indicator-${domainObject.identifier.key}`);
                        
                        // Quality change handler
                        qualitySelect.addEventListener('change', (e) => {
                            currentQuality = e.target.value;
                            const newUrl = domainObject.streamUrl.replace(/quality=\w+/, `quality=${currentQuality}`);
                            streamImg.src = newUrl;
                            qualityIndicator.textContent = currentQuality.charAt(0).toUpperCase() + currentQuality.slice(1);
                        });

                        // Snapshot handler
                        snapshotBtn.addEventListener('click', () => {
                            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                            const filename = `${domainObject.identifier.key}_${timestamp}.jpg`;
                            
                            // Create snapshot URL (high quality PNG)
                            const snapshotUrl = `http://localhost:8081/snapshot?topic=${cameraConfig.topic}/compressed&quality=95&width=1280&height=720`;
                            
                            // Trigger download
                            const link = document.createElement('a');
                            link.href = snapshotUrl;
                            link.download = filename;
                            link.click();
                            
                            // Visual feedback
                            snapshotBtn.textContent = '✅ Saved!';
                            setTimeout(() => {
                                snapshotBtn.textContent = '📸 Snapshot';
                            }, 2000);
                        });

                        // Fullscreen handler
                        fullscreenBtn.addEventListener('click', () => {
                            if (streamImg.requestFullscreen) {
                                streamImg.requestFullscreen();
                            }
                        });

                        // Set as primary camera handler
                        primaryBtn.addEventListener('click', () => {
                            const request = new ROSLIB.ServiceRequest({
                                topic: cameraConfig.topic
                            });
                            
                            cameraSelectService.callService(request, (result) => {
                                if (result.prev_topic) {
                                    primaryBtn.textContent = '★ Primary Set!';
                                    primaryBtn.style.background = '#28a745';
                                    setTimeout(() => {
                                        primaryBtn.textContent = '★ Set Primary';
                                        primaryBtn.style.background = '#dc3545';
                                    }, 3000);
                                }
                            });
                        });

                        // Stream monitoring
                        let lastUpdate = Date.now();
                        streamImg.addEventListener('load', () => {
                            lastUpdate = Date.now();
                            const lastUpdateEl = element.querySelector(`#last-update-${domainObject.identifier.key}`);
                            if (lastUpdateEl) {
                                lastUpdateEl.textContent = new Date().toLocaleTimeString();
                            }
                        });
                    },
                    
                    destroy: () => {
                        // Cleanup event listeners
                    }
                };
            }
        });

        // Existing telemetry provider (simplified)
        openmct.telemetry.addProvider({
            supportsRequest: () => false,
            supportsSubscribe: (domainObject) => domainObject.type === 'rover.telemetry',
            subscribe: (domainObject, callback) => {
                const topic = new ROSLIB.Topic({
                    ros: ros,
                    name: '/turtle1/cmd_vel', // Replace with actual telemetry topics
                    messageType: 'geometry_msgs/Twist'
                });

                const handler = (message) => {
                    const value = domainObject.identifier.key === 'linear.x' 
                        ? message.linear.x 
                        : message.angular.z;
                    
                    callback({
                        timestamp: Date.now(),
                        value: value,
                        id: domainObject.identifier.key
                    });
                };

                topic.subscribe(handler);
                return () => topic.unsubscribe(handler);
            }
        });

        // Type registrations
        openmct.types.addType('rover.telemetry', {
            name: 'Rover Telemetry',
            description: 'Real-time rover telemetry data',
            cssClass: 'icon-telemetry'
        });

        openmct.types.addType('rover.camera', {
            name: 'Rover Camera',
            description: 'Live camera feed with controls',
            cssClass: 'icon-camera'
        });

        console.log('[Plugin] European Rover Challenge GUI initialized successfully! 🚀');
    };
}