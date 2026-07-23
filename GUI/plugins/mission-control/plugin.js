// src/plugins/mission-control/plugin.js

(function () {
    const MISSION_CONTROL_KEY = 'mission-control';
    const ROVER_STATUS_KEY = 'rover-status';
    const MISSION_CONTROL_ROOT_KEY = 'mission-control-root';
    const MISSION_PANEL_KEY = 'mission-panel';
    const STATUS_DISPLAY_KEY = 'status-display';

    function MissionControlPlugin() {
        return function install(openmct) {
            console.log('Mission Control Plugin: install function started.');

            // 1. Define mission control panel type
            openmct.types.addType(MISSION_CONTROL_KEY, {
                name: 'Mission Control Panel',
                description: 'Control panel for rover missions with START/STOP/RESET buttons.',
                cssClass: 'icon-command',
                creatable: true,
                def: {
                    type: MISSION_CONTROL_KEY
                },
                initialize: function (domainObject) {
                    domainObject.name = domainObject.name || 'Mission Control Panel';
                },
                form: []
            });

            // 2. Define rover status display type
            openmct.types.addType(ROVER_STATUS_KEY, {
                name: 'Rover Status Display',
                description: 'Display rover state and node statuses.',
                cssClass: 'icon-telemetry',
                creatable: true,
                def: {
                    type: ROVER_STATUS_KEY
                },
                initialize: function (domainObject) {
                    domainObject.name = domainObject.name || 'Rover Status Display';
                },
                form: []
            });

            // 3. Add Mission Control as root object
            openmct.objects.addRoot({
                namespace: MISSION_CONTROL_KEY,
                key: MISSION_CONTROL_ROOT_KEY
            });

            // 4. Object Provider
            openmct.objects.addProvider(MISSION_CONTROL_KEY, {
                get: function (identifier) {
                    console.log('Mission Control Object Provider: Getting object for identifier ->', identifier);
                    
                    if (identifier.key === MISSION_CONTROL_ROOT_KEY) {
                        return Promise.resolve({
                            identifier: identifier,
                            name: 'Mission Control',
                            type: 'folder',
                            location: 'ROOT'
                        });
                    } else if (identifier.key === MISSION_PANEL_KEY) {
                        return Promise.resolve({
                            identifier: identifier,
                            name: 'Mission Control Panel',
                            type: MISSION_CONTROL_KEY,
                            location: `${MISSION_CONTROL_KEY}:${MISSION_CONTROL_ROOT_KEY}`
                        });
                    } else if (identifier.key === STATUS_DISPLAY_KEY) {
                        return Promise.resolve({
                            identifier: identifier,
                            name: 'Rover Status Display',
                            type: ROVER_STATUS_KEY,
                            location: `${MISSION_CONTROL_KEY}:${MISSION_CONTROL_ROOT_KEY}`
                        });
                    }
                    
                    return Promise.reject(new Error('Unknown object: ' + identifier.key));
                }
            });

            // 5. Composition Provider for Mission Control folder
            openmct.composition.addProvider({
                appliesTo: function (domainObject) {
                    return domainObject.identifier.namespace === MISSION_CONTROL_KEY &&
                           domainObject.identifier.key === MISSION_CONTROL_ROOT_KEY;
                },
                load: function (domainObject) {
                    console.log('Loading children for Mission Control folder.');
                    return Promise.resolve([
                        {
                            namespace: MISSION_CONTROL_KEY,
                            key: MISSION_PANEL_KEY
                        },
                        {
                            namespace: MISSION_CONTROL_KEY,
                            key: STATUS_DISPLAY_KEY
                        }
                    ]);
                }
            });

            // 6. Mission Control Panel View Provider
            openmct.objectViews.addProvider({
                key: 'mission-control-view',
                name: 'Mission Control',
                cssClass: 'icon-command',
                canView: function (domainObject) {
                    return domainObject.type === MISSION_CONTROL_KEY;
                },
                view: function (domainObject) {
                    let missionControlInstance = null;
                    return {
                        show: function (element) {
                            if (typeof window.MissionControlView === 'undefined') {
                                console.error('MissionControlView not found. Make sure MissionControlView.js is loaded.');
                                element.innerHTML = '<p style="color: red;">Error: MissionControlView component not loaded.</p>';
                                return;
                            }
                            missionControlInstance = new window.MissionControlView(element, openmct);
                            missionControlInstance.render();
                        },
                        destroy: function (element) {
                            if (missionControlInstance) {
                                missionControlInstance.destroy();
                                missionControlInstance = null;
                            }
                        }
                    };
                }
            });

            // 7. Rover Status Display View Provider
            openmct.objectViews.addProvider({
                key: 'rover-status-view',
                name: 'Rover Status',
                cssClass: 'icon-telemetry',
                canView: function (domainObject) {
                    return domainObject.type === ROVER_STATUS_KEY;
                },
                view: function (domainObject) {
                    let roverStatusInstance = null;
                    return {
                        show: function (element) {
                            if (typeof window.RoverStatusView === 'undefined') {
                                console.error('RoverStatusView not found. Make sure RoverStatusView.js is loaded.');
                                element.innerHTML = '<p style="color: red;">Error: RoverStatusView component not loaded.</p>';
                                return;
                            }
                            roverStatusInstance = new window.RoverStatusView(element, openmct);
                            roverStatusInstance.render();
                        },
                        destroy: function (element) {
                            if (roverStatusInstance) {
                                roverStatusInstance.destroy();
                                roverStatusInstance = null;
                            }
                        }
                    };
                }
            });

            console.log('Mission Control Plugin installed successfully.');
        };
    }

    // Expose globally
    window.MissionControlPlugin = MissionControlPlugin;

})();