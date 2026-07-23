// src/plugins/Drilling-Control/plugin.js
// Assumes window.DrillingControlView is available globally.

(function () {
    const DRILLING_CONTROL_KEY = 'drilling-control';
    const DRILLING_ROOT_KEY = 'drilling-root';
    const MAIN_DRILLING_INSTANCE_KEY = 'main-drilling-control';

    function DrillingControlPlugin() {
        return function install(openmct) {
            console.log('Drilling Control Plugin: install function started.');

            // 1. Define the object type for your drilling control
            openmct.types.addType(DRILLING_CONTROL_KEY, {
                name: 'Drilling Control Panel',
                description: 'Interface for manual and autonomous control of the drilling rig.',
                cssClass: 'icon-telemetry',
                creatable: true,
                def: { type: DRILLING_CONTROL_KEY },
                initialize: function (domainObject) {
                    domainObject.name = domainObject.name || 'New Drilling Control Panel';
                },
                form: []
            });

            // 2. Add an Object Provider to handle the IDs
            openmct.objects.addProvider(DRILLING_CONTROL_KEY, {
                get: function (identifier) {
                    if (identifier.key === DRILLING_ROOT_KEY) {
                        return Promise.resolve({
                            identifier: identifier,
                            name: 'Drilling Controls',
                            type: 'folder',
                            location: 'ROOT'
                        });
                    } else if (identifier.key === MAIN_DRILLING_INSTANCE_KEY) {
                        return Promise.resolve({
                            identifier: identifier,
                            name: 'Main Drilling Panel',
                            type: DRILLING_CONTROL_KEY,
                            location: `${DRILLING_CONTROL_KEY}:${DRILLING_ROOT_KEY}`
                        });
                    }
                    return Promise.reject(new Error('Unknown object: ' + identifier.key));
                }
            });

            // 3. Add the root folder to OpenMCT's navigation tree
            openmct.objects.addRoot({ namespace: DRILLING_CONTROL_KEY, key: DRILLING_ROOT_KEY });

            // 4. Composition Provider: Define what goes inside the folder
            openmct.composition.addProvider({
                appliesTo: function (domainObject) {
                    return domainObject.identifier.namespace === DRILLING_CONTROL_KEY &&
                           domainObject.identifier.key === DRILLING_ROOT_KEY;
                },
                load: function (domainObject) {
                    return Promise.resolve([
                        { namespace: DRILLING_CONTROL_KEY, key: MAIN_DRILLING_INSTANCE_KEY }
                    ]);
                }
            });

            // 5. Register the view provider for your 'drilling-control' type
            openmct.objectViews.addProvider({
                key: 'drilling-control-view',
                name: 'Drilling Control View',
                cssClass: 'icon-telemetry',
                canView: function (domainObject) {
                    return domainObject.type === DRILLING_CONTROL_KEY;
                },
                view: function (domainObject) {
                    let drillingControlInstance = null;
                    return {
                        show: function (element) {
                            if (typeof window.DrillingControlView === 'undefined') {
                                console.error('DrillingControlView not found. Make sure DrillingControlView.js is loaded.');
                                element.innerHTML = '<p style="color: red;">Error: DrillingControlView component not loaded.</p>';
                                return;
                            }
                            drillingControlInstance = new window.DrillingControlView(element, openmct);
                            drillingControlInstance.render();
                        },
                        destroy: function (element) {
                            if (drillingControlInstance) {
                                drillingControlInstance.destroy();
                                drillingControlInstance = null;
                            }
                        }
                    };
                }
            });

            console.log('Drilling Control Plugin installed successfully.');
        };
    }

    window.DrillingControlPlugin = DrillingControlPlugin;
})();