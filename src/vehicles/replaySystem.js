import { EventEmitter } from 'events';
import * as THREE from 'three';

export class VehicleReplaySystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            recording: {
                maxDuration: 300, // seconds
                frameRate: 60, // frames per second
                compressionLevel: 0.01, // minimum change threshold
                properties: {
                    position: {
                        type: 'vector3',
                        precision: 3
                    },
                    rotation: {
                        type: 'euler',
                        precision: 3
                    },
                    velocity: {
                        type: 'vector3',
                        precision: 2
                    },
                    wheelRotation: {
                        type: 'array',
                        precision: 2
                    },
                    suspension: {
                        type: 'array',
                        precision: 3
                    },
                    steering: {
                        type: 'number',
                        precision: 2
                    },
                    throttle: {
                        type: 'number',
                        precision: 2
                    },
                    brake: {
                        type: 'number',
                        precision: 2
                    }
                }
            },
            playback: {
                interpolation: {
                    enabled: true,
                    method: 'cubic' // linear, cubic
                },
                timeScale: {
                    min: 0.1,
                    max: 2.0,
                    default: 1.0
                },
                camera: {
                    modes: ['follow', 'free', 'cinematic'],
                    transitions: {
                        duration: 1.0,
                        easing: 'easeInOutQuad'
                    }
                }
            },
            events: {
                types: {
                    collision: {
                        properties: ['position', 'force', 'direction']
                    },
                    jump: {
                        properties: ['height', 'distance', 'rotation']
                    },
                    drift: {
                        properties: ['angle', 'duration', 'speed']
                    },
                    recovery: {
                        properties: ['method', 'duration', 'position']
                    }
                },
                maxCount: 1000
            },
            export: {
                format: 'json',
                compression: true,
                metadata: {
                    version: '1.0',
                    includeVehicleConfig: true,
                    includeTerrainState: true
                }
            }
        };

        this.state = {
            recording: {
                active: false,
                startTime: 0,
                frames: [],
                events: [],
                metadata: null
            },
            playback: {
                active: false,
                currentTime: 0,
                duration: 0,
                timeScale: this.settings.playback.timeScale.default,
                frameIndex: 0,
                camera: {
                    mode: 'follow',
                    transition: null
                }
            },
            cache: {
                interpolatedFrames: new Map(),
                lastValues: new Map()
            }
        };

        this.initialize();
    }

    initialize() {
        this.setupEventListeners();
        this.initializeCache();
    }

    setupEventListeners() {
        this.vehicle.on('update', this.onVehicleUpdate.bind(this));
        this.vehicle.on('collision', this.onVehicleCollision.bind(this));
        this.vehicle.on('stateChange', this.onVehicleStateChange.bind(this));
    }

    initializeCache() {
        Object.keys(this.settings.recording.properties).forEach(prop => {
            this.state.cache.lastValues.set(prop, null);
        });
    }

    startRecording() {
        if (this.state.recording.active) return false;

        this.state.recording = {
            active: true,
            startTime: performance.now(),
            frames: [],
            events: [],
            metadata: this.captureMetadata()
        };

        this.emit('recordingStarted');
        return true;
    }

    stopRecording() {
        if (!this.state.recording.active) return false;

        this.state.recording.active = false;
        this.finalizeRecording();

        this.emit('recordingStopped', {
            duration: this.getRecordingDuration(),
            frameCount: this.state.recording.frames.length,
            eventCount: this.state.recording.events.length
        });

        return true;
    }

    captureMetadata() {
        return {
            timestamp: Date.now(),
            vehicle: this.vehicle.getConfiguration(),
            terrain: this.vehicle.getTerrainState(),
            settings: {
                frameRate: this.settings.recording.frameRate,
                compression: this.settings.recording.compressionLevel
            }
        };
    }

    recordFrame() {
        const currentTime = performance.now();
        const frameTime = (currentTime - this.state.recording.startTime) / 1000;

        if (frameTime > this.settings.recording.maxDuration) {
            this.stopRecording();
            return;
        }

        const frame = this.captureVehicleState();
        
        // Check if frame should be recorded based on compression settings
        if (this.shouldRecordFrame(frame)) {
            frame.time = frameTime;
        this.state.recording.frames.push(frame);
            this.updateLastValues(frame);
        }
    }

    captureVehicleState() {
        const state = {};
        
        Object.entries(this.settings.recording.properties).forEach(([prop, config]) => {
            const value = this.vehicle[prop];
            state[prop] = this.formatValue(value, config);
        });

        return state;
    }

    formatValue(value, config) {
        switch (config.type) {
            case 'vector3':
            return {
                    x: Number(value.x.toFixed(config.precision)),
                    y: Number(value.y.toFixed(config.precision)),
                    z: Number(value.z.toFixed(config.precision))
                };
            case 'euler':
            return {
                    x: Number(value.x.toFixed(config.precision)),
                    y: Number(value.y.toFixed(config.precision)),
                    z: Number(value.z.toFixed(config.precision))
                };
            case 'array':
                return value.map(v => Number(v.toFixed(config.precision)));
            case 'number':
                return Number(value.toFixed(config.precision));
            default:
                return value;
        }
    }

    shouldRecordFrame(frame) {
        return Object.entries(frame).some(([prop, value]) => {
            const lastValue = this.state.cache.lastValues.get(prop);
            if (!lastValue) return true;

            const diff = this.calculateDifference(value, lastValue);
            return diff > this.settings.recording.compressionLevel;
        });
    }

    calculateDifference(current, last) {
        if (typeof current === 'number') {
            return Math.abs(current - last);
        } else if (current instanceof Object) {
            return Math.max(
                ...Object.keys(current).map(key =>
                    Math.abs(current[key] - last[key])
                )
            );
        } else if (Array.isArray(current)) {
            return Math.max(
                ...current.map((v, i) => Math.abs(v - last[i]))
            );
        }
        return Infinity;
    }

    updateLastValues(frame) {
        Object.entries(frame).forEach(([prop, value]) => {
            this.state.cache.lastValues.set(prop, value);
        });
    }

    recordEvent(type, data) {
        if (!this.state.recording.active) return;

        const event = {
            type,
            time: (performance.now() - this.state.recording.startTime) / 1000,
            data: this.formatEventData(type, data)
        };

        this.state.recording.events.push(event);
    }

    formatEventData(type, data) {
        const eventConfig = this.settings.events.types[type];
        if (!eventConfig) return data;

        const formattedData = {};
        eventConfig.properties.forEach(prop => {
            formattedData[prop] = data[prop];
        });

        return formattedData;
    }

    startPlayback(replayData) {
        if (this.state.playback.active) return false;

        this.loadReplayData(replayData);
        this.state.playback = {
            active: true,
            currentTime: 0,
            duration: this.calculatePlaybackDuration(),
            timeScale: this.settings.playback.timeScale.default,
            frameIndex: 0,
            camera: {
                mode: 'follow',
                transition: null
            }
        };

        this.emit('playbackStarted', {
            duration: this.state.playback.duration,
            frameCount: this.state.recording.frames.length,
            eventCount: this.state.recording.events.length
        });

        return true;
    }

    loadReplayData(replayData) {
        this.state.recording = {
            active: false,
            frames: replayData.frames,
            events: replayData.events,
            metadata: replayData.metadata
        };

        this.prepareInterpolation();
    }

    prepareInterpolation() {
        if (!this.settings.playback.interpolation.enabled) return;

        this.state.cache.interpolatedFrames.clear();

        // Pre-calculate interpolated frames
        for (let i = 0; i < this.state.recording.frames.length - 1; i++) {
            const frame1 = this.state.recording.frames[i];
            const frame2 = this.state.recording.frames[i + 1];
            const timeStep = 1 / this.settings.recording.frameRate;

            for (let t = 0; t < 1; t += timeStep) {
                const interpolatedFrame = this.interpolateFrame(frame1, frame2, t);
                const time = frame1.time + (frame2.time - frame1.time) * t;
                this.state.cache.interpolatedFrames.set(time, interpolatedFrame);
            }
        }
    }

    interpolateFrame(frame1, frame2, t) {
        const interpolated = {};

        Object.entries(this.settings.recording.properties).forEach(([prop, config]) => {
            interpolated[prop] = this.interpolateValue(
                frame1[prop],
                frame2[prop],
                t,
                config.type
            );
        });

        return interpolated;
    }

    interpolateValue(v1, v2, t, type) {
        switch (type) {
            case 'vector3':
            case 'euler':
                return {
                    x: this.interpolateNumber(v1.x, v2.x, t),
                    y: this.interpolateNumber(v1.y, v2.y, t),
                    z: this.interpolateNumber(v1.z, v2.z, t)
                };
            case 'array':
                return v1.map((val, i) => 
                    this.interpolateNumber(val, v2[i], t)
                );
            case 'number':
                return this.interpolateNumber(v1, v2, t);
            default:
                return v1;
        }
    }

    interpolateNumber(a, b, t) {
        if (this.settings.playback.interpolation.method === 'cubic') {
            // Cubic interpolation
            const t2 = t * t;
            const t3 = t2 * t;
            return (2 * t3 - 3 * t2 + 1) * a + (-2 * t3 + 3 * t2) * b;
        } else {
            // Linear interpolation
            return a + (b - a) * t;
        }
    }

    updatePlayback(deltaTime) {
        if (!this.state.playback.active) return;

        // Update time
        this.state.playback.currentTime += deltaTime * this.state.playback.timeScale;

        // Check for playback end
        if (this.state.playback.currentTime >= this.state.playback.duration) {
            this.stopPlayback();
            return;
        }

        // Apply frame
        this.applyPlaybackFrame();

        // Process events
        this.processPlaybackEvents();

        // Update camera
        this.updatePlaybackCamera();
    }

    applyPlaybackFrame() {
        let frame;

        if (this.settings.playback.interpolation.enabled) {
            frame = this.state.cache.interpolatedFrames.get(
                this.state.playback.currentTime
            );
            } else {
            // Find the closest frame
            while (this.state.playback.frameIndex < this.state.recording.frames.length - 1 &&
                   this.state.recording.frames[this.state.playback.frameIndex + 1].time <= 
                   this.state.playback.currentTime) {
                this.state.playback.frameIndex++;
            }
            frame = this.state.recording.frames[this.state.playback.frameIndex];
        }

        if (frame) {
            this.applyVehicleState(frame);
        }
    }

    applyVehicleState(frame) {
        Object.entries(frame).forEach(([prop, value]) => {
            if (prop !== 'time') {
                this.vehicle[prop] = this.deserializeValue(value);
            }
        });
    }

    deserializeValue(value) {
        if (value instanceof Object && 'x' in value && 'y' in value && 'z' in value) {
            return new THREE.Vector3(value.x, value.y, value.z);
        }
        return value;
    }

    processPlaybackEvents() {
        const currentTime = this.state.playback.currentTime;
        
        this.state.recording.events.forEach(event => {
            if (event.time <= currentTime && !event.processed) {
                this.emit('playbackEvent', event);
                event.processed = true;
            }
        });
    }

    updatePlaybackCamera() {
        if (this.state.playback.camera.transition) {
            this.updateCameraTransition();
        }

        switch (this.state.playback.camera.mode) {
            case 'follow':
                this.updateFollowCamera();
                break;
            case 'free':
                this.updateFreeCamera();
                break;
            case 'cinematic':
                this.updateCinematicCamera();
                break;
        }
    }

    updateCameraTransition() {
        const transition = this.state.playback.camera.transition;
        const progress = (performance.now() - transition.startTime) / 
                        (transition.duration * 1000);

        if (progress >= 1) {
            this.state.playback.camera.transition = null;
            return;
        }

        const t = this.easeInOutQuad(progress);
        this.vehicle.camera.position.lerpVectors(
            transition.startPosition,
            transition.endPosition,
            t
        );
        this.vehicle.camera.quaternion.slerp(
            transition.startRotation,
            transition.endRotation,
            t
        );
    }

    easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    updateFollowCamera() {
        // Standard follow camera logic
        const targetPosition = this.vehicle.position.clone()
            .add(new THREE.Vector3(0, 2, -5));
        this.vehicle.camera.position.lerp(targetPosition, 0.1);
        this.vehicle.camera.lookAt(this.vehicle.position);
    }

    updateFreeCamera() {
        // Free camera maintains its position/rotation unless explicitly changed
    }

    updateCinematicCamera() {
        // Cinematic camera follows predefined paths or interesting angles
        const time = this.state.playback.currentTime;
        const path = this.calculateCinematicPath(time);
        this.vehicle.camera.position.copy(path.position);
        this.vehicle.camera.lookAt(path.target);
    }

    calculateCinematicPath(time) {
        // Calculate cinematic camera position based on time and vehicle state
        const angle = time * Math.PI * 0.5;
        const radius = 10;
        const height = 3 + Math.sin(time * 0.5) * 2;

        return {
            position: new THREE.Vector3(
                Math.cos(angle) * radius,
                height,
                Math.sin(angle) * radius
            ).add(this.vehicle.position),
            target: this.vehicle.position
        };
    }

    setCameraMode(mode) {
        if (!this.settings.playback.camera.modes.includes(mode)) return;

        const transition = {
            startTime: performance.now(),
            duration: this.settings.playback.camera.transitions.duration,
            startPosition: this.vehicle.camera.position.clone(),
            startRotation: this.vehicle.camera.quaternion.clone(),
            endPosition: this.calculateCameraPosition(mode),
            endRotation: this.calculateCameraRotation(mode)
        };

        this.state.playback.camera.mode = mode;
        this.state.playback.camera.transition = transition;
    }

    calculateCameraPosition(mode) {
        switch (mode) {
            case 'follow':
                return this.vehicle.position.clone()
                    .add(new THREE.Vector3(0, 2, -5));
            case 'cinematic':
                return this.calculateCinematicPath(
                    this.state.playback.currentTime
                ).position;
            default:
                return this.vehicle.camera.position.clone();
        }
    }

    calculateCameraRotation(mode) {
        const rotation = new THREE.Quaternion();
        const target = mode === 'follow' ? this.vehicle.position :
                      this.calculateCinematicPath(
                          this.state.playback.currentTime
                      ).target;

        const direction = target.clone()
            .sub(this.calculateCameraPosition(mode))
            .normalize();
        rotation.setFromRotationMatrix(
            new THREE.Matrix4().lookAt(
                new THREE.Vector3(),
                direction,
                new THREE.Vector3(0, 1, 0)
            )
        );

        return rotation;
    }

    setTimeScale(scale) {
        scale = Math.max(
            this.settings.playback.timeScale.min,
            Math.min(this.settings.playback.timeScale.max, scale)
        );
        this.state.playback.timeScale = scale;
    }

    stopPlayback() {
        if (!this.state.playback.active) return;

        this.state.playback.active = false;
        this.resetPlaybackState();

        this.emit('playbackStopped');
    }

    resetPlaybackState() {
        this.state.playback = {
            active: false,
            currentTime: 0,
            duration: 0,
            timeScale: this.settings.playback.timeScale.default,
            frameIndex: 0,
            camera: {
                mode: 'follow',
                transition: null
            }
        };

        // Reset event processing flags
        this.state.recording.events.forEach(event => {
            delete event.processed;
        });
    }

    exportReplay() {
        const replayData = {
            metadata: {
                ...this.state.recording.metadata,
                exportTime: Date.now(),
                format: this.settings.export.format,
                version: this.settings.export.metadata.version
            },
            frames: this.state.recording.frames,
            events: this.state.recording.events
        };

        if (this.settings.export.compression) {
            return this.compressReplayData(replayData);
        }

        return replayData;
    }

    compressReplayData(data) {
        // Implement compression logic (e.g., delta encoding, quantization)
        return data;
    }

    calculatePlaybackDuration() {
        const frames = this.state.recording.frames;
        return frames[frames.length - 1].time;
    }

    getRecordingDuration() {
        return (performance.now() - this.state.recording.startTime) / 1000;
    }

    onVehicleUpdate(deltaTime) {
        if (this.state.recording.active) {
            this.recordFrame();
        }
        if (this.state.playback.active) {
            this.updatePlayback(deltaTime);
        }
    }

    onVehicleCollision(data) {
        if (this.state.recording.active) {
            this.recordEvent('collision', data);
        }
    }

    onVehicleStateChange(data) {
        if (this.state.recording.active) {
            this.recordEvent('stateChange', data);
        }
    }

    dispose() {
        if (this.state.recording.active) {
            this.stopRecording();
        }
        if (this.state.playback.active) {
            this.stopPlayback();
        }

        // Clear states
        this.state.cache.interpolatedFrames.clear();
        this.state.cache.lastValues.clear();

        // Remove listeners
        this.removeAllListeners();
    }
} 
        const highlight = {
            type,
            timestamp: Date.now() - this.state.recording.startTime,
            duration: this.settings.highlights.duration
        };

        this.state.recording.markers.push(highlight);
        this.emit('highlightMarked', highlight);
    }

    saveReplay(replay) {
        const compressed = this.compressReplay(replay);

        // Manage storage limits
        if (this.state.saved.size >= this.settings.storage.maxReplays) {
            const oldest = Array.from(this.state.saved.keys())[0];
            this.state.saved.delete(oldest);
        }

        this.state.saved.set(replay.id, replay);
        this.saveReplayData();

        this.emit('replaySaved', replay);
    }

    compressReplay(replay) {
        if (!this.settings.storage.compression) return replay;

        return {
            ...replay,
            frames: replay.frames.map(frame => ({
                timestamp: frame.timestamp,
                state: this.compressFrame(frame.state)
            }))
        };
    }

    decompressReplay(replay) {
        if (!this.settings.storage.compression) return replay;

        return {
            ...replay,
            frames: replay.frames.map(frame => ({
                timestamp: frame.timestamp,
                state: this.decompressFrame(frame.state)
            }))
        };
    }

    compressFrame(state) {
        // Implement frame compression logic
        return state;
    }

    decompressFrame(state) {
        // Implement frame decompression logic
        return state;
    }

    saveReplayData() {
        try {
            const data = {
                replays: Array.from(this.state.saved.entries()),
                highlights: this.state.highlights,
                stats: this.state.stats
            };

            localStorage.setItem('vehicleReplays', 
                               JSON.stringify(data));
            
            this.emit('replayDataSaved', data);
        } catch (error) {
            console.error('Failed to save replay data:', error);
        }
    }

    getEnvironmentData() {
        return {
            terrain: this.vehicle.getCurrentTerrain(),
            weather: this.vehicle.getCurrentWeather(),
            time: Date.now()
        };
    }

    setupPlaybackEnvironment(metadata) {
        // Setup environment based on metadata
        this.vehicle.setEnvironment(metadata.environment);
    }

    resetPlaybackEnvironment() {
        // Reset environment to current state
        this.vehicle.resetEnvironment();
    }

    dispose() {
        if (this.state.recording) {
            this.stopRecording();
        }
        if (this.state.playback) {
            this.stopPlayback();
        }

        // Clear state
        this.state.saved.clear();
        this.state.highlights = [];

        // Remove event listeners
        this.removeAllListeners();
    }
} 