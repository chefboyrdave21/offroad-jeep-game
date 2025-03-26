import { EventEmitter } from 'events';
import * as THREE from 'three';

export class VehicleWeatherEffectsSystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            weather: {
                rain: {
                    intensityLevels: [0.2, 0.4, 0.6, 0.8, 1.0],
                    effects: {
                        traction: -0.3,
                        visibility: -0.4,
                        windshieldWater: 0.5
                    },
                    particles: {
                        count: 1000,
                        size: 0.1,
                        speed: 10
                    }
                },
                snow: {
                    intensityLevels: [0.2, 0.4, 0.6, 0.8, 1.0],
                    effects: {
                        traction: -0.5,
                        visibility: -0.6,
                        accumulation: 0.3
                    },
                    particles: {
                        count: 800,
                        size: 0.15,
                        speed: 5
                    }
                },
                wind: {
                    intensityLevels: [5, 10, 15, 20, 25],
                    effects: {
                        handling: -0.2,
                        stability: -0.3,
                        debris: 0.4
                    }
                },
                fog: {
                    intensityLevels: [0.2, 0.4, 0.6, 0.8, 1.0],
                    effects: {
                        visibility: -0.7,
                        ambient: -0.3
                    }
                },
                mud: {
                    accumulation: {
                        rate: 0.1,
                        max: 1.0
                    },
                    effects: {
                        weight: 0.2,
                        cooling: -0.1
                    }
                }
            },
            surfaces: {
                asphalt: {
                    wetness: {
                        absorption: 0.3,
                        drainage: 0.5
                    }
                },
                dirt: {
                    wetness: {
                        absorption: 0.6,
                        drainage: 0.2
                    }
                },
                grass: {
                    wetness: {
                        absorption: 0.8,
                        drainage: 0.3
                    }
                },
                sand: {
                    wetness: {
                        absorption: 0.9,
                        drainage: 0.1
                    }
                }
            },
            vehicle: {
                windshield: {
                    wiperSpeed: [0, 0.5, 1.0],
                    waterAccumulation: {
                        rate: 0.2,
                        max: 1.0
                    }
                },
                body: {
                    dirtAccumulation: {
                        rate: 0.1,
                        max: 1.0
                    },
                    washRate: 0.3
                }
            }
        };

        this.state = {
            current: {
                weather: null,
                intensity: 0,
                effects: new Map(),
                particles: new Map()
            },
            vehicle: {
                windshield: {
                    water: 0,
                    wiperState: 0
                },
                body: {
                    dirt: 0,
                    wetness: 0
                }
            },
            environment: {
                surface: null,
                wetness: 0,
                temperature: 20
            }
        };

        this.initialize();
    }

    initialize() {
        this.setupParticleSystems();
        this.setupShaderEffects();
        this.setupEventListeners();
    }

    setupParticleSystems() {
        // Rain particles
        const rainGeometry = new THREE.BufferGeometry();
        const rainMaterial = new THREE.PointsMaterial({
            size: this.settings.weather.rain.particles.size,
            transparent: true,
            opacity: 0.6
        });

        this.state.particles.set('rain', {
            system: new THREE.Points(rainGeometry, rainMaterial),
            active: false
        });

        // Snow particles
        const snowGeometry = new THREE.BufferGeometry();
        const snowMaterial = new THREE.PointsMaterial({
            size: this.settings.weather.snow.particles.size,
            transparent: true,
            opacity: 0.8
        });

        this.state.particles.set('snow', {
            system: new THREE.Points(snowGeometry, snowMaterial),
            active: false
        });
    }

    setupShaderEffects() {
        // Setup shader effects for various weather conditions
        this.state.effects.set('rain', {
            uniforms: {
                intensity: { value: 0 },
                time: { value: 0 }
            },
            active: false
        });

        this.state.effects.set('snow', {
            uniforms: {
                intensity: { value: 0 },
                accumulation: { value: 0 }
            },
            active: false
        });

        this.state.effects.set('fog', {
            uniforms: {
                density: { value: 0 },
                color: { value: new THREE.Color(0xcfcfcf) }
            },
            active: false
        });
    }

    setupEventListeners() {
        this.vehicle.on('surfaceChange', this.handleSurfaceChange.bind(this));
        this.vehicle.on('collision', this.handleCollision.bind(this));
        this.vehicle.on('splash', this.handleSplash.bind(this));
    }

    setWeather(type, intensity) {
        if (!this.settings.weather[type]) {
            throw new Error(`Invalid weather type: ${type}`);
        }

        this.state.current.weather = type;
        this.state.current.intensity = intensity;

        this.updateWeatherEffects();
        this.emit('weatherChanged', { type, intensity });
    }

    updateWeatherEffects() {
        const weather = this.state.current.weather;
        const intensity = this.state.current.intensity;

        if (!weather) return;

        // Update particle systems
        this.updateParticles(weather, intensity);

        // Update shader effects
        this.updateShaders(weather, intensity);

        // Update vehicle effects
        this.updateVehicleEffects(weather, intensity);

        // Update environment effects
        this.updateEnvironmentEffects(weather, intensity);
    }

    updateParticles(weather, intensity) {
        if (weather === 'rain' || weather === 'snow') {
            const particles = this.state.particles.get(weather);
            const settings = this.settings.weather[weather].particles;

            const count = Math.floor(settings.count * intensity);
            const positions = new Float32Array(count * 3);

            for (let i = 0; i < count; i++) {
                positions[i * 3] = (Math.random() - 0.5) * 50;
                positions[i * 3 + 1] = Math.random() * 30;
                positions[i * 3 + 2] = (Math.random() - 0.5) * 50;
            }

            particles.system.geometry.setAttribute(
                'position',
                new THREE.BufferAttribute(positions, 3)
            );
            particles.active = true;
        }
    }

    updateShaders(weather, intensity) {
        const effect = this.state.effects.get(weather);
        if (!effect) return;

        effect.uniforms.intensity.value = intensity;
        effect.active = true;

        if (weather === 'fog') {
            effect.uniforms.density.value = 
                this.settings.weather.fog.intensityLevels[
                    Math.floor(intensity * 4)
                ];
        }
    }

    updateVehicleEffects(weather, intensity) {
        const effects = this.settings.weather[weather].effects;

        // Update vehicle physics
        if (effects.traction) {
            this.vehicle.modifyTraction(effects.traction * intensity);
        }
        if (effects.handling) {
            this.vehicle.modifyHandling(effects.handling * intensity);
        }
        if (effects.stability) {
            this.vehicle.modifyStability(effects.stability * intensity);
        }

        // Update windshield water
        if (weather === 'rain') {
            this.updateWindshieldWater(intensity);
        }

        // Update body conditions
        this.updateBodyConditions(weather, intensity);
    }

    updateEnvironmentEffects(weather, intensity) {
        const surface = this.state.environment.surface;
        if (!surface) return;

        const surfaceSettings = this.settings.surfaces[surface];
        
        // Update surface wetness
        if (weather === 'rain') {
            const absorption = surfaceSettings.wetness.absorption;
            const drainage = surfaceSettings.wetness.drainage;

            this.state.environment.wetness = Math.min(
                1,
                this.state.environment.wetness + 
                (intensity * absorption - drainage) * 0.016
            );
        }

        // Update temperature effects
        if (weather === 'snow') {
            this.state.environment.temperature = Math.max(
                0,
                this.state.environment.temperature - intensity * 0.1
            );
        }
    }

    updateWindshieldWater(intensity) {
        const windshield = this.state.vehicle.windshield;
        const settings = this.settings.vehicle.windshield;

        // Add water based on rain intensity
        windshield.water = Math.min(
            settings.waterAccumulation.max,
            windshield.water + intensity * settings.waterAccumulation.rate
        );

        // Remove water based on wiper speed
        if (windshield.wiperState > 0) {
            windshield.water = Math.max(
                0,
                windshield.water - settings.wiperSpeed[windshield.wiperState]
            );
        }
    }

    updateBodyConditions(weather, intensity) {
        const body = this.state.vehicle.body;
        const settings = this.settings.vehicle.body;

        // Update dirt accumulation
        if (weather === 'rain' || weather === 'snow') {
            body.dirt = Math.min(
                settings.dirtAccumulation.max,
                body.dirt + intensity * settings.dirtAccumulation.rate
            );
        }

        // Update wetness
        if (weather === 'rain') {
            body.wetness = Math.min(1, intensity);
        } else {
            body.wetness = Math.max(0, body.wetness - 0.016);
        }

        // Clean vehicle in heavy rain
        if (weather === 'rain' && intensity > 0.8) {
            body.dirt = Math.max(
                0,
                body.dirt - settings.washRate * 0.016
            );
        }
    }

    setWiperSpeed(speed) {
        if (speed < 0 || speed >= this.settings.vehicle.windshield.wiperSpeed.length) {
            throw new Error('Invalid wiper speed');
        }

        this.state.vehicle.windshield.wiperState = speed;
        this.emit('wiperSpeedChanged', speed);
    }

    handleSurfaceChange(surface) {
        this.state.environment.surface = surface;
        this.updateEnvironmentEffects(
            this.state.current.weather,
            this.state.current.intensity
        );
    }

    handleCollision(data) {
        // Splash effect on collision with water
        if (data.surface === 'water') {
            this.createSplashEffect(data.position, data.force);
        }

        // Dirt spray on collision with mud/dirt
        if (data.surface === 'mud' || data.surface === 'dirt') {
            this.createDirtSprayEffect(data.position, data.force);
        }
    }

    handleSplash(data) {
        this.createSplashEffect(data.position, data.force);
    }

    createSplashEffect(position, force) {
        // Create water splash particle effect
        const splashGeometry = new THREE.BufferGeometry();
        const splashMaterial = new THREE.PointsMaterial({
            size: 0.2,
            transparent: true,
            opacity: 0.6
        });

        const particles = new THREE.Points(splashGeometry, splashMaterial);
        particles.position.copy(position);

        // Add to scene temporarily
        setTimeout(() => {
            particles.geometry.dispose();
            particles.material.dispose();
            particles.parent.remove(particles);
        }, 1000);
    }

    createDirtSprayEffect(position, force) {
        // Create dirt spray particle effect
        const sprayGeometry = new THREE.BufferGeometry();
        const sprayMaterial = new THREE.PointsMaterial({
            size: 0.15,
            transparent: true,
            opacity: 0.8,
            color: new THREE.Color(0x553322)
        });

        const particles = new THREE.Points(sprayGeometry, sprayMaterial);
        particles.position.copy(position);

        // Add to scene temporarily
        setTimeout(() => {
            particles.geometry.dispose();
            particles.material.dispose();
            particles.parent.remove(particles);
        }, 1000);
    }

    getWeatherState() {
        return {
            type: this.state.current.weather,
            intensity: this.state.current.intensity,
            vehicle: { ...this.state.vehicle },
            environment: { ...this.state.environment }
        };
    }

    dispose() {
        // Dispose particle systems
        this.state.particles.forEach(particles => {
            particles.system.geometry.dispose();
            particles.system.material.dispose();
        });

        // Clear state
        this.state.particles.clear();
        this.state.effects.clear();

        // Remove event listeners
        this.removeAllListeners();
    }
} 