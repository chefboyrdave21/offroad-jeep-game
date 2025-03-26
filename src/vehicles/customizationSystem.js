import * as THREE from 'three';
import { EventEmitter } from 'events';

export class VehicleCustomizationSystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            paintwork: {
                baseColors: {
                    'factory': { color: 0x1a1a1a, roughness: 0.5, metalness: 0.8 },
                    'matte_black': { color: 0x000000, roughness: 0.9, metalness: 0.1 },
                    'glossy_red': { color: 0xff0000, roughness: 0.2, metalness: 0.9 },
                    'army_green': { color: 0x4b5320, roughness: 0.7, metalness: 0.3 },
                    'desert_tan': { color: 0xc2b280, roughness: 0.6, metalness: 0.4 }
                },
                decals: {
                    'racing_stripes': {
                        texture: 'textures/decals/racing_stripes.png',
                        defaultScale: new THREE.Vector2(1, 1),
                        allowedPositions: ['hood', 'sides']
                    },
                    'mud_splatter': {
                        texture: 'textures/decals/mud_splatter.png',
                        defaultScale: new THREE.Vector2(2, 2),
                        allowedPositions: ['all']
                    },
                    'scratches': {
                        texture: 'textures/decals/scratches.png',
                        defaultScale: new THREE.Vector2(1, 1),
                        allowedPositions: ['all']
                    }
                },
                weathering: {
                    rust: { max: 1.0, texture: 'textures/weathering/rust.png' },
                    dirt: { max: 1.0, texture: 'textures/weathering/dirt.png' },
                    scratches: { max: 1.0, texture: 'textures/weathering/scratches.png' }
                }
            },
            bodywork: {
                bumpers: {
                    'stock': { model: 'models/bumpers/stock.glb', weight: 25 },
                    'heavy_duty': { model: 'models/bumpers/heavy_duty.glb', weight: 45 },
                    'winch_mount': { model: 'models/bumpers/winch_mount.glb', weight: 40 }
                },
                fenders: {
                    'stock': { model: 'models/fenders/stock.glb', clearance: 0 },
                    'wide_body': { model: 'models/fenders/wide_body.glb', clearance: 2 },
                    'cut': { model: 'models/fenders/cut.glb', clearance: 4 }
                },
                hood: {
                    'stock': { model: 'models/hood/stock.glb', cooling: 1.0 },
                    'vented': { model: 'models/hood/vented.glb', cooling: 1.2 },
                    'scooped': { model: 'models/hood/scooped.glb', cooling: 1.4 }
                }
            },
            performance: {
                suspension: {
                    'stock': {
                        height: 0,
                        stiffness: 1.0,
                        damping: 1.0,
                        travel: 20
                    },
                    'comfort': {
                        height: 2,
                        stiffness: 0.8,
                        damping: 1.2,
                        travel: 22
                    },
                    'offroad': {
                        height: 4,
                        stiffness: 1.2,
                        damping: 0.8,
                        travel: 30
                    },
                    'competition': {
                        height: 3,
                        stiffness: 1.4,
                        damping: 0.7,
                        travel: 25
                    }
                },
                wheels: {
                    'stock': {
                        model: 'models/wheels/stock.glb',
                        radius: 0.4,
                        width: 0.25,
                        grip: 1.0,
                        weight: 15
                    },
                    'offroad': {
                        model: 'models/wheels/offroad.glb',
                        radius: 0.45,
                        width: 0.3,
                        grip: 1.3,
                        weight: 20
                    },
                    'mud_terrain': {
                        model: 'models/wheels/mud_terrain.glb',
                        radius: 0.47,
                        width: 0.35,
                        grip: 1.5,
                        weight: 25
                    }
                },
                engine: {
                    'stock': {
                        power: 200,
                        torque: 400,
                        weight: 150,
                        efficiency: 1.0
                    },
                    'performance': {
                        power: 300,
                        torque: 500,
                        weight: 160,
                        efficiency: 0.9
                    },
                    'racing': {
                        power: 400,
                        torque: 600,
                        weight: 170,
                        efficiency: 0.8
                    }
                }
            },
            interior: {
                seats: {
                    'stock': { model: 'models/seats/stock.glb', weight: 20 },
                    'sport': { model: 'models/seats/sport.glb', weight: 15 },
                    'racing': { model: 'models/seats/racing.glb', weight: 10 }
                },
                rollcage: {
                    'none': { model: null, weight: 0, protection: 0 },
                    'basic': { model: 'models/rollcage/basic.glb', weight: 40, protection: 0.5 },
                    'full': { model: 'models/rollcage/full.glb', weight: 60, protection: 1.0 }
                }
            }
        };

        this.state = {
            current: {
                paintwork: {
                    baseColor: 'factory',
                    decals: [],
                    weathering: {
                        rust: 0,
                        dirt: 0,
                        scratches: 0
                    }
                },
                bodywork: {
                    bumpers: 'stock',
                    fenders: 'stock',
                    hood: 'stock'
                },
                performance: {
                    suspension: 'stock',
                    wheels: 'stock',
                    engine: 'stock'
                },
                interior: {
                    seats: 'stock',
                    rollcage: 'none'
                }
            },
            loadedModels: new Map(),
            loadedTextures: new Map(),
            pendingUpdates: new Set()
        };

        this.initialize();
    }

    async initialize() {
        await this.loadDefaultResources();
        this.setupMaterials();
        this.setupEventListeners();
        this.applyCurrentConfiguration();
    }

    async loadDefaultResources() {
        // Load default textures and models
        const textureLoader = new THREE.TextureLoader();
        const modelLoader = new THREE.GLTFLoader();

        // Load essential textures
        const texturePromises = Object.entries(this.settings.paintwork.decals)
            .map(([name, config]) => 
                this.loadTexture(config.texture)
                    .then(texture => this.state.loadedTextures.set(name, texture))
            );

        // Load essential models
        const modelPromises = [
            this.loadModel(this.settings.bodywork.bumpers.stock.model),
            this.loadModel(this.settings.bodywork.fenders.stock.model),
            this.loadModel(this.settings.bodywork.hood.stock.model)
        ];

        await Promise.all([...texturePromises, ...modelPromises]);
    }

    async loadTexture(path) {
        return new Promise((resolve, reject) => {
            new THREE.TextureLoader().load(
                path,
                texture => resolve(texture),
                undefined,
                error => reject(error)
            );
        });
    }

    async loadModel(path) {
        return new Promise((resolve, reject) => {
            new THREE.GLTFLoader().load(
                path,
                gltf => resolve(gltf.scene),
                undefined,
                error => reject(error)
            );
        });
    }

    setupMaterials() {
        // Create base materials for different paint types
        this.materials = {
            base: new THREE.MeshStandardMaterial(),
            decal: new THREE.MeshStandardMaterial({ transparent: true }),
            weathering: new THREE.MeshStandardMaterial({ transparent: true, blending: THREE.MultiplyBlending })
        };

        // Setup material uniforms for effects
        this.materials.base.onBeforeCompile = shader => {
            shader.uniforms.weatheringFactors = { value: new THREE.Vector3() };
            shader.uniforms.weatheringTextures = { value: [] };
            
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <map_fragment>',
                this.getCustomShaderCode()
            );
        };
    }

    getCustomShaderCode() {
        return `
            #include <map_fragment>
            
            // Apply weathering effects
            vec3 weathering = vec3(1.0);
            for(int i = 0; i < 3; i++) {
                vec4 weatheringTex = texture2D(weatheringTextures[i], vUv);
                weathering *= mix(vec3(1.0), weatheringTex.rgb, weatheringFactors[i]);
            }
            
            diffuseColor.rgb *= weathering;
        `;
    }

    setupEventListeners() {
        this.vehicle.on('collision', this.handleCollision.bind(this));
        this.vehicle.on('terrainContact', this.handleTerrainContact.bind(this));
        this.vehicle.on('update', this.update.bind(this));
    }

    async setConfiguration(config) {
        // Validate configuration
        if (!this.validateConfiguration(config)) {
            this.emit('error', 'Invalid configuration');
            return false;
        }

        // Load required resources
        await this.loadConfigurationResources(config);

        // Apply changes
        Object.entries(config).forEach(([category, settings]) => {
            Object.entries(settings).forEach(([key, value]) => {
                this.state.current[category][key] = value;
                this.state.pendingUpdates.add(`${category}.${key}`);
            });
        });

        // Update vehicle
        await this.applyCurrentConfiguration();
        
        this.emit('configurationChanged', this.state.current);
        return true;
    }

    validateConfiguration(config) {
        return Object.entries(config).every(([category, settings]) => {
            if (!this.settings[category]) return false;
            
            return Object.entries(settings).every(([key, value]) => {
                const validOptions = this.settings[category][key];
                return validOptions && (validOptions[value] || value === null);
            });
        });
    }

    async loadConfigurationResources(config) {
        const resourcePromises = [];

        // Load required models
        Object.entries(config).forEach(([category, settings]) => {
            Object.entries(settings).forEach(([key, value]) => {
                const option = this.settings[category][key]?.[value];
                if (option?.model && !this.state.loadedModels.has(option.model)) {
                    resourcePromises.push(
                        this.loadModel(option.model)
                            .then(model => this.state.loadedModels.set(option.model, model))
                    );
                }
            });
        });

        await Promise.all(resourcePromises);
    }

    async applyCurrentConfiguration() {
        // Apply pending updates
        for (const update of this.state.pendingUpdates) {
            const [category, key] = update.split('.');
            await this.applyConfigurationChange(category, key);
        }

        this.state.pendingUpdates.clear();
        
        // Update vehicle physics
        this.updateVehiclePhysics();
    }

    async applyConfigurationChange(category, key) {
        const value = this.state.current[category][key];
        const config = this.settings[category][key][value];

        switch (`${category}.${key}`) {
            case 'paintwork.baseColor':
                this.applyPaintwork(config);
                break;
            case 'bodywork.bumpers':
            case 'bodywork.fenders':
            case 'bodywork.hood':
                await this.applyBodywork(key, config);
                break;
            case 'performance.suspension':
                this.applySuspension(config);
                break;
            case 'performance.wheels':
                await this.applyWheels(config);
                break;
            case 'performance.engine':
                this.applyEngine(config);
                break;
            case 'interior.seats':
            case 'interior.rollcage':
                await this.applyInterior(key, config);
                break;
        }
    }

    applyPaintwork(config) {
        this.materials.base.color.setHex(config.color);
        this.materials.base.roughness = config.roughness;
        this.materials.base.metalness = config.metalness;
        
        // Update weathering uniforms
        const weathering = this.state.current.paintwork.weathering;
        this.materials.base.uniforms.weatheringFactors.value.set(
            weathering.rust,
            weathering.dirt,
            weathering.scratches
        );
    }

    async applyBodywork(part, config) {
        const model = await this.loadModel(config.model);
        const currentPart = this.vehicle.getBodyPart(part);
        
        if (currentPart) {
            this.vehicle.removePart(part);
        }
        
        this.vehicle.addPart(part, model);
        model.traverse(child => {
            if (child.isMesh) {
                child.material = this.materials.base.clone();
            }
        });
    }

    applySuspension(config) {
        this.vehicle.suspension.setHeight(config.height);
        this.vehicle.suspension.setStiffness(config.stiffness);
        this.vehicle.suspension.setDamping(config.damping);
        this.vehicle.suspension.setTravel(config.travel);
    }

    async applyWheels(config) {
        const model = await this.loadModel(config.model);
        
        this.vehicle.wheels.forEach((wheel, index) => {
            const wheelModel = model.clone();
            wheel.setModel(wheelModel);
            wheel.setProperties({
                radius: config.radius,
                width: config.width,
                grip: config.grip,
                weight: config.weight
            });
        });
    }

    applyEngine(config) {
        this.vehicle.engine.setPower(config.power);
        this.vehicle.engine.setTorque(config.torque);
        this.vehicle.engine.setWeight(config.weight);
        this.vehicle.engine.setEfficiency(config.efficiency);
    }

    async applyInterior(part, config) {
        if (!config.model) {
            this.vehicle.removeInteriorPart(part);
            return;
        }

        const model = await this.loadModel(config.model);
        this.vehicle.setInteriorPart(part, model);
    }

    updateVehiclePhysics() {
        // Calculate total weight
        let totalWeight = 0;
        Object.entries(this.state.current).forEach(([category, settings]) => {
            Object.entries(settings).forEach(([key, value]) => {
                const option = this.settings[category][key]?.[value];
                if (option?.weight) {
                    totalWeight += option.weight;
                }
            });
        });

        // Update vehicle mass and center of mass
        this.vehicle.physics.setMass(totalWeight);
        this.vehicle.physics.updateCenterOfMass();

        // Update performance characteristics
        this.updatePerformanceCharacteristics();
    }

    updatePerformanceCharacteristics() {
        const current = this.state.current.performance;
        
        // Calculate combined performance metrics
        const suspension = this.settings.performance.suspension[current.suspension];
        const wheels = this.settings.performance.wheels[current.wheels];
        const engine = this.settings.performance.engine[current.engine];

        // Update vehicle dynamics
        this.vehicle.setHandlingCharacteristics({
            grip: wheels.grip,
            groundClearance: suspension.height,
            stability: suspension.stiffness,
            acceleration: engine.power / this.vehicle.physics.getMass(),
            topSpeed: engine.power * engine.efficiency
        });
    }

    handleCollision(data) {
        // Update weathering based on collision
        if (data.force > 10) {
            const weathering = this.state.current.paintwork.weathering;
            weathering.scratches = Math.min(
                weathering.scratches + (data.force * 0.01),
                this.settings.paintwork.weathering.scratches.max
            );
            this.state.pendingUpdates.add('paintwork.weathering');
        }
    }

    handleTerrainContact(data) {
        // Update dirt accumulation based on terrain type
        const weathering = this.state.current.paintwork.weathering;
        switch (data.type) {
            case 'mud':
                weathering.dirt = Math.min(
                    weathering.dirt + 0.1,
                    this.settings.paintwork.weathering.dirt.max
                );
                break;
            case 'water':
                weathering.dirt = Math.max(weathering.dirt - 0.2, 0);
                break;
        }
        this.state.pendingUpdates.add('paintwork.weathering');
    }

    update(deltaTime) {
        if (this.state.pendingUpdates.size > 0) {
            this.applyCurrentConfiguration();
        }
    }

    dispose() {
        // Dispose materials
        Object.values(this.materials).forEach(material => {
            material.dispose();
        });

        // Dispose textures
        this.state.loadedTextures.forEach(texture => {
            texture.dispose();
        });

        // Clear states
        this.state.loadedModels.clear();
        this.state.loadedTextures.clear();
        this.state.pendingUpdates.clear();

        // Remove listeners
        this.removeAllListeners();
    }
} 