// plugins/mission-control/plugin.js

(function () {
    const MISSION_CONTROL_KEY = 'mission-control';
    const ROVER_STATUS_KEY = 'rover-status';
    const SUPERVISOR_ROOT_KEY = 'supervisor-root';
    const MISSION_PANEL_KEY = 'mission-panel';
    const STATUS_DISPLAY_KEY = 'status-display';
    const MULTI_CAM_KEY = 'multi-camera-dashboard';
    const CAM_1_KEY = 'cam-1-front';
    const CAM_2_KEY = 'cam-2-left';
    const CAM_3_KEY = 'cam-3-right';
    const CAM_4_KEY = 'cam-4-rear';
    const CAM_5_KEY = 'cam-5-arm';

    function MissionControlPlugin() {
        return function install(openmct) {
            console.log('ROAR Supervisor Plugin: Installing...');

            const host = window.location.hostname || 'localhost';

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
                get: function (identifier) {
                    if (identifier.key === SUPERVISOR_ROOT_KEY) {
                        return Promise.resolve({
                            identifier: identifier,
                            name: '🚀 ROAR Supervisor & System Monitor',
                            type: 'folder',
                            location: 'ROOT'
                        });
                    } else if (identifier.key === STATUS_DISPLAY_KEY) {
                        return Promise.resolve({
                            identifier: identifier,
                            name: 'Rover Status & Node Health Display',
                            type: ROVER_STATUS_KEY,
                            location: `${MISSION_CONTROL_KEY}:${SUPERVISOR_ROOT_KEY}`
                        });
                    } else if (identifier.key === MISSION_PANEL_KEY) {
                        return Promise.resolve({
                            identifier: identifier,
                            name: 'Mission Control Panel',
                            type: MISSION_CONTROL_KEY,
                            location: `${MISSION_CONTROL_KEY}:${SUPERVISOR_ROOT_KEY}`
                        });
                    } else if (identifier.key === MULTI_CAM_KEY) {
                        return Promise.resolve({
                            identifier: identifier,
                            name: '📹 5-Camera Grid Dashboard',
                            type: 'multi-camera',
                            location: `${MISSION_CONTROL_KEY}:${SUPERVISOR_ROOT_KEY}`
                        });
                    } else if (identifier.key === CAM_1_KEY) {
                        return Promise.resolve({
                            identifier: identifier,
                            name: 'Camera 1 (Front - /dev/video2)',
                            type: 'camera',
                            cameraFeedUrl: `http://${host}:8080/api/stream/2`,
                            location: `${MISSION_CONTROL_KEY}:${SUPERVISOR_ROOT_KEY}`
                        });
                    } else if (identifier.key === CAM_2_KEY) {
                        return Promise.resolve({
                            identifier: identifier,
                            name: 'Camera 2 (Left - /dev/video4)',
                            type: 'camera',
                            cameraFeedUrl: `http://${host}:8080/api/stream/4`,
                            location: `${MISSION_CONTROL_KEY}:${SUPERVISOR_ROOT_KEY}`
                        });
                    } else if (identifier.key === CAM_3_KEY) {
                        return Promise.resolve({
                            identifier: identifier,
                            name: 'Camera 3 (Right - /dev/video6)',
                            type: 'camera',
                            cameraFeedUrl: `http://${host}:8080/api/stream/6`,
                            location: `${MISSION_CONTROL_KEY}:${SUPERVISOR_ROOT_KEY}`
                        });
                    } else if (identifier.key === CAM_4_KEY) {
                        return Promise.resolve({
                            identifier: identifier,
                            name: 'Camera 4 (Rear - /dev/video8)',
                            type: 'camera',
                            cameraFeedUrl: `http://${host}:8080/api/stream/8`,
                            location: `${MISSION_CONTROL_KEY}:${SUPERVISOR_ROOT_KEY}`
                        });
                    } else if (identifier.key === CAM_5_KEY) {
                        return Promise.resolve({
                            identifier: identifier,
                            name: 'Camera 5 (Arm/Tool - /dev/video10)',
                            type: 'camera',
                            cameraFeedUrl: `http://${host}:8080/api/stream/10`,
                            location: `${MISSION_CONTROL_KEY}:${SUPERVISOR_ROOT_KEY}`
                        });
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
                load: function (domainObject) {
                    return Promise.resolve([
                        { namespace: MISSION_CONTROL_KEY, key: STATUS_DISPLAY_KEY },
                        { namespace: MISSION_CONTROL_KEY, key: MISSION_PANEL_KEY },
                        { namespace: MISSION_CONTROL_KEY, key: MULTI_CAM_KEY },
                        { namespace: MISSION_CONTROL_KEY, key: CAM_1_KEY },
                        { namespace: MISSION_CONTROL_KEY, key: CAM_2_KEY },
                        { namespace: MISSION_CONTROL_KEY, key: CAM_3_KEY },
                        { namespace: MISSION_CONTROL_KEY, key: CAM_4_KEY },
                        { namespace: MISSION_CONTROL_KEY, key: CAM_5_KEY }
                    ]);
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

            console.log('ROAR Supervisor Plugin installed successfully.');
        };
    }

    window.MissionControlPlugin = MissionControlPlugin;
})();