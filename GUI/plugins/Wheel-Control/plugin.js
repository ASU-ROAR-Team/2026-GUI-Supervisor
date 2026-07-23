// src/plugins/Wheel-Control/plugin.js
(function () {

    const WHEEL_CONTROL_KEY = 'wheel-control';
    const WHEEL_ROOT_KEY = 'wheel-root';
    const MAIN_WHEEL_INSTANCE_KEY = 'main-wheel';

    function WheelControlPlugin() {
        return function install(openmct) {
            console.log('[WheelControlPlugin] Installing');

            openmct.types.addType(WHEEL_CONTROL_KEY, {
                name: 'Wheel Duty Cycle Control',
                description: 'Direct PWM slider control for Left and Right wheels',
                cssClass: 'icon-telemetry',
                creatable: false
            });

            openmct.objects.addProvider(WHEEL_CONTROL_KEY, {
                get: function (identifier) {
                    if (identifier.key === WHEEL_ROOT_KEY) {
                        return Promise.resolve({
                            identifier,
                            name: 'Rover Mobility',
                            type: 'folder',
                            location: 'ROOT'
                        });
                    }
                    if (identifier.key === MAIN_WHEEL_INSTANCE_KEY) {
                        return Promise.resolve({
                            identifier,
                            name: 'Wheel Control',
                            type: WHEEL_CONTROL_KEY,
                            location: `${WHEEL_CONTROL_KEY}:${WHEEL_ROOT_KEY}`
                        });
                    }
                    return Promise.reject('Unknown object: ' + identifier.key);
                }
            });

            openmct.objects.addRoot({
                namespace: WHEEL_CONTROL_KEY,
                key: WHEEL_ROOT_KEY
            });

            openmct.composition.addProvider({
                appliesTo: function (identifier) {
                    return identifier.namespace === 'ROOT';
                },
                load: function () {
                    return [{ namespace: WHEEL_CONTROL_KEY, key: WHEEL_ROOT_KEY }];
                }
            });

            openmct.composition.addProvider({
                appliesTo: function (domainObject) {
                    return (
                        domainObject.identifier.namespace === WHEEL_CONTROL_KEY &&
                        domainObject.identifier.key === WHEEL_ROOT_KEY
                    );
                },
                load: function () {
                    return [{ namespace: WHEEL_CONTROL_KEY, key: MAIN_WHEEL_INSTANCE_KEY }];
                }
            });

            openmct.objectViews.addProvider({
                key: 'wheel-control-view',
                name: 'Wheel Control View',
                cssClass: 'icon-telemetry',
                canView: function (domainObject) {
                    return domainObject.type === WHEEL_CONTROL_KEY;
                },
                view: function () {
                    let viewInstance;
                    return {
                        show: function (element) {
                            if (!window.WheelControlView) {
                                element.innerHTML = '<p style="color:red">WheelControlView not loaded</p>';
                                return;
                            }
                            viewInstance = new window.WheelControlView(element, openmct);
                            viewInstance.render();
                        },
                        destroy: function () {
                            if (viewInstance?.destroy) {
                                viewInstance.destroy();
                            }
                            viewInstance = null;
                        }
                    };
                }
            });
        };
    }

    window.WheelControlPlugin = WheelControlPlugin;

})();