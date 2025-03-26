import { EventEmitter } from 'events';
import * as THREE from 'three';

export class VehicleTerrainSystem extends EventEmitter {
    constructor(vehicle, terrain) {
        super();
        this.vehicle = vehicle;
        this.terrain = terrain;

        this.settings = {
            surfaces: {
                dirt: {
                    friction: 0.8,
                    resistance: 0.3,
                    deformability: 0.7,
                    particleColor: '#8B4513',
                    soundEffect: 'dirt.mp3',
                    recovery: 0.2 // Rate at which terrain recovers from deformation
                },
                mud: {
                    friction: 0.4,
                    resistance: 0.8,
                    deformability: 0.9,
                    particleColor: '#483C32',
                    soundEffect: 'mud.mp3',
                    recovery: 0.1
                },
                sand: {
                    friction: 0.6,
                    resistance: 0.5,
                    deformability: 0.8,
                    particleColor: '#C2B280',
                    soundEffect: 'sand.mp3',
                    recovery: 0.15
                },
                rock: {
                    friction: 0.9,
                    resistance: 0.2,
                    deformability: 0.1,
                    particleColor: '#808080',
                    soundEffect: 'rock.mp3',
                    recovery: 0.8
                },
                grass: {
                    friction: 0.7,
                    resistance: 0.4,
                    deformability: 0.5,
                    particleColor: '#355E3B',
                    soundEffect: 'grass.mp3',
                    recovery: 0.3
                }
            },
            deformation: {
                maxDepth: 0.5, // Maximum deformation depth in meters
                radius: 1.5,   // Radius of deformation area
                resolution: 32, // Resolution of deformation grid
                smoothing: 0.3, // Smoothing factor for deformation
                persistence: 0.7 // How long deformation persists
            },
            particles: {
                maxParticles: 1000,
                particleSize: 0.1,
                emissionRate: 50,
                lifetime: 2.0,
                velocityRange: { min: 0.1, max: 0.5 }
            },
            physics: {
                gravity: 9.81,
                buoyancy: 1.0,
                dragCoefficient: 0.47,
                densityAir: 1.225,
                waterLevel: 0.0
            }
        };

        this.state = {
            currentSurface: null,
            deformationMap: new Map(), // Stores terrain deformation data
            activeParticles: [],
            surfaceContacts: [], // Wheel contact points
            submergedVolume: 0,
            lastUpdateTime: 0
        };

        this.initialize();
    }

    initialize() {
        this.initializeDeformationSystem();
        this.initializeParticleSystem();
        this.setupEventListeners();
    }

    initializeDeformationSystem() {
        // Create heightfield for terrain deformation
        const { resolution } = this.settings.deformation;
        this.heightField = new Float32Array(resolution * resolution);
        this.deformationGeometry = new THREE.PlaneGeometry(
            this.terrain.width,
            this.terrain.height,
            resolution - 1,
            resolution - 1
        );

        // Initialize deformation shader
        this.deformationMaterial = new THREE.ShaderMaterial({
            uniforms: {
                heightMap: { value: null },
                deformationMap: { value: null },
                maxDepth: { value: this.settings.deformation.maxDepth },
                smoothing: { value: this.settings.deformation.smoothing }
            },
            vertexShader: `
                uniform sampler2D heightMap;
                uniform sampler2D deformationMap;
                uniform float maxDepth;
                uniform float smoothing;
                
                varying vec2 vUv;
                
                void main() {
                    vUv = uv;
                    vec4 heightData = texture2D(heightMap, uv);
                    vec4 deformData = texture2D(deformationMap, uv);
                    
                    float height = heightData.r;
                    float deform = deformData.r * maxDepth;
                    
                    // Apply smoothing
                    float smoothDeform = deform * (1.0 - smoothing);
                    
                    vec3 newPosition = position;
                    newPosition.y = height - smoothDeform;
                    
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
                }
            `,
            fragmentShader: `
                varying vec2 vUv;
                
                void main() {
                    gl_FragColor = vec4(1.0);
                }
            `
        });
    }

    initializeParticleSystem() {
        const { maxParticles, particleSize } = this.settings.particles;
        
        // Create particle geometry
        const positions = new Float32Array(maxParticles * 3);
        const colors = new Float32Array(maxParticles * 3);
        
        this.particleGeometry = new THREE.BufferGeometry();
        this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        // Create particle material
        this.particleMaterial = new THREE.PointsMaterial({
            size: particleSize,
            vertexColors: true,
            transparent: true,
            opacity: 0.8
        });
        
        // Create particle system
        this.particleSystem = new THREE.Points(this.particleGeometry, this.particleMaterial);
        this.terrain.add(this.particleSystem);
    }

    setupEventListeners() {
        this.vehicle.on('wheelContact', this.handleWheelContact.bind(this));
        this.vehicle.on('collision', this.handleCollision.bind(this));
        this.terrain.on('update', this.update.bind(this));
    }

    update(deltaTime) {
        this.updateDeformation(deltaTime);
        this.updateParticles(deltaTime);
        this.updatePhysics(deltaTime);
        this.updateSurfaceEffects();
        
        this.state.lastUpdateTime = Date.now();
    }

    updateDeformation(deltaTime) {
        // Update terrain deformation based on vehicle interaction
        this.state.surfaceContacts.forEach(contact => {
            const { position, force, surfaceType } = contact;
            const surfaceSettings = this.settings.surfaces[surfaceType];
            
            if (surfaceSettings && force > 0) {
                const deformAmount = force * surfaceSettings.deformability;
                this.deformTerrain(position, deformAmount);
            }
        });
        
        // Apply terrain recovery
        this.state.deformationMap.forEach((deformation, key) => {
            const surfaceType = this.getSurfaceTypeAtPosition(deformation.position);
            const recovery = this.settings.surfaces[surfaceType].recovery;
            
            deformation.depth *= (1 - recovery * deltaTime);
            
            if (deformation.depth < 0.01) {
                this.state.deformationMap.delete(key);
            }
        });
        
        this.updateDeformationGeometry();
    }

    deformTerrain(position, amount) {
        const { radius, resolution } = this.settings.deformation;
        
        // Calculate affected area in heightfield
        const centerX = Math.floor((position.x / this.terrain.width) * resolution);
        const centerZ = Math.floor((position.z / this.terrain.height) * resolution);
        const radiusPixels = Math.ceil(radius * resolution / this.terrain.width);
        
        // Apply deformation using Gaussian distribution
        for (let x = -radiusPixels; x <= radiusPixels; x++) {
            for (let z = -radiusPixels; z <= radiusPixels; z++) {
                const px = centerX + x;
                const pz = centerZ + z;
                
                if (px >= 0 && px < resolution && pz >= 0 && pz < resolution) {
                    const distance = Math.sqrt(x * x + z * z) / radiusPixels;
                    const influence = Math.exp(-distance * distance * 4);
                    const index = pz * resolution + px;
                    
                    this.heightField[index] -= amount * influence;
                }
            }
        }
        
        // Store deformation for recovery
        const key = `${centerX},${centerZ}`;
        this.state.deformationMap.set(key, {
            position: position.clone(),
            depth: amount,
            time: Date.now()
        });
    }

    updateDeformationGeometry() {
        const positions = this.deformationGeometry.attributes.position.array;
        
        // Update vertex positions based on heightfield
        for (let i = 0; i < positions.length; i += 3) {
            const x = Math.floor((i / 3) % this.settings.deformation.resolution);
            const z = Math.floor((i / 3) / this.settings.deformation.resolution);
            const index = z * this.settings.deformation.resolution + x;
            
            positions[i + 1] = this.heightField[index];
        }
        
        this.deformationGeometry.attributes.position.needsUpdate = true;
        this.deformationGeometry.computeVertexNormals();
    }

    updateParticles(deltaTime) {
        const { maxParticles, lifetime, velocityRange } = this.settings.particles;
        
        // Update existing particles
        this.state.activeParticles = this.state.activeParticles.filter(particle => {
            particle.life -= deltaTime;
            
            if (particle.life <= 0) {
                return false;
            }
            
            // Update position
            particle.position.add(particle.velocity.multiplyScalar(deltaTime));
            
            // Apply gravity
            particle.velocity.y -= this.settings.physics.gravity * deltaTime;
            
            // Update particle system geometry
            const index = particle.index * 3;
            const positions = this.particleGeometry.attributes.position.array;
            positions[index] = particle.position.x;
            positions[index + 1] = particle.position.y;
            positions[index + 2] = particle.position.z;
            
            return true;
        });
        
        // Emit new particles based on vehicle movement
        this.state.surfaceContacts.forEach(contact => {
            const { position, velocity, surfaceType } = contact;
            const speed = velocity.length();
            
            if (speed > 1.0 && this.state.activeParticles.length < maxParticles) {
                const particleCount = Math.min(
                    this.settings.particles.emissionRate * deltaTime,
                    maxParticles - this.state.activeParticles.length
                );
                
                for (let i = 0; i < particleCount; i++) {
                    this.emitParticle(position, velocity, surfaceType);
                }
            }
        });
        
        this.particleGeometry.attributes.position.needsUpdate = true;
    }

    emitParticle(position, velocity, surfaceType) {
        const { velocityRange, lifetime } = this.settings.particles;
        const surfaceSettings = this.settings.surfaces[surfaceType];
        
        // Calculate random velocity
        const randomVel = new THREE.Vector3(
            (Math.random() - 0.5) * (velocityRange.max - velocityRange.min) + velocityRange.min,
            Math.random() * velocityRange.max,
            (Math.random() - 0.5) * (velocityRange.max - velocityRange.min) + velocityRange.min
        );
        
        // Add to velocity based on surface contact
        randomVel.add(velocity.multiplyScalar(0.2));
        
        // Create particle
        const particle = {
            index: this.state.activeParticles.length,
            position: position.clone(),
            velocity: randomVel,
            color: new THREE.Color(surfaceSettings.particleColor),
            life: lifetime * (0.8 + Math.random() * 0.4)
        };
        
        // Update particle system
        const index = particle.index * 3;
        const positions = this.particleGeometry.attributes.position.array;
        const colors = this.particleGeometry.attributes.color.array;
        
        positions[index] = particle.position.x;
        positions[index + 1] = particle.position.y;
        positions[index + 2] = particle.position.z;
        
        colors[index] = particle.color.r;
        colors[index + 1] = particle.color.g;
        colors[index + 2] = particle.color.b;
        
        this.state.activeParticles.push(particle);
    }

    updatePhysics(deltaTime) {
        // Calculate buoyancy and drag forces
        if (this.state.submergedVolume > 0) {
            const { buoyancy, dragCoefficient, densityAir } = this.settings.physics;
            
            // Buoyancy force
            const buoyancyForce = new THREE.Vector3(0, 
                buoyancy * this.state.submergedVolume * this.settings.physics.gravity, 
                0
            );
            
            // Drag force
            const velocity = this.vehicle.getVelocity();
            const dragForce = velocity.clone().multiplyScalar(
                -0.5 * densityAir * dragCoefficient * this.state.submergedVolume * velocity.length()
            );
            
            // Apply forces
            this.vehicle.applyForce(buoyancyForce);
            this.vehicle.applyForce(dragForce);
        }
    }

    updateSurfaceEffects() {
        this.state.surfaceContacts.forEach(contact => {
            const { position, surfaceType, velocity } = contact;
            const surfaceSettings = this.settings.surfaces[surfaceType];
            
            // Update friction and resistance
            this.vehicle.setWheelFriction(contact.wheelIndex, surfaceSettings.friction);
            this.vehicle.setWheelResistance(contact.wheelIndex, surfaceSettings.resistance);
            
            // Emit surface-specific events
            this.emit('surfaceEffect', {
                type: surfaceType,
                position: position,
                velocity: velocity,
                settings: surfaceSettings
            });
        });
    }

    handleWheelContact(contact) {
        const surfaceType = this.getSurfaceTypeAtPosition(contact.position);
        contact.surfaceType = surfaceType;
        
        this.state.surfaceContacts[contact.wheelIndex] = contact;
        
        // Emit surface change event if needed
        if (this.state.currentSurface !== surfaceType) {
            this.state.currentSurface = surfaceType;
            this.emit('surfaceChange', surfaceType);
        }
    }

    handleCollision(collision) {
        const { position, force, normal } = collision;
        const surfaceType = this.getSurfaceTypeAtPosition(position);
        
        // Apply deformation if collision is significant
        if (force > 1.0) {
            const deformAmount = force * this.settings.surfaces[surfaceType].deformability;
            this.deformTerrain(position, deformAmount);
            
            // Emit particles from collision
            const particleCount = Math.min(
                Math.floor(force * 10),
                this.settings.particles.maxParticles - this.state.activeParticles.length
            );
            
            for (let i = 0; i < particleCount; i++) {
                const velocity = normal.clone().multiplyScalar(force * 0.5);
                this.emitParticle(position, velocity, surfaceType);
            }
        }
    }

    getSurfaceTypeAtPosition(position) {
        // Get surface type from terrain data or heightmap
        const x = Math.floor((position.x / this.terrain.width) * this.terrain.textureSize);
        const z = Math.floor((position.z / this.terrain.height) * this.terrain.textureSize);
        
        return this.terrain.getSurfaceType(x, z);
    }

    dispose() {
        // Clean up resources
        this.deformationGeometry.dispose();
        this.deformationMaterial.dispose();
        this.particleGeometry.dispose();
        this.particleMaterial.dispose();
        
        // Remove from scene
        this.terrain.remove(this.particleSystem);
        
        // Clear state
        this.state.deformationMap.clear();
        this.state.activeParticles = [];
        this.state.surfaceContacts = [];
        
        // Remove event listeners
        this.removeAllListeners();
    }
} 