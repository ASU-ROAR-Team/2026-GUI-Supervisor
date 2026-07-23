(function () {
    const DRILLING_26_KEY = 'drilling-26';
    const DRILLING_26_ROOT_KEY = 'drilling-26-root';
    const MAIN_DRILLING_26_INSTANCE_KEY = 'main-drilling-26';

    function Drilling26Plugin() {
        return function install(openmct) {
            openmct.types.addType(DRILLING_26_KEY, {
                name: 'Drilling 26 Panel',
                description: 'Upgraded interface for dual motor control and telemetry.',
                cssClass: 'icon-telemetry',
                creatable: true,
                def: { type: DRILLING_26_KEY },
                initialize: function (domainObject) {
                    domainObject.name = domainObject.name || 'New Drilling 26 Panel';
                },
                form: []
            });

            openmct.objects.addProvider(DRILLING_26_KEY, {
                get: function (identifier) {
                    if (identifier.key === DRILLING_26_ROOT_KEY) {
                        return Promise.resolve({
                            identifier: identifier,
                            name: 'Drilling 26 Controls',
                            type: 'folder',
                            location: 'ROOT'
                        });
                    } else if (identifier.key === MAIN_DRILLING_26_INSTANCE_KEY) {
                        return Promise.resolve({
                            identifier: identifier,
                            name: 'Main Drilling 26 Panel',
                            type: DRILLING_26_KEY,
                            location: `${DRILLING_26_KEY}:${DRILLING_26_ROOT_KEY}`
                        });
                    }
                    return Promise.reject(new Error('Unknown object: ' + identifier.key));
                }
            });

            openmct.objects.addRoot({ namespace: DRILLING_26_KEY, key: DRILLING_26_ROOT_KEY });

            openmct.composition.addProvider({
                appliesTo: function (domainObject) {
                    return domainObject.identifier.namespace === DRILLING_26_KEY &&
                           domainObject.identifier.key === DRILLING_26_ROOT_KEY;
                },
                load: function (domainObject) {
                    return Promise.resolve([
                        { namespace: DRILLING_26_KEY, key: MAIN_DRILLING_26_INSTANCE_KEY }
                    ]);
                }
            });

            openmct.objectViews.addProvider({
                key: 'drilling-26-view',
                name: 'Drilling 26 View',
                cssClass: 'icon-telemetry',
                canView: function (domainObject) {
                    return domainObject.type === DRILLING_26_KEY;
                },
                view: function (domainObject) {
                    let drillingInstance = null;
                    return {
                        show: function (element) {
                            if (typeof window.Drilling26View === 'undefined') {
                                element.innerHTML = 'Error: Drilling26View not loaded.';
                                return;
                            }
                            drillingInstance = new window.Drilling26View(element, openmct);
                            drillingInstance.render();
                        },
                        destroy: function (element) {
                            if (drillingInstance) {
                                drillingInstance.destroy();
                                drillingInstance = null;
                            }
                        }
                    };
                }
            });
        };
    }

    window.Drilling26Plugin = Drilling26Plugin;
})();