import { EventEmitter } from 'events';
import * as THREE from 'three';

export class VehicleCameraSystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            modes: {
                thirdPerson: {
                    offset: { x: 0, y: 2, z: -6 },
                    lookAt: { x: 0, y: 1, z: 2 },
                    fov: 75,
                    damping: {
                        position: 0.1,
                        rotation: 0.05
                    },
                    limits: {
                        distance: { min: 3, max: 10 },
                        height: { min: 1, max: 5 },
                        angle: { min: -45, max: 45 }
                    }
                },
                firstPerson: {
                    offset: { x: 0, y: 1.6, z: 0.2 },
                    fov: 90,
                    damping: {
                        rotation: 0.1
                    },
                    limits: {
                        pitch: { min: -60, max: 60 },
                        yaw: { min: -120, max: 120 }
                    },
                    headBob: {
                        amount: 0.05,
                        frequency: 2
                    }
                },
                chase: {
                    offset: { x: 0, y: 3, z: -8 },
                    lookAt: { x: 0, y: 0, z: 4 },
                    fov: 70,
                    damping: {
                        position: 0.15,
                        rotation: 0.1
                    },
                    prediction: {
                        time: 0.5,
                        smoothing: 0.3
                    }
                },
                cinematic: {
                    positions: [
                        { x: 3, y: 1, z: 3 },
                        { x: -3, y: 2, z: -3 },
                        { x: 0, y: 4, z: -5 }
                    ],
                    transitionTime: 5,
                    fov: 60,
                    damping: {
                        position: 0.05,
                        rotation: 0.03
                    }
                },
                orbit: {
                    distance: 8,
                    height: 3,
                    speed: 0.5,
                    fov: 65,
                    damping: {
                        position: 0.1,
                        rotation: 0.05
                    }
                }
            },
            collision: {
                enabled: true,
                rayCount: 12,
                minDistance: 1,
                recovery: {
                    speed: 2,
                    damping: 0.3
                }
            },
            transitions: {
                duration: 1.0,
                easing: 'easeInOutQuad',
                fovSpeed: 2.0
            },
            shake: {
                impact: {
                    amount: 0.2,
                    duration: 0.5,
                    falloff: 'exponential'
                },
                engine: {
                    amount: 0.05,
                    frequency: 30
                }
            }
        };

        this.state = {
            mode: 'thirdPerson',
            camera: new THREE.PerspectiveCamera(
                this.settings.modes.thirdPerson.fov,
                window.innerWidth / window.innerHeight,
                0.1,
                1000
            ),
            target: new THREE.Vector3(),
            position: new THREE.Vector3(),
            rotation: new THREE.Euler(),
            shake: {
                active: false,
                offset: new THREE.Vector3(),
                time: 0
            },
            collision: {
                active: false,
                normal: new THREE.Vector3(),
                distance: 0
            },
            transition: {
                active: false,
                start: null,
                end: null,
                time: 0
            }
        };

        this.initialize();
    }

    initialize() {
        this.setupEventListeners();
        this.setMode('thirdPerson');
    }

    setupEventListeners() {
        this.vehicle.on('collision', this.handleCollision.bind(this));
        this.vehicle.on('engineStateChange', this.handleEngineState.bind(this));
        window.addEventListener('resize', this.handleResize.bind(this));
    }

    setMode(mode) {
        if (!this.settings.modes[mode]) {
            throw new Error(`Invalid camera mode: ${mode}`);
        }

        const previousMode = this.state.mode;
        this.state.mode = mode;

        // Start transition if enabled
        if (previousMode !== mode) {
            this.startTransition(previousMode, mode);
        }

        this.emit('modeChanged', { previous: previousMode, current: mode });
    }

    startTransition(fromMode, toMode) {
        const fromSettings = this.settings.modes[fromMode];
        const toSettings = this.settings.modes[toMode];

        this.state.transition = {
            active: true,
            start: {
                position: this.state.position.clone(),
                rotation: this.state.rotation.clone(),
                fov: this.state.camera.fov
            },
            end: {
                position: this.calculateTargetPosition(toSettings),
                rotation: this.calculateTargetRotation(toSettings),
                fov: toSettings.fov
            },
            time: 0
        };
    }

    update(deltaTime) {
        // Update transition if active
        if (this.state.transition.active) {
            this.updateTransition(deltaTime);
        }

        // Update camera based on current mode
        this.updateCamera(deltaTime);

        // Update camera shake
        if (this.state.shake.active) {
            this.updateShake(deltaTime);
        }

        // Check for collisions
        if (this.settings.collision.enabled) {
            this.checkCollisions();
        }

        // Apply final transforms to camera
        this.applyTransforms();
    }

    updateTransition(deltaTime) {
        const transition = this.state.transition;
        transition.time += deltaTime;

        const progress = Math.min(
            transition.time / this.settings.transitions.duration,
            1
        );

        const eased = this.ease(progress);

        // Interpolate position
        this.state.position.lerpVectors(
            transition.start.position,
            transition.end.position,
            eased
        );

        // Interpolate rotation
        this.state.rotation.x = this.lerp(
            transition.start.rotation.x,
            transition.end.rotation.x,
            eased
        );
        this.state.rotation.y = this.lerp(
            transition.start.rotation.y,
            transition.end.rotation.y,
            eased
        );
        this.state.rotation.z = this.lerp(
            transition.start.rotation.z,
            transition.end.rotation.z,
            eased
        );

        // Interpolate FOV
        this.state.camera.fov = this.lerp(
            transition.start.fov,
            transition.end.fov,
            eased
        );
        this.state.camera.updateProjectionMatrix();

        if (progress >= 1) {
            this.state.transition.active = false;
        }
    }

    updateCamera(deltaTime) {
        const mode = this.settings.modes[this.state.mode];

        switch (this.state.mode) {
            case 'thirdPerson':
                this.updateThirdPersonCamera(mode, deltaTime);
                break;
            case 'firstPerson':
                this.updateFirstPersonCamera(mode, deltaTime);
                break;
            case 'chase':
                this.updateChaseCamera(mode, deltaTime);
                break;
            case 'cinematic':
                this.updateCinematicCamera(mode, deltaTime);
                break;
            case 'orbit':
                this.updateOrbitCamera(mode, deltaTime);
                break;
        }
    }

    updateThirdPersonCamera(mode, deltaTime) {
        const targetPos = this.calculateTargetPosition(mode);
        const targetRot = this.calculateTargetRotation(mode);

        // Apply damping
        this.state.position.lerp(targetPos, mode.damping.position);
        this.lerpRotation(targetRot, mode.damping.rotation);
    }

    updateFirstPersonCamera(mode, deltaTime) {
        // Update position based on vehicle's driver seat
        const vehiclePos = this.vehicle.position.clone();
        const vehicleRot = this.vehicle.rotation.clone();

        const offset = new THREE.Vector3(
            mode.offset.x,
            mode.offset.y,
            mode.offset.z
        ).applyEuler(vehicleRot);

        this.state.position.copy(vehiclePos.add(offset));

        // Apply head bob if vehicle is moving
        if (this.vehicle.speed > 1) {
            const bobAmount = Math.sin(Date.now() * mode.headBob.frequency * 0.001) * 
                            mode.headBob.amount * 
                            Math.min(1, this.vehicle.speed / 10);
            this.state.position.y += bobAmount;
        }

        // Apply rotation with damping
        const targetRot = new THREE.Euler(
            vehicleRot.x,
            vehicleRot.y,
            vehicleRot.z
        );
        this.lerpRotation(targetRot, mode.damping.rotation);
    }

    updateChaseCamera(mode, deltaTime) {
        const vehiclePos = this.vehicle.position.clone();
        const vehicleVel = this.vehicle.velocity.clone();

        // Predict future position
        const prediction = vehicleVel.multiplyScalar(mode.prediction.time);
        const targetPos = vehiclePos.add(prediction);

        // Calculate camera position with offset
        const offset = new THREE.Vector3(
            mode.offset.x,
            mode.offset.y,
            mode.offset.z
        ).applyEuler(this.vehicle.rotation);

        const cameraTarget = targetPos.add(offset);

        // Apply smoothing
        this.state.position.lerp(cameraTarget, mode.damping.position);

        // Look at predicted position
        const lookAt = targetPos.add(new THREE.Vector3(
            mode.lookAt.x,
            mode.lookAt.y,
            mode.lookAt.z
        ));
        this.state.target.lerp(lookAt, mode.prediction.smoothing);
    }

    updateCinematicCamera(mode, deltaTime) {
        const currentTime = Date.now() * 0.001;
        const position = Math.floor(currentTime / mode.transitionTime) % 
                        mode.positions.length;
        const nextPosition = (position + 1) % mode.positions.length;
        
        const progress = (currentTime % mode.transitionTime) / mode.transitionTime;
        const eased = this.ease(progress);

        // Interpolate between positions
        const current = new THREE.Vector3().copy(mode.positions[position]);
        const next = new THREE.Vector3().copy(mode.positions[nextPosition]);
        
        this.state.position.lerpVectors(current, next, eased);

        // Look at vehicle
        this.state.target.copy(this.vehicle.position);
    }

    updateOrbitCamera(mode, deltaTime) {
        const time = Date.now() * 0.001 * mode.speed;
        
        this.state.position.x = Math.cos(time) * mode.distance;
        this.state.position.z = Math.sin(time) * mode.distance;
        this.state.position.y = mode.height;

        // Look at vehicle
        this.state.target.copy(this.vehicle.position);
    }

    checkCollisions() {
        const raycaster = new THREE.Raycaster();
        const rays = this.generateCollisionRays();

        let collision = false;
        let nearestDistance = Infinity;
        let nearestNormal = new THREE.Vector3();

        rays.forEach(ray => {
            raycaster.set(ray.origin, ray.direction);
            const intersects = raycaster.intersectObjects(this.vehicle.scene.children, true);

            if (intersects.length > 0 && 
                intersects[0].distance < nearestDistance) {
                collision = true;
                nearestDistance = intersects[0].distance;
                nearestNormal = intersects[0].face.normal;
            }
        });

        if (collision && nearestDistance < this.settings.collision.minDistance) {
            this.handleCameraCollision(nearestDistance, nearestNormal);
        } else {
            this.state.collision.active = false;
        }
    }

    generateCollisionRays() {
        const rays = [];
        const angleStep = (Math.PI * 2) / this.settings.collision.rayCount;

        for (let i = 0; i < this.settings.collision.rayCount; i++) {
            const angle = angleStep * i;
            const direction = new THREE.Vector3(
                Math.cos(angle),
                Math.sin(angle),
                0
            );
            rays.push({
                origin: this.state.position.clone(),
                direction: direction
            });
        }

        return rays;
    }

    handleCameraCollision(distance, normal) {
        this.state.collision = {
            active: true,
            normal: normal,
            distance: distance
        };

        // Move camera away from collision
        const offset = normal.multiplyScalar(
            this.settings.collision.minDistance - distance
        );
        this.state.position.add(offset);
    }

    handleCollision(data) {
        if (data.force > 10) {
            this.addShake('impact', data.force);
        }
    }

    handleEngineState(running) {
        if (running) {
            this.addShake('engine');
        }
    }

    addShake(type, intensity = 1) {
        const shakeSettings = this.settings.shake[type];
        
        this.state.shake = {
            active: true,
            type: type,
            intensity: intensity * shakeSettings.amount,
            duration: shakeSettings.duration,
            time: 0
        };
    }

    updateShake(deltaTime) {
        const shake = this.state.shake;
        shake.time += deltaTime;

        if (shake.time >= shake.duration) {
            this.state.shake.active = false;
            this.state.shake.offset.set(0, 0, 0);
            return;
        }

        const progress = shake.time / shake.duration;
        const intensity = shake.intensity * (1 - progress);

        if (shake.type === 'impact') {
            this.updateImpactShake(intensity);
        } else if (shake.type === 'engine') {
            this.updateEngineShake(intensity);
        }
    }

    updateImpactShake(intensity) {
        this.state.shake.offset.set(
            (Math.random() - 0.5) * intensity,
            (Math.random() - 0.5) * intensity,
            (Math.random() - 0.5) * intensity
        );
    }

    updateEngineShake(intensity) {
        const time = Date.now() * 0.001 * this.settings.shake.engine.frequency;
        this.state.shake.offset.set(
            Math.sin(time) * intensity,
            Math.cos(time * 0.5) * intensity,
            0
        );
    }

    applyTransforms() {
        // Apply position
        this.state.camera.position.copy(this.state.position);
        
        // Apply shake
        if (this.state.shake.active) {
            this.state.camera.position.add(this.state.shake.offset);
        }

        // Apply rotation
        this.state.camera.rotation.copy(this.state.rotation);

        // Update camera
        this.state.camera.updateProjectionMatrix();
    }

    handleResize() {
        this.state.camera.aspect = window.innerWidth / window.innerHeight;
        this.state.camera.updateProjectionMatrix();
    }

    calculateTargetPosition(mode) {
        const vehiclePos = this.vehicle.position.clone();
        const vehicleRot = this.vehicle.rotation.clone();

        const offset = new THREE.Vector3(
            mode.offset.x,
            mode.offset.y,
            mode.offset.z
        ).applyEuler(vehicleRot);

        return vehiclePos.add(offset);
    }

    calculateTargetRotation(mode) {
        if (mode.lookAt) {
            const lookAtPos = this.vehicle.position.clone().add(
                new THREE.Vector3(
                    mode.lookAt.x,
                    mode.lookAt.y,
                    mode.lookAt.z
                )
            );
            this.state.camera.lookAt(lookAtPos);
            return this.state.camera.rotation.clone();
        }
        return this.vehicle.rotation.clone();
    }

    lerpRotation(target, factor) {
        this.state.rotation.x = this.lerp(
            this.state.rotation.x,
            target.x,
            factor
        );
        this.state.rotation.y = this.lerp(
            this.state.rotation.y,
            target.y,
            factor
        );
        this.state.rotation.z = this.lerp(
            this.state.rotation.z,
            target.z,
            factor
        );
    }

    lerp(start, end, factor) {
        return start + (end - start) * factor;
    }

    ease(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    dispose() {
        window.removeEventListener('resize', this.handleResize);
        this.removeAllListeners();
    }
} 