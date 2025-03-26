import { EventEmitter } from 'events';
import * as THREE from 'three';

export class VehicleParticleSystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            effects: {
                exhaust: {
                    count: 100,
                    size: { min: 0.1, max: 0.3 },
                    lifetime: { min: 0.5, max: 1.5 },
                    velocity: { min: 1, max: 3 },
                    color: { start: 0x666666, end: 0x333333 },
                    opacity: { start: 0.6, end: 0 },
                    position: { x: 0, y: 0.3, z: -2 }
                },
                dust: {
                    count: 200,
                    size: { min: 0.2, max: 0.5 },
                    lifetime: { min: 1, max: 2 },
                    spread: { x: 1, y: 0.5, z: 1 },
                    color: {
                        asphalt: 0x444444,
                        dirt: 0x8B4513,
                        sand: 0xD2B48C,
                        grass: 0x90EE90
                    }
                },
                mud: {
                    count: 50,
                    size: { min: 0.3, max: 0.6 },
                    lifetime: { min: 0.8, max: 1.2 },
                    velocity: { min: 2, max: 4 },
                    viscosity: 0.8,
                    color: 0x4A3C2A
                },
                water: {
                    count: 150,
                    size: { min: 0.1, max: 0.4 },
                    lifetime: { min: 0.6, max: 1.0 },
                    velocity: { min: 3, max: 5 },
                    opacity: { start: 0.7, end: 0 },
                    color: 0x4AA4FF
                },
                sparks: {
                    count: 30,
                    size: { min: 0.05, max: 0.15 },
                    lifetime: { min: 0.3, max: 0.6 },
                    velocity: { min: 5, max: 8 },
                    color: 0xFFA500,
                    gravity: -9.8
                },
                smoke: {
                    count: 80,
                    size: { min: 0.5, max: 1.5 },
                    lifetime: { min: 2, max: 4 },
                    velocity: { min: 0.5, max: 1.5 },
                    turbulence: 0.3,
                    color: { start: 0x222222, end: 0x666666 }
                }
            },
            physics: {
                gravity: -9.81,
                wind: { x: 0, y: 0, z: 0 },
                airResistance: 0.1
            },
            performance: {
                maxParticles: 1000,
                cullingDistance: 50,
                poolSize: 2000
            }
        };

        this.state = {
            active: new Map(),
            pool: new Map(),
            count: 0,
            time: 0
        };

        this.initialize();
    }

    initialize() {
        this.setupParticlePools();
        this.setupEventListeners();
    }

    setupParticlePools() {
        Object.keys(this.settings.effects).forEach(type => {
            this.state.active.set(type, new Set());
            this.state.pool.set(type, []);
            
            // Pre-allocate particle pool
            for (let i = 0; i < this.settings.performance.poolSize; i++) {
                this.state.pool.get(type).push(this.createParticle(type));
            }
        });
    }

    setupEventListeners() {
        this.vehicle.on('collision', this.handleCollision.bind(this));
        this.vehicle.on('surfaceChange', this.handleSurfaceChange.bind(this));
        this.vehicle.on('engineState', this.handleEngineState.bind(this));
    }

    createParticle(type) {
        const effect = this.settings.effects[type];
        const geometry = new THREE.BufferGeometry();
        const material = new THREE.PointsMaterial({
            size: effect.size.min,
            transparent: true,
            blending: THREE.AdditiveBlending
        });

        return {
            mesh: new THREE.Points(geometry, material),
            velocity: new THREE.Vector3(),
            lifetime: 0,
            age: 0,
            active: false,
            type: type
        };
    }

    emit(type, position, count = 1, params = {}) {
        const effect = this.settings.effects[type];
        const pool = this.state.pool.get(type);
        const active = this.state.active.get(type);

        for (let i = 0; i < count; i++) {
            if (this.state.count >= this.settings.performance.maxParticles) break;

            const particle = pool.pop();
            if (!particle) break;

            this.initializeParticle(particle, position, effect, params);
            active.add(particle);
            this.state.count++;
        }
    }

    initializeParticle(particle, position, effect, params) {
        // Position
        particle.mesh.position.copy(position);
        
        // Velocity
        const velocity = params.velocity || new THREE.Vector3(
            (Math.random() - 0.5) * (effect.velocity.max - effect.velocity.min) + effect.velocity.min,
            (Math.random() - 0.5) * (effect.velocity.max - effect.velocity.min) + effect.velocity.min,
            (Math.random() - 0.5) * (effect.velocity.max - effect.velocity.min) + effect.velocity.min
        );
        particle.velocity.copy(velocity);

        // Lifetime
        particle.lifetime = params.lifetime || 
            Math.random() * (effect.lifetime.max - effect.lifetime.min) + effect.lifetime.min;
        particle.age = 0;

        // Size
        particle.mesh.material.size = 
            Math.random() * (effect.size.max - effect.size.min) + effect.size.min;

        // Color
        if (effect.color.start && effect.color.end) {
            particle.startColor = new THREE.Color(effect.color.start);
            particle.endColor = new THREE.Color(effect.color.end);
            particle.mesh.material.color = particle.startColor.clone();
        } else {
            particle.mesh.material.color = new THREE.Color(effect.color);
        }

        particle.active = true;
    }

    update(deltaTime) {
        this.state.time += deltaTime;

        Object.keys(this.settings.effects).forEach(type => {
            const active = this.state.active.get(type);
            const pool = this.state.pool.get(type);
            const effect = this.settings.effects[type];

            active.forEach(particle => {
                if (this.updateParticle(particle, effect, deltaTime)) {
                    // Particle died
                    active.delete(particle);
                    pool.push(particle);
                    this.state.count--;
                }
            });
        });

        // Update continuous effects
        this.updateContinuousEffects(deltaTime);
    }

    updateParticle(particle, effect, deltaTime) {
        particle.age += deltaTime;

        if (particle.age >= particle.lifetime) {
            particle.active = false;
            return true;
        }

        const progress = particle.age / particle.lifetime;

        // Update position
        particle.velocity.add(new THREE.Vector3(
            this.settings.physics.wind.x,
            this.settings.physics.gravity,
            this.settings.physics.wind.z
        ).multiplyScalar(deltaTime));

        particle.velocity.multiplyScalar(1 - this.settings.physics.airResistance);
        particle.mesh.position.add(particle.velocity.clone().multiplyScalar(deltaTime));

        // Update color
        if (particle.startColor && particle.endColor) {
            particle.mesh.material.color.lerpColors(
                particle.startColor,
                particle.endColor,
                progress
            );
        }

        // Update opacity
        if (effect.opacity) {
            particle.mesh.material.opacity = this.lerp(
                effect.opacity.start,
                effect.opacity.end,
                progress
            );
        }

        // Update size
        if (effect.size.end) {
            particle.mesh.material.size = this.lerp(
                effect.size.min,
                effect.size.max,
                progress
            );
        }

        return false;
    }

    updateContinuousEffects(deltaTime) {
        // Exhaust
        if (this.vehicle.engineRunning) {
            const exhaustPosition = this.vehicle.position.clone().add(
                new THREE.Vector3(
                    this.settings.effects.exhaust.position.x,
                    this.settings.effects.exhaust.position.y,
                    this.settings.effects.exhaust.position.z
                ).applyEuler(this.vehicle.rotation)
            );
            this.emit('exhaust', exhaustPosition, 1);
        }

        // Dust/Surface particles
        if (this.vehicle.speed > 1) {
            const wheelPositions = this.vehicle.getWheelPositions();
            wheelPositions.forEach(pos => {
                this.emitSurfaceParticles(pos);
            });
        }
    }

    emitSurfaceParticles(position) {
        const surface = this.vehicle.getCurrentSurface();
        if (!surface) return;

        const effect = this.settings.effects.dust;
        const color = effect.color[surface];
        
        if (color) {
            this.emit('dust', position, 1, {
                color: color,
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * effect.spread.x,
                    Math.random() * effect.spread.y,
                    (Math.random() - 0.5) * effect.spread.z
                )
            });
        }
    }

    handleCollision(data) {
        const position = new THREE.Vector3().fromArray(data.position);
        const force = data.force;

        if (force > 10) {
            // Sparks
            this.emit('sparks', position, 10);
            
            // Smoke
            if (force > 20) {
                this.emit('smoke', position, 5);
            }
        }
    }

    handleSurfaceChange(data) {
        const position = this.vehicle.position.clone();

        switch (data.surface) {
            case 'water':
                this.emit('water', position, 20);
                break;
            case 'mud':
                this.emit('mud', position, 15);
                break;
        }
    }

    handleEngineState(running) {
        if (!running) {
            this.emit('smoke', 
                this.vehicle.position.clone().add(new THREE.Vector3(0, 1, 0)), 
                10
            );
        }
    }

    lerp(start, end, alpha) {
        return start + (end - start) * alpha;
    }

    dispose() {
        // Dispose all particles
        this.state.pool.forEach(pool => {
            pool.forEach(particle => {
                particle.mesh.geometry.dispose();
                particle.mesh.material.dispose();
            });
        });

        // Clear state
        this.state.active.clear();
        this.state.pool.clear();
        this.state.count = 0;

        // Remove event listeners
        this.removeAllListeners();
    }
} 