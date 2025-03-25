import * as THREE from 'three';
import { EventEmitter } from 'events';

export class VehicleTuningSystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            engine: {
                powerCurve: {
                    min: 1000,
                    max: 7000,
                    points: 10,
                    range: { min: 0.7, max: 1.3 }
                },
                throttleResponse: {
                    min: 0.1,
                    max: 1.0,
                    step: 0.1
                },
                revLimiter: {
                    min: 5000,
                    max: 8000,
                    step: 100
                }
            },
            transmission: {
                gearRatios: {
                    min: 0.5,
                    max: 4.0,
                    step: 0.1,
                    gears: 6
                },
                finalDrive: {
                    min: 2.5,
                    max: 5.0,
                    step: 0.1
                },
                shiftSpeed: {
                    min: 0.1,
                    max: 0.5,
                    step: 0.05
                }
            },
            suspension: {
                springs: {
                    stiffness: {
                        min: 50000,
                        max: 150000,
                        step: 5000
                    },
                    height: {
                        min: 0.2,
                        max: 0.5,
                        step: 0.01
                    }
                },
                dampers: {
                    compression: {
                        min: 3000,
                        max: 9000,
                        step: 500
                    },
                    rebound: {
                        min: 3000,
                        max: 9000,
                        step: 500
                    }
                },
                antiRollBars: {
                    front: {
                        min: 1000,
                        max: 5000,
                        step: 250
                    },
                    rear: {
                        min: 1000,
                        max: 5000,
                        step: 250
                    }
                }
            },
            differentials: {
                front: {
                    lockingRange: {
                        min: 0,
                        max: 1,
                        step: 0.1
                    },
                    preload: {
                        min: 0,
                        max: 100,
                        step: 5
                    }
                },
                rear: {
                    lockingRange: {
                        min: 0,
                        max: 1,
                        step: 0.1
                    },
                    preload: {
                        min: 0,
                        max: 100,
                        step: 5
                    }
                },
                center: {
                    torqueSplit: {
                        min: 0.1,
                        max: 0.9,
                        step: 0.1
                    }
                }
            },
            brakes: {
                bias: {
                    min: 0.3,
                    max: 0.7,
                    step: 0.05
                },
                pressure: {
                    min: 0.5,
                    max: 1.5,
                    step: 0.1
                }
            },
            tires: {
                pressure: {
                    min: 25,
                    max: 45,
                    step: 1
                },
                compound: ['soft', 'medium', 'hard', 'offroad'],
                camber: {
                    min: -3.0,
                    max: 3.0,
                    step: 0.5
                }
            }
        };

        this.state = {
            engine: {
                powerCurve: this.generateDefaultPowerCurve(),
                throttleResponse: 0.5,
                revLimiter: 6500
            },
            transmission: {
                gearRatios: [3.5, 2.5, 1.8, 1.3, 1.0, 0.8],
                finalDrive: 3.7,
                shiftSpeed: 0.3
            },
            suspension: {
                springs: {
                    stiffness: 100000,
                    height: 0.35
                },
                dampers: {
                    compression: 6000,
                    rebound: 6000
                },
                antiRollBars: {
                    front: 3000,
                    rear: 2500
                }
            },
            differentials: {
                front: {
                    lockingRange: 0.5,
                    preload: 50
                },
                rear: {
                    lockingRange: 0.5,
                    preload: 50
                },
                center: {
                    torqueSplit: 0.5
                }
            },
            brakes: {
                bias: 0.5,
                pressure: 1.0
            },
            tires: {
                pressure: 35,
                compound: 'medium',
                camber: 0
            },
            presets: new Map(),
            telemetry: {
                enabled: false,
                data: []
            }
        };

        this.initialize();
    }

    initialize() {
        this.setupDefaultPresets();
        this.applyCurrentTuning();
        this.setupTelemetry();
    }

    generateDefaultPowerCurve() {
        const curve = [];
        const { min, max, points } = this.settings.engine.powerCurve;
        const step = (max - min) / (points - 1);

        for (let i = 0; i < points; i++) {
            const rpm = min + (step * i);
            const power = this.calculateDefaultPower(rpm);
            curve.push({ rpm, power });
        }

        return curve;
    }

    calculateDefaultPower(rpm) {
        // Simplified power curve calculation
        const normalizedRpm = (rpm - this.settings.engine.powerCurve.min) /
            (this.settings.engine.powerCurve.max - this.settings.engine.powerCurve.min);
        return Math.sin(normalizedRpm * Math.PI) * 0.5 + 0.5;
    }

    setupDefaultPresets() {
        // Race preset
        this.savePreset('race', {
            engine: {
                throttleResponse: 0.8,
                revLimiter: 7000
            },
            suspension: {
                springs: {
                    stiffness: 120000,
                    height: 0.3
                }
            },
            tires: {
                compound: 'soft',
                pressure: 32
            }
        });

        // Offroad preset
        this.savePreset('offroad', {
            suspension: {
                springs: {
                    stiffness: 80000,
                    height: 0.45
                },
                dampers: {
                    compression: 7000,
                    rebound: 7000
                }
            },
            tires: {
                compound: 'offroad',
                pressure: 28
            }
        });
    }

    setupTelemetry() {
        if (this.state.telemetry.enabled) {
            this.telemetryInterval = setInterval(() => {
                this.recordTelemetry();
            }, 100); // 10Hz sampling rate
        }
    }

    recordTelemetry() {
        const vehicleData = this.vehicle.getState();
        const timestamp = Date.now();

        this.state.telemetry.data.push({
            timestamp,
            rpm: vehicleData.rpm,
            speed: vehicleData.speed,
            gear: vehicleData.gear,
            throttle: vehicleData.throttle,
            brake: vehicleData.brake,
            suspension: vehicleData.suspensionCompression
        });

        // Keep only last 30 seconds of data
        if (this.state.telemetry.data.length > 300) {
            this.state.telemetry.data.shift();
        }
    }

    tune(category, subcategory, parameter, value) {
        const settings = this.settings[category];
        if (!settings) return false;

        if (subcategory) {
            if (!settings[subcategory]) return false;
            if (!this.validateValue(settings[subcategory][parameter], value)) return false;
            this.state[category][subcategory][parameter] = value;
        } else {
            if (!this.validateValue(settings[parameter], value)) return false;
            this.state[category][parameter] = value;
        }

        this.applyTuning(category, subcategory, parameter);
        this.emit('tuningUpdated', { category, subcategory, parameter, value });
        return true;
    }

    validateValue(setting, value) {
        if (Array.isArray(setting)) {
            return setting.includes(value);
        }
        
        if (typeof value === 'number') {
            return value >= setting.min && 
                   value <= setting.max && 
                   (value % setting.step === 0 || Math.abs(value % setting.step) < 0.0001);
        }

        return false;
    }

    applyTuning(category, subcategory, parameter) {
        switch (category) {
            case 'engine':
                this.applyEngineTuning(subcategory, parameter);
                break;
            case 'transmission':
                this.applyTransmissionTuning(parameter);
                break;
            case 'suspension':
                this.applySuspensionTuning(subcategory, parameter);
                break;
            case 'differentials':
                this.applyDifferentialTuning(subcategory, parameter);
                break;
            case 'brakes':
                this.applyBrakeTuning(parameter);
                break;
            case 'tires':
                this.applyTireTuning(parameter);
                break;
        }
    }

    applyEngineTuning(subcategory, parameter) {
        const engineState = this.state.engine;
        
        if (parameter === 'powerCurve') {
            this.vehicle.updatePowerCurve(engineState.powerCurve);
        } else if (parameter === 'throttleResponse') {
            this.vehicle.updateThrottleResponse(engineState.throttleResponse);
        } else if (parameter === 'revLimiter') {
            this.vehicle.updateRevLimiter(engineState.revLimiter);
        }
    }

    applyTransmissionTuning(parameter) {
        const transState = this.state.transmission;
        
        if (parameter === 'gearRatios') {
            this.vehicle.updateGearRatios(transState.gearRatios);
        } else if (parameter === 'finalDrive') {
            this.vehicle.updateFinalDrive(transState.finalDrive);
        } else if (parameter === 'shiftSpeed') {
            this.vehicle.updateShiftSpeed(transState.shiftSpeed);
        }
    }

    applySuspensionTuning(subcategory, parameter) {
        const suspState = this.state.suspension;
        
        if (subcategory === 'springs') {
            this.vehicle.updateSuspensionSprings({
                stiffness: suspState.springs.stiffness,
                height: suspState.springs.height
            });
        } else if (subcategory === 'dampers') {
            this.vehicle.updateSuspensionDampers({
                compression: suspState.dampers.compression,
                rebound: suspState.dampers.rebound
            });
        } else if (subcategory === 'antiRollBars') {
            this.vehicle.updateAntiRollBars({
                front: suspState.antiRollBars.front,
                rear: suspState.antiRollBars.rear
            });
        }
    }

    applyDifferentialTuning(subcategory, parameter) {
        const diffState = this.state.differentials;
        
        if (subcategory === 'front' || subcategory === 'rear') {
            this.vehicle.updateDifferential(subcategory, {
                lockingRange: diffState[subcategory].lockingRange,
                preload: diffState[subcategory].preload
            });
        } else if (subcategory === 'center') {
            this.vehicle.updateTorqueSplit(diffState.center.torqueSplit);
        }
    }

    applyBrakeTuning(parameter) {
        const brakeState = this.state.brakes;
        
        if (parameter === 'bias') {
            this.vehicle.updateBrakeBias(brakeState.bias);
        } else if (parameter === 'pressure') {
            this.vehicle.updateBrakePressure(brakeState.pressure);
        }
    }

    applyTireTuning(parameter) {
        const tireState = this.state.tires;
        
        if (parameter === 'pressure') {
            this.vehicle.updateTirePressure(tireState.pressure);
        } else if (parameter === 'compound') {
            this.vehicle.updateTireCompound(tireState.compound);
        } else if (parameter === 'camber') {
            this.vehicle.updateTireCamber(tireState.camber);
        }
    }

    applyCurrentTuning() {
        // Apply all current tuning settings
        Object.keys(this.state).forEach(category => {
            if (category === 'presets' || category === 'telemetry') return;
            
            const categoryState = this.state[category];
            Object.keys(categoryState).forEach(parameter => {
                if (typeof categoryState[parameter] === 'object') {
                    Object.keys(categoryState[parameter]).forEach(subParameter => {
                        this.applyTuning(category, parameter, subParameter);
                    });
                } else {
                    this.applyTuning(category, null, parameter);
                }
            });
        });
    }

    savePreset(name, settings) {
        this.state.presets.set(name, JSON.parse(JSON.stringify(settings)));
    }

    loadPreset(name) {
        const preset = this.state.presets.get(name);
        if (!preset) return false;

        // Deep merge preset with current state
        Object.entries(preset).forEach(([category, settings]) => {
            if (typeof settings === 'object') {
                Object.entries(settings).forEach(([subcategory, values]) => {
                    if (typeof values === 'object') {
                        Object.entries(values).forEach(([parameter, value]) => {
                            this.tune(category, subcategory, parameter, value);
                        });
                    } else {
                        this.tune(category, null, subcategory, values);
                    }
                });
            }
        });

        this.emit('presetLoaded', name);
        return true;
    }

    getTelemetryData() {
        return this.state.telemetry.data;
    }

    enableTelemetry(enabled) {
        this.state.telemetry.enabled = enabled;
        
        if (enabled) {
            this.setupTelemetry();
        } else {
            clearInterval(this.telemetryInterval);
            this.state.telemetry.data = [];
        }
    }

    save() {
        return {
            engine: { ...this.state.engine },
            transmission: { ...this.state.transmission },
            suspension: { ...this.state.suspension },
            differentials: { ...this.state.differentials },
            brakes: { ...this.state.brakes },
            tires: { ...this.state.tires },
            presets: Array.from(this.state.presets.entries())
        };
    }

    load(data) {
        Object.assign(this.state, {
            ...data,
            presets: new Map(data.presets),
            telemetry: {
                enabled: false,
                data: []
            }
        });

        this.applyCurrentTuning();
    }

    dispose() {
        clearInterval(this.telemetryInterval);
        this.removeAllListeners();
    }
} 