import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class VehicleSystem {
    constructor(scene, physicsSystem) {
        // Core references
        this.scene = scene;
        this.physicsSystem = physicsSystem;

        // Vehicle settings
        this.settings = {
            chassis: {
                mass: 1500,
                width: 2.0,
                height: 0.6,
                length: 4.0,
                groundClearance: 0.4
            },
            wheels: {
                radius: 0.4,
                width: 0.3,
                suspensionStiffness: 30,
                suspensionRestLength: 0.3,
                dampingRelaxation: 2.3,
                dampingCompression: 4.4,
                maxSuspensionForce: 100000,
                rollInfluence: 0.01,
                frictionSlip: 1.4
            },
            engine: {
                maxPower: 400,
                maxReverseForce: 100,
                maxBrakingForce: 100,
                maxSteeringAngle: Math.PI / 6
            },
            transmission: {
                gearRatios: [-2.9, 3.4, 2.0, 1.3, 1.0, 0.7],
                finalDriveRatio: 3.7,
                shiftTime: 0.3
            }
        };

        // Vehicle state
        this.state = {
            speed: 0,
            rpm: 0,
            gear: 1,
            isShifting: false,
            throttle: 0,
            brake: 0,
            steering: 0,
            engineLoad: 0,
            wheelContacts: [false, false, false, false]
        };

        // Vehicle components
        this.components = {
            chassis: null,
            wheels: [],
            vehicle: null,
            model: null
        };

        this.initialize();
    }

    async initialize() {
        await this.loadVehicleModel();
        this.setupPhysics();
        this.setupWheels();
        this.setupControls();
    }

    async loadVehicleModel() {
        // Load vehicle model and setup visual components
        const model = await this.loadModel('models/vehicles/jeep.glb');
        this.components.model = model;
        this.scene.add(model);

        // Setup wheel models
        this.wheelModels = [];
        for (let i = 0; i < 4; i++) {
            const wheelModel = await this.loadModel('models/vehicles/wheel.glb');
            this.wheelModels.push(wheelModel);
            this.scene.add(wheelModel);
        }
    }

    setupPhysics() {
        // Create chassis body
        const chassisShape = new CANNON.Box(new CANNON.Vec3(
            this.settings.chassis.width / 2,
            this.settings.chassis.height / 2,
            this.settings.chassis.length / 2
        ));

        const chassisBody = new CANNON.Body({
            mass: this.settings.chassis.mass,
            position: new CANNON.Vec3(0, 3, 0),
            shape: chassisShape
        });

        // Create vehicle
        this.components.vehicle = new CANNON.RaycastVehicle({
            chassisBody,
            indexRightAxis: 0,
            indexUpAxis: 1,
            indexForwardAxis: 2
        });

        // Add wheels
        const wheelOptions = {
            radius: this.settings.wheels.radius,
            directionLocal: new CANNON.Vec3(0, -1, 0),
            suspensionStiffness: this.settings.wheels.suspensionStiffness,
            suspensionRestLength: this.settings.wheels.suspensionRestLength,
            frictionSlip: this.settings.wheels.frictionSlip,
            dampingRelaxation: this.settings.wheels.dampingRelaxation,
            dampingCompression: this.settings.wheels.dampingCompression,
            maxSuspensionForce: this.settings.wheels.maxSuspensionForce,
            rollInfluence: this.settings.wheels.rollInfluence,
            axleLocal: new CANNON.Vec3(-1, 0, 0),
            chassisConnectionPointLocal: new CANNON.Vec3(1, 0, 1),
            useCustomSlidingRotationalSpeed: true,
            customSlidingRotationalSpeed: -30
        };

        // Add wheel bodies
        const wheelPositions = [
            [-1, 0, 1],  // Front left
            [1, 0, 1],   // Front right
            [-1, 0, -1], // Back left
            [1, 0, -1]   // Back right
        ];

        wheelPositions.forEach(position => {
            wheelOptions.chassisConnectionPointLocal.set(
                position[0] * this.settings.chassis.width / 2,
                position[1] + this.settings.chassis.groundClearance,
                position[2] * this.settings.chassis.length / 2
            );
            this.components.vehicle.addWheel(wheelOptions);
        });

        // Add vehicle to physics world
        this.components.vehicle.addToWorld(this.physicsSystem.world);
    }

    setupWheels() {
        this.components.wheels = this.components.vehicle.wheelInfos;
    }

    setupControls() {
        // Setup keyboard controls
        document.addEventListener('keydown', (event) => this.handleKeyDown(event));
        document.addEventListener('keyup', (event) => this.handleKeyUp(event));
    }

    handleKeyDown(event) {
        switch(event.key) {
            case 'w':
                this.state.throttle = 1;
                break;
            case 's':
                this.state.brake = 1;
                break;
            case 'a':
                this.state.steering = 1;
                break;
            case 'd':
                this.state.steering = -1;
                break;
            case ' ':
                this.state.handbrake = true;
                break;
        }
    }

    handleKeyUp(event) {
        switch(event.key) {
            case 'w':
                this.state.throttle = 0;
                break;
            case 's':
                this.state.brake = 0;
                break;
            case 'a':
            case 'd':
                this.state.steering = 0;
                break;
            case ' ':
                this.state.handbrake = false;
                break;
        }
    }

    update(deltaTime) {
        this.updateVehiclePhysics(deltaTime);
        this.updateVehicleModel();
        this.updateWheelModels();
        this.updateVehicleState();
    }

    updateVehiclePhysics(deltaTime) {
        // Update wheel steering
        const steeringAngle = this.state.steering * this.settings.engine.maxSteeringAngle;
        this.components.vehicle.setSteeringValue(steeringAngle, 0);
        this.components.vehicle.setSteeringValue(steeringAngle, 1);

        // Calculate engine force
        let engineForce = 0;
        if (this.state.throttle > 0) {
            engineForce = this.calculateEngineForce();
        } else if (this.state.brake > 0) {
            engineForce = -this.settings.engine.maxReverseForce;
        }

        // Apply engine force to driving wheels
        this.components.vehicle.applyEngineForce(engineForce, 2);
        this.components.vehicle.applyEngineForce(engineForce, 3);

        // Apply braking
        const brakingForce = this.state.brake * this.settings.engine.maxBrakingForce;
        for (let i = 0; i < 4; i++) {
            this.components.vehicle.setBrake(brakingForce, i);
        }

        // Update wheel contact states
        this.updateWheelContacts();
    }

    calculateEngineForce() {
        // Calculate current speed
        this.state.speed = this.components.vehicle.chassisBody.velocity.length();

        // Calculate engine RPM based on wheel rotation and gear ratio
        const wheelRotationSpeed = this.components.vehicle.wheelInfos[2].rpm;
        const gearRatio = this.settings.transmission.gearRatios[this.state.gear];
        const finalRatio = this.settings.transmission.finalDriveRatio;
        this.state.rpm = Math.abs(wheelRotationSpeed * gearRatio * finalRatio);

        // Calculate engine power based on RPM curve
        let power = this.settings.engine.maxPower;
        if (this.state.rpm > 6000) {
            power *= (1 - (this.state.rpm - 6000) / 2000);
        }

        // Calculate engine force
        const engineForce = power * this.state.throttle * gearRatio * finalRatio;
        this.state.engineLoad = this.state.throttle;

        return engineForce;
    }

    updateWheelContacts() {
        for (let i = 0; i < 4; i++) {
            this.state.wheelContacts[i] = this.components.vehicle.wheelInfos[i].isInContact;
        }
    }

    updateVehicleModel() {
        if (!this.components.model) return;

        // Update chassis position and rotation
        const chassisPosition = this.components.vehicle.chassisBody.position;
        const chassisQuaternion = this.components.vehicle.chassisBody.quaternion;

        this.components.model.position.copy(chassisPosition);
        this.components.model.quaternion.copy(chassisQuaternion);
    }

    updateWheelModels() {
        this.components.vehicle.wheelInfos.forEach((wheel, i) => {
            if (!this.wheelModels[i]) return;

            // Get wheel transform
            this.components.vehicle.updateWheelTransform(i);
            const transform = this.components.vehicle.wheelInfos[i].worldTransform;

            // Update wheel model
            const wheelModel = this.wheelModels[i];
            wheelModel.position.copy(transform.position);
            wheelModel.quaternion.copy(transform.quaternion);

            // Apply wheel rotation
            wheelModel.rotation.y = Math.PI / 2; // Align wheel model
            wheelModel.rotation.x += wheel.rpm * Math.PI * 2 / 60; // Apply rotation based on RPM
        });
    }

    updateVehicleState() {
        // Automatic gear shifting
        if (!this.state.isShifting) {
            if (this.state.rpm > 6500 && this.state.gear < 5) {
                this.shiftGear(this.state.gear + 1);
            } else if (this.state.rpm < 2000 && this.state.gear > 1) {
                this.shiftGear(this.state.gear - 1);
            }
        }
    }

    shiftGear(newGear) {
        this.state.isShifting = true;
        this.state.gear = newGear;

        setTimeout(() => {
            this.state.isShifting = false;
        }, this.settings.transmission.shiftTime * 1000);
    }

    reset() {
        // Reset vehicle position and rotation
        this.components.vehicle.chassisBody.position.set(0, 3, 0);
        this.components.vehicle.chassisBody.quaternion.set(0, 0, 0, 1);
        this.components.vehicle.chassisBody.velocity.set(0, 0, 0);
        this.components.vehicle.chassisBody.angularVelocity.set(0, 0, 0);

        // Reset vehicle state
        this.state.speed = 0;
        this.state.rpm = 0;
        this.state.gear = 1;
        this.state.isShifting = false;
        this.state.throttle = 0;
        this.state.brake = 0;
        this.state.steering = 0;
    }

    dispose() {
        // Remove event listeners
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);

        // Remove physics bodies
        if (this.components.vehicle) {
            this.components.vehicle.removeFromWorld(this.physicsSystem.world);
        }

        // Remove models
        if (this.components.model) {
            this.scene.remove(this.components.model);
        }
        this.wheelModels.forEach(model => {
            this.scene.remove(model);
        });
    }
} 