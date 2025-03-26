import { EventEmitter } from 'events';
import * as THREE from 'three';

export class VehiclePerformanceSystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            engine: {
                types: {
                    gasoline: {
                        powerCurve: [
                            { rpm: 1000, power: 20, torque: 180 },
                            { rpm: 2000, power: 45, torque: 210 },
                            { rpm: 3000, power: 75, torque: 230 },
                            { rpm: 4000, power: 110, torque: 245 },
                            { rpm: 5000, power: 140, torque: 235 },
                            { rpm: 6000, power: 160, torque: 215 },
                            { rpm: 7000, power: 155, torque: 190 }
                        ],
                        redline: 7000,
                        idleRpm: 800,
                        fuelConsumption: 0.12 // liters per kilometer
                    },
                    diesel: {
                        powerCurve: [
                            { rpm: 1000, power: 30, torque: 300 },
                            { rpm: 1500, power: 60, torque: 350 },
                            { rpm: 2000, power: 90, torque: 400 },
                            { rpm: 2500, power: 120, torque: 420 },
                            { rpm: 3000, power: 140, torque: 400 },
                            { rpm: 3500, power: 150, torque: 370 },
                            { rpm: 4000, power: 145, torque: 340 }
                        ],
                        redline: 4500,
                        idleRpm: 700,
                        fuelConsumption: 0.09
                    }
                },
                temperature: {
                    optimal: 90, // Celsius
                    overheat: 120,
                    cooldown: 0.1, // degrees per second
                    heatup: 0.2
                },
                damage: {
                    powerLoss: 0.2, // max power loss from damage
                    wearRate: 0.001 // per kilometer
                }
            },
            transmission: {
                types: {
                    manual: {
                        gearRatios: [-2.9, 3.32, 2.13, 1.48, 1.00, 0.74],
                        shiftTime: 0.5,
                        efficiency: 0.95
                    },
                    automatic: {
                        gearRatios: [-2.7, 3.06, 1.95, 1.35, 1.00, 0.85],
                        shiftTime: 0.3,
                        efficiency: 0.92
                    }
                },
                finalDrive: 3.73,
                clutchSlip: {
                    max: 1.0,
                    recovery: 0.5 // per second
                }
            },
            drivetrain: {
                types: {
                    rwd: {
                        frontBias: 0,
                        rearBias: 1,
                        efficiency: 0.97
                    },
                    fwd: {
                        frontBias: 1,
                        rearBias: 0,
                        efficiency: 0.96
                    },
                    awd: {
                        frontBias: 0.4,
                        rearBias: 0.6,
                        efficiency: 0.94,
                        centerDiffLock: false
                    }
                },
                differential: {
                    slipRatio: 0.3,
                    lockRate: 0.5
                }
            },
            turbo: {
                enabled: false,
                boost: {
                    max: 1.5, // bar
                    rampUp: 0.3, // seconds to full boost
                    rampDown: 0.2
                },
                wastegate: {
                    threshold: 1.2, // bar
                    response: 0.1 // seconds
                }
            },
            telemetry: {
                sampleRate: 60, // Hz
                bufferSize: 3600, // 1 minute at 60Hz
                metrics: [
                    'rpm',
                    'speed',
                    'gear',
                    'throttle',
                    'boost',
                    'temperature',
                    'fuel'
                ]
            }
        };

        this.state = {
            engine: {
                rpm: 0,
                power: 0,
                torque: 0,
                temperature: 20,
                damage: 0,
                running: false,
                starter: false,
                fuelLevel: 100, // percentage
                consumption: 0
            },
            transmission: {
                gear: 0,
                clutch: 1.0,
                shifting: false,
                shiftTimer: 0
            },
            drivetrain: {
                wheelSpeeds: [0, 0, 0, 0],
                wheelTorques: [0, 0, 0, 0],
                diffLock: false
            },
            turbo: {
                boost: 0,
                wastegateOpen: false,
                spooling: false
            },
            telemetry: {
                buffer: [],
                lastSample: 0
            }
        };

        this.initialize();
    }

    initialize() {
        this.setupEngine();
        this.setupTransmission();
        this.setupDrivetrain();
        this.setupTurbo();
        this.setupTelemetry();
    }

    setupEngine() {
        // Set initial engine type
        this.engineType = 'gasoline';
        this.engineConfig = this.settings.engine.types[this.engineType];
        
        // Create interpolated power curve
        this.powerCurve = this.createPowerCurve();
    }

    createPowerCurve() {
        const curve = this.engineConfig.powerCurve;
        return {
            power: (rpm) => {
                // Find surrounding points
                let lower = curve[0];
                let upper = curve[curve.length - 1];
                
                for (let i = 0; i < curve.length - 1; i++) {
                    if (rpm >= curve[i].rpm && rpm <= curve[i + 1].rpm) {
                        lower = curve[i];
                        upper = curve[i + 1];
                        break;
                    }
                }

                // Interpolate
                const t = (rpm - lower.rpm) / (upper.rpm - lower.rpm);
                return lower.power + (upper.power - lower.power) * t;
            },
            torque: (rpm) => {
                let lower = curve[0];
                let upper = curve[curve.length - 1];
                
                for (let i = 0; i < curve.length - 1; i++) {
                    if (rpm >= curve[i].rpm && rpm <= curve[i + 1].rpm) {
                        lower = curve[i];
                        upper = curve[i + 1];
                        break;
                    }
                }

                const t = (rpm - lower.rpm) / (upper.rpm - lower.rpm);
                return lower.torque + (upper.torque - lower.torque) * t;
            }
        };
    }

    setupTransmission() {
        // Set initial transmission type
        this.transmissionType = 'manual';
        this.transmissionConfig = this.settings.transmission.types[this.transmissionType];
    }

    setupDrivetrain() {
        // Set initial drivetrain type
        this.drivetrainType = 'rwd';
        this.drivetrainConfig = this.settings.drivetrain.types[this.drivetrainType];
    }

    setupTurbo() {
        if (this.settings.turbo.enabled) {
            this.state.turbo.boost = 0;
            this.state.turbo.wastegateOpen = false;
        }
    }

    setupTelemetry() {
        this.state.telemetry.buffer = new Array(this.settings.telemetry.bufferSize)
            .fill(null)
            .map(() => ({
                time: 0,
                metrics: {}
            }));
    }

    update(deltaTime) {
        this.updateEngine(deltaTime);
        this.updateTransmission(deltaTime);
        this.updateDrivetrain(deltaTime);
        this.updateTurbo(deltaTime);
        this.updateTelemetry();
    }

    updateEngine(deltaTime) {
        if (!this.state.engine.running) {
            if (this.state.engine.starter) {
                this.startEngine();
            }
            return;
        }

        // Update RPM based on throttle and load
        const targetRpm = this.calculateTargetRpm();
        const rpmChange = (targetRpm - this.state.engine.rpm) * deltaTime * 2;
        this.state.engine.rpm = Math.max(
            this.engineConfig.idleRpm,
            Math.min(this.engineConfig.redline, this.state.engine.rpm + rpmChange)
        );

        // Calculate power and torque
        this.state.engine.power = this.calculateEnginePower();
        this.state.engine.torque = this.calculateEngineTorque();

        // Update temperature
        this.updateEngineTemperature(deltaTime);

        // Update fuel consumption
        this.updateFuelConsumption(deltaTime);

        // Update engine damage
        this.updateEngineDamage(deltaTime);
    }

    calculateTargetRpm() {
        const throttle = this.vehicle.throttle;
        const load = this.vehicle.getEngineLoad();
        const gear = this.state.transmission.gear;
        const gearRatio = this.transmissionConfig.gearRatios[gear];
        const wheelSpeed = this.getAverageWheelSpeed();

        if (gear === 0) return this.engineConfig.idleRpm;

        return (wheelSpeed * gearRatio * this.settings.transmission.finalDrive * 60) / (2 * Math.PI);
    }

    calculateEnginePower() {
        let power = this.powerCurve.power(this.state.engine.rpm);
        
        // Apply damage reduction
        power *= (1 - this.state.engine.damage * this.settings.engine.damage.powerLoss);

        // Apply temperature effects
        const tempFactor = this.calculateTemperatureFactor();
        power *= tempFactor;

        // Apply turbo boost
        if (this.settings.turbo.enabled) {
            power *= (1 + this.state.turbo.boost * 0.5);
        }

        return power * this.vehicle.throttle;
    }

    calculateEngineTorque() {
        let torque = this.powerCurve.torque(this.state.engine.rpm);
        
        // Apply damage reduction
        torque *= (1 - this.state.engine.damage * this.settings.engine.damage.powerLoss);

        // Apply temperature effects
        const tempFactor = this.calculateTemperatureFactor();
        torque *= tempFactor;

        // Apply turbo boost
        if (this.settings.turbo.enabled) {
            torque *= (1 + this.state.turbo.boost * 0.5);
        }

        return torque * this.vehicle.throttle;
    }

    calculateTemperatureFactor() {
        const temp = this.state.engine.temperature;
        const optimal = this.settings.engine.temperature.optimal;
        const overheat = this.settings.engine.temperature.overheat;

        if (temp < optimal) {
            return 0.8 + 0.2 * (temp / optimal);
        } else if (temp > overheat) {
            return Math.max(0, 1 - (temp - overheat) / 20);
        }
        return 1;
    }

    updateEngineTemperature(deltaTime) {
        const temp = this.state.engine.temperature;
        const load = this.vehicle.getEngineLoad();
        const optimal = this.settings.engine.temperature.optimal;

        // Temperature increases with load and RPM
        const heatGeneration = this.settings.engine.temperature.heatup * 
            (load * 0.7 + this.state.engine.rpm / this.engineConfig.redline * 0.3);

        // Cooling based on vehicle speed and ambient temperature
        const cooling = this.settings.engine.temperature.cooldown * 
            (1 + this.vehicle.speed / 100);

        this.state.engine.temperature += (heatGeneration - cooling) * deltaTime;
    }

    updateFuelConsumption(deltaTime) {
        const consumption = this.engineConfig.fuelConsumption * 
            (this.state.engine.rpm / this.engineConfig.redline) * 
            this.vehicle.throttle * 
            deltaTime;

        this.state.engine.consumption = consumption;
        this.state.engine.fuelLevel = Math.max(
            0,
            this.state.engine.fuelLevel - consumption
        );

        if (this.state.engine.fuelLevel === 0) {
            this.stopEngine();
        }
    }

    updateEngineDamage(deltaTime) {
        // Base wear from usage
        const baseWear = this.settings.engine.damage.wearRate * 
            (this.state.engine.rpm / this.engineConfig.redline) * 
            deltaTime;

        // Additional wear from overheating
        let heatWear = 0;
        if (this.state.engine.temperature > this.settings.engine.temperature.overheat) {
            heatWear = (this.state.engine.temperature - this.settings.engine.temperature.overheat) * 
                0.001 * deltaTime;
        }

        this.state.engine.damage = Math.min(
            1,
            this.state.engine.damage + baseWear + heatWear
        );
    }

    updateTransmission(deltaTime) {
        if (this.state.transmission.shifting) {
            this.updateShifting(deltaTime);
        }

        // Update clutch
        this.updateClutch(deltaTime);

        // Calculate gear ratios and efficiency
        this.updateGearEfficiency();
    }

    updateShifting(deltaTime) {
        this.state.transmission.shiftTimer += deltaTime;
        
        if (this.state.transmission.shiftTimer >= this.transmissionConfig.shiftTime) {
            this.state.transmission.shifting = false;
            this.state.transmission.shiftTimer = 0;
            this.emit('shiftComplete', this.state.transmission.gear);
        }
    }

    updateClutch(deltaTime) {
        if (this.state.transmission.clutch < 1) {
            this.state.transmission.clutch = Math.min(
                1,
                this.state.transmission.clutch + 
                this.settings.transmission.clutchSlip.recovery * deltaTime
            );
        }
    }

    updateGearEfficiency() {
        const gearRatio = this.transmissionConfig.gearRatios[this.state.transmission.gear];
        const finalRatio = this.settings.transmission.finalDrive;
        const efficiency = this.transmissionConfig.efficiency;

        this.state.transmission.totalRatio = gearRatio * finalRatio;
        this.state.transmission.efficiency = efficiency * 
            (1 - Math.abs(1 - this.state.transmission.clutch) * 0.3);
    }

    updateDrivetrain(deltaTime) {
        // Calculate torque distribution
        this.calculateTorqueDistribution();

        // Update differential behavior
        this.updateDifferential();

        // Calculate drivetrain losses
        this.calculateDrivetrainLosses();
    }

    calculateTorqueDistribution() {
        const totalTorque = this.state.engine.torque * 
            this.state.transmission.totalRatio * 
            this.state.transmission.efficiency;

        const frontTorque = totalTorque * this.drivetrainConfig.frontBias;
        const rearTorque = totalTorque * this.drivetrainConfig.rearBias;

        // Distribute to wheels
        if (this.drivetrainType === 'fwd' || this.drivetrainType === 'awd') {
            this.state.drivetrain.wheelTorques[0] = frontTorque / 2;
            this.state.drivetrain.wheelTorques[1] = frontTorque / 2;
        }

        if (this.drivetrainType === 'rwd' || this.drivetrainType === 'awd') {
            this.state.drivetrain.wheelTorques[2] = rearTorque / 2;
            this.state.drivetrain.wheelTorques[3] = rearTorque / 2;
        }
    }

    updateDifferential() {
        const slipRatio = this.settings.drivetrain.differential.slipRatio;
        const lockRate = this.settings.drivetrain.differential.lockRate;

        // Front differential
        if (this.drivetrainType === 'fwd' || this.drivetrainType === 'awd') {
            const frontSlip = Math.abs(
                this.state.drivetrain.wheelSpeeds[0] - 
                this.state.drivetrain.wheelSpeeds[1]
            );

            if (frontSlip > slipRatio) {
                const lockFactor = Math.min(1, frontSlip * lockRate);
                const avgTorque = (this.state.drivetrain.wheelTorques[0] + 
                    this.state.drivetrain.wheelTorques[1]) / 2;

                this.state.drivetrain.wheelTorques[0] = avgTorque;
                this.state.drivetrain.wheelTorques[1] = avgTorque;
            }
        }

        // Rear differential
        if (this.drivetrainType === 'rwd' || this.drivetrainType === 'awd') {
            const rearSlip = Math.abs(
                this.state.drivetrain.wheelSpeeds[2] - 
                this.state.drivetrain.wheelSpeeds[3]
            );

            if (rearSlip > slipRatio) {
                const lockFactor = Math.min(1, rearSlip * lockRate);
                const avgTorque = (this.state.drivetrain.wheelTorques[2] + 
                    this.state.drivetrain.wheelTorques[3]) / 2;

                this.state.drivetrain.wheelTorques[2] = avgTorque;
                this.state.drivetrain.wheelTorques[3] = avgTorque;
            }
        }
    }

    calculateDrivetrainLosses() {
        const efficiency = this.drivetrainConfig.efficiency;
        
        this.state.drivetrain.wheelTorques = 
            this.state.drivetrain.wheelTorques.map(torque => 
                torque * efficiency
            );
    }

    updateTurbo(deltaTime) {
        if (!this.settings.turbo.enabled) return;

        const throttle = this.vehicle.throttle;
        const rpm = this.state.engine.rpm;
        const maxBoost = this.settings.turbo.boost.max;
        const rampUp = this.settings.turbo.boost.rampUp;
        const rampDown = this.settings.turbo.boost.rampDown;

        // Calculate target boost based on RPM and throttle
        const targetBoost = throttle * maxBoost * 
            Math.min(1, (rpm - 2000) / 2000);

        // Update boost with lag
        if (targetBoost > this.state.turbo.boost) {
            this.state.turbo.boost = Math.min(
                targetBoost,
                this.state.turbo.boost + (maxBoost / rampUp) * deltaTime
            );
            this.state.turbo.spooling = true;
        } else {
            this.state.turbo.boost = Math.max(
                targetBoost,
                this.state.turbo.boost - (maxBoost / rampDown) * deltaTime
            );
            this.state.turbo.spooling = false;
        }

        // Update wastegate
        this.updateWastegate();
    }

    updateWastegate() {
        const threshold = this.settings.turbo.wastegate.threshold;
        const currentBoost = this.state.turbo.boost;

        if (currentBoost >= threshold && !this.state.turbo.wastegateOpen) {
            this.state.turbo.wastegateOpen = true;
            this.emit('wastegateOpen');
        } else if (currentBoost < threshold && this.state.turbo.wastegateOpen) {
            this.state.turbo.wastegateOpen = false;
            this.emit('wastegateClose');
        }
    }

    updateTelemetry() {
        const now = performance.now();
        if (now - this.state.telemetry.lastSample < 1000 / this.settings.telemetry.sampleRate) {
            return;
        }

        const sample = {
            time: now,
            metrics: {
                rpm: this.state.engine.rpm,
                speed: this.vehicle.speed,
                gear: this.state.transmission.gear,
                throttle: this.vehicle.throttle,
                boost: this.state.turbo.boost,
                temperature: this.state.engine.temperature,
                fuel: this.state.engine.fuelLevel
            }
        };

        this.state.telemetry.buffer.shift();
        this.state.telemetry.buffer.push(sample);
        this.state.telemetry.lastSample = now;

        this.emit('telemetryUpdate', sample);
    }

    startEngine() {
        if (this.state.engine.running || this.state.engine.fuelLevel === 0) return false;

        this.state.engine.rpm = this.engineConfig.idleRpm;
        this.state.engine.running = true;
        this.state.engine.starter = false;

        this.emit('engineStart');
        return true;
    }

    stopEngine() {
        if (!this.state.engine.running) return false;

        this.state.engine.rpm = 0;
        this.state.engine.running = false;
        this.state.engine.power = 0;
        this.state.engine.torque = 0;

        this.emit('engineStop');
        return true;
    }

    shiftGear(gear) {
        if (this.state.transmission.shifting) return false;

        const gearCount = this.transmissionConfig.gearRatios.length;
        if (gear < -1 || gear >= gearCount - 1) return false;

        this.state.transmission.shifting = true;
        this.state.transmission.shiftTimer = 0;
        this.state.transmission.gear = gear;
        this.state.transmission.clutch = 0;

        this.emit('gearChange', gear);
        return true;
    }

    getAverageWheelSpeed() {
        return this.state.drivetrain.wheelSpeeds.reduce((a, b) => a + b, 0) / 4;
    }

    getTelemetryData() {
        return {
            current: this.state.telemetry.buffer[this.state.telemetry.buffer.length - 1],
            buffer: this.state.telemetry.buffer
        };
    }

    getEngineState() {
        return {
            rpm: this.state.engine.rpm,
            power: this.state.engine.power,
            torque: this.state.engine.torque,
            temperature: this.state.engine.temperature,
            damage: this.state.engine.damage,
            running: this.state.engine.running,
            fuelLevel: this.state.engine.fuelLevel
        };
    }

    dispose() {
        this.stopEngine();
        this.removeAllListeners();
    }
} 