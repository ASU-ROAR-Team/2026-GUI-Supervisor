// plugins/mission-control/plugin.js

(function () {
    const MISSION_CONTROL_KEY = 'mission-control';
    const ROVER_STATUS_KEY = 'rover-status';
    const SUPERVISOR_ROOT_KEY = 'supervisor-root';
    const MISSION_PANEL_KEY = 'mission-panel';
    const STATUS_DISPLAY_KEY = 'status-display';
    const MULTI_CAM_KEY = 'multi-camera-dashboard';

    let cachedActiveCameras = null;

    async function fetchActiveCameras() {
        const host = (window.getRoarHost ? window.getRoarHost() : window.location.hostname) || 'localhost';
        try {
            const res = await fetch(`http://${host}:9090/api/cameras`);
            if (res.ok) {
                const data = await res.json();
                if (data.cameras && data.cameras.length > 0) {
                    cachedActiveCameras = data.cameras;
                    return cachedActiveCameras;
                }
            }
        } catch (e) {
            console.warn('Could not fetch active cameras for ROAR Supervisor:', e);
        }
        return cachedActiveCameras || [];
    }

    function MissionControlPlugin() {
        return function install(openmct) {
            console.log('ROAR Supervisor Plugin: Installing...');

            const host = (window.getRoarHost ? window.getRoarHost() : window.location.hostname) || 'localhost';

            // 1. Define mission control panel type
            openmct.types.addType(MISSION_CONTROL_KEY, {
                name: 'Mission Control Panel',
                description: 'Control panel for rover missions with START/STOP/RESET commands.',
                cssClass: 'icon-command',
                creatable: true,
                def: { type: MISSION_CONTROL_KEY },
                initialize(domainObject) {
                    domainObject.name = domainObject.name || 'Mission Control Panel';
                },
                form: []
            });

            // 2. Define rover status display type
            openmct.types.addType(ROVER_STATUS_KEY, {
                name: 'Rover Status & Node Health Display',
                description: 'Display rover state, supervisor messages, and monitored ROS2 node CPU/memory/status.',
                cssClass: 'icon-telemetry',
                creatable: true,
                def: { type: ROVER_STATUS_KEY },
                initialize(domainObject) {
                    domainObject.name = domainObject.name || 'Rover Status & Node Health Display';
                },
                form: []
            });

            // 3. Add Supervisor as root object in OpenMCT
            openmct.objects.addRoot({
                namespace: MISSION_CONTROL_KEY,
                key: SUPERVISOR_ROOT_KEY
            });

            // 4. Object Provider for Supervisor objects & cameras
            openmct.objects.addProvider(MISSION_CONTROL_KEY, {
                get: async function (identifier) {
                    if (identifier.key === SUPERVISOR_ROOT_KEY) {
                        return {
                            identifier: identifier,
                            name: '🚀 ROAR Supervisor & System Monitor',
                            type: 'folder',
                            location: 'ROOT'
                        };
                    } else if (identifier.key === STATUS_DISPLAY_KEY) {
                        return {
                            identifier: identifier,
                            name: 'Rover Status & Node Health Display',
                            type: ROVER_STATUS_KEY,
                            location: `${MISSION_CONTROL_KEY}:${SUPERVISOR_ROOT_KEY}`
                        };
                    } else if (identifier.key === MISSION_PANEL_KEY) {
                        return {
                            identifier: identifier,
                            name: 'Mission Control Panel',
                            type: MISSION_CONTROL_KEY,
                            location: `${MISSION_CONTROL_KEY}:${SUPERVISOR_ROOT_KEY}`
                        };
                    } else if (identifier.key === MULTI_CAM_KEY) {
                        return {
                            identifier: identifier,
                            name: '📹 Multi-Camera Grid Dashboard',
                            type: 'multi-camera',
                            location: `${MISSION_CONTROL_KEY}:${SUPERVISOR_ROOT_KEY}`
                        };
                    } else if (identifier.key.startsWith('cam-')) {
                        const camNum = identifier.key.replace('cam-', '');
                        const cameras = await fetchActiveCameras();
                        const found = cameras.find(c => String(c.cam_num) === String(camNum));
                        const displayName = found ? `${found.name} (${found.dev})` : `Camera #${camNum} (/dev/video${camNum})`;

                        return {
                            identifier: identifier,
                            name: `📷 ${displayName}`,
                            type: 'camera',
                            cameraFeedUrl: `http://${host}:9090/api/stream/${camNum}`,
                            location: `${MISSION_CONTROL_KEY}:${SUPERVISOR_ROOT_KEY}`
                        };
                    }

                    return Promise.reject(new Error('Unknown object: ' + identifier.key));
                }
            });

            // 5. Composition Provider for ROAR Supervisor folder
            openmct.composition.addProvider({
                appliesTo: function (domainObject) {
                    return domainObject.identifier.namespace === MISSION_CONTROL_KEY &&
                           domainObject.identifier.key === SUPERVISOR_ROOT_KEY;
                },
                load: async function (domainObject) {
                    const cameras = await fetchActiveCameras();
                    const items = [
                        { namespace: MISSION_CONTROL_KEY, key: STATUS_DISPLAY_KEY },
                        { namespace: MISSION_CONTROL_KEY, key: MISSION_PANEL_KEY },
                        { namespace: MISSION_CONTROL_KEY, key: MULTI_CAM_KEY }
                    ];

                    if (cameras.length === 0) {
                        // Fallback default camera IDs if web server is not currently reachable
                        [0, 2, 4, 11, 13, 15].forEach(num => {
                            items.push({ namespace: MISSION_CONTROL_KEY, key: `cam-${num}` });
                        });
                    } else {
                        cameras.forEach(cam => {
                            items.push({ namespace: MISSION_CONTROL_KEY, key: `cam-${cam.cam_num}` });
                        });
                    }

                    return items;
                }
            });

            // 6. Mission Control Panel View Provider
            openmct.objectViews.addProvider({
                key: 'mission-control-view',
                name: 'Mission Control',
                cssClass: 'icon-command',
                canView: (domainObject) => domainObject.type === MISSION_CONTROL_KEY,
                view: (domainObject) => {
                    let instance = null;
                    return {
                        show(element) {
                            if (typeof window.MissionControlView === 'undefined') {
                                element.innerHTML = '<p style="color: red;">Error: MissionControlView not loaded.</p>';
                                return;
                            }
                            instance = new window.MissionControlView(element, openmct);
                        },
                        destroy() {
                            if (instance) {
                                instance.destroy();
                                instance = null;
                            }
                        }
                    };
                }
            });

            // 7. Rover Status Display View Provider
            openmct.objectViews.addProvider({
                key: 'rover-status-view',
                name: 'Rover & Node Status',
                cssClass: 'icon-telemetry',
                canView: (domainObject) => domainObject.type === ROVER_STATUS_KEY,
                view: (domainObject) => {
                    let instance = null;
                    return {
                        show(element) {
                            if (typeof window.RoverStatusView === 'undefined') {
                                element.innerHTML = '<p style="color: red;">Error: RoverStatusView not loaded.</p>';
                                return;
                            }
                            instance = new window.RoverStatusView(element, openmct);
                        },
                        destroy() {
                            if (instance) {
                                instance.destroy();
                                instance = null;
                            }
                        }
                    };
                }
            });

            console.log('ROAR Supervisor Plugin installed successfully with Dynamic Camera Discovery.');
        };
    }

    window.MissionControlPlugin = MissionControlPlugin;
})();