(function () {
    const JOYSTICK_26_KEY = 'joystick-26';
    const JOYSTICK_26_ROOT_KEY = 'joystick-26-root';
    const MAIN_JOYSTICK_26_INSTANCE_KEY = 'main-rover-joystick-26';

    function Joystick26Plugin() {
        return function install(openmct) {
            openmct.types.addType(JOYSTICK_26_KEY, {
                name: 'Rover Joystick 26',
                description: 'Upgraded on-screen joystick with mission-state locking and real-time telemetry.',
                cssClass: 'icon-telemetry',
                creatable: true,
                def: { type: JOYSTICK_26_KEY },
                initialize: function (domainObject) {
                    domainObject.name = domainObject.name || 'New Joystick 26 Panel';
                },
                form: []
            });

            openmct.objects.addProvider(JOYSTICK_26_KEY, {
                get: function (identifier) {
                    if (identifier.key === JOYSTICK_26_ROOT_KEY) {
                        return Promise.resolve({
                            identifier: identifier,
                            name: 'Rover Joystick 26 Controls',
                            type: 'folder',
                            location: 'ROOT'
                        });
                    } else if (identifier.key === MAIN_JOYSTICK_26_INSTANCE_KEY) {
                        return Promise.resolve({
                            identifier: identifier,
                            name: 'Main Rover Joystick 26',
                            type: JOYSTICK_26_KEY,
                            location: `${JOYSTICK_26_KEY}:${JOYSTICK_26_ROOT_KEY}`
                        });
                    }
                    return Promise.reject(new Error('Unknown object: ' + identifier.key));
                }
            });

            openmct.objects.addRoot({ namespace: JOYSTICK_26_KEY, key: JOYSTICK_26_ROOT_KEY });

            openmct.composition.addProvider({
                appliesTo: function (domainObject) {
                    return domainObject.identifier.namespace === JOYSTICK_26_KEY &&
                           domainObject.identifier.key === JOYSTICK_26_ROOT_KEY;
                },
                load: function (domainObject) {
                    return Promise.resolve([
                        { namespace: JOYSTICK_26_KEY, key: MAIN_JOYSTICK_26_INSTANCE_KEY }
                    ]);
                }
            });

            openmct.objectViews.addProvider({
                key: 'joystick-26-view',
                name: 'Joystick 26 View',
                cssClass: 'icon-telemetry',
                canView: function (domainObject) {
                    return domainObject.type === JOYSTICK_26_KEY;
                },
                view: function (domainObject) {
                    let instance = null;
                    return {
                        show: function (element) {
                            if (typeof window.Joystick26View === 'undefined') {
                                element.innerHTML = '<p style="color: red;">Error: Joystick26View not loaded.</p>';
                                return;
                            }
                            instance = new window.Joystick26View(element, openmct);
                            instance.render();
                        },
                        destroy: function (element) {
                            if (instance) {
                                instance.destroy();
                                instance = null;
                            }
                        }
                    };
                }
            });
        };
    }

    window.Joystick26Plugin = Joystick26Plugin;
})();