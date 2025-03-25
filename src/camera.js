import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Vector3, Quaternion, PerspectiveCamera, MathUtils } from 'three';

export function setupCamera(camera, renderer) {
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;
  controls.minDistance = 5;
  controls.maxDistance = 20;
  controls.maxPolarAngle = Math.PI / 2;

  camera.position.set(0, 3, 10);
  controls.update();

  function update() {
    controls.update();
  }

  // TODO: Implement different camera views
  return { update };
}

export class CameraSystem {
    constructor(camera) {
        // Core components
        this.camera = camera;
        this.target = null;

        // Camera modes
        this.modes = {
            FOLLOW: 'follow',
            ORBIT: 'orbit',
            FIXED: 'fixed',
            CINEMATIC: 'cinematic',
            FIRST_PERSON: 'firstPerson'
        };

        // Camera settings
        this.settings = {
            follow: {
                distance: 7,
                height: 3,
                rotationSpeed: 2,
                smoothing: 0.1,
                lookAhead: 0.5,
                minDistance: 4,
                maxDistance: 15,
                minHeight: 1,
                maxHeight: 8,
                collisionOffset: 0.5
            },
            orbit: {
                distance: 10,
                minDistance: 5,
                maxDistance: 20,
                rotationSpeed: 1,
                minPolarAngle: Math.PI / 4,
                maxPolarAngle: Math.PI / 2
            },
            firstPerson: {
                offset: new THREE.Vector3(0, 1.6, 0),
                lookSpeed: 0.002,
                minPolarAngle: 0,
                maxPolarAngle: Math.PI
            }
        };

        // Camera state
        this.state = {
            mode: this.modes.FOLLOW,
            position: new THREE.Vector3(),
            rotation: new THREE.Euler(),
            targetPosition: new THREE.Vector3(),
            targetRotation: new THREE.Euler(),
            velocity: new THREE.Vector3(),
            distance: this.settings.follow.distance,
            height: this.settings.follow.height,
            yaw: 0,
            pitch: 0
        };

        // Helper objects
        this.workVectors = {
            direction: new THREE.Vector3(),
            up: new THREE.Vector3(0, 1, 0),
            right: new THREE.Vector3(),
            targetOffset: new THREE.Vector3(),
            rayStart: new THREE.Vector3(),
            rayEnd: new THREE.Vector3()
        };

        this.initialize();
    }

    initialize() {
        // Setup raycaster for collision detection
        this.raycaster = new THREE.Raycaster();
        
        // Initialize camera position
        this.camera.position.set(0, this.settings.follow.height, -this.settings.follow.distance);
        this.camera.lookAt(0, 0, 0);
    }

    setTarget(target) {
        this.target = target;
        this.updateTargetPosition();
    }

    setMode(mode) {
        if (!this.modes[mode]) return;

        const previousMode = this.state.mode;
        this.state.mode = mode;

        // Reset state for new mode
        switch (mode) {
            case this.modes.FOLLOW:
                this.state.distance = this.settings.follow.distance;
                this.state.height = this.settings.follow.height;
                break;
            case this.modes.ORBIT:
                this.state.distance = this.settings.orbit.distance;
                break;
            case this.modes.FIRST_PERSON:
                this.camera.position.copy(this.target.position).add(this.settings.firstPerson.offset);
                break;
        }

        // Emit mode change event
        this.onModeChange?.(mode, previousMode);
    }

    update(deltaTime, collisionObjects = []) {
        if (!this.target) return;

        this.updateTargetPosition();

        switch (this.state.mode) {
            case this.modes.FOLLOW:
                this.updateFollowCamera(deltaTime, collisionObjects);
                break;
            case this.modes.ORBIT:
                this.updateOrbitCamera(deltaTime, collisionObjects);
                break;
            case this.modes.FIXED:
                this.updateFixedCamera(deltaTime);
                break;
            case this.modes.CINEMATIC:
                this.updateCinematicCamera(deltaTime);
                break;
            case this.modes.FIRST_PERSON:
                this.updateFirstPersonCamera(deltaTime);
                break;
        }

        // Update camera matrices
        this.camera.updateMatrix();
        this.camera.updateMatrixWorld();
    }

    updateTargetPosition() {
        if (!this.target) return;

        // Get target world position
        this.state.targetPosition.setFromMatrixPosition(this.target.matrixWorld);
        
        // Get target forward direction
        this.target.getWorldDirection(this.workVectors.direction);
        
        // Calculate target rotation
        this.state.targetRotation.setFromRotationMatrix(this.target.matrixWorld);
    }

    updateFollowCamera(deltaTime, collisionObjects) {
        // Calculate desired camera position
        const targetPos = this.state.targetPosition.clone();
        const targetDir = this.workVectors.direction.clone();

        // Apply look-ahead offset
        targetPos.add(
            targetDir.multiplyScalar(this.settings.follow.lookAhead)
        );

        // Calculate camera position
        const cameraOffset = new THREE.Vector3(
            0,
            this.state.height,
            -this.state.distance
        );

        // Apply rotation
        cameraOffset.applyAxisAngle(
            this.workVectors.up,
            this.state.yaw
        );

        const desiredPosition = targetPos.clone().add(cameraOffset);

        // Check for collisions
        if (collisionObjects.length > 0) {
            this.handleCameraCollision(
                targetPos,
                desiredPosition,
                collisionObjects
            );
        }

        // Smooth camera movement
        this.camera.position.lerp(
            desiredPosition,
            this.settings.follow.smoothing
        );

        // Look at target
        this.camera.lookAt(targetPos);
    }

    updateOrbitCamera(deltaTime, collisionObjects) {
        const targetPos = this.state.targetPosition;

        // Update orbit position
        const phi = THREE.MathUtils.degToRad(this.state.pitch);
        const theta = THREE.MathUtils.degToRad(this.state.yaw);

        const x = this.state.distance * Math.sin(phi) * Math.cos(theta);
        const y = this.state.distance * Math.cos(phi);
        const z = this.state.distance * Math.sin(phi) * Math.sin(theta);

        const desiredPosition = targetPos.clone().add(
            new THREE.Vector3(x, y, z)
        );

        // Check for collisions
        if (collisionObjects.length > 0) {
            this.handleCameraCollision(
                targetPos,
                desiredPosition,
                collisionObjects
            );
        }

        this.camera.position.copy(desiredPosition);
        this.camera.lookAt(targetPos);
    }

    updateFirstPersonCamera(deltaTime) {
        if (!this.target) return;

        // Update position
        const targetPos = this.state.targetPosition.clone();
        targetPos.add(this.settings.firstPerson.offset);
        this.camera.position.copy(targetPos);

        // Update rotation
        this.camera.rotation.set(
            this.state.pitch,
            this.state.yaw,
            0,
            'YXZ'
        );
    }

    updateFixedCamera(deltaTime) {
        // Implementation for fixed camera positions
        // This could be used for specific viewpoints or cutscenes
    }

    updateCinematicCamera(deltaTime) {
        // Implementation for cinematic camera movements
        // This could follow predefined paths or behaviors
    }

    handleCameraCollision(from, to, collisionObjects) {
        this.raycaster.set(from, to.clone().sub(from).normalize());
        const distance = from.distanceTo(to);
        
        const intersects = this.raycaster.intersectObjects(collisionObjects);
        
        if (intersects.length > 0 && intersects[0].distance < distance) {
            const collision = intersects[0];
            const newPos = collision.point.clone().add(
                collision.face.normal.multiplyScalar(this.settings.follow.collisionOffset)
            );
            to.copy(newPos);
        }
    }

    handleMouseMovement(deltaX, deltaY) {
        switch (this.state.mode) {
            case this.modes.FOLLOW:
            case this.modes.ORBIT:
                this.state.yaw += deltaX * this.settings.follow.rotationSpeed;
                this.state.pitch += deltaY * this.settings.follow.rotationSpeed;
                
                // Clamp pitch angle
                this.state.pitch = THREE.MathUtils.clamp(
                    this.state.pitch,
                    this.settings.orbit.minPolarAngle,
                    this.settings.orbit.maxPolarAngle
                );
                break;

            case this.modes.FIRST_PERSON:
                this.state.yaw -= deltaX * this.settings.firstPerson.lookSpeed;
                this.state.pitch -= deltaY * this.settings.firstPerson.lookSpeed;
                
                // Clamp pitch angle
                this.state.pitch = THREE.MathUtils.clamp(
                    this.state.pitch,
                    this.settings.firstPerson.minPolarAngle,
                    this.settings.firstPerson.maxPolarAngle
                );
                break;
        }
    }

    handleMouseWheel(delta) {
        switch (this.state.mode) {
            case this.modes.FOLLOW:
                this.state.distance = THREE.MathUtils.clamp(
                    this.state.distance + delta * 0.5,
                    this.settings.follow.minDistance,
                    this.settings.follow.maxDistance
                );
                break;

            case this.modes.ORBIT:
                this.state.distance = THREE.MathUtils.clamp(
                    this.state.distance + delta * 0.5,
                    this.settings.orbit.minDistance,
                    this.settings.orbit.maxDistance
                );
                break;
        }
    }

    shake(intensity, duration) {
        // Implementation for camera shake effect
        const startPosition = this.camera.position.clone();
        const startRotation = this.camera.rotation.clone();
        let elapsed = 0;

        const animate = () => {
            elapsed += 0.016; // Approximate for 60fps
            
            if (elapsed < duration) {
                const remaining = 1 - (elapsed / duration);
                const shakeIntensity = intensity * remaining;
                
                this.camera.position.copy(startPosition).add(
                    new THREE.Vector3(
                        (Math.random() - 0.5) * shakeIntensity,
                        (Math.random() - 0.5) * shakeIntensity,
                        (Math.random() - 0.5) * shakeIntensity
                    )
                );

                requestAnimationFrame(animate);
            } else {
                this.camera.position.copy(startPosition);
                this.camera.rotation.copy(startRotation);
            }
        };

        requestAnimationFrame(animate);
    }

    dispose() {
        // Clean up any event listeners or resources
        this.target = null;
        this.raycaster = null;
    }
}