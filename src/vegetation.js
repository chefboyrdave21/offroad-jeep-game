import * as THREE from 'three';
import { InstancedMesh } from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise';

export class VegetationSystem {
    constructor(scene, resourceManager) {
        // Core references
        this.scene = scene;
        this.resourceManager = resourceManager;

        // Vegetation settings
        this.settings = {
            grassDensity: 2000,
            treeDensity: 100,
            bushDensity: 200,
            grassPatchSize: 100,
            vegetationRange: 200,
            lodLevels: 3,
            windStrength: 0.2,
            windFrequency: 0.5,
            cullDistance: 150,
            updateFrequency: 0.1
        };

        // Vegetation types
        this.vegetationTypes = {
            grass: {
                variants: ['tall', 'short', 'wheat'],
                instances: new Map(),
                materials: new Map()
            },
            trees: {
                variants: ['pine', 'oak', 'birch'],
                instances: new Map(),
                materials: new Map()
            },
            bushes: {
                variants: ['round', 'flowering', 'dead'],
                instances: new Map(),
                materials: new Map()
            }
        };

        // State tracking
        this.state = {
            lastUpdate: 0,
            windTime: 0,
            activeChunks: new Set(),
            visibleInstances: new Set()
        };

        // Initialize systems
        this.noise = new SimplexNoise();
        this.initialize();
    }

    async initialize() {
        await this.loadVegetationAssets();
        this.setupMaterials();
        this.createInstancedMeshes();
        this.setupWindAnimation();
    }

    async loadVegetationAssets() {
        // Load vegetation models and textures
        const loadPromises = [];

        for (const [type, data] of Object.entries(this.vegetationTypes)) {
            for (const variant of data.variants) {
                loadPromises.push(
                    this.resourceManager.loadResource('models', `${type}_${variant}`),
                    this.resourceManager.loadResource('textures', `${type}_${variant}_diffuse`),
                    this.resourceManager.loadResource('textures', `${type}_${variant}_normal`)
                );
            }
        }

        await Promise.all(loadPromises);
    }

    setupMaterials() {
        // Create materials for each vegetation type
        for (const [type, data] of Object.entries(this.vegetationTypes)) {
            for (const variant of data.variants) {
                const material = new THREE.MeshStandardMaterial({
                    map: this.resourceManager.getResource('textures', `${type}_${variant}_diffuse`),
                    normalMap: this.resourceManager.getResource('textures', `${type}_${variant}_normal`),
                    alphaTest: 0.5,
                    transparent: true,
                    side: THREE.DoubleSide
                });

                // Add custom uniforms for wind animation
                material.onBeforeCompile = (shader) => {
                    shader.uniforms.windTime = { value: 0 };
                    shader.uniforms.windStrength = { value: this.settings.windStrength };
                    shader.uniforms.windFrequency = { value: this.settings.windFrequency };

                    shader.vertexShader = `
                        uniform float windTime;
                        uniform float windStrength;
                        uniform float windFrequency;
                        
                        ${shader.vertexShader}
                    `.replace(
                        '#include <begin_vertex>',
                        `
                        #include <begin_vertex>
                        
                        // Apply wind effect
                        float windFactor = sin(position.x * windFrequency + windTime) * 
                                         cos(position.z * windFrequency + windTime) * 
                                         windStrength;
                        
                        transformed.x += windFactor * (position.y / 10.0);
                        transformed.z += windFactor * (position.y / 10.0);
                        `
                    );
                };

                data.materials.set(variant, material);
            }
        }
    }

    createInstancedMeshes() {
        for (const [type, data] of Object.entries(this.vegetationTypes)) {
            for (const variant of data.variants) {
                const model = this.resourceManager.getResource('models', `${type}_${variant}`);
                const geometry = model.scene.children[0].geometry;
                const material = data.materials.get(variant);

                let instanceCount;
                switch (type) {
                    case 'grass':
                        instanceCount = this.settings.grassDensity;
                        break;
                    case 'trees':
                        instanceCount = this.settings.treeDensity;
                        break;
                    case 'bushes':
                        instanceCount = this.settings.bushDensity;
                        break;
                }

                const instancedMesh = new InstancedMesh(
                    geometry,
                    material,
                    instanceCount
                );
                instancedMesh.castShadow = true;
                instancedMesh.receiveShadow = true;

                data.instances.set(variant, instancedMesh);
                this.scene.add(instancedMesh);
            }
        }
    }

    setupWindAnimation() {
        // Initialize wind animation matrices
        this.windMatrix = new THREE.Matrix4();
        this.tempMatrix = new THREE.Matrix4();
        this.position = new THREE.Vector3();
        this.rotation = new THREE.Euler();
        this.quaternion = new THREE.Quaternion();
        this.scale = new THREE.Vector3();
    }

    update(deltaTime, playerPosition) {
        this.state.windTime += deltaTime * this.settings.windFrequency;
        
        // Update only at specified frequency
        if (Date.now() - this.state.lastUpdate < this.settings.updateFrequency * 1000) {
            return;
        }
        this.state.lastUpdate = Date.now();

        this.updateVegetationPlacement(playerPosition);
        this.updateWindAnimation();
        this.updateVisibility(playerPosition);
    }

    updateVegetationPlacement(playerPosition) {
        // Calculate active chunks based on player position
        const chunkSize = this.settings.grassPatchSize;
        const range = this.settings.vegetationRange;
        
        const startX = Math.floor((playerPosition.x - range) / chunkSize);
        const endX = Math.floor((playerPosition.x + range) / chunkSize);
        const startZ = Math.floor((playerPosition.z - range) / chunkSize);
        const endZ = Math.floor((playerPosition.z + range) / chunkSize);

        // Update active chunks
        this.state.activeChunks.clear();
        for (let x = startX; x <= endX; x++) {
            for (let z = startZ; z <= endZ; z++) {
                this.state.activeChunks.add(`${x},${z}`);
            }
        }

        // Update instance matrices for active chunks
        this.updateInstanceMatrices();
    }

    updateInstanceMatrices() {
        for (const [type, data] of Object.entries(this.vegetationTypes)) {
            for (const [variant, instancedMesh] of data.instances) {
                let instanceIndex = 0;

                for (const chunk of this.state.activeChunks) {
                    const [chunkX, chunkZ] = chunk.split(',').map(Number);
                    const chunkSize = this.settings.grassPatchSize;
                    
                    // Generate positions within chunk
                    const count = this.getInstanceCountForType(type);
                    for (let i = 0; i < count; i++) {
                        if (instanceIndex >= instancedMesh.count) break;

                        // Generate position
                        const x = chunkX * chunkSize + Math.random() * chunkSize;
                        const z = chunkZ * chunkSize + Math.random() * chunkSize;
                        
                        // Get height from noise
                        const height = this.getTerrainHeight(x, z);
                        
                        // Set position
                        this.position.set(x, height, z);
                        
                        // Random rotation
                        this.rotation.set(
                            0,
                            Math.random() * Math.PI * 2,
                            0
                        );
                        this.quaternion.setFromEuler(this.rotation);
                        
                        // Random scale variation
                        const scale = 0.8 + Math.random() * 0.4;
                        this.scale.set(scale, scale, scale);
                        
                        // Update matrix
                        this.tempMatrix.compose(
                            this.position,
                            this.quaternion,
                            this.scale
                        );
                        instancedMesh.setMatrixAt(instanceIndex, this.tempMatrix);
                        
                        instanceIndex++;
                    }
                }

                instancedMesh.instanceMatrix.needsUpdate = true;
            }
        }
    }

    updateWindAnimation() {
        // Update wind uniforms
        for (const data of Object.values(this.vegetationTypes)) {
            for (const material of data.materials.values()) {
                if (material.userData.shader) {
                    material.userData.shader.uniforms.windTime.value = this.state.windTime;
                }
            }
        }
    }

    updateVisibility(playerPosition) {
        for (const data of Object.values(this.vegetationTypes)) {
            for (const instancedMesh of data.instances.values()) {
                // Check distance to player
                instancedMesh.visible = 
                    instancedMesh.position.distanceTo(playerPosition) <= 
                    this.settings.cullDistance;
            }
        }
    }

    getInstanceCountForType(type) {
        switch (type) {
            case 'grass':
                return this.settings.grassDensity;
            case 'trees':
                return this.settings.treeDensity;
            case 'bushes':
                return this.settings.bushDensity;
            default:
                return 0;
        }
    }

    getTerrainHeight(x, z) {
        // Simple noise-based height generation
        const scale = 0.01;
        return this.noise.noise(x * scale, z * scale) * 5;
    }

    setDensity(type, density) {
        if (this.settings[`${type}Density`] !== undefined) {
            this.settings[`${type}Density`] = density;
            this.createInstancedMeshes();
        }
    }

    setWindParameters(strength, frequency) {
        this.settings.windStrength = strength;
        this.settings.windFrequency = frequency;
    }

    dispose() {
        // Dispose geometries and materials
        for (const data of Object.values(this.vegetationTypes)) {
            for (const instancedMesh of data.instances.values()) {
                instancedMesh.geometry.dispose();
                this.scene.remove(instancedMesh);
            }
            for (const material of data.materials.values()) {
                material.dispose();
            }
            data.instances.clear();
            data.materials.clear();
        }
    }
} 