import * as THREE from 'three';
import SimplexNoise from 'simplex-noise';

export class TerrainSystem {
    constructor(scene, physicsSystem) {
        // Core references
        this.scene = scene;
        this.physicsSystem = physicsSystem;

        // Terrain settings
        this.settings = {
            size: 1024,
            segments: 256,
            maxHeight: 100,
            minHeight: -20,
            scale: {
                horizontal: 1,
                vertical: 1
            },
            noise: {
                octaves: 6,
                persistence: 0.5,
                lacunarity: 2.0,
                scale: 500,
                seed: Math.random()
            },
            textures: {
                tileSize: 32,
                textureScale: 16
            },
            lod: {
                levels: 4,
                distance: 200,
                morphTargets: true
            }
        };

        // Terrain state
        this.state = {
            heightData: null,
            normalMap: null,
            splatMap: null,
            chunks: new Map(),
            activeChunks: new Set()
        };

        // Noise generators
        this.noise = {
            terrain: new SimplexNoise(this.settings.noise.seed),
            detail: new SimplexNoise(this.settings.noise.seed + 1),
            variation: new SimplexNoise(this.settings.noise.seed + 2)
        };

        this.initialize();
    }

    async initialize() {
        await this.loadTerrainTextures();
        this.setupTerrainMaterial();
        this.generateTerrain();
        this.setupPhysics();
    }

    async loadTerrainTextures() {
        const textureLoader = new THREE.TextureLoader();
        const loadTexture = (path) => {
            return new Promise((resolve) => {
                textureLoader.load(path, (texture) => {
                    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                    texture.repeat.set(
                        this.settings.textures.textureScale,
                        this.settings.textures.textureScale
                    );
                    resolve(texture);
                });
            });
        };

        // Load terrain textures
        this.textures = {
            grass: {
                diffuse: await loadTexture('textures/terrain/grass_diffuse.jpg'),
                normal: await loadTexture('textures/terrain/grass_normal.jpg'),
                roughness: await loadTexture('textures/terrain/grass_roughness.jpg')
            },
            rock: {
                diffuse: await loadTexture('textures/terrain/rock_diffuse.jpg'),
                normal: await loadTexture('textures/terrain/rock_normal.jpg'),
                roughness: await loadTexture('textures/terrain/rock_roughness.jpg')
            },
            dirt: {
                diffuse: await loadTexture('textures/terrain/dirt_diffuse.jpg'),
                normal: await loadTexture('textures/terrain/dirt_normal.jpg'),
                roughness: await loadTexture('textures/terrain/dirt_roughness.jpg')
            },
            snow: {
                diffuse: await loadTexture('textures/terrain/snow_diffuse.jpg'),
                normal: await loadTexture('textures/terrain/snow_normal.jpg'),
                roughness: await loadTexture('textures/terrain/snow_roughness.jpg')
            }
        };
    }

    setupTerrainMaterial() {
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                grassMap: { value: this.textures.grass.diffuse },
                rockMap: { value: this.textures.rock.diffuse },
                dirtMap: { value: this.textures.dirt.diffuse },
                snowMap: { value: this.textures.snow.diffuse },
                grassNormal: { value: this.textures.grass.normal },
                rockNormal: { value: this.textures.rock.normal },
                dirtNormal: { value: this.textures.dirt.normal },
                snowNormal: { value: this.textures.snow.normal },
                splatMap: { value: null },
                normalMap: { value: null },
                heightScale: { value: this.settings.scale.vertical },
                textureScale: { value: this.settings.textures.textureScale },
                time: { value: 0 }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vPosition;
                varying float vHeight;
                
                void main() {
                    vUv = uv;
                    vNormal = normal;
                    vPosition = position;
                    vHeight = position.y;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D grassMap;
                uniform sampler2D rockMap;
                uniform sampler2D dirtMap;
                uniform sampler2D snowMap;
                uniform sampler2D splatMap;
                uniform float textureScale;
                uniform float time;
                
                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vPosition;
                varying float vHeight;
                
                void main() {
                    vec4 splat = texture2D(splatMap, vUv);
                    vec2 scaledUv = vUv * textureScale;
                    
                    // Sample textures
                    vec4 grass = texture2D(grassMap, scaledUv);
                    vec4 rock = texture2D(rockMap, scaledUv);
                    vec4 dirt = texture2D(dirtMap, scaledUv);
                    vec4 snow = texture2D(snowMap, scaledUv);
                    
                    // Blend textures based on splat map and height
                    vec4 color = grass * splat.r +
                                rock * splat.g +
                                dirt * splat.b +
                                snow * splat.a;
                    
                    gl_FragColor = color;
                }
            `
        });
    }

    generateTerrain() {
        // Generate height data
        this.generateHeightData();
        
        // Generate normal map
        this.generateNormalMap();
        
        // Generate splat map
        this.generateSplatMap();
        
        // Create terrain chunks
        this.createTerrainChunks();
    }

    generateHeightData() {
        const size = this.settings.size;
        const data = new Float32Array(size * size);

        for (let z = 0; z < size; z++) {
            for (let x = 0; x < size; x++) {
                const height = this.getHeightAt(x, z);
                data[z * size + x] = height;
            }
        }

        this.state.heightData = data;
    }

    getHeightAt(x, z) {
        let height = 0;
        let amplitude = 1;
        let frequency = 1 / this.settings.noise.scale;

        // Accumulate octaves
        for (let i = 0; i < this.settings.noise.octaves; i++) {
            const nx = x * frequency;
            const nz = z * frequency;
            
            height += this.noise.terrain.noise2D(nx, nz) * amplitude;
            
            amplitude *= this.settings.noise.persistence;
            frequency *= this.settings.noise.lacunarity;
        }

        // Add detail noise
        const detailNoise = this.noise.detail.noise2D(
            x / 50,
            z / 50
        ) * 5;

        height = height * this.settings.maxHeight + detailNoise;
        height = Math.max(this.settings.minHeight, Math.min(this.settings.maxHeight, height));

        return height;
    }

    generateNormalMap() {
        const size = this.settings.size;
        const data = new Float32Array(size * size * 3);

        for (let z = 0; z < size; z++) {
            for (let x = 0; x < size; x++) {
                const idx = (z * size + x) * 3;
                
                // Calculate normal using central differences
                const hL = this.getHeightAt(x - 1, z);
                const hR = this.getHeightAt(x + 1, z);
                const hD = this.getHeightAt(x, z - 1);
                const hU = this.getHeightAt(x, z + 1);
                
                const normal = new THREE.Vector3(
                    hL - hR,
                    2.0,
                    hD - hU
                ).normalize();

                data[idx] = normal.x;
                data[idx + 1] = normal.y;
                data[idx + 2] = normal.z;
            }
        }

        this.state.normalMap = data;
    }

    generateSplatMap() {
        const size = this.settings.size;
        const data = new Float32Array(size * size * 4);

        for (let z = 0; z < size; z++) {
            for (let x = 0; x < size; x++) {
                const idx = (z * size + x) * 4;
                const height = this.getHeightAt(x, z);
                const slope = this.getSlope(x, z);
                
                // Calculate texture weights
                let grass = 1.0;
                let rock = 0.0;
                let dirt = 0.0;
                let snow = 0.0;

                // Slope-based blending
                if (slope > 0.5) {
                    rock = (slope - 0.5) * 2;
                    grass = 1 - rock;
                }

                // Height-based blending
                if (height > this.settings.maxHeight * 0.7) {
                    snow = (height - this.settings.maxHeight * 0.7) / (this.settings.maxHeight * 0.3);
                    grass *= (1 - snow);
                    rock *= (1 - snow);
                }

                // Add some noise variation
                const noise = this.noise.variation.noise2D(x / 100, z / 100) * 0.5 + 0.5;
                dirt = Math.max(0, Math.min(0.3, noise));
                grass *= (1 - dirt);

                data[idx] = grass;
                data[idx + 1] = rock;
                data[idx + 2] = dirt;
                data[idx + 3] = snow;
            }
        }

        this.state.splatMap = data;
    }

    getSlope(x, z) {
        const h = this.getHeightAt(x, z);
        const hL = this.getHeightAt(x - 1, z);
        const hR = this.getHeightAt(x + 1, z);
        const hD = this.getHeightAt(x, z - 1);
        const hU = this.getHeightAt(x, z + 1);

        const dX = Math.abs(hL - hR) / 2;
        const dZ = Math.abs(hD - hU) / 2;

        return Math.sqrt(dX * dX + dZ * dZ);
    }

    createTerrainChunks() {
        const chunkSize = this.settings.size / 4;
        
        for (let z = 0; z < 4; z++) {
            for (let x = 0; x < 4; x++) {
                const chunk = this.createTerrainChunk(x, z, chunkSize);
                this.state.chunks.set(`${x},${z}`, chunk);
                this.scene.add(chunk);
            }
        }
    }

    createTerrainChunk(chunkX, chunkZ, size) {
        const geometry = new THREE.PlaneGeometry(
            size,
            size,
            this.settings.segments / 4,
            this.settings.segments / 4
        );
        geometry.rotateX(-Math.PI / 2);

        // Update vertex positions
        const vertices = geometry.attributes.position.array;
  for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i] + chunkX * size;
            const z = vertices[i + 2] + chunkZ * size;
            vertices[i + 1] = this.getHeightAt(x, z);
        }

        geometry.computeVertexNormals();
        
        const chunk = new THREE.Mesh(geometry, this.material);
        chunk.castShadow = true;
        chunk.receiveShadow = true;
        
        return chunk;
    }

    setupPhysics() {
        // Create heightfield physics body
        const data = [];
        const size = this.settings.segments;
        
        for (let i = 0; i < size; i++) {
            data[i] = [];
            for (let j = 0; j < size; j++) {
                const height = this.getHeightAt(
                    (i / size) * this.settings.size,
                    (j / size) * this.settings.size
                );
                data[i][j] = height;
            }
        }

        this.physicsSystem.createTerrainBody(data, {
            elementSize: this.settings.size / this.settings.segments
        });
    }

    update(deltaTime, playerPosition) {
        // Update material uniforms
        this.material.uniforms.time.value += deltaTime;

        // Update active chunks based on player position
        this.updateActiveChunks(playerPosition);
    }

    updateActiveChunks(playerPosition) {
        const chunkSize = this.settings.size / 4;
        const chunkX = Math.floor(playerPosition.x / chunkSize);
        const chunkZ = Math.floor(playerPosition.z / chunkSize);

        // Update visibility of chunks
        this.state.chunks.forEach((chunk, key) => {
            const [x, z] = key.split(',').map(Number);
            const distance = Math.max(
                Math.abs(x - chunkX),
                Math.abs(z - chunkZ)
            );

            chunk.visible = distance <= 2;
        });
    }

    dispose() {
        // Dispose geometries and materials
        this.state.chunks.forEach(chunk => {
            chunk.geometry.dispose();
            this.scene.remove(chunk);
        });
        
        this.material.dispose();
        
        // Clear collections
        this.state.chunks.clear();
        this.state.activeChunks.clear();
        
        // Dispose textures
        Object.values(this.textures).forEach(category => {
            Object.values(category).forEach(texture => {
                texture.dispose();
            });
        });
    }
}