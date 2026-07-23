// src/plugins/joystick-control/plugin.js

// This plugin assumes that window.JoystickView is available globally,
// which means JoystickView.js must be loaded BEFORE this script in index.html.
// It also assumes openmct is available globally.

// Wrap in an IIFE to keep local variables private, but expose the main function
(function () {
    const JOYSTICK_CONTROL_KEY = 'joystick-control';
    const JOYSTICK_ROOT_KEY = 'joystick-root';
    const MAIN_JOYSTICK_INSTANCE_KEY = 'main-rover-joystick';

    function JoystickPlugin() {
        return function install(openmct) {
            console.log('Joystick Plugin: install function started.');

            // 1. Define a new object type for your joystick control
            openmct.types.addType(JOYSTICK_CONTROL_KEY, {
                name: 'Joystick Control',
                description: 'On-screen joystick for controlling a ROS rover via Twist messages.',
                cssClass: 'icon-telemetry',
                creatable: true,
                def: {
                    type: JOYSTICK_CONTROL_KEY
                },
                initialize: function (domainObject) {
                    domainObject.name = domainObject.name || 'New Joystick';
                },
                form: []
            });

            // 2. Add Object Provider - This resolves objects by their identifiers
            openmct.objects.addProvider(JOYSTICK_CONTROL_KEY, {
                get: function (identifier) {
                    console.log('Object Provider: Getting object for identifier ->', identifier);
                    
                    if (identifier.key === JOYSTICK_ROOT_KEY) {
                        // Return the "Rover Controls" folder object
                        return Promise.resolve({
                            identifier: identifier,
                            name: 'Rover Controls',
                            type: 'folder',
                            location: 'ROOT'
                        });
                    } else if (identifier.key === MAIN_JOYSTICK_INSTANCE_KEY) {
                        // Return the main joystick instance object
                        return Promise.resolve({
                            identifier: identifier,
                            name: 'Main Rover Joystick',
                            type: JOYSTICK_CONTROL_KEY,
                            location: `${JOYSTICK_CONTROL_KEY}:${JOYSTICK_ROOT_KEY}`
                        });
                    }
                    
                    return Promise.reject(new Error('Unknown object: ' + identifier.key));
                }
            });

            // 3. Add Rover Controls as a ROOT object instead of modifying existing ROOT
            // This is a cleaner approach that doesn't interfere with existing functionality
            openmct.objects.addRoot({
                namespace: JOYSTICK_CONTROL_KEY,
                key: JOYSTICK_ROOT_KEY
            });

            // 4. COMPOSITION PROVIDER (Contents *of* your "Rover Controls" folder)
            // This provider ensures that the actual joystick instance appears when you click
            // on your "Rover Controls" folder.
            openmct.composition.addProvider({
                appliesTo: function (domainObject) {
                    const matches = domainObject.identifier.namespace === JOYSTICK_CONTROL_KEY &&
                                    domainObject.identifier.key === JOYSTICK_ROOT_KEY;
                    console.log('COMPOSITION PROVIDER 2 (Joystick Folder): Identifier ->', domainObject.identifier, '| Matches ->', matches);
                    return matches;
                },
                load: function (domainObject) {
                    console.log('Loading children for Rover Controls folder. Adding joystick instance.');
                    return Promise.resolve([
                        {
                            namespace: JOYSTICK_CONTROL_KEY,
                            key: MAIN_JOYSTICK_INSTANCE_KEY
                        }
                    ]);
                }
            });

            // 5. Register the view provider for your 'joystick-control' type
            openmct.objectViews.addProvider({
                key: 'joystick-view',
                name: 'Joystick',
                cssClass: 'icon-telemetry',
                canView: function (domainObject) {
                    return domainObject.type === JOYSTICK_CONTROL_KEY;
                },
                view: function (domainObject) {
                    let joystickInstance = null;
                    return {
                        show: function (element) {
                            if (typeof window.JoystickView === 'undefined') {
                                console.error('JoystickView not found. Make sure JoystickView.js is loaded before plugin.js.');
                                element.innerHTML = '<p style="color: red;">Error: JoystickView component not loaded.</p>';
                                return;
                            }
                            joystickInstance = new window.JoystickView(element, openmct);
                            joystickInstance.render();
                        },
                        destroy: function (element) {
                            if (joystickInstance) {
                                joystickInstance.destroy();
                                joystickInstance = null;
                            }
                        }
                    };
                }
            });

            console.log('Joystick Plugin installed successfully.');
        };
    }

    // Expose JoystickPlugin globally
    window.JoystickPlugin = JoystickPlugin;

})(); // End of IIFE