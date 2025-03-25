import * as THREE from 'three';

export class TerrainDecorationSystem {
    constructor(terrainSystem) {
        this.terrainSystem = terrainSystem;
        
        this.settings = {
            rocks: {
                density: 0.02,
                sizeRange: { min: 0.5, max: 2.0 },
                heightRange: { min: 0.3, max: 0.8 },
                slopeRange: { min: 0.2, max: 0.7 },
                clusterRadius: 5,
                clusterDensity: 0.6
            },
            debris: {
                density: 0.03,
                sizeRange: { min: 0.2, max: 0.8 },
                types: ['branches', 'leaves', 'stones'],
                decayRate: 0.001
            },
            details: {
                textureResolution: 1024,
                normalStrength: 0.5,
                roughnessVariation: 0.3,
                detailScale: 20
            },
            decals: {
                maxCount: 1000,
                sizeRange: { min: 1, max: 4 },
                types: ['cracks', 'puddles', 'tracks']
            }
        };

        this.decorations = {
            rocks: new Map(),
            debris: new Map(),
            decals: new Map()
        };

        this.initialize();
    }

    async initialize() {
        await this.loadDecorationAssets();
        this.createDetailTextures();
        this.setupDecalSystem();
    }

    async loadDecorationAssets() {
        const loader = new THREE.TextureLoader();
        
        this.textures = {
            rocks: {
                diffuse: await loader.loadAsync('textures/decorations/rocks_diffuse.jpg'),
                normal: await loader.loadAsync('textures/decorations/rocks_normal.jpg'),
                roughness: await loader.loadAsync('textures/decorations/rocks_roughness.jpg')
            },
            debris: {
                branches: await loader.loadAsync('textures/decorations/branches_diffuse.jpg'),
                leaves: await loader.loadAsync('textures/decorations/leaves_diffuse.jpg'),
                stones: await loader.loadAsync('textures/decorations/stones_diffuse.jpg')
            },
            decals: {
                cracks: await loader.loadAsync('textures/decorations/cracks_diffuse.jpg'),
                puddles: await loader.loadAsync('textures/decorations/puddles_diffuse.jpg'),
                tracks: await loader.loadAsync('textures/decorations/tracks_diffuse.jpg')
            }
        };

        // Create materials
        this.materials = {
            rocks: new THREE.MeshStandardMaterial({
                map: this.textures.rocks.diffuse,
                normalMap: this.textures.rocks.normal,
                roughnessMap: this.textures.rocks.roughness
            }),
            debris: this.settings.debris.types.reduce((acc, type) => {
                acc[type] = new THREE.MeshStandardMaterial({
                    map: this.textures.debris[type],
                    transparent: true,
                    alphaTest: 0.5
                });
                return acc;
            }, {}),
            decals: this.settings.decals.types.reduce((acc, type) => {
                acc[type] = new THREE.MeshStandardMaterial({
                    map: this.textures.decals[type],
                    transparent: true,
                    alphaTest: 0.5,
                    polygonOffset: true,
                    polygonOffsetFactor: -1
                });
                return acc;
            }, {})
        };
    }

    createDetailTextures() {
        const size = this.settings.details.textureResolution;
        
        // Create detail normal map
        this.detailNormalMap = new THREE.WebGLRenderTarget(size, size, {
            format: THREE.RGBAFormat,
            type: THREE.FloatType
        });

        // Create detail roughness map
        this.detailRoughnessMap = new THREE.WebGLRenderTarget(size, size, {
            format: THREE.RGBAFormat,
            type: THREE.FloatType
        });

        this.generateDetailTextures();
    }

    generateDetailTextures() {
        const detailMaterial = new THREE.ShaderMaterial({
            uniforms: {
                scale: { value: this.settings.details.detailScale },
                normalStrength: { value: this.settings.details.normalStrength },
                roughnessVariation: { value: this.settings.details.roughnessVariation }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float scale;
                uniform float normalStrength;
                uniform float roughnessVariation;
                varying vec2 vUv;

                // Noise functions
                float random(vec2 p) {
                    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
                }

                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(
                        mix(random(i), random(i + vec2(1.0, 0.0)), f.x),
                        mix(random(i + vec2(0.0, 1.0)), random(i + vec2(1.0, 1.0)), f.x),
                        f.y
                    );
                }

                void main() {
                    vec2 scaled = vUv * scale;
                    
                    // Generate normal
                    float nx = noise(scaled + vec2(0.1, 0.0)) - noise(scaled - vec2(0.1, 0.0));
                    float ny = noise(scaled + vec2(0.0, 0.1)) - noise(scaled - vec2(0.0, 0.1));
                    vec3 normal = normalize(vec3(nx * normalStrength, ny * normalStrength, 1.0));
                    
                    // Generate roughness
                    float roughness = noise(scaled) * roughnessVariation + (1.0 - roughnessVariation);
                    
                    gl_FragColor = vec4(normal * 0.5 + 0.5, roughness);
                }
            `
        });

        const quad = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            detailMaterial
        );

        const scene = new THREE.Scene();
        scene.add(quad);

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        // Render detail textures
        this.terrainSystem.renderer.setRenderTarget(this.detailNormalMap);
        this.terrainSystem.renderer.render(scene, camera);
        
        this.terrainSystem.renderer.setRenderTarget(this.detailRoughnessMap);
        this.terrainSystem.renderer.render(scene, camera);
        
        this.terrainSystem.renderer.setRenderTarget(null);
    }

    setupDecalSystem() {
        this.decalGeometry = new THREE.PlaneGeometry(1, 1);
        this.decalGeometry.rotateX(-Math.PI / 2);
        
        this.decalParent = new THREE.Object3D();
        this.terrainSystem.scene.add(this.decalParent);
    }

    addRockCluster(position) {
        const { rocks } = this.settings;
        const clusterId = Date.now().toString();
        const cluster = {
            position: position.clone(),
            rocks: []
        };

        const count = Math.floor(Math.random() * 10 + 5);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * rocks.clusterRadius;
            const rockPosition = position.clone().add(
                new THREE.Vector3(
                    Math.cos(angle) * radius,
                    0,
                    Math.sin(angle) * radius
                )
            );

            if (Math.random() < rocks.clusterDensity) {
                const size = THREE.MathUtils.lerp(
                    rocks.sizeRange.min,
                    rocks.sizeRange.max,
                    Math.random()
                );

                const rock = this.createRock(rockPosition, size);
                cluster.rocks.push(rock);
            }
        }

        this.decorations.rocks.set(clusterId, cluster);
        return clusterId;
    }

    createRock(position, size) {
        const geometry = new THREE.DodecahedronGeometry(size, 1);
        geometry.vertices.forEach(vertex => {
            vertex.x += (Math.random() - 0.5) * 0.2 * size;
            vertex.y += (Math.random() - 0.5) * 0.2 * size;
            vertex.z += (Math.random() - 0.5) * 0.2 * size;
        });
        geometry.computeVertexNormals();

        const rock = new THREE.Mesh(geometry, this.materials.rocks);
        rock.position.copy(position);
        rock.rotation.y = Math.random() * Math.PI * 2;
        
        this.terrainSystem.scene.add(rock);
        return rock;
    }

    addDebris(position, type) {
        const { debris } = this.settings;
        const debrisId = Date.now().toString();
        
        const size = THREE.MathUtils.lerp(
            debris.sizeRange.min,
            debris.sizeRange.max,
            Math.random()
        );

        const geometry = new THREE.PlaneGeometry(size, size);
        const material = this.materials.debris[type];
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = Math.random() * Math.PI * 2;

        this.terrainSystem.scene.add(mesh);
        this.decorations.debris.set(debrisId, {
            mesh,
            type,
            creationTime: Date.now()
        });

        return debrisId;
    }

    addDecal(position, type, size) {
        if (this.decorations.decals.size >= this.settings.decals.maxCount) {
            return null;
        }

        const decalId = Date.now().toString();
        const material = this.materials.decals[type];
        
        const mesh = new THREE.Mesh(this.decalGeometry, material);
        mesh.position.copy(position);
        mesh.scale.setScalar(size);
        mesh.rotation.z = Math.random() * Math.PI * 2;

        this.decalParent.add(mesh);
        this.decorations.decals.set(decalId, {
            mesh,
            type,
            position: position.clone()
        });

        return decalId;
    }

    update(deltaTime) {
        this.updateDebris(deltaTime);
        this.updateDecals();
    }

    updateDebris(deltaTime) {
        const now = Date.now();
        for (const [id, debris] of this.decorations.debris) {
            const age = (now - debris.creationTime) / 1000;
            const alpha = Math.max(0, 1 - age * this.settings.debris.decayRate);
            
            if (alpha <= 0) {
                this.removeDebris(id);
            } else {
                debris.mesh.material.opacity = alpha;
            }
        }
    }

    updateDecals() {
        // Update decal visibility based on camera distance
        const cameraPosition = this.terrainSystem.camera.position;
        
        for (const [id, decal] of this.decorations.decals) {
            const distance = decal.position.distanceTo(cameraPosition);
            decal.mesh.visible = distance < 100;
        }
    }

    removeRockCluster(clusterId) {
        const cluster = this.decorations.rocks.get(clusterId);
        if (cluster) {
            cluster.rocks.forEach(rock => {
                rock.geometry.dispose();
                this.terrainSystem.scene.remove(rock);
            });
            this.decorations.rocks.delete(clusterId);
        }
    }

    removeDebris(debrisId) {
        const debris = this.decorations.debris.get(debrisId);
        if (debris) {
            debris.mesh.geometry.dispose();
            this.terrainSystem.scene.remove(debris.mesh);
            this.decorations.debris.delete(debrisId);
        }
    }

    removeDecal(decalId) {
        const decal = this.decorations.decals.get(decalId);
        if (decal) {
            this.decalParent.remove(decal.mesh);
            this.decorations.decals.delete(decalId);
        }
    }

    dispose() {
        // Dispose textures
        Object.values(this.textures).forEach(category => {
            Object.values(category).forEach(texture => {
                texture.dispose();
            });
        });

        // Dispose materials
        Object.values(this.materials).forEach(category => {
            if (category instanceof THREE.Material) {
                category.dispose();
            } else {
                Object.values(category).forEach(material => {
                    material.dispose();
                });
            }
        });

        // Dispose render targets
        this.detailNormalMap.dispose();
        this.detailRoughnessMap.dispose();

        // Dispose geometries and remove meshes
        this.decalGeometry.dispose();
        this.decorations.rocks.forEach(cluster => this.removeRockCluster(cluster));
        this.decorations.debris.forEach(debris => this.removeDebris(debris));
        this.decorations.decals.forEach(decal => this.removeDecal(decal));

        // Clear collections
        this.decorations.rocks.clear();
        this.decorations.debris.clear();
        this.decorations.decals.clear();
    }
} 