/*****************************************************************************
 * Open MCT, Copyright (c) 2014-2024, United States Government
 * as represented by the Administrator of the National Aeronautics and Space
 * All rights reserved.
 *
 * Open MCT is licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses-2.0.
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 *
 * Open MCT includes source code licensed under additional open source
 * licenses. See the Open Source Licenses file (LICENSES.md) included with
 * this source code distribution or the Licensing information page available
 * at runtime from the About dialog for additional information.
 *****************************************************************************/

// Note: Ensure ROSLIB is loaded before this plugin (e.g., in index.html)
// ROSLIB will be available globally as 'ROSLIB'

window.StartComboPlugin = function StartComboPlugin() {
    let rosConnection = null;
    let teleopCommandPublisher = null;

    // --- ROS Subscribers for Supervisor Status ---
    let supervisorAliveSubscriber = null;
    let supervisorStateSubscriber = null;
    let currentSupervisorState = 'unknown'; // Track the supervisor's reported state
    let isSupervisorAlive = false; // Initialize as false. Will become true only when explicitly published.


    // Define the unique ID of your Tab View object.
    const TAB_VIEW_OBJECT_ID = '7f955c70-852d-4af2-9c6f-e47f0e5367f2'; // Your current Tab View ID
    const NAVIGATION_TAB_INDEX = 0; // Your current Navigation Tab Index


    return function install(openmct) {
        // IDs for OpenMCT Condition Widgets (buttons)
        const START_CONDITION_ID = '1a569409-1887-4d0b-a666-e95f315f121e';
        const STOP_CONDITION_ID = 'c3dcf803-db9c-4bea-8cf5-42757073aaa9';
        const RESET_CONDITION_ID = 'a3c8bcf6-f105-4f5e-9ea8-56f6cb53cadc';

        const AUTOMATIC_CONDITION_ID = '0864bbd3-d1c0-4788-bd64-bb69dc67b20e'; // Your Automatic Button ID
        const MANUAL_CONDITION_ID = '1960c2d2-c001-4d0a-9248-657b0c5c4d93'; // Your Manual Button ID

        const TELEOP_FORWARD_ID = '4869247c-071e-4758-af09-4c392f91157c';
        const TELEOP_BACKWARD_ID = '8d37b37c-f119-4c84-9cdd-ee5ab8085fd9';
        const TELEOP_LEFT_ID = 'da097b62-92ea-4226-97e6-13e7a3d01753'; // Corrected typo here
        const TELEOP_RIGHT_ID = 'e9521249-b137-4fed-bc12-5e825d721d2f';

        // --- NEW: Define the ID of your OpenMCT Timer object ---
        const GUI_TIMER_ID = 'aeedce2a-e698-4421-a6b4-6caa5f9cd53b'; // Your OpenMCT Timer Object ID


        // --- Helper function to control the OpenMCT Timer object ---
        async function controlOpenMCTTimer(actionKey) {
            try {
                const timerObject = await openmct.objects.get(GUI_TIMER_ID);
                if (timerObject && openmct.actions && openmct.actions._allActions) {
                    const timerAction = openmct.actions._allActions[actionKey];
                    if (timerAction && typeof timerAction.invoke === 'function') {
                        const isApplicable = typeof timerAction.appliesTo === 'function' ? timerAction.appliesTo([timerObject]) : true;
                        if (isApplicable) {
                            await timerAction.invoke([timerObject]);
                            console.log(`StartComboPlugin: OpenMCT Timer action invoked: ${actionKey}.`);
                        } else {
                            console.log(`StartComboPlugin: OpenMCT Timer action not applicable: ${actionKey}.`);
                        }
                    } else {
                        console.error(`StartComboPlugin: OpenMCT Timer action not found: ${actionKey}. Available actions:`, Object.keys(openmct.actions._allActions));
                    }
                } else {
                    console.error('StartComboPlugin: OpenMCT Timer object or actions not available.');
                }
            } catch (error) {
                console.error(`StartComboPlugin: Error controlling OpenMCT Timer with action ${actionKey}:`, error);
            }
        }


        // --- Function to manage OpenMCT Timer based ONLY on supervisor's aliveness ---
        // This function will primarily reset the timer if the supervisor dies.
        // The start/pause/resume/reset actions for the timer will primarily be
        // driven by the button clicks, *conditional* on supervisor aliveness.
        function handleSupervisorAlivenessForTimer() {
            if (!isSupervisorAlive) {
                console.log('StartComboPlugin: Supervisor is not alive. Resetting OpenMCT Timer.');
                controlOpenMCTTimer('timer.stop'); // Hard reset if supervisor is dead
            } else {
                console.log('StartComboPlugin: Supervisor is alive. Allowing button commands to control OpenMCT Timer.');
                // No action here if supervisor is alive; timer state is managed by button clicks
            }
        }


        try {
            if (typeof ROSLIB === 'undefined' || typeof ROSLIB.Ros === 'undefined') {
                 console.error('StartComboPlugin: ROSLIB library not available.');
            } else {
                const initializeRosSubscribers = () => {
                    supervisorAliveSubscriber = new ROSLIB.Topic({
                        ros: rosConnection,
                        name: '/supervisor_alive',
                        messageType: 'std_msgs/Bool'
                    });
                    supervisorAliveSubscriber.subscribe(function(message) {
                        isSupervisorAlive = message.data; // Set based on *received* message
                        console.log('StartComboPlugin: Received /supervisor_alive:', isSupervisorAlive);
                        handleSupervisorAlivenessForTimer();
                    });
                    console.log("StartComboPlugin: Subscribed to /supervisor_alive.");

                    supervisorStateSubscriber = new ROSLIB.Topic({
                        ros: rosConnection,
                        name: '/supervisor_state',
                        messageType: 'std_msgs/String'
                    });
                    supervisorStateSubscriber.subscribe(function(message) {
                        currentSupervisorState = message.data;
                        console.log('StartComboPlugin: Received /supervisor_state:', currentSupervisorState);
                    });
                    console.log("StartComboPlugin: Subscribed to /supervisor_state.");
                };

                if (typeof window.ros !== 'undefined' && window.ros.isConnected) {
                    rosConnection = window.ros;
                    console.log('StartComboPlugin: Using existing ROS connection.');
                    teleopCommandPublisher = new ROSLIB.Topic({ ros: rosConnection, name: '/teleop_command', messageType: 'std_msgs/String' });
                    console.log("StartComboPlugin: Initialized teleop command publisher using existing connection.");
                    initializeRosSubscribers();
                    // On using existing connection, its state for isSupervisorAlive is unknown until first message
                    handleSupervisorAlivenessForTimer(); // Ensure timer is reset if supervisor isn't publishing
                } else {
                    rosConnection = new ROSLIB.Ros({
                        url: 'ws://localhost:9090' // Match your rosbridge_websocket URL
                    });
                    rosConnection.on('connection', () => {
                        console.log('StartComboPlugin: ROS Connected.');
                        teleopCommandPublisher = new ROSLIB.Topic({ ros: rosConnection, name: '/teleop_command', messageType: 'std_msgs/String' });
                        console.log("StartComboPlugin: Initialized teleop command publisher.");
                        initializeRosSubscribers();
                        // IMPORTANT: DO NOT set isSupervisorAlive = true here.
                        // It should only be true when a message from /supervisor_alive says so.
                        // The initial state of isSupervisorAlive (false) is correct until a message is received.
                        handleSupervisorAlivenessForTimer(); // Immediately check aliveness (which is false initially)
                    });
                    rosConnection.on('error', (err) => {
                        console.error('StartComboPlugin: ROS Connection error:', err);
                        isSupervisorAlive = false; // Supervisor is considered not alive if ROS connection breaks
                        currentSupervisorState = 'error'; // Indicate error state
                        handleSupervisorAlivenessForTimer(); // Reset timer due to supervisor death
                    });
                    rosConnection.on('close', () => {
                        console.warn('StartComboPlugin: ROS Connection closed.');
                        teleopCommandPublisher = null;
                        if (supervisorAliveSubscriber) { supervisorAliveSubscriber.unsubscribe(); supervisorAliveSubscriber = null; }
                        if (supervisorStateSubscriber) { supervisorStateSubscriber.unsubscribe(); supervisorStateSubscriber = null; }
                        isSupervisorAlive = false; // Supervisor definitely not alive if ROS connection is closed
                        currentSupervisorState = 'disconnected'; // Indicate disconnected state
                        handleSupervisorAlivenessForTimer(); // Reset timer due to supervisor death
                    });
                }
            }
        } catch (error) {
            console.error('StartComboPlugin: Error during ROS connection attempt:', error);
            rosConnection = null;
            teleopCommandPublisher = null;
            isSupervisorAlive = false;
            currentSupervisorState = 'error';
            handleSupervisorAlivenessForTimer();
        }

        openmct.objectViews.addProvider({
            key: 'control-button-view',
            name: 'Control Button View',
            canView: (domainObject) => {
                 return (domainObject.identifier.key === START_CONDITION_ID ||
                         domainObject.identifier.key === STOP_CONDITION_ID ||
                         domainObject.identifier.key === RESET_CONDITION_ID ||
                         domainObject.identifier.key === AUTOMATIC_CONDITION_ID ||
                         domainObject.identifier.key === MANUAL_CONDITION_ID ||
                         domainObject.identifier.key === TELEOP_FORWARD_ID ||
                         domainObject.identifier.key === TELEOP_BACKWARD_ID ||
                         domainObject.identifier.key === TELEOP_LEFT_ID ||
                         domainObject.identifier.key === TELEOP_RIGHT_ID) &&
                        domainObject.type === 'conditionWidget';
            },
            view: (domainObject, objectPath) => {
                let childView;
                let supervisorClickListener;
                let teleopMousedownListener;
                let teleopMouseupListener;
                let currentContainer;
                const capturedOpenmctForView = openmct;

                return {
                    show: (container) => {
                        currentContainer = container;
                        const providers = capturedOpenmctForView.objectViews.get(domainObject, objectPath)
                            .filter(p => p.key !== 'control-button-view');

                        if (!providers.length) {
                            console.warn('StartComboPlugin: No default view found.');
                            currentContainer.innerHTML = 'No default view available.';
                            return;
                        }

                        childView = providers[0].view(domainObject, objectPath);
                        childView.show(currentContainer);

                        let isSupervisorButton = false;
                        let isTeleopButton = false;
                        let supervisorCommand = null;
                        let teleopCommandOnPress = null;
                        let teleopCommandOnRelease = null;

                        if (domainObject.identifier.key === START_CONDITION_ID) {
                            isSupervisorButton = true;
                            supervisorCommand = "start";
                        } else if (domainObject.identifier.key === STOP_CONDITION_ID) {
                            isSupervisorButton = true;
                            supervisorCommand = "stop";
                        } else if (domainObject.identifier.key === RESET_CONDITION_ID) {
                            isSupervisorButton = true;
                            supervisorCommand = "reset";
                        } else if (domainObject.identifier.key === AUTOMATIC_CONDITION_ID) {
                            isSupervisorButton = true;
                            supervisorCommand = "automatic";
                        } else if (domainObject.identifier.key === MANUAL_CONDITION_ID) {
                            isSupervisorButton = true;
                            supervisorCommand = "manual";
                        }
                        else if (domainObject.identifier.key === TELEOP_FORWARD_ID) {
                            isTeleopButton = true;
                            teleopCommandOnPress = "forward";
                            teleopCommandOnRelease = "stop"; // Release sends 'stop'
                        } else if (domainObject.identifier.key === TELEOP_BACKWARD_ID) {
                            isTeleopButton = true;
                            teleopCommandOnPress = "backward";
                            teleopCommandOnRelease = "stop"; // Release sends 'stop'
                        } else if (domainObject.identifier.key === TELEOP_LEFT_ID) {
                            isTeleopButton = true;
                            teleopCommandOnPress = "left";
                            teleopCommandOnRelease = "stop"; // Release sends 'stop'
                        } else if (domainObject.identifier.key === TELEOP_RIGHT_ID) {
                            isTeleopButton = true;
                            teleopCommandOnPress = "right";
                            teleopCommandOnRelease = "stop"; // Release sends 'stop'
                        }

                        if (isSupervisorButton) {
                            supervisorClickListener = async () => {
                                console.log(`StartComboPlugin: Supervisor Button clicked: ${domainObject.identifier.key}, Command: ${supervisorCommand}`);

                                let activeTabIndex = null;
                                const params = capturedOpenmctForView.router.currentLocation.params;
                                const tabParamName = `tabs.pos.${TAB_VIEW_OBJECT_ID}`;
                                if (params && params[tabParamName]) {
                                    activeTabIndex = parseInt(params[tabParamName], 10);
                                }

                                if (activeTabIndex === NAVIGATION_TAB_INDEX) {
                                    if (!isSupervisorAlive) {
                                        console.warn(`StartComboPlugin: Supervisor is not alive. Command "${supervisorCommand}" will not be sent, and timer will not be affected by this button press.`);
                                        return;
                                    }

                                    console.log('StartComboPlugin: Navigation tab is active. Triggering supervisor/mode actions.');

                                    if (supervisorCommand && rosConnection && rosConnection.isConnected) {
                                        try {
                                            const launchService = new ROSLIB.Service({
                                                ros: rosConnection,
                                                name: '/LaunchAPF',
                                                serviceType: 'apf_trials/LaunchAPF'
                                            });
                                            const request = new ROSLIB.ServiceRequest({ command: supervisorCommand });

                                            launchService.callService(request, (result) => {
                                                console.log(`StartComboPlugin: ROS service call result for "${supervisorCommand}": success=${result.success}, message="${result.message}"`);

                                                if (result.success) {
                                                    console.log(`StartComboPlugin: ROS service call success for "${supervisorCommand}". Synchronizing OpenMCT Timer.`);
                                                    if (supervisorCommand === "start") {
                                                        controlOpenMCTTimer('timer.start');
                                                    } else if (supervisorCommand === "stop") {
                                                        controlOpenMCTTimer('timer.pause');
                                                    } else if (supervisorCommand === "reset") {
                                                        controlOpenMCTTimer('timer.stop');
                                                    }
                                                } else {
                                                    console.error(`StartComboPlugin: ROS service call failed for "${supervisorCommand}". OpenMCT Timer state NOT changed. Supervisor might be in a state that cannot accept this command.`);
                                                }
                                            }, (error) => {
                                                console.error(`StartComboPlugin: ROS service call error for "${supervisorCommand}":`, error);
                                            });
                                        } catch (error) {
                                            console.error('StartComboPlugin: Error preparing or calling ROS service:', error);
                                        }
                                    } else if (supervisorCommand) {
                                        console.warn(`StartComboPlugin: ROS connection not ready or command is null. Supervisor command "${supervisorCommand}" not sent, OpenMCT Timer state NOT changed.`);
                                    }
                                } else {
                                    console.log(`StartComboPlugin: Supervisor button click ignored: Not on Navigation tab (${activeTabIndex}).`);
                                }
                            };
                        }

                        if (isTeleopButton) {
                            teleopMousedownListener = () => {
                                console.log(`StartComboPlugin: Teleop Button mousedown: ${domainObject.identifier.key}, Command: ${teleopCommandOnPress}`);

                                let activeTabIndex = null;
                                const params = capturedOpenmctForView.router.currentLocation.params;
                                const tabParamName = `tabs.pos.${TAB_VIEW_OBJECT_ID}`;
                                if (params && params[tabParamName]) {
                                    activeTabIndex = parseInt(params[tabParamName], 10);
                                }

                                if (activeTabIndex === NAVIGATION_TAB_INDEX) {
                                     if (!isSupervisorAlive) {
                                         console.warn(`StartComboPlugin: Supervisor is not alive. Teleop command "${teleopCommandOnPress}" will not be sent.`);
                                         return;
                                     }
                                     if (teleopCommandOnPress && teleopCommandPublisher) {
                                          try {
                                              const message = new ROSLIB.Message({ data: teleopCommandOnPress });
                                              teleopCommandPublisher.publish(message);
                                              console.log(`StartComboPlugin: Published teleop command on mousedown: "${teleopCommandOnPress}" to /teleop_command.`);
                                          } catch (error) { console.error(`StartComboPlugin: Error publishing teleop command "${teleopCommandOnPress}" on mousedown:`, error); }
                                     } else if (teleopCommandOnPress) {
                                          console.warn(`StartComboPlugin: Teleop command publisher not ready or command is null. Teleop command "${teleopCommandOnPress}" not sent on mousedown.`);
                                     }
                                } else {
                                     console.log(`StartComboPlugin: Teleop button mousedown ignored: Not on Navigation tab (${activeTabIndex}).`);
                                }
                            };

                            teleopMouseupListener = () => {
                                console.log(`StartComboPlugin: Teleop Button mouseup: ${domainObject.identifier.key}, Command: ${teleopCommandOnRelease}`);

                                let activeTabIndex = null;
                                const params = capturedOpenmctForView.router.currentLocation.params;
                                const tabParamName = `tabs.pos.${TAB_VIEW_OBJECT_ID}`;
                                if (params && params[tabParamName]) {
                                    activeTabIndex = parseInt(params[tabParamName], 10);
                                }

                                if (activeTabIndex === NAVIGATION_TAB_INDEX) {
                                     if (!isSupervisorAlive) {
                                         console.warn(`StartComboPlugin: Supervisor is not alive. Teleop command "${teleopCommandOnRelease}" will not be sent.`);
                                         return;
                                     }
                                     if (teleopCommandOnRelease && teleopCommandPublisher) {
                                          try {
                                              const message = new ROSLIB.Message({ data: teleopCommandOnRelease });
                                              teleopCommandPublisher.publish(message);
                                              console.log(`StartComboPlugin: Published teleop command on mouseup: "${teleopCommandOnRelease}" to /teleop_command.`);
                                          } catch (error) { console.error(`StartComboPlugin: Error publishing teleop command "${teleopCommandOnRelease}" on mouseup:`, error); error }
                                     } else if (teleopCommandOnRelease) {
                                          console.warn(`StartComboPlugin: Teleop command publisher not ready or command is null. Teleop command "${teleopCommandOnRelease}" not sent on mouseup.`);
                                     }
                                } else {
                                     console.log(`StartComboPlugin: Teleop button mouseup ignored: Not on Navigation tab (${activeTabIndex}).`);
                                }
                            };
                        }

                        currentContainer.style.cursor = 'pointer';

                        if (isSupervisorButton && supervisorClickListener) {
                            currentContainer.addEventListener('click', supervisorClickListener);
                        } else if (isTeleopButton && teleopMousedownListener && teleopMouseupListener) {
                            currentContainer.addEventListener('mousedown', teleopMousedownListener);
                            currentContainer.addEventListener('mouseup', teleopMouseupListener);
                            currentContainer.addEventListener('mouseleave', teleopMouseupListener);
                            currentContainer.addEventListener('dragstart', (event) => { event.preventDefault(); });
                        }
                    },
                    destroy: () => {
                        if (currentContainer) {
                            if (supervisorClickListener) {
                                currentContainer.removeEventListener('click', supervisorClickListener);
                            }
                            if (teleopMousedownListener) {
                                currentContainer.removeEventListener('mousedown', teleopMousedownListener);
                            }
                            if (teleopMouseupListener) {
                                currentContainer.removeEventListener('mouseup', teleopMouseupListener);
                                currentContainer.removeEventListener('mouseleave', teleopMouseupListener);
                                currentContainer.removeEventListener('dragstart', (event) => { event.preventDefault(); });
                            }
                            currentContainer.style.cursor = '';
                        }
                        childView?.destroy?.();
                        currentContainer = null;
                        supervisorClickListener = null;
                        teleopMousedownListener = null;
                        teleopMouseupListener = null;
                        childView = null;
                    }
                };
            }
        });

        // Main plugin destroy function
        return {
             destroy: () => {
                 // Unsubscribe from ROS topics
                 if (supervisorAliveSubscriber) {
                     supervisorAliveSubscriber.unsubscribe();
                     supervisorAliveSubscriber = null;
                     console.log("StartComboPlugin: Unsubscribed from /supervisor_alive.");
                 }
                 if (supervisorStateSubscriber) {
                     supervisorStateSubscriber.unsubscribe();
                     supervisorStateSubscriber = null;
                     console.log("StartComboPlugin: Unsubscribed from /supervisor_state.");
                 }

                 if (rosConnection && rosConnection.isConnected && (typeof window.ros === 'undefined' || window.ros !== rosConnection)) {
                      console.log('StartComboPlugin: Closing ROS connection.');
                     try { rosConnection.close(); } catch (error) { console.error('StartComboPlugin: Error closing ROS connection:', error); }
                 } else if (rosConnection && (typeof window.ros === 'undefined' || window.ros !== rosConnection)) {
                     console.log('StartComboPlugin: ROS connection not connected, cleaning up.');
                     try { rosConnection = null; } catch (error) { console.error('StartComboPlugin: Error during cleanup:', error); }
                 }
                 teleopCommandPublisher = null;
             }
        };
    };
}