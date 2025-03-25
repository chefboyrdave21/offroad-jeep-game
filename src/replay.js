import * as THREE from 'three';

export class ReplaySystem {
    constructor(vehicle, camera) {
        // Core references
        this.vehicle = vehicle;
        this.camera = camera;

        // Replay settings
        this.settings = {
            recordingInterval: 1/60, // 60fps recording
            maxDuration: 300, // 5 minutes max
            compressionLevel: 0.1, // Data compression factor
            cameraSmoothing: 0.1,
            autoTrim: true,
            maxReplaySize: 50 * 1024 * 1024 // 50MB limit
        };

        // Replay state
        this.state = {
            isRecording: false,
            isPlaying: false,
            currentTime: 0,
            duration: 0,
            lastRecordTime: 0,
            frameCount: 0
        };

        // Replay data
        this.replayData = {
            metadata: {
                version: '1.0',
                date: null,
                duration: 0,
                levelId: null,
                vehicleId: null
            },
            frames: [],
            events: [],
            markers: new Map()
        };

        // Playback controls
        this.playback = {
            speed: 1.0,
            loop: false,
            currentFrame: 0,
            startTime: 0,
            paused: false
        };

        this.initialize();
    }

    initialize() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Listen for notable events
        this.vehicle.on('collision', (data) => {
            if (this.state.isRecording) {
                this.recordEvent('collision', data);
            }
        });

        this.vehicle.on('damage', (data) => {
            if (this.state.isRecording) {
                this.recordEvent('damage', data);
            }
        });
    }

    startRecording(metadata = {}) {
        if (this.state.isRecording || this.state.isPlaying) return;

        // Initialize recording state
        this.state.isRecording = true;
        this.state.currentTime = 0;
        this.state.lastRecordTime = performance.now();
        this.state.frameCount = 0;

        // Clear previous data
        this.replayData.frames = [];
        this.replayData.events = [];
        this.replayData.markers.clear();

        // Set metadata
        this.replayData.metadata = {
            version: '1.0',
            date: new Date().toISOString(),
            duration: 0,
            levelId: metadata.levelId || null,
            vehicleId: metadata.vehicleId || null,
            ...metadata
        };
    }

    stopRecording() {
        if (!this.state.isRecording) return;

        this.state.isRecording = false;
        this.replayData.metadata.duration = this.state.currentTime;

        // Auto-trim if enabled
        if (this.settings.autoTrim) {
            this.trimReplay();
        }

        return this.replayData;
    }

    recordFrame() {
        if (!this.state.isRecording) return;

        const now = performance.now();
        const deltaTime = (now - this.state.lastRecordTime) / 1000;

        if (deltaTime >= this.settings.recordingInterval) {
            // Record vehicle state
            const frame = {
                time: this.state.currentTime,
                vehicle: {
                    position: this.vehicle.components.vehicle.chassisBody.position.clone(),
                    rotation: this.vehicle.components.vehicle.chassisBody.quaternion.clone(),
                    velocity: this.vehicle.components.vehicle.chassisBody.velocity.clone(),
                    wheels: this.vehicle.components.wheels.map(wheel => ({
                        rotation: wheel.rotation,
                        suspensionLength: wheel.suspensionLength
                    })),
                    state: {
                        throttle: this.vehicle.state.throttle,
                        brake: this.vehicle.state.brake,
                        steering: this.vehicle.state.steering,
                        gear: this.vehicle.state.gear
                    }
                },
                camera: {
                    position: this.camera.position.clone(),
                    rotation: this.camera.rotation.clone()
                }
            };

            this.replayData.frames.push(this.compressFrame(frame));
            
            this.state.lastRecordTime = now;
            this.state.currentTime += deltaTime;
            this.state.frameCount++;

            // Check recording limits
            if (this.state.currentTime >= this.settings.maxDuration ||
                this.getReplaySize() >= this.settings.maxReplaySize) {
                this.stopRecording();
            }
        }
    }

    recordEvent(type, data) {
        if (!this.state.isRecording) return;

        this.replayData.events.push({
            time: this.state.currentTime,
            type: type,
            data: data
        });
    }

    addMarker(name, time = this.state.currentTime) {
        if (!this.state.isRecording) return;

        this.replayData.markers.set(name, {
            time: time,
            frame: this.state.frameCount
        });
    }

    startPlayback(replayData, options = {}) {
        if (this.state.isRecording || this.state.isPlaying) return;

        // Initialize playback state
        this.replayData = this.decompressReplay(replayData);
        this.state.isPlaying = true;
        this.playback = {
            speed: options.speed || 1.0,
            loop: options.loop || false,
            currentFrame: 0,
            startTime: performance.now(),
            paused: false
        };
    }

    stopPlayback() {
        if (!this.state.isPlaying) return;

        this.state.isPlaying = false;
        this.playback.paused = false;
        this.resetVehicleState();
    }

    pausePlayback() {
        if (!this.state.isPlaying) return;
        this.playback.paused = true;
    }

    resumePlayback() {
        if (!this.state.isPlaying) return;
        this.playback.paused = false;
        this.playback.startTime = performance.now() - (this.state.currentTime * 1000);
    }

    setPlaybackSpeed(speed) {
        this.playback.speed = Math.max(0.1, Math.min(speed, 10.0));
    }

    update() {
        if (this.state.isRecording) {
            this.recordFrame();
        } else if (this.state.isPlaying && !this.playback.paused) {
            this.updatePlayback();
        }
    }

    updatePlayback() {
        const currentTime = (performance.now() - this.playback.startTime) / 1000 * this.playback.speed;
        
        // Find frames to interpolate between
        const nextFrameIndex = this.findNextFrame(currentTime);
        if (nextFrameIndex === -1) {
            if (this.playback.loop) {
                this.restartPlayback();
            } else {
                this.stopPlayback();
            }
            return;
        }

        const frame1 = this.replayData.frames[nextFrameIndex - 1];
        const frame2 = this.replayData.frames[nextFrameIndex];
        const alpha = (currentTime - frame1.time) / (frame2.time - frame1.time);

        // Interpolate vehicle state
        this.interpolateVehicleState(frame1, frame2, alpha);
        
        // Interpolate camera
        this.interpolateCamera(frame1, frame2, alpha);

        // Check for events
        this.checkEvents(currentTime);
    }

    findNextFrame(time) {
        for (let i = 0; i < this.replayData.frames.length; i++) {
            if (this.replayData.frames[i].time > time) {
                return i;
            }
        }
        return -1;
    }

    interpolateVehicleState(frame1, frame2, alpha) {
        // Interpolate position
        const position = new THREE.Vector3().lerpVectors(
            frame1.vehicle.position,
            frame2.vehicle.position,
            alpha
        );

        // Interpolate rotation
        const rotation = new THREE.Quaternion().slerpQuaternions(
            frame1.vehicle.rotation,
            frame2.vehicle.rotation,
            alpha
        );

        // Apply to vehicle
        this.vehicle.components.vehicle.chassisBody.position.copy(position);
        this.vehicle.components.vehicle.chassisBody.quaternion.copy(rotation);

        // Interpolate wheel states
        frame1.vehicle.wheels.forEach((wheel, index) => {
            const wheel2 = frame2.vehicle.wheels[index];
            const wheelObj = this.vehicle.components.wheels[index];
            
            wheelObj.rotation = THREE.MathUtils.lerp(
                wheel.rotation,
                wheel2.rotation,
                alpha
            );
            
            wheelObj.suspensionLength = THREE.MathUtils.lerp(
                wheel.suspensionLength,
                wheel2.suspensionLength,
                alpha
            );
        });

        // Update vehicle state
        this.vehicle.state.throttle = THREE.MathUtils.lerp(
            frame1.vehicle.state.throttle,
            frame2.vehicle.state.throttle,
            alpha
        );
        this.vehicle.state.brake = THREE.MathUtils.lerp(
            frame1.vehicle.state.brake,
            frame2.vehicle.state.brake,
            alpha
        );
        this.vehicle.state.steering = THREE.MathUtils.lerp(
            frame1.vehicle.state.steering,
            frame2.vehicle.state.steering,
            alpha
        );
        this.vehicle.state.gear = frame2.vehicle.state.gear;
    }

    interpolateCamera(frame1, frame2, alpha) {
        // Interpolate camera position
        this.camera.position.lerpVectors(
            frame1.camera.position,
            frame2.camera.position,
            alpha
        );

        // Interpolate camera rotation
        const rotation = new THREE.Euler().setFromVector3(
            new THREE.Vector3().lerpVectors(
                new THREE.Vector3().setFromEuler(frame1.camera.rotation),
                new THREE.Vector3().setFromEuler(frame2.camera.rotation),
                alpha
            )
        );
        this.camera.rotation.copy(rotation);
    }

    checkEvents(currentTime) {
        this.replayData.events.forEach(event => {
            if (!event.triggered && event.time <= currentTime) {
                this.triggerEvent(event);
                event.triggered = true;
            }
        });
    }

    triggerEvent(event) {
        switch(event.type) {
            case 'collision':
                this.vehicle.emit('replayCollision', event.data);
                break;
            case 'damage':
                this.vehicle.emit('replayDamage', event.data);
                break;
        }
    }

    compressFrame(frame) {
        // Compress numerical values
        const compress = (value) => Math.round(value * (1 / this.settings.compressionLevel)) / (1 / this.settings.compressionLevel);

        return {
            time: compress(frame.time),
            vehicle: {
                position: new THREE.Vector3(
                    compress(frame.vehicle.position.x),
                    compress(frame.vehicle.position.y),
                    compress(frame.vehicle.position.z)
                ),
                rotation: frame.vehicle.rotation,
                velocity: new THREE.Vector3(
                    compress(frame.vehicle.velocity.x),
                    compress(frame.vehicle.velocity.y),
                    compress(frame.vehicle.velocity.z)
                ),
                wheels: frame.vehicle.wheels.map(wheel => ({
                    rotation: compress(wheel.rotation),
                    suspensionLength: compress(wheel.suspensionLength)
                })),
                state: {
                    throttle: compress(frame.vehicle.state.throttle),
                    brake: compress(frame.vehicle.state.brake),
                    steering: compress(frame.vehicle.state.steering),
                    gear: frame.vehicle.state.gear
                }
            },
            camera: {
                position: new THREE.Vector3(
                    compress(frame.camera.position.x),
                    compress(frame.camera.position.y),
                    compress(frame.camera.position.z)
                ),
                rotation: new THREE.Euler(
                    compress(frame.camera.rotation.x),
                    compress(frame.camera.rotation.y),
                    compress(frame.camera.rotation.z)
                )
            }
        };
    }

    decompressReplay(replayData) {
        return {
            ...replayData,
            frames: replayData.frames.map(frame => this.compressFrame(frame))
        };
    }

    trimReplay() {
        // Remove unnecessary frames at start and end
        const startIndex = this.findFirstSignificantFrame();
        const endIndex = this.findLastSignificantFrame();

        if (startIndex < endIndex) {
            this.replayData.frames = this.replayData.frames.slice(startIndex, endIndex + 1);
            this.replayData.metadata.duration = 
                this.replayData.frames[this.replayData.frames.length - 1].time -
                this.replayData.frames[0].time;
        }
    }

    findFirstSignificantFrame() {
        for (let i = 0; i < this.replayData.frames.length; i++) {
            const frame = this.replayData.frames[i];
            if (frame.vehicle.state.throttle !== 0 ||
                frame.vehicle.state.brake !== 0 ||
                frame.vehicle.state.steering !== 0) {
                return Math.max(0, i - 60); // Include 1 second before action
            }
        }
        return 0;
    }

    findLastSignificantFrame() {
        for (let i = this.replayData.frames.length - 1; i >= 0; i--) {
            const frame = this.replayData.frames[i];
            if (frame.vehicle.state.throttle !== 0 ||
                frame.vehicle.state.brake !== 0 ||
                frame.vehicle.state.steering !== 0) {
                return Math.min(this.replayData.frames.length - 1, i + 60); // Include 1 second after action
            }
        }
        return this.replayData.frames.length - 1;
    }

    getReplaySize() {
        return JSON.stringify(this.replayData).length;
    }

    restartPlayback() {
        this.playback.currentFrame = 0;
        this.playback.startTime = performance.now();
        this.resetVehicleState();
    }

    resetVehicleState() {
        if (this.replayData.frames.length > 0) {
            const firstFrame = this.replayData.frames[0];
            this.vehicle.components.vehicle.chassisBody.position.copy(firstFrame.vehicle.position);
            this.vehicle.components.vehicle.chassisBody.quaternion.copy(firstFrame.vehicle.rotation);
            this.vehicle.components.vehicle.chassisBody.velocity.copy(firstFrame.vehicle.velocity);
        }
    }

    dispose() {
        this.stopRecording();
        this.stopPlayback();
        this.replayData = null;
    }
} 