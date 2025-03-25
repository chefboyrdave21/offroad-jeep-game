import * as THREE from 'three';
import { EventEmitter } from 'events';

export class VehicleHandlingSystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            chassis: {
                mass: 1500, // kg
                dimensions: new THREE.Vector3(2.0, 1.5, 4.5), // meters
                centerOfMass: new THREE.Vector3(0, -0.3, 0), // relative to model center
                inertia: new THREE.Vector3(2200, 3000, 800), // kg*m^2
                dragCoefficient: 0.35,
                rollingResistance: 0.015
            },
            wheels: {
                front: {
                    radius: 0.35,
                    width: 0.25,
                    mass: 20,
                    offset: new THREE.Vector2(0.85, 1.4), // width, length from center
                    steering: {
                        maxAngle: 35, // degrees
                        speed: 2.0, // seconds full lock to lock
                        ackermann: 0.15, // Ackermann steering coefficient
                        returnSpeed: 5.0 // steering wheel return speed
                    }
                },
                rear: {
                    radius: 0.35,
                    width: 0.25,
                    mass: 20,
                    offset: new THREE.Vector2(0.85, -1.4)
                }
            },
            tires: {
                friction: {
                    static: 1.2,
                    dynamic: 1.0,
                    rolling: 0.015
                },
                slipRatios: {
                    peak: 0.08,
                    optimal: {
                        longitudinal: 0.12,
                        lateral: 0.14
                    }
                },
                combinedSlip: {
                    coefficient: 0.8, // friction reduction in combined slip
                    blendExponent: 2.0 // how quickly combined slip affects friction
                },
                temperature: {
                    optimal: 80, // celsius
                    range: 30, // +/- from optimal
                    heatRate: 0.1, // degrees per second under load
                    coolRate: 0.05 // degrees per second when not loaded
                }
            },
            aerodynamics: {
                downforce: {
                    coefficient: 0.5,
                    distribution: 0.4 // front downforce ratio
                },
                lift: {
                    coefficient: 0.1,
                    center: new THREE.Vector3(0, 0.2, 0)
                },
                sideForce: {
                    coefficient: 0.4,
                    center: new THREE.Vector3(0, 0.3, 0)
                }
            },
            stability: {
                tractionControl: {
                    enabled: true,
                    sensitivity: 0.5,
                    maxIntervention: 0.8
                },
                stabilityControl: {
                    enabled: true,
                    yawCorrection: 0.3,
                    brakingIntervention: 0.5
                },
                antiLockBrakes: {
                    enabled: true,
                    frequency: 15, // Hz
                    slipThreshold: 0.2
                }
            }
        };

        this.state = {
            chassis: {
                velocity: new THREE.Vector3(),
                angularVelocity: new THREE.Vector3(),
                acceleration: new THREE.Vector3(),
                forces: new THREE.Vector3(),
                torques: new THREE.Vector3()
            },
            wheels: {
                front: {
                    left: { rotation: 0, angularVelocity: 0, steeringAngle: 0, contact: null },
                    right: { rotation: 0, angularVelocity: 0, steeringAngle: 0, contact: null }
                },
                rear: {
                    left: { rotation: 0, angularVelocity: 0, contact: null },
                    right: { rotation: 0, angularVelocity: 0, contact: null }
                }
            },
            tires: {
                temperatures: new Float32Array(4),
                slipRatios: new Float32Array(4),
                slipAngles: new Float32Array(4),
                forces: Array(4).fill().map(() => new THREE.Vector3())
            },
            stability: {
                tcsActive: false,
                escActive: false,
                absActive: false,
                yawRate: 0,
                lateralG: 0
            }
        };

        this.initialize();
    }

    initialize() {
        this.setupPhysicsBody();
        this.setupWheels();
        this.setupStabilityControls();
    }

    setupPhysicsBody() {
        const { chassis } = this.settings;
        
        // Create physics body representation
        this.physicsBody = {
            mass: chassis.mass,
            inertia: chassis.inertia.clone(),
            dimensions: chassis.dimensions.clone(),
            centerOfMass: chassis.centerOfMass.clone()
        };

        // Initialize state
        this.resetState();
    }

    setupWheels() {
        const { front, rear } = this.settings.wheels;

        // Setup wheel physics properties
        ['left', 'right'].forEach(side => {
            // Front wheels
            this.state.wheels.front[side].inertia = this.calculateWheelInertia(front);
            this.state.wheels.front[side].radius = front.radius;
            this.state.wheels.front[side].width = front.width;

            // Rear wheels
            this.state.wheels.rear[side].inertia = this.calculateWheelInertia(rear);
            this.state.wheels.rear[side].radius = rear.radius;
            this.state.wheels.rear[side].width = rear.width;
        });
    }

    setupStabilityControls() {
        const { stability } = this.settings;

        // Initialize stability control timers
        if (stability.antiLockBrakes.enabled) {
            this.absTimer = 0;
        }
    }

    calculateWheelInertia(wheelConfig) {
        // I = 1/2 * m * r^2 for a cylinder
        return 0.5 * wheelConfig.mass * wheelConfig.radius * wheelConfig.radius;
    }

    update(deltaTime) {
        this.updateForces(deltaTime);
        this.updateWheels(deltaTime);
        this.updateStabilityControls(deltaTime);
        this.updatePhysics(deltaTime);
        this.updateTelemetry();
    }

    updateForces(deltaTime) {
        const state = this.state;
        const settings = this.settings;

        // Reset forces and torques
        state.chassis.forces.set(0, 0, 0);
        state.chassis.torques.set(0, 0, 0);

        // Calculate aerodynamic forces
        this.calculateAerodynamicForces();

        // Calculate tire forces
        this.calculateTireForces();

        // Apply gravity
        state.chassis.forces.y -= settings.chassis.mass * 9.81;
    }

    calculateAerodynamicForces() {
        const velocity = this.state.chassis.velocity;
        const speed = velocity.length();
        const { aerodynamics } = this.settings;
        
        if (speed < 0.1) return; // Skip at very low speeds

        // Calculate dynamic pressure
        const airDensity = 1.225; // kg/m^3 at sea level
        const dynamicPressure = 0.5 * airDensity * speed * speed;

        // Calculate drag force
        const dragForce = velocity.clone()
            .normalize()
            .multiplyScalar(-dynamicPressure * this.settings.chassis.dragCoefficient);
        this.state.chassis.forces.add(dragForce);

        // Calculate downforce
        const downforce = -dynamicPressure * aerodynamics.downforce.coefficient;
        this.state.chassis.forces.y += downforce;

        // Apply downforce distribution
        const frontDownforce = downforce * aerodynamics.downforce.distribution;
        const rearDownforce = downforce * (1 - aerodynamics.downforce.distribution);
        
        // Calculate lift and side forces based on vehicle orientation
        this.calculateLiftAndSideForces(dynamicPressure);
    }

    calculateLiftAndSideForces(dynamicPressure) {
        const { lift, sideForce } = this.settings.aerodynamics;
        const velocity = this.state.chassis.velocity;
        
        // Calculate angle of attack and side slip angle
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.vehicle.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.vehicle.quaternion);
        
        const angleOfAttack = Math.acos(forward.dot(velocity.normalize()));
        const sideSlipAngle = Math.acos(right.dot(velocity.normalize()));

        // Apply lift force
        const liftForce = dynamicPressure * lift.coefficient * Math.sin(angleOfAttack);
        const liftVector = new THREE.Vector3(0, liftForce, 0);
        this.state.chassis.forces.add(liftVector);

        // Apply side force
        const sideForceValue = dynamicPressure * sideForce.coefficient * Math.sin(sideSlipAngle);
        const sideForceVector = right.multiplyScalar(sideForceValue);
        this.state.chassis.forces.add(sideForceVector);
    }

    calculateTireForces() {
        const wheels = this.state.wheels;
        
        // Process each wheel
        ['front', 'rear'].forEach(axle => {
            ['left', 'right'].forEach(side => {
                const wheel = wheels[axle][side];
                const wheelIndex = this.getWheelIndex(axle, side);
                
                if (wheel.contact) {
                    this.calculateWheelForces(wheel, wheelIndex);
                }
            });
        });
    }

    calculateWheelForces(wheel, wheelIndex) {
        const { tires } = this.settings;
        
        // Calculate slip ratio
        const slipRatio = this.calculateSlipRatio(wheel);
        this.state.tires.slipRatios[wheelIndex] = slipRatio;

        // Calculate slip angle
        const slipAngle = this.calculateSlipAngle(wheel);
        this.state.tires.slipAngles[wheelIndex] = slipAngle;

        // Calculate combined slip
        const combinedSlip = this.calculateCombinedSlip(slipRatio, slipAngle);

        // Calculate tire force
        const force = this.calculateTireForce(wheel, combinedSlip, wheelIndex);
        this.state.tires.forces[wheelIndex].copy(force);

        // Apply force to chassis
        this.applyWheelForceToVehicle(force, wheel.contact.point);
    }

    calculateSlipRatio(wheel) {
        const wheelSpeed = wheel.angularVelocity * wheel.radius;
        const vehicleSpeed = this.state.chassis.velocity.length();
        
        if (vehicleSpeed < 0.1) return 0;
        
        return (wheelSpeed - vehicleSpeed) / Math.abs(vehicleSpeed);
    }

    calculateSlipAngle(wheel) {
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.vehicle.quaternion);
        const velocity = this.state.chassis.velocity;
        
        if (velocity.length() < 0.1) return 0;
        
        const wheelVelocity = velocity.clone();
        if (wheel.steeringAngle) {
            wheelVelocity.applyAxisAngle(new THREE.Vector3(0, 1, 0), wheel.steeringAngle);
        }
        
        return Math.atan2(wheelVelocity.x, wheelVelocity.z);
    }

    calculateCombinedSlip(slipRatio, slipAngle) {
        const { combinedSlip } = this.settings.tires;
        
        const totalSlip = Math.sqrt(
            slipRatio * slipRatio + 
            Math.tan(slipAngle) * Math.tan(slipAngle)
        );
        
        return Math.pow(totalSlip, combinedSlip.blendExponent);
    }

    calculateTireForce(wheel, combinedSlip, wheelIndex) {
        const { tires } = this.settings;
        const normalForce = wheel.contact.force;
        
        // Calculate friction coefficient based on slip and temperature
        const frictionCoef = this.calculateFrictionCoefficient(
            combinedSlip,
            this.state.tires.temperatures[wheelIndex]
        );
        
        // Calculate maximum force
        const maxForce = normalForce * frictionCoef;
        
        // Calculate force direction
        const forceDirection = this.calculateForceDirection(wheel, combinedSlip);
        
        return forceDirection.multiplyScalar(maxForce);
    }

    calculateFrictionCoefficient(slip, temperature) {
        const { friction, temperature: tempSettings } = this.settings.tires;
        
        // Base friction
        let coef = friction.static;
        
        // Slip effect
        if (slip > this.settings.tires.slipRatios.peak) {
            coef *= friction.dynamic / friction.static;
        }
        
        // Temperature effect
        const tempDiff = Math.abs(temperature - tempSettings.optimal);
        if (tempDiff > tempSettings.range) {
            coef *= 0.8; // Reduced grip outside optimal range
        }
        
        return coef;
    }

    calculateForceDirection(wheel, combinedSlip) {
        const forward = new THREE.Vector3(0, 0, 1);
        if (wheel.steeringAngle) {
            forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), wheel.steeringAngle);
        }
        
        const right = new THREE.Vector3(1, 0, 0);
        if (wheel.steeringAngle) {
            right.applyAxisAngle(new THREE.Vector3(0, 1, 0), wheel.steeringAngle);
        }
        
        return forward.multiplyScalar(combinedSlip).add(
            right.multiplyScalar(Math.tan(wheel.steeringAngle || 0))
        ).normalize();
    }

    updateWheels(deltaTime) {
        ['front', 'rear'].forEach(axle => {
            ['left', 'right'].forEach(side => {
                const wheel = this.state.wheels[axle][side];
                
                // Update wheel rotation
                wheel.rotation += wheel.angularVelocity * deltaTime;
                wheel.rotation %= (2 * Math.PI);
                
                // Update steering for front wheels
                if (axle === 'front') {
                    this.updateWheelSteering(wheel, deltaTime);
                }
            });
        });
    }

    updateWheelSteering(wheel, deltaTime) {
        const { steering } = this.settings.wheels.front;
        const targetAngle = this.vehicle.input.steering * steering.maxAngle;
        
        // Apply Ackermann steering
        if (targetAngle !== 0) {
            const ackermanAngle = targetAngle * (1 + steering.ackermann);
            wheel.steeringAngle += (ackermanAngle - wheel.steeringAngle) * 
                                 steering.speed * deltaTime;
        } else {
            // Return to center
            wheel.steeringAngle *= Math.max(0, 1 - steering.returnSpeed * deltaTime);
        }
    }

    updateStabilityControls(deltaTime) {
        if (this.settings.stability.tractionControl.enabled) {
            this.updateTractionControl();
        }
        
        if (this.settings.stability.stabilityControl.enabled) {
            this.updateStabilityControl();
        }
        
        if (this.settings.stability.antiLockBrakes.enabled) {
            this.updateABS(deltaTime);
        }
    }

    updateTractionControl() {
        const { tractionControl } = this.settings.stability;
        let tcsActive = false;
        
        // Check each driven wheel
        ['rear', 'front'].forEach(axle => {
            ['left', 'right'].forEach(side => {
                const wheel = this.state.wheels[axle][side];
                const wheelIndex = this.getWheelIndex(axle, side);
                
                if (this.state.tires.slipRatios[wheelIndex] > 
                    this.settings.tires.slipRatios.optimal.longitudinal) {
                    // Reduce engine torque to this wheel
                    const reduction = Math.min(
                        tractionControl.maxIntervention,
                        (this.state.tires.slipRatios[wheelIndex] - 
                         this.settings.tires.slipRatios.optimal.longitudinal) * 
                        tractionControl.sensitivity
                    );
                    
                    wheel.torque *= (1 - reduction);
                    tcsActive = true;
                }
            });
        });
        
        this.state.stability.tcsActive = tcsActive;
    }

    updateStabilityControl() {
        const { stabilityControl } = this.settings.stability;
        const targetYawRate = this.calculateTargetYawRate();
        const yawError = this.state.stability.yawRate - targetYawRate;
        
        if (Math.abs(yawError) > 0.1) { // Threshold for intervention
            // Apply corrective braking
            const brakingForce = yawError * stabilityControl.brakingIntervention;
            
            if (yawError > 0) {
                // Oversteer - brake outer front wheel
                this.state.wheels.front.right.brakingForce += brakingForce;
            } else {
                // Understeer - brake inner rear wheel
                this.state.wheels.rear.left.brakingForce += Math.abs(brakingForce);
            }
            
            this.state.stability.escActive = true;
        } else {
            this.state.stability.escActive = false;
        }
    }

    calculateTargetYawRate() {
        const speed = this.state.chassis.velocity.length();
        const steeringAngle = this.vehicle.input.steering * 
                             this.settings.wheels.front.steering.maxAngle;
        
        // Simple bicycle model
        const wheelbase = Math.abs(
            this.settings.wheels.front.offset.y - 
            this.settings.wheels.rear.offset.y
        );
        
        return (speed * steeringAngle) / wheelbase;
    }

    updateABS(deltaTime) {
        const { antiLockBrakes } = this.settings.stability;
        let absActive = false;
        
        this.absTimer += deltaTime;
        if (this.absTimer >= 1 / antiLockBrakes.frequency) {
            this.absTimer = 0;
            
            // Check each wheel
            ['front', 'rear'].forEach(axle => {
                ['left', 'right'].forEach(side => {
                    const wheel = this.state.wheels[axle][side];
                    const wheelIndex = this.getWheelIndex(axle, side);
                    
                    if (this.state.tires.slipRatios[wheelIndex] < 
                        -antiLockBrakes.slipThreshold) {
                        // Release brake pressure
                        wheel.brakingForce = 0;
                        absActive = true;
                    }
                });
            });
        }
        
        this.state.stability.absActive = absActive;
    }

    updatePhysics(deltaTime) {
        // Update chassis physics
        this.updateChassisPhysics(deltaTime);
        
        // Update wheel physics
        this.updateWheelPhysics(deltaTime);
    }

    updateChassisPhysics(deltaTime) {
        const state = this.state.chassis;
        
        // Update velocity
        state.acceleration.copy(state.forces).divideScalar(this.settings.chassis.mass);
        state.velocity.add(state.acceleration.multiplyScalar(deltaTime));
        
        // Update angular velocity
        const angularAcceleration = new THREE.Vector3()
            .copy(state.torques)
            .divide(this.settings.chassis.inertia);
        state.angularVelocity.add(angularAcceleration.multiplyScalar(deltaTime));
        
        // Apply to vehicle transform
        this.vehicle.position.add(state.velocity.multiplyScalar(deltaTime));
        this.vehicle.quaternion.multiply(
            new THREE.Quaternion().setFromEuler(
                new THREE.Euler(
                    state.angularVelocity.x * deltaTime,
                    state.angularVelocity.y * deltaTime,
                    state.angularVelocity.z * deltaTime
                )
            )
        );
    }

    updateWheelPhysics(deltaTime) {
        ['front', 'rear'].forEach(axle => {
            ['left', 'right'].forEach(side => {
                const wheel = this.state.wheels[axle][side];
                
                // Update angular velocity based on torque
                const netTorque = wheel.torque - wheel.brakingForce;
                wheel.angularVelocity += (netTorque / wheel.inertia) * deltaTime;
                
                // Apply rolling resistance
                const rollingResistance = -Math.sign(wheel.angularVelocity) * 
                                        this.settings.tires.friction.rolling * 
                                        wheel.contact?.force || 0;
                wheel.angularVelocity += (rollingResistance / wheel.inertia) * deltaTime;
            });
        });
    }

    updateTelemetry() {
        // Calculate lateral G-force
        const rightVector = new THREE.Vector3(1, 0, 0)
            .applyQuaternion(this.vehicle.quaternion);
        this.state.stability.lateralG = 
            this.state.chassis.acceleration.dot(rightVector) / 9.81;
        
        // Update yaw rate
        this.state.stability.yawRate = this.state.chassis.angularVelocity.y;
    }

    getWheelIndex(axle, side) {
        return (axle === 'front' ? 0 : 2) + (side === 'left' ? 0 : 1);
    }

    resetState() {
        const state = this.state;
        
        // Reset chassis state
        state.chassis.velocity.set(0, 0, 0);
        state.chassis.angularVelocity.set(0, 0, 0);
        state.chassis.acceleration.set(0, 0, 0);
        state.chassis.forces.set(0, 0, 0);
        state.chassis.torques.set(0, 0, 0);
        
        // Reset wheel states
        ['front', 'rear'].forEach(axle => {
            ['left', 'right'].forEach(side => {
                const wheel = state.wheels[axle][side];
                wheel.rotation = 0;
                wheel.angularVelocity = 0;
                wheel.torque = 0;
                wheel.brakingForce = 0;
                if (axle === 'front') {
                    wheel.steeringAngle = 0;
                }
            });
        });
        
        // Reset stability control states
        state.stability.tcsActive = false;
        state.stability.escActive = false;
        state.stability.absActive = false;
        state.stability.yawRate = 0;
        state.stability.lateralG = 0;
    }

    dispose() {
        this.removeAllListeners();
    }
} 