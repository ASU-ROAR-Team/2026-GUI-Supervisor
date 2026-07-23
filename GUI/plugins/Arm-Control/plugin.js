// src/plugins/Arm-Control/plugin.js

(function () {

    const ARM_CONTROL_KEY = 'arm-control';
    const ARM_ROOT_KEY = 'arm-root';
    const MAIN_ARM_INSTANCE_KEY = 'main-arm-sliders';

    function ArmControlPlugin() {
        return function install(openmct) {

            console.log('[ArmControlPlugin] Installing');

            /* 1. Type definition */
            openmct.types.addType(ARM_CONTROL_KEY, {
                name: 'Robotic Arm Control Sliders',
                description: 'Slider-based velocity control for a 6-DOF robotic arm',
                cssClass: 'icon-telemetry',
                creatable: false
            });

            /* 2. Object Provider */
            openmct.objects.addProvider(ARM_CONTROL_KEY, {
                get: function (identifier) {
                    if (identifier.key === ARM_ROOT_KEY) {
                        return Promise.resolve({
                            identifier,
                            name: 'Arm Controls',
                            type: 'folder',
                            location: 'ROOT'
                        });
                    }

                    if (identifier.key === MAIN_ARM_INSTANCE_KEY) {
                        return Promise.resolve({
                            identifier,
                            name: 'Main Robotic Arm Sliders',
                            type: ARM_CONTROL_KEY,
                            location: `${ARM_CONTROL_KEY}:${ARM_ROOT_KEY}`
                        });
                    }

                    return Promise.reject('Unknown object: ' + identifier.key);
                }
            });

            /* 3. Add Arm Controls folder as ROOT */
            openmct.objects.addRoot({
                namespace: ARM_CONTROL_KEY,
                key: ARM_ROOT_KEY
            });

            /* 4. Make ROOT show Arm Controls folder */
            openmct.composition.addProvider({
                appliesTo: function (identifier) {
                    return identifier.namespace === 'ROOT';
                },
                load: function () {
                    return [
                        { namespace: ARM_CONTROL_KEY, key: ARM_ROOT_KEY }
                    ];
                }
            });

            /* 5. Arm folder contents */
            openmct.composition.addProvider({
                appliesTo: function (domainObject) {
                    return (
                        domainObject.identifier.namespace === ARM_CONTROL_KEY &&
                        domainObject.identifier.key === ARM_ROOT_KEY
                    );
                },
                load: function () {
                    return [
                        { namespace: ARM_CONTROL_KEY, key: MAIN_ARM_INSTANCE_KEY }
                    ];
                }
            });

            /* 6. View provider */
            openmct.objectViews.addProvider({
                key: 'arm-control-view',
                name: 'Arm Control Sliders',
                cssClass: 'icon-telemetry',

                canView: function (domainObject) {
                    return domainObject.type === ARM_CONTROL_KEY;
                },

                view: function () {
                    let viewInstance;

                    return {
                        show: function (element) {
                            if (!window.ArmControlView) {
                                element.innerHTML =
                                    '<p style="color:red">ArmControlView not loaded</p>';
                                return;
                            }

                            viewInstance = new window.ArmControlView(element, openmct);
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

            console.log('[ArmControlPlugin] Installed successfully');
        };
    }

    window.ArmControlPlugin = ArmControlPlugin;

})();