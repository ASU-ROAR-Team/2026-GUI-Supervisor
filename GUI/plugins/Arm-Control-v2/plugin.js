// src/plugins/Arm-Control-v2/plugin.js

(function () {

    const ARM_CONTROL_V2_KEY = 'arm-control-v2';
    const ARM_ROOT_V2_KEY = 'arm-root-v2';
    const MAIN_ARM_V2_INSTANCE_KEY = 'main-arm-v2';

    function ArmControlV2Plugin() {
        return function install(openmct) {

            console.log('[ArmControlV2Plugin] Installing');

            /* 1. Type definition */
            openmct.types.addType(ARM_CONTROL_V2_KEY, {
                name: 'Robotic Arm Control (FK + IK Sliders)',
                description: 'Forward and Inverse Kinematics control with slider-based IK',
                cssClass: 'icon-telemetry',
                creatable: false
            });

            /* 2. Object Provider */
            openmct.objects.addProvider(ARM_CONTROL_V2_KEY, {
                get: function (identifier) {
                    if (identifier.key === ARM_ROOT_V2_KEY) {
                        return Promise.resolve({
                            identifier,
                            name: 'Arm Controls v2',
                            type: 'folder',
                            location: 'ROOT'
                        });
                    }

                    if (identifier.key === MAIN_ARM_V2_INSTANCE_KEY) {
                        return Promise.resolve({
                            identifier,
                            name: 'Robotic Arm Control (v2)',
                            type: ARM_CONTROL_V2_KEY,
                            location: `${ARM_CONTROL_V2_KEY}:${ARM_ROOT_V2_KEY}`
                        });
                    }

                    return Promise.reject('Unknown object: ' + identifier.key);
                }
            });

            /* 3. Add Arm Controls v2 folder as ROOT */
            openmct.objects.addRoot({
                namespace: ARM_CONTROL_V2_KEY,
                key: ARM_ROOT_V2_KEY
            });

            /* 4. Make ROOT show Arm Controls v2 folder */
            openmct.composition.addProvider({
                appliesTo: function (identifier) {
                    return identifier.namespace === 'ROOT';
                },
                load: function () {
                    return [
                        { namespace: ARM_CONTROL_V2_KEY, key: ARM_ROOT_V2_KEY }
                    ];
                }
            });

            /* 5. Arm v2 folder contents */
            openmct.composition.addProvider({
                appliesTo: function (domainObject) {
                    return (
                        domainObject.identifier.namespace === ARM_CONTROL_V2_KEY &&
                        domainObject.identifier.key === ARM_ROOT_V2_KEY
                    );
                },
                load: function () {
                    return [
                        { namespace: ARM_CONTROL_V2_KEY, key: MAIN_ARM_V2_INSTANCE_KEY }
                    ];
                }
            });

            /* 6. View provider */
            openmct.objectViews.addProvider({
                key: 'arm-control-v2-view',
                name: 'Arm Control v2 (FK + IK)',
                cssClass: 'icon-telemetry',

                canView: function (domainObject) {
                    return domainObject.type === ARM_CONTROL_V2_KEY;
                },

                view: function () {
                    let viewInstance;

                    return {
                        show: function (element) {
                            if (!window.ArmControlV2View) {
                                element.innerHTML =
                                    '<p style="color:red">ArmControlV2View not loaded</p>';
                                return;
                            }

                            viewInstance = new window.ArmControlV2View(element, openmct);
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

            console.log('[ArmControlV2Plugin] Installed successfully');
        };
    }

    window.ArmControlV2Plugin = ArmControlV2Plugin;

})();