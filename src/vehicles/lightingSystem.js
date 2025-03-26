import { EventEmitter } from 'events';
import * as THREE from 'three';

export class VehicleLightingSystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            lights: {
                headlights: {
                    low: {
                        intensity: 1.0,
                        distance: 50,
                        angle: Math.PI / 4,
                        color: 0xffffff,
                        position: { x: 0.8, y: 0.6, z: 2.0 }
                    },
                    high: {
                        intensity: 2.0,
                        distance: 100,
                        angle: Math.PI / 3,
                        color: 0xffffff,
                        position: { x: 0.8, y: 0.6, z: 2.0 }
                    }
                },
                taillights: {
                    normal: {
                        intensity: 0.5,
                        distance: 20,
                        color: 0xff0000,
                        position: { x: 0.8, y: 0.6, z: -2.0 }
                    },
                    brake: {
                        intensity: 1.0,
                        distance: 30,
                        color: 0xff0000,
                        position: { x: 0.8, y: 0.6, z: -2.0 }
                    }
                },
                indicators: {
                    intensity: 0.7,
                    distance: 15,
                    color: 0xff7700,
                    blinkRate: 500,
                    positions: {
                        front: { x: 0.9, y: 0.6, z: 2.0 },
                        rear: { x: 0.9, y: 0.6, z: -2.0 }
                    }
                },
                fog: {
                    intensity: 1.2,
                    distance: 30,
                    angle: Math.PI / 3,
                    color: 0xffffff,
                    position: { x: 0.9, y: 0.3, z: 2.0 }
                },
                auxiliary: {
                    intensity: 2.5,
                    distance: 150,
                    angle: Math.PI / 6,
                    color: 0xffffff,
                    positions: {
                        roof: { x: 0, y: 1.8, z: 0.5 },
                        bumper: { x: 0.5, y: 0.4, z: 2.2 }
                    }
                }
            },
            environment: {
                ambient: {
                    day: 1.0,
                    night: 0.1,
                    transition: 0.1
                },
                shadows: {
                    enabled: true,
                    resolution: 2048,
                    bias: 0.0001
                }
            },
            effects: {
                flare: {
                    size: 100,
                    opacity: 0.6,
                    threshold: 0.7
                },
                reflection: {
                    intensity: 0.5,
                    roughness: 0.2
                },
                volumetric: {
                    density: 0.02,
                    decay: 0.97,
                    weight: 0.3
                }
            }
        };

        this.state = {
            lights: new Map(),
            indicators: {
                left: false,
                right: false,
                hazard: false,
                blinkState: false
            },
            environment: {
                timeOfDay: 12,
                ambient: 1.0
            },
            effects: new Map()
        };

        this.initialize();
    }

    initialize() {
        this.setupLights();
        this.setupEffects();
        this.setupEventListeners();
        this.startBlinkInterval();
    }

    setupLights() {
        // Headlights
        this.createHeadlights();
        // Taillights
        this.createTaillights();
        // Indicators
        this.createIndicators();
        // Fog lights
        this.createFogLights();
        // Auxiliary lights
        this.createAuxiliaryLights();
    }

    createHeadlights() {
        ['left', 'right'].forEach(side => {
            const position = this.settings.lights.headlights.low.position;
            const xPos = side === 'left' ? -position.x : position.x;

            // Low beam
            const lowBeam = new THREE.SpotLight(
                this.settings.lights.headlights.low.color,
                this.settings.lights.headlights.low.intensity
            );
            lowBeam.position.set(xPos, position.y, position.z);
            lowBeam.angle = this.settings.lights.headlights.low.angle;
            lowBeam.distance = this.settings.lights.headlights.low.distance;

            // High beam
            const highBeam = new THREE.SpotLight(
                this.settings.lights.headlights.high.color,
                0 // Start off
            );
            highBeam.position.set(xPos, position.y, position.z);
            highBeam.angle = this.settings.lights.headlights.high.angle;
            highBeam.distance = this.settings.lights.headlights.high.distance;

            this.state.lights.set(`headlight_${side}_low`, lowBeam);
            this.state.lights.set(`headlight_${side}_high`, highBeam);
        });
    }

    createTaillights() {
        ['left', 'right'].forEach(side => {
            const position = this.settings.lights.taillights.normal.position;
            const xPos = side === 'left' ? -position.x : position.x;

            // Normal
            const normal = new THREE.PointLight(
                this.settings.lights.taillights.normal.color,
                this.settings.lights.taillights.normal.intensity
            );
            normal.position.set(xPos, position.y, position.z);
            normal.distance = this.settings.lights.taillights.normal.distance;

            // Brake
            const brake = new THREE.PointLight(
                this.settings.lights.taillights.brake.color,
                0 // Start off
            );
            brake.position.set(xPos, position.y, position.z);
            brake.distance = this.settings.lights.taillights.brake.distance;

            this.state.lights.set(`taillight_${side}_normal`, normal);
            this.state.lights.set(`taillight_${side}_brake`, brake);
        });
    }

    createIndicators() {
        ['left', 'right'].forEach(side => {
            ['front', 'rear'].forEach(location => {
                const position = this.settings.lights.indicators.positions[location];
                const xPos = side === 'left' ? -position.x : position.x;

                const indicator = new THREE.PointLight(
                    this.settings.lights.indicators.color,
                    0 // Start off
                );
                indicator.position.set(xPos, position.y, position.z);
                indicator.distance = this.settings.lights.indicators.distance;

                this.state.lights.set(`indicator_${side}_${location}`, indicator);
            });
        });
    }

    createFogLights() {
        ['left', 'right'].forEach(side => {
            const position = this.settings.lights.fog.position;
            const xPos = side === 'left' ? -position.x : position.x;

            const fogLight = new THREE.SpotLight(
                this.settings.lights.fog.color,
                0 // Start off
            );
            fogLight.position.set(xPos, position.y, position.z);
            fogLight.angle = this.settings.lights.fog.angle;
            fogLight.distance = this.settings.lights.fog.distance;

            this.state.lights.set(`fog_${side}`, fogLight);
        });
    }

    createAuxiliaryLights() {
        Object.entries(this.settings.lights.auxiliary.positions).forEach(([location, position]) => {
            const auxLight = new THREE.SpotLight(
                this.settings.lights.auxiliary.color,
                0 // Start off
            );
            auxLight.position.set(position.x, position.y, position.z);
            auxLight.angle = this.settings.lights.auxiliary.angle;
            auxLight.distance = this.settings.lights.auxiliary.distance;

            this.state.lights.set(`auxiliary_${location}`, auxLight);
        });
    }

    setupEffects() {
        // Lens flare
        this.setupLensFlare();
        // Light reflection
        this.setupReflection();
        // Volumetric lighting
        this.setupVolumetricLighting();
    }

    setupLensFlare() {
        const flareTexture = new THREE.TextureLoader().load('path/to/flare.png');
        
        this.state.lights.forEach((light, name) => {
            if (name.includes('headlight') || name.includes('auxiliary')) {
                const flare = {
                    texture: flareTexture,
                    size: this.settings.effects.flare.size,
                    opacity: this.settings.effects.flare.opacity
                };
                this.state.effects.set(`flare_${name}`, flare);
            }
        });
    }

    setupReflection() {
        this.state.lights.forEach((light, name) => {
            const reflection = {
                intensity: this.settings.effects.reflection.intensity,
                roughness: this.settings.effects.reflection.roughness
            };
            this.state.effects.set(`reflection_${name}`, reflection);
        });
    }

    setupVolumetricLighting() {
        this.state.lights.forEach((light, name) => {
            if (name.includes('headlight') || name.includes('fog')) {
                const volumetric = {
                    density: this.settings.effects.volumetric.density,
                    decay: this.settings.effects.volumetric.decay,
                    weight: this.settings.effects.volumetric.weight
                };
                this.state.effects.set(`volumetric_${name}`, volumetric);
            }
        });
    }

    setupEventListeners() {
        this.vehicle.on('brake', this.handleBrake.bind(this));
        this.vehicle.on('engineState', this.handleEngineState.bind(this));
        this.vehicle.on('timeChange', this.handleTimeChange.bind(this));
    }

    startBlinkInterval() {
        setInterval(() => {
            if (this.state.indicators.left || 
                this.state.indicators.right || 
                this.state.indicators.hazard) {
                this.state.indicators.blinkState = !this.state.indicators.blinkState;
                this.updateIndicators();
            }
        }, this.settings.lights.indicators.blinkRate);
    }

    setHeadlights(state, beam = 'low') {
        ['left', 'right'].forEach(side => {
            const light = this.state.lights.get(`headlight_${side}_${beam}`);
            light.intensity = state ? 
                this.settings.lights.headlights[beam].intensity : 0;
        });

        this.updateEffects();
        this.emit('headlightsChanged', { state, beam });
    }

    setHighBeam(state) {
        this.setHeadlights(state, 'high');
    }

    setFogLights(state) {
        ['left', 'right'].forEach(side => {
            const light = this.state.lights.get(`fog_${side}`);
            light.intensity = state ? 
                this.settings.lights.fog.intensity : 0;
        });

        this.updateEffects();
        this.emit('fogLightsChanged', state);
    }

    setAuxiliaryLights(state, location) {
        const light = this.state.lights.get(`auxiliary_${location}`);
        light.intensity = state ? 
            this.settings.lights.auxiliary.intensity : 0;

        this.updateEffects();
        this.emit('auxiliaryLightsChanged', { state, location });
    }

    setIndicator(side, state) {
        this.state.indicators[side] = state;
        this.updateIndicators();
        this.emit('indicatorChanged', { side, state });
    }

    setHazardLights(state) {
        this.state.indicators.hazard = state;
        this.updateIndicators();
        this.emit('hazardLightsChanged', state);
    }

    updateIndicators() {
        const intensity = this.state.indicators.blinkState ? 
            this.settings.lights.indicators.intensity : 0;

        ['left', 'right'].forEach(side => {
            if (this.state.indicators[side] || this.state.indicators.hazard) {
                ['front', 'rear'].forEach(location => {
                    const light = this.state.lights.get(`indicator_${side}_${location}`);
                    light.intensity = intensity;
                });
            }
        });
    }

    handleBrake(braking) {
        ['left', 'right'].forEach(side => {
            const light = this.state.lights.get(`taillight_${side}_brake`);
            light.intensity = braking ? 
                this.settings.lights.taillights.brake.intensity : 0;
        });
    }

    handleEngineState(running) {
        if (!running) {
            this.setHeadlights(false);
            this.setHighBeam(false);
            this.setFogLights(false);
            Object.keys(this.settings.lights.auxiliary.positions).forEach(location => {
                this.setAuxiliaryLights(false, location);
            });
        }
    }

    handleTimeChange(hour) {
        this.state.environment.timeOfDay = hour;
        this.updateAmbientLight();
    }

    updateAmbientLight() {
        const hour = this.state.environment.timeOfDay;
        let ambient;

        if (hour >= 6 && hour <= 18) {
            // Daytime
            ambient = this.settings.environment.ambient.day;
        } else if (hour < 6) {
            // Dawn transition
            const progress = hour / 6;
            ambient = this.lerp(
                this.settings.environment.ambient.night,
                this.settings.environment.ambient.day,
                progress
            );
        } else {
            // Dusk transition
            const progress = (hour - 18) / 6;
            ambient = this.lerp(
                this.settings.environment.ambient.day,
                this.settings.environment.ambient.night,
                progress
            );
        }

        this.state.environment.ambient = ambient;
        this.emit('ambientChanged', ambient);
    }

    updateEffects() {
        this.state.lights.forEach((light, name) => {
            if (light.intensity > 0) {
                // Update lens flare
                const flare = this.state.effects.get(`flare_${name}`);
                if (flare) {
                    flare.opacity = this.settings.effects.flare.opacity * 
                        (light.intensity / this.settings.lights[name.split('_')[0]].intensity);
                }

                // Update volumetric lighting
                const volumetric = this.state.effects.get(`volumetric_${name}`);
                if (volumetric) {
                    volumetric.density = this.settings.effects.volumetric.density * 
                        (light.intensity / this.settings.lights[name.split('_')[0]].intensity);
                }
            }
        });
    }

    lerp(start, end, alpha) {
        return start + (end - start) * alpha;
    }

    dispose() {
        // Dispose lights
        this.state.lights.forEach(light => {
            light.dispose();
        });

        // Dispose effects
        this.state.effects.forEach(effect => {
            if (effect.texture) {
                effect.texture.dispose();
            }
        });

        // Clear state
        this.state.lights.clear();
        this.state.effects.clear();

        // Remove event listeners
        this.removeAllListeners();
    }
} 