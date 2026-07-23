// src/plugins/Arm-Control-FK/plugin.js
(function () {
    const ARM_CONTROL_FK_KEY = 'arm-control-fk';
    const ARM_ROOT_FK_KEY = 'arm-root-fk';
    const MAIN_ARM_FK_INSTANCE_KEY = 'main-arm-fk';

    function ArmControlFKPlugin() {
        return function install(openmct) {
            openmct.types.addType(ARM_CONTROL_FK_KEY, {
                name: 'Robotic Arm Control (FK Float32)',
                description: 'Modified FK mode mapped to Float32 topics',
                cssClass: 'icon-telemetry',
                creatable: false
            });

            openmct.objects.addProvider(ARM_CONTROL_FK_KEY, {
                get: function (identifier) {
                    if (identifier.key === ARM_ROOT_FK_KEY) {
                        return Promise.resolve({
                            identifier, name: 'Arm Controls FK', type: 'folder', location: 'ROOT'
                        });
                    }
                    if (identifier.key === MAIN_ARM_FK_INSTANCE_KEY) {
                        return Promise.resolve({
                            identifier, name: 'Robotic Arm Control (FK Mod)', type: ARM_CONTROL_FK_KEY, location: `${ARM_CONTROL_FK_KEY}:${ARM_ROOT_FK_KEY}`
                        });
                    }
                    return Promise.reject('Unknown object: ' + identifier.key);
                }
            });

            openmct.objects.addRoot({ namespace: ARM_CONTROL_FK_KEY, key: ARM_ROOT_FK_KEY });

            openmct.composition.addProvider({
                appliesTo: function (identifier) { return identifier.namespace === 'ROOT'; },
                load: function () { return [{ namespace: ARM_CONTROL_FK_KEY, key: ARM_ROOT_FK_KEY }]; }
            });

            openmct.composition.addProvider({
                appliesTo: function (domainObject) {
                    return domainObject.identifier.namespace === ARM_CONTROL_FK_KEY && domainObject.identifier.key === ARM_ROOT_FK_KEY;
                },
                load: function () { return [{ namespace: ARM_CONTROL_FK_KEY, key: MAIN_ARM_FK_INSTANCE_KEY }]; }
            });

            openmct.objectViews.addProvider({
                key: 'arm-control-fk-view',
                name: 'Arm Control FK Mod',
                cssClass: 'icon-telemetry',
                canView: function (domainObject) { return domainObject.type === ARM_CONTROL_FK_KEY; },
                view: function () {
                    let viewInstance;
                    return {
                        show: function (element) {
                            if (!window.ArmControlFKView) { element.innerHTML = '<p style="color:red">View not loaded</p>'; return; }
                            viewInstance = new window.ArmControlFKView(element, openmct);
                            viewInstance.render();
                        },
                        destroy: function () {
                            if (viewInstance?.destroy) viewInstance.destroy();
                            viewInstance = null;
                        }
                    };
                }
            });
        };
    }
    window.ArmControlFKPlugin = ArmControlFKPlugin;
})();