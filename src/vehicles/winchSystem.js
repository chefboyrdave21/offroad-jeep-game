import * as THREE from 'three';
import { EventEmitter } from 'events';

export class VehicleWinchSystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            rope: {
                maxLength: 20, // meters
                segments: 40,
                thickness: 0.02,
                tensileStrength: 5000, // kg
                springConstant: 50000,
                damping: 0.5,
                resolution: {
                    simulation: 10, // physics steps per frame
                    render: 1 // render steps per physics step
                }
            },
            motor: {
                maxPower: 2000, // watts
                maxSpeed: 2, // meters per second
                acceleration: 1, // meters per second squared
                brakingForce: 3000 // newtons
            },
            mount: {
                position: new THREE.Vector3(0, 0.5, 2), // relative to vehicle
                rotation: new THREE.Euler(0, 0, 0)
            },
            physics: {
                gravity: -9.81,
                airResistance: 0.1,
                friction: 0.3
            }
        };

        this.state = {
            isDeployed: false,
            isRetracting: false,
            isExtending: false,
            currentLength: 0,
            currentSpeed: 0,
            tension: 0,
            attachPoint: null,
            ropeSegments: [],
            lastUpdateTime: 0
        };

        this.initialize();
    }

    initialize() {
        this.setupRopeGeometry();
        this.setupRopePhysics();
        this.setupEventListeners();
    }

    setupRopeGeometry() {
        // Create rope geometry
        const ropeGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.settings.rope.segments * 3);
        const indices = [];
        
        // Initialize rope segments at mount point
        const mountWorldPosition = this.getMountWorldPosition();
        for (let i = 0; i < this.settings.rope.segments; i++) {
            positions[i * 3] = mountWorldPosition.x;
            positions[i * 3 + 1] = mountWorldPosition.y;
            positions[i * 3 + 2] = mountWorldPosition.z;

            if (i < this.settings.rope.segments - 1) {
                indices.push(i, i + 1);
            }
        }

        ropeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        ropeGeometry.setIndex(indices);

        // Create rope material
        const ropeMaterial = new THREE.LineBasicMaterial({
            color: 0x444444,
            linewidth: this.settings.rope.thickness,
            linecap: 'round',
            linejoin: 'round'
        });

        this.ropeMesh = new THREE.LineSegments(ropeGeometry, ropeMaterial);
        this.ropeMesh.frustumCulled = false; // Prevent culling when rope extends beyond view
    }

    setupRopePhysics() {
        // Initialize rope segments with physics properties
        this.state.ropeSegments = Array(this.settings.rope.segments).fill(null).map((_, i) => ({
            position: new THREE.Vector3(),
            prevPosition: new THREE.Vector3(),
            velocity: new THREE.Vector3(),
            force: new THREE.Vector3(),
            mass: 0.1, // kg per segment
            isFixed: i === 0 // First segment is fixed to mount point
        }));

        this.updateRopeSegments();
    }

    setupEventListeners() {
        this.vehicle.on('collision', this.handleCollision.bind(this));
        this.vehicle.on('update', this.update.bind(this));
    }

    deploy(targetPoint) {
        if (this.state.isDeployed) return false;

        const mountPos = this.getMountWorldPosition();
        const distance = mountPos.distanceTo(targetPoint);

        if (distance > this.settings.rope.maxLength) {
            this.emit('deploymentFailed', 'Target too far');
            return false;
        }

        this.state.attachPoint = targetPoint.clone();
        this.state.isDeployed = true;
        this.state.currentLength = distance;
        
        // Initialize rope segment positions
        this.updateRopeSegments();
        
        this.emit('deployed', {
            length: distance,
            attachPoint: targetPoint.clone()
        });

        return true;
    }

    retract(speed = 1.0) {
        if (!this.state.isDeployed || this.state.isRetracting) return;

        speed = Math.min(Math.max(speed, 0), 1) * this.settings.motor.maxSpeed;
        this.state.isRetracting = true;
        this.state.isExtending = false;
        this.state.currentSpeed = -speed;

        this.emit('retracting', { speed });
    }

    extend(speed = 1.0) {
        if (!this.state.isDeployed || this.state.isExtending) return;

        const maxExtension = this.settings.rope.maxLength - this.state.currentLength;
        if (maxExtension <= 0) {
            this.emit('extensionLimit');
            return;
        }

        speed = Math.min(Math.max(speed, 0), 1) * this.settings.motor.maxSpeed;
        this.state.isExtending = true;
        this.state.isRetracting = false;
        this.state.currentSpeed = speed;

        this.emit('extending', { speed });
    }

    stop() {
        this.state.isRetracting = false;
        this.state.isExtending = false;
        this.state.currentSpeed = 0;
        this.emit('stopped');
    }

    release() {
        if (!this.state.isDeployed) return;

        this.state.isDeployed = false;
        this.state.isRetracting = false;
        this.state.isExtending = false;
        this.state.currentLength = 0;
        this.state.currentSpeed = 0;
        this.state.tension = 0;
        this.state.attachPoint = null;

        this.updateRopeSegments();
        this.emit('released');
    }

    update(deltaTime) {
        if (!this.state.isDeployed) return;

        const steps = this.settings.rope.resolution.simulation;
        const dt = deltaTime / steps;

        for (let step = 0; step < steps; step++) {
            this.updatePhysics(dt);
        }

        this.updateRopeGeometry();
        this.updateMotor(deltaTime);
    }

    updatePhysics(dt) {
        const segments = this.state.ropeSegments;

        // Apply forces
        segments.forEach(segment => {
            if (segment.isFixed) return;

            // Gravity
            segment.force.y = this.settings.physics.gravity * segment.mass;

            // Air resistance
            const airForce = segment.velocity.clone()
                .multiplyScalar(-this.settings.physics.airResistance);
            segment.force.add(airForce);
        });

        // Verlet integration
        segments.forEach(segment => {
            if (segment.isFixed) {
                segment.position.copy(this.getMountWorldPosition());
                segment.prevPosition.copy(segment.position);
                return;
            }

            const temp = segment.position.clone();
            
            // Verlet integration step
            segment.position.add(
                segment.position.clone()
                    .sub(segment.prevPosition)
                    .multiplyScalar(1 - this.settings.rope.damping)
            ).add(
                segment.force.multiplyScalar(dt * dt / segment.mass)
            );

            segment.prevPosition.copy(temp);
            segment.force.set(0, 0, 0);
        });

        // Constrain rope length
        for (let i = 0; i < segments.length - 1; i++) {
            const segmentLength = this.state.currentLength / (segments.length - 1);
            this.constrainSegments(segments[i], segments[i + 1], segmentLength);
        }

        // Attach end to target
        if (this.state.attachPoint) {
            const lastSegment = segments[segments.length - 1];
            lastSegment.position.copy(this.state.attachPoint);
            lastSegment.prevPosition.copy(this.state.attachPoint);
        }
    }

    constrainSegments(seg1, seg2, targetLength) {
        const delta = seg2.position.clone().sub(seg1.position);
        const currentLength = delta.length();
        const diff = (currentLength - targetLength) / currentLength;

        if (!seg1.isFixed) {
            seg1.position.add(delta.multiplyScalar(0.5 * diff));
        }
        if (!seg2.isFixed) {
            seg2.position.sub(delta.multiplyScalar(0.5 * diff));
        }
    }

    updateRopeGeometry() {
        const positions = this.ropeMesh.geometry.attributes.position.array;
        
        this.state.ropeSegments.forEach((segment, i) => {
            positions[i * 3] = segment.position.x;
            positions[i * 3 + 1] = segment.position.y;
            positions[i * 3 + 2] = segment.position.z;
        });

        this.ropeMesh.geometry.attributes.position.needsUpdate = true;
    }

    updateMotor(deltaTime) {
        if (!this.state.currentSpeed) return;

        const prevLength = this.state.currentLength;
        this.state.currentLength += this.state.currentSpeed * deltaTime;

        // Clamp length
        this.state.currentLength = Math.max(0.5, 
            Math.min(this.state.currentLength, this.settings.rope.maxLength));

        // Stop if limits reached
        if (this.state.currentLength === prevLength) {
            this.stop();
        }
    }

    getMountWorldPosition() {
        return this.vehicle.position.clone()
            .add(this.settings.mount.position.clone()
                .applyEuler(this.vehicle.rotation));
    }

    calculateTension() {
        if (!this.state.isDeployed) return 0;

        const mountPos = this.getMountWorldPosition();
        const endPos = this.state.attachPoint;
        const currentLength = mountPos.distanceTo(endPos);
        
        // Calculate tension based on spring model
        const extension = currentLength - this.state.currentLength;
        const tension = extension * this.settings.rope.springConstant;

        return Math.max(0, tension);
    }

    handleCollision(data) {
        if (!this.state.isDeployed) return;

        const force = data.force;
        if (force > this.settings.rope.tensileStrength) {
            this.emit('ropeSnapped', {
                force,
                tensileStrength: this.settings.rope.tensileStrength
            });
            this.release();
        }
    }

    dispose() {
        this.ropeMesh.geometry.dispose();
        this.ropeMesh.material.dispose();
        this.removeAllListeners();
    }
} 