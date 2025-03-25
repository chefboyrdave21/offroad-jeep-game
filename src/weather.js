import * as THREE from 'three';

export class WeatherSystem {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Weather states
        this.states = {
            CLEAR: 'clear',
            CLOUDY: 'cloudy',
            RAIN: 'rain',
            STORM: 'storm',
            FOG: 'fog'
        };

        // Current weather state
        this.currentState = this.states.CLEAR;

        // Weather settings
        this.settings = {
            transitionDuration: 5.0, // seconds
            dayNightCycle: true,
            timeScale: 1.0, // 1.0 = real-time
            rainCount: 10000,
            snowCount: 5000,
            cloudCount: 50,
            lightningFrequency: 3.0 // seconds
        };

        // Weather components
        this.components = {
            sky: null,
            clouds: null,
            rain: null,
            lightning: null,
            fog: null
        };

        // Time tracking
        this.time = {
            current: 12, // Start at noon
            dayLength: 24 * 60, // 24 minutes = 1 day
            lastUpdate: Date.now(),
            lastLightning: 0
        };

        this.initialize();
    }

    async initialize() {
        await this.createSky();
        this.createClouds();
        this.createRain();
        this.createLightning();
        this.createFog();
    }

    async createSky() {
        // Create sky hemisphere
        const sky = new THREE.HemisphereLight(0x0088ff, 0x002244, 1);
        this.scene.add(sky);
        this.components.sky = sky;

        // Create sun
        const sunLight = new THREE.DirectionalLight(0xffffee, 1);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.near = 1;
        sunLight.shadow.camera.far = 1000;
        sunLight.shadow.camera.left = -100;
        sunLight.shadow.camera.right = 100;
        sunLight.shadow.camera.top = 100;
        sunLight.shadow.camera.bottom = -100;
        this.scene.add(sunLight);
        this.components.sky.sunLight = sunLight;
    }

    createClouds() {
        const cloudGeometry = new THREE.BufferGeometry();
        const cloudMaterial = new THREE.PointsMaterial({
            size: 50,
            map: new THREE.TextureLoader().load('textures/weather/cloud.png'),
            transparent: true,
            opacity: 0.6,
            depthWrite: false
        });

        // Generate cloud positions
        const positions = new Float32Array(this.settings.cloudCount * 3);
        for (let i = 0; i < this.settings.cloudCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 1000;
            positions[i * 3 + 1] = 200 + Math.random() * 50;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 1000;
        }
        cloudGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const clouds = new THREE.Points(cloudGeometry, cloudMaterial);
        this.scene.add(clouds);
        this.components.clouds = clouds;
    }

    createRain() {
        const rainGeometry = new THREE.BufferGeometry();
        const rainMaterial = new THREE.PointsMaterial({
            size: 0.1,
            color: 0xaaaaaa,
            transparent: true,
            opacity: 0.6,
            depthWrite: false
        });

        // Generate raindrops
        const positions = new Float32Array(this.settings.rainCount * 3);
        const velocities = new Float32Array(this.settings.rainCount);
        
        for (let i = 0; i < this.settings.rainCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 1000;
            positions[i * 3 + 1] = Math.random() * 500;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 1000;
            velocities[i] = 1 + Math.random();
        }

        rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        rainGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));

        const rain = new THREE.Points(rainGeometry, rainMaterial);
        rain.visible = false;
        this.scene.add(rain);
        this.components.rain = {
            mesh: rain,
            velocities: velocities
        };
    }

    createLightning() {
        const lightningLight = new THREE.PointLight(0xffffff, 0, 1000);
        lightningLight.visible = false;
        this.scene.add(lightningLight);
        this.components.lightning = lightningLight;
    }

    createFog() {
        this.components.fog = new THREE.FogExp2(0xcccccc, 0.0005);
        this.scene.fog = this.components.fog;
        this.scene.fog.enabled = false;
    }

    setWeatherState(state, instant = false) {
        if (this.states[state]) {
            const duration = instant ? 0 : this.settings.transitionDuration;
            this.transitionToState(state, duration);
        }
    }

    transitionToState(newState, duration) {
        const startState = this.getStateProperties(this.currentState);
        const endState = this.getStateProperties(newState);
        const startTime = Date.now();

        const updateTransition = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            const progress = Math.min(elapsed / duration, 1);

            // Interpolate properties
            this.updateSkyProperties(startState.sky, endState.sky, progress);
            this.updateCloudProperties(startState.clouds, endState.clouds, progress);
            this.updateRainProperties(startState.rain, endState.rain, progress);
            this.updateFogProperties(startState.fog, endState.fog, progress);

            if (progress < 1) {
                requestAnimationFrame(updateTransition);
            } else {
                this.currentState = newState;
            }
        };

        updateTransition();
    }

    getStateProperties(state) {
        switch(state) {
            case this.states.CLEAR:
                return {
                    sky: { intensity: 1.0, color: 0x0088ff },
                    clouds: { opacity: 0.2, count: 20 },
                    rain: { enabled: false },
                    fog: { density: 0 }
                };
            case this.states.CLOUDY:
                return {
                    sky: { intensity: 0.7, color: 0x666666 },
                    clouds: { opacity: 0.8, count: 50 },
                    rain: { enabled: false },
                    fog: { density: 0.0002 }
                };
            case this.states.RAIN:
                return {
                    sky: { intensity: 0.4, color: 0x444444 },
                    clouds: { opacity: 0.9, count: 80 },
                    rain: { enabled: true },
                    fog: { density: 0.0005 }
                };
            case this.states.STORM:
                return {
                    sky: { intensity: 0.2, color: 0x222222 },
                    clouds: { opacity: 1.0, count: 100 },
                    rain: { enabled: true },
                    fog: { density: 0.001 }
                };
            case this.states.FOG:
                return {
                    sky: { intensity: 0.5, color: 0x888888 },
                    clouds: { opacity: 0.3, count: 30 },
                    rain: { enabled: false },
                    fog: { density: 0.003 }
                };
        }
    }

    updateSkyProperties(start, end, progress) {
        const intensity = THREE.MathUtils.lerp(start.intensity, end.intensity, progress);
        const color = new THREE.Color().lerpColors(
            new THREE.Color(start.color),
            new THREE.Color(end.color),
            progress
        );

        this.components.sky.intensity = intensity;
        this.components.sky.color.copy(color);
    }

    updateCloudProperties(start, end, progress) {
        const opacity = THREE.MathUtils.lerp(start.opacity, end.opacity, progress);
        this.components.clouds.material.opacity = opacity;
    }

    updateRainProperties(start, end, progress) {
        this.components.rain.mesh.visible = end.enabled;
        if (end.enabled) {
            const opacity = THREE.MathUtils.lerp(0, 0.6, progress);
            this.components.rain.mesh.material.opacity = opacity;
        }
    }

    updateFogProperties(start, end, progress) {
        const density = THREE.MathUtils.lerp(start.density, end.density, progress);
        this.components.fog.density = density;
    }

    updateDayNightCycle(deltaTime) {
        if (!this.settings.dayNightCycle) return;

        // Update time
        const timeProgress = (deltaTime * this.settings.timeScale) / this.time.dayLength;
        this.time.current = (this.time.current + timeProgress) % 24;

        // Calculate sun position
        const sunAngle = (this.time.current / 24) * Math.PI * 2 - Math.PI / 2;
        const sunPosition = new THREE.Vector3(
            Math.cos(sunAngle) * 100,
            Math.sin(sunAngle) * 100,
            0
        );

        // Update sun light
        this.components.sky.sunLight.position.copy(sunPosition);

        // Calculate light intensity based on time of day
        const intensity = Math.max(0, Math.sin(sunAngle + Math.PI / 2));
        this.components.sky.sunLight.intensity = intensity;
    }

    updateRain(deltaTime) {
        if (!this.components.rain.mesh.visible) return;

        const positions = this.components.rain.mesh.geometry.attributes.position.array;
        const velocities = this.components.rain.velocities;

        for (let i = 0; i < this.settings.rainCount; i++) {
            positions[i * 3 + 1] -= velocities[i] * deltaTime * 100;

            if (positions[i * 3 + 1] < 0) {
                positions[i * 3 + 1] = 500;
            }
        }

        this.components.rain.mesh.geometry.attributes.position.needsUpdate = true;
    }

    updateLightning(deltaTime) {
        if (this.currentState !== this.states.STORM) return;

        const time = Date.now() / 1000;
        if (time - this.time.lastLightning > this.settings.lightningFrequency) {
            this.createLightningFlash();
            this.time.lastLightning = time;
        }
    }

    createLightningFlash() {
        const lightning = this.components.lightning;
        lightning.position.set(
            (Math.random() - 0.5) * 1000,
            200,
            (Math.random() - 0.5) * 1000
        );
        
        lightning.visible = true;
        lightning.intensity = 2;

        // Flash animation
        const startTime = Date.now();
        const flashDuration = 0.2;

        const animateLightning = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed < flashDuration) {
                const intensity = 2 * (1 - elapsed / flashDuration);
                lightning.intensity = intensity;
                requestAnimationFrame(animateLightning);
            } else {
                lightning.visible = false;
            }
        };

        animateLightning();
    }

    update(deltaTime) {
        this.updateDayNightCycle(deltaTime);
        this.updateRain(deltaTime);
        this.updateLightning(deltaTime);
    }

    dispose() {
        // Clean up resources
        Object.values(this.components).forEach(component => {
            if (component) {
                if (component.geometry) component.geometry.dispose();
                if (component.material) component.material.dispose();
                if (component.dispose) component.dispose();
            }
        });
    }
} 