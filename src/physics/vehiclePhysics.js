import * as CANNON from 'cannon-es';

export class VehiclePhysics {
    constructor(world) {
        this.world = world;
        
        // Vehicle physics settings
        this.wheelMaterial = new CANNON.Material('wheel');
        this.chassisMaterial = new CANNON.Material('chassis');
        
        // Vehicle body
        const chassisShape = new CANNON.Box(new CANNON.Vec3(1, 0.5, 2));
        this.chassisBody = new CANNON.Body({
            mass: 1500,
            material: this.chassisMaterial,
            position: new CANNON.Vec3(0, 2, 0),
            shape: chassisShape
        });

        // Vehicle settings
        this.vehicle = new CANNON.RaycastVehicle({
            chassisBody: this.chassisBody,
            indexRightAxis: 0,  // x
            indexUpAxis: 1,     // y
            indexForwardAxis: 2 // z
        });

        // Wheel options
        const wheelOptions = {
            radius: 0.4,
            directionLocal: new CANNON.Vec3(0, -1, 0),
            suspensionStiffness: 30,
            suspensionRestLength: 0.3,
            frictionSlip: 1.4,
            dampingRelaxation: 2.3,
            dampingCompression: 4.4,
            maxSuspensionForce: 100000,
            rollInfluence: 0.01,
            axleLocal: new CANNON.Vec3(1, 0, 0),
            chassisConnectionPointLocal: new CANNON.Vec3(1, 0, 1),
            maxSuspensionTravel: 0.3,
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true
        };

        // Add wheels
        const wheelPositions = [
            { x: -0.9, y: 0, z: -1.3 }, // Front left
            { x: 0.9, y: 0, z: -1.3 },  // Front right
            { x: -0.9, y: 0, z: 1.25 }, // Back left
            { x: 0.9, y: 0, z: 1.25 }   // Back right
        ];

        wheelPositions.forEach(pos => {
            wheelOptions.chassisConnectionPointLocal.set(pos.x, pos.y, pos.z);
            this.vehicle.addWheel(wheelOptions);
        });

        // Add vehicle to world
        this.vehicle.addToWorld(this.world);
    }

    update(controls) {
        // Update wheel physics
        const maxSteerVal = 0.5;
        const maxForce = 1500;
        const brakeForce = 1000000;

        this.vehicle.setSteeringValue(controls.steering * maxSteerVal, 0);
        this.vehicle.setSteeringValue(controls.steering * maxSteerVal, 1);

        if (controls.acceleration) {
            this.vehicle.applyEngineForce(-maxForce, 2);
            this.vehicle.applyEngineForce(-maxForce, 3);
        } else if (controls.braking) {
            this.vehicle.applyEngineForce(maxForce, 2);
            this.vehicle.applyEngineForce(maxForce, 3);
        } else {
            this.vehicle.applyEngineForce(0, 2);
            this.vehicle.applyEngineForce(0, 3);
        }

        if (controls.brake) {
            this.vehicle.setBrake(brakeForce, 0);
            this.vehicle.setBrake(brakeForce, 1);
            this.vehicle.setBrake(brakeForce, 2);
            this.vehicle.setBrake(brakeForce, 3);
        }
    }

    getChassisWorldPosition() {
        return this.chassisBody.position;
    }

    getChassisWorldQuaternion() {
        return this.chassisBody.quaternion;
    }
}
