import * as THREE from 'three';
import SimplexNoise from 'simplex-noise';

export class TerrainErosionSystem {
    constructor(terrainSystem) {
        this.terrainSystem = terrainSystem;
        
        this.settings = {
            hydraulic: {
                droplets: 50000,
                iterations: 30,
                minSlope: 0.01,
                capacity: 4.0,
                deposition: 0.1,
                erosion: 0.3,
                evaporation: 0.02,
                radius: 2
            },
            thermal: {
                iterations: 50,
                talus: 0.8, // Maximum stable slope angle
                rate: 0.5
            },
            wind: {
                strength: 1.0,
                direction: new THREE.Vector2(1, 0),
                turbulence: 0.3,
                particleLifetime: 2000
            },
            weathering: {
                rate: 0.1,
                detail: 0.5,
                frequency: 0.02
            }
        };

        this.state = {
            erosionMap: null,
            weatheringMap: null,
            windParticles: [],
            lastUpdate: Date.now()
        };

        this.initialize();
    }

    initialize() {
        const { resolution } = this.terrainSystem.settings;
        
        // Initialize erosion and weathering maps
        this.state.erosionMap = new Float32Array(resolution * resolution);
        this.state.weatheringMap = new Float32Array(resolution * resolution);
        
        // Create noise generators
        this.noise = {
            weathering: new SimplexNoise(),
            wind: new SimplexNoise()
        };

        // Initialize wind particle system
        this.initializeWindSystem();
    }

    initializeWindSystem() {
        const particleCount = 1000;
        const geometry = new THREE.BufferGeometry();
        
        // Create particle attributes
        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount * 3);
        const ages = new Float32Array(particleCount);
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
        geometry.setAttribute('age', new THREE.BufferAttribute(ages, 1));

        // Create particle material
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                windDirection: { value: this.settings.wind.direction }
            },
            vertexShader: `
                attribute vec3 velocity;
                attribute float age;
                uniform float time;
                
                varying float vAlpha;
                
                void main() {
                    vec3 pos = position + velocity * time;
                    vAlpha = 1.0 - (age / 2000.0);
                    
                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    gl_PointSize = 2.0;
                }
            `,
            fragmentShader: `
                varying float vAlpha;
                
                void main() {
                    if (vAlpha <= 0.0) discard;
                    gl_FragColor = vec4(0.8, 0.8, 0.8, vAlpha * 0.5);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.windParticleSystem = new THREE.Points(geometry, material);
        this.terrainSystem.scene.add(this.windParticleSystem);
    }

    applyHydraulicErosion() {
        const { resolution } = this.terrainSystem.settings;
        const { droplets, iterations, minSlope, capacity, deposition, erosion, evaporation, radius } = this.settings.hydraulic;
        
        for (let d = 0; d < droplets; d++) {
            // Initialize water droplet
            let pos = new THREE.Vector2(
                Math.random() * resolution,
                Math.random() * resolution
            );
            let dir = new THREE.Vector2();
            let speed = 1;
            let water = 1;
            let sediment = 0;

            for (let i = 0; i < iterations; i++) {
                const x = Math.floor(pos.x);
                const y = Math.floor(pos.y);
                
                if (x < 0 || x >= resolution - 1 || y < 0 || y >= resolution - 1) break;

                // Calculate height gradient
                const heights = this.getHeightsAround(x, y);
                const gradient = this.calculateGradient(heights);
                
                // Update droplet direction and position
                dir.x = dir.x * 0.1 + gradient.x * 0.9;
                dir.y = dir.y * 0.1 + gradient.y * 0.9;
                
                const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
                if (len < minSlope) break;
                
                dir.divideScalar(len);
                pos.add(dir);

                // Calculate sediment capacity and update erosion/deposition
                const slope = len;
                const maxSediment = Math.max(slope * speed * water * capacity, 0);
                
                if (sediment > maxSediment) {
                    // Deposit sediment
                    const depositAmount = (sediment - maxSediment) * deposition;
                    sediment -= depositAmount;
                    this.deposit(x, y, depositAmount, radius);
                } else {
                    // Erode terrain
                    const erodeAmount = Math.min((maxSediment - sediment) * erosion, -heights.center);
                    sediment += erodeAmount;
                    this.erode(x, y, erodeAmount, radius);
                }

                // Update water and speed
                water *= (1 - evaporation);
                if (water < 0.01) break;
                
                speed = Math.sqrt(speed * speed + slope);
            }
        }

        this.terrainSystem.updateGeometry();
    }

    applyThermalErosion() {
        const { resolution } = this.terrainSystem.settings;
        const { iterations, talus, rate } = this.settings.thermal;
        const maxAngle = Math.tan(talus * Math.PI / 180);

        for (let iter = 0; iter < iterations; iter++) {
            const changes = new Float32Array(resolution * resolution);

            for (let y = 0; y < resolution - 1; y++) {
                for (let x = 0; x < resolution - 1; x++) {
                    const idx = y * resolution + x;
                    const height = this.terrainSystem.heightField[idx];

                    // Check neighbors
                    const neighbors = [
                        { dx: 1, dy: 0 },
                        { dx: 0, dy: 1 },
                        { dx: -1, dy: 0 },
                        { dx: 0, dy: -1 }
                    ];

                    for (const n of neighbors) {
                        const nx = x + n.dx;
                        const ny = y + n.dy;
                        
                        if (nx < 0 || nx >= resolution || ny < 0 || ny >= resolution) continue;

                        const nIdx = ny * resolution + nx;
                        const nHeight = this.terrainSystem.heightField[nIdx];
                        const slope = (height - nHeight);
                        
                        if (slope > maxAngle) {
                            const delta = (slope - maxAngle) * rate;
                            changes[idx] -= delta;
                            changes[nIdx] += delta;
                        }
                    }
                }
            }

            // Apply changes
            for (let i = 0; i < resolution * resolution; i++) {
                this.terrainSystem.heightField[i] += changes[i];
            }
        }

        this.terrainSystem.updateGeometry();
    }

    applyWindErosion(deltaTime) {
        const { strength, direction, turbulence } = this.settings.wind;
        const { resolution } = this.terrainSystem.settings;
        const time = Date.now() / 1000;

        // Update wind direction with turbulence
        const turbulenceOffset = new THREE.Vector2(
            this.noise.wind.noise2D(time * 0.1, 0) * turbulence,
            this.noise.wind.noise2D(0, time * 0.1) * turbulence
        );
        
        const currentDirection = direction.clone().add(turbulenceOffset).normalize();

        // Update wind particles
        this.updateWindParticles(deltaTime, currentDirection);

        // Apply wind erosion to terrain
        for (let y = 0; y < resolution; y++) {
            for (let x = 0; x < resolution; x++) {
                const idx = y * resolution + x;
                const height = this.terrainSystem.heightField[idx];
                
                // Calculate wind exposure
                const exposure = this.calculateWindExposure(x, y, currentDirection);
                
                // Apply erosion based on exposure
                const erosionAmount = exposure * strength * deltaTime;
                this.terrainSystem.heightField[idx] -= Math.max(0, erosionAmount);
                
                // Accumulate eroded material downwind
                const dx = Math.floor(x + currentDirection.x * 2);
                const dy = Math.floor(y + currentDirection.y * 2);
                
                if (dx >= 0 && dx < resolution && dy >= 0 && dy < resolution) {
                    const targetIdx = dy * resolution + dx;
                    this.terrainSystem.heightField[targetIdx] += erosionAmount * 0.5;
                }
            }
        }

        this.terrainSystem.updateGeometry();
    }

    applyWeathering(deltaTime) {
        const { rate, detail, frequency } = this.settings.weathering;
        const { resolution } = this.terrainSystem.settings;
        const time = Date.now() / 1000;

        for (let y = 0; y < resolution; y++) {
            for (let x = 0; x < resolution; x++) {
                const idx = y * resolution + x;
                
                // Calculate weathering intensity based on height and slope
                const height = this.terrainSystem.heightField[idx];
                const slope = this.calculateLocalSlope(x, y);
                
                // Add noise-based variation
                const noiseValue = this.noise.weathering.noise3D(
                    x * frequency,
                    y * frequency,
                    time * 0.1
                ) * 0.5 + 0.5;

                // Calculate weathering amount
                const weatheringAmount = rate * deltaTime * (
                    height * 0.3 +    // Height factor
                    slope * 0.5 +     // Slope factor
                    noiseValue * 0.2  // Random variation
                );

                // Apply weathering
                this.terrainSystem.heightField[idx] -= weatheringAmount;
                
                // Add detail noise to weathered areas
                if (weatheringAmount > 0.01) {
                    const detailNoise = this.noise.weathering.noise2D(
                        x * frequency * 4,
                        y * frequency * 4
                    ) * detail * weatheringAmount;
                    
                    this.terrainSystem.heightField[idx] += detailNoise;
                }
            }
        }

        this.terrainSystem.updateGeometry();
    }

    updateWindParticles(deltaTime, windDirection) {
        const geometry = this.windParticleSystem.geometry;
        const positions = geometry.attributes.position.array;
        const velocities = geometry.attributes.velocity.array;
        const ages = geometry.attributes.age.array;
        
        const { resolution, size } = this.terrainSystem.settings;
        const terrainSize = size;
        const particleCount = positions.length / 3;

        for (let i = 0; i < particleCount; i++) {
            const idx = i * 3;
            ages[i] += deltaTime * 1000;

            if (ages[i] >= this.settings.wind.particleLifetime) {
                // Reset particle
                this.initializeWindParticle(positions, velocities, ages, i, terrainSize);
            } else {
                // Update particle position
                positions[idx] += velocities[idx] * deltaTime;
                positions[idx + 1] += velocities[idx + 1] * deltaTime;
                positions[idx + 2] += velocities[idx + 2] * deltaTime;

                // Check terrain collision
                const x = Math.floor((positions[idx] / terrainSize + 0.5) * resolution);
                const z = Math.floor((positions[idx + 2] / terrainSize + 0.5) * resolution);

                if (x >= 0 && x < resolution && z >= 0 && z < resolution) {
                    const height = this.terrainSystem.heightField[z * resolution + x];
                    if (positions[idx + 1] < height) {
                        this.initializeWindParticle(positions, velocities, ages, i, terrainSize);
                    }
                } else {
                    this.initializeWindParticle(positions, velocities, ages, i, terrainSize);
                }
            }
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.age.needsUpdate = true;
        this.windParticleSystem.material.uniforms.time.value += deltaTime;
    }

    initializeWindParticle(positions, velocities, ages, index, terrainSize) {
        const idx = index * 3;
        const halfSize = terrainSize * 0.5;

        // Random position on terrain edge based on wind direction
        const windAngle = Math.atan2(this.settings.wind.direction.y, this.settings.wind.direction.x);
        const spawnAngle = windAngle + Math.PI;
        const spawnRadius = halfSize * 1.2;
        
        positions[idx] = Math.cos(spawnAngle) * spawnRadius;
        positions[idx + 2] = Math.sin(spawnAngle) * spawnRadius;
        positions[idx + 1] = this.getTerrainHeightAt(positions[idx], positions[idx + 2]) + Math.random() * 5;

        // Set velocity based on wind direction with some variation
        const speed = 10 + Math.random() * 5;
        velocities[idx] = this.settings.wind.direction.x * speed;
        velocities[idx + 1] = Math.random() * 2 - 1;
        velocities[idx + 2] = this.settings.wind.direction.y * speed;

        ages[index] = 0;
    }

    // Utility methods
    getHeightsAround(x, y) {
        const { resolution } = this.terrainSystem.settings;
        const idx = y * resolution + x;
        
        return {
            center: this.terrainSystem.heightField[idx],
            left: x > 0 ? this.terrainSystem.heightField[idx - 1] : this.terrainSystem.heightField[idx],
            right: x < resolution - 1 ? this.terrainSystem.heightField[idx + 1] : this.terrainSystem.heightField[idx],
            top: y > 0 ? this.terrainSystem.heightField[(y - 1) * resolution + x] : this.terrainSystem.heightField[idx],
            bottom: y < resolution - 1 ? this.terrainSystem.heightField[(y + 1) * resolution + x] : this.terrainSystem.heightField[idx]
        };
    }

    calculateGradient(heights) {
        return new THREE.Vector2(
            (heights.right - heights.left) * 0.5,
            (heights.bottom - heights.top) * 0.5
        );
    }

    deposit(x, y, amount, radius) {
        const { resolution } = this.terrainSystem.settings;
        
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                
                if (nx < 0 || nx >= resolution || ny < 0 || ny >= resolution) continue;
                
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > radius) continue;
                
                const influence = 1 - (dist / radius);
                const idx = ny * resolution + nx;
                this.terrainSystem.heightField[idx] += amount * influence;
            }
        }
    }

    erode(x, y, amount, radius) {
        this.deposit(x, y, -amount, radius);
    }

    calculateWindExposure(x, y, windDirection) {
        const { resolution } = this.terrainSystem.settings;
        const height = this.terrainSystem.heightField[y * resolution + x];
        
        // Check upwind height
        const upX = Math.floor(x - windDirection.x * 2);
        const upY = Math.floor(y - windDirection.y * 2);
        
        if (upX < 0 || upX >= resolution || upY < 0 || upY >= resolution) {
            return 0;
        }

        const upHeight = this.terrainSystem.heightField[upY * resolution + upX];
        const heightDiff = height - upHeight;
        
        return Math.max(0, heightDiff);
    }

    calculateLocalSlope(x, y) {
        const heights = this.getHeightsAround(x, y);
        const gradient = this.calculateGradient(heights);
        return Math.sqrt(gradient.x * gradient.x + gradient.y * gradient.y);
    }

    getTerrainHeightAt(x, z) {
        const { resolution, size } = this.terrainSystem.settings;
        const halfSize = size * 0.5;
        
        const tx = Math.floor((x / size + 0.5) * resolution);
        const tz = Math.floor((z / size + 0.5) * resolution);
        
        if (tx < 0 || tx >= resolution || tz < 0 || tz >= resolution) {
            return 0;
        }

        return this.terrainSystem.heightField[tz * resolution + tx];
    }

    update(deltaTime) {
        const now = Date.now();
        const timeSinceLastUpdate = (now - this.state.lastUpdate) / 1000;

        if (timeSinceLastUpdate > 1) {
            this.applyHydraulicErosion();
            this.applyThermalErosion();
            this.state.lastUpdate = now;
        }

        this.applyWindErosion(deltaTime);
        this.applyWeathering(deltaTime);
    }

    dispose() {
        // Dispose wind particle system
        this.windParticleSystem.geometry.dispose();
        this.windParticleSystem.material.dispose();
        this.terrainSystem.scene.remove(this.windParticleSystem);

        // Clear state
        this.state.erosionMap = null;
        this.state.weatheringMap = null;
        this.state.windParticles = [];
    }
} 
} 