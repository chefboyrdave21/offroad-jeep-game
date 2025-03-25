import * as THREE from 'three';

export class TerrainTexturingSystem {
    constructor() {
        this.textureLoader = new THREE.TextureLoader();
        
        this.materials = {
            grass: {
                diffuse: 'textures/terrain/grass_diffuse.jpg',
                normal: 'textures/terrain/grass_normal.jpg',
                roughness: 'textures/terrain/grass_roughness.jpg',
                ao: 'textures/terrain/grass_ao.jpg',
                displacement: 'textures/terrain/grass_height.jpg',
                tiling: 20
            },
            rock: {
                diffuse: 'textures/terrain/rock_diffuse.jpg',
                normal: 'textures/terrain/rock_normal.jpg',
                roughness: 'textures/terrain/rock_roughness.jpg',
                ao: 'textures/terrain/rock_ao.jpg',
                displacement: 'textures/terrain/rock_height.jpg',
                tiling: 15
            },
            sand: {
                diffuse: 'textures/terrain/sand_diffuse.jpg',
                normal: 'textures/terrain/sand_normal.jpg',
                roughness: 'textures/terrain/sand_roughness.jpg',
                ao: 'textures/terrain/sand_ao.jpg',
                displacement: 'textures/terrain/sand_height.jpg',
                tiling: 25
            },
            snow: {
                diffuse: 'textures/terrain/snow_diffuse.jpg',
                normal: 'textures/terrain/snow_normal.jpg',
                roughness: 'textures/terrain/snow_roughness.jpg',
                ao: 'textures/terrain/snow_ao.jpg',
                displacement: 'textures/terrain/snow_height.jpg',
                tiling: 30
            },
            mud: {
                diffuse: 'textures/terrain/mud_diffuse.jpg',
                normal: 'textures/terrain/mud_normal.jpg',
                roughness: 'textures/terrain/mud_roughness.jpg',
                ao: 'textures/terrain/mud_ao.jpg',
                displacement: 'textures/terrain/mud_height.jpg',
                tiling: 18
            }
        };

        this.splatMaps = {
            height: null,
            slope: null,
            moisture: null
        };

        this.shaderUniforms = {
            terrainSize: { value: new THREE.Vector2(1000, 1000) },
            textureScale: { value: new THREE.Vector2(1, 1) },
            heightMap: { value: null },
            slopeMap: { value: null },
            moistureMap: { value: null },
            materialTextures: { value: [] },
            materialNormals: { value: [] },
            materialRoughness: { value: [] },
            materialAO: { value: [] },
            materialDisplacement: { value: [] },
            materialTiling: { value: [] }
        };

        this.initialize();
    }

    async initialize() {
        await this.loadTextures();
        this.createSplatMaps();
        this.createShaderMaterial();
    }

    async loadTextures() {
        const texturePromises = [];
        const materialKeys = Object.keys(this.materials);

        for (const material of materialKeys) {
            const materialData = this.materials[material];
            const promises = [
                this.loadTexture(materialData.diffuse),
                this.loadTexture(materialData.normal),
                this.loadTexture(materialData.roughness),
                this.loadTexture(materialData.ao),
                this.loadTexture(materialData.displacement)
            ];
            texturePromises.push(Promise.all(promises));
        }

        const textures = await Promise.all(texturePromises);

        materialKeys.forEach((material, index) => {
            const [diffuse, normal, roughness, ao, displacement] = textures[index];
            this.materials[material].textures = {
                diffuse, normal, roughness, ao, displacement
            };
        });

        this.updateShaderUniforms();
    }

    loadTexture(path) {
        return new Promise((resolve, reject) => {
            this.textureLoader.load(
                path,
                texture => {
                    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                    resolve(texture);
                },
                undefined,
                reject
            );
        });
    }

    createSplatMaps() {
        const size = 1024;
        
        this.splatMaps.height = new THREE.WebGLRenderTarget(size, size, {
            type: THREE.FloatType
        });
        this.splatMaps.slope = new THREE.WebGLRenderTarget(size, size, {
            type: THREE.FloatType
        });
        this.splatMaps.moisture = new THREE.WebGLRenderTarget(size, size, {
            type: THREE.FloatType
        });

        this.updateSplatMaps();
    }

    updateSplatMaps() {
        // Update height splat map
        const heightMaterial = new THREE.ShaderMaterial({
            uniforms: {
                heightMap: this.shaderUniforms.heightMap
            },
            vertexShader: this.getSplatMapVertexShader(),
            fragmentShader: this.getHeightSplatMapFragmentShader()
        });

        // Update slope splat map
        const slopeMaterial = new THREE.ShaderMaterial({
            uniforms: {
                heightMap: this.shaderUniforms.heightMap
            },
            vertexShader: this.getSplatMapVertexShader(),
            fragmentShader: this.getSlopeSplatMapFragmentShader()
        });

        // Update moisture splat map
        const moistureMaterial = new THREE.ShaderMaterial({
            uniforms: {
                moistureMap: this.shaderUniforms.moistureMap
            },
            vertexShader: this.getSplatMapVertexShader(),
            fragmentShader: this.getMoistureSplatMapFragmentShader()
        });

        // Render splat maps
        const renderer = this.renderer;
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));

        quad.material = heightMaterial;
        renderer.setRenderTarget(this.splatMaps.height);
        renderer.render(scene, camera);

        quad.material = slopeMaterial;
        renderer.setRenderTarget(this.splatMaps.slope);
        renderer.render(scene, camera);

        quad.material = moistureMaterial;
        renderer.setRenderTarget(this.splatMaps.moisture);
        renderer.render(scene, camera);

        renderer.setRenderTarget(null);
    }

    createShaderMaterial() {
        return new THREE.ShaderMaterial({
            uniforms: this.shaderUniforms,
            vertexShader: this.getTerrainVertexShader(),
            fragmentShader: this.getTerrainFragmentShader(),
            lights: true
        });
    }

    updateShaderUniforms() {
        const materialArrays = {
            diffuse: [],
            normal: [],
            roughness: [],
            ao: [],
            displacement: [],
            tiling: []
        };

        Object.values(this.materials).forEach(material => {
            materialArrays.diffuse.push(material.textures.diffuse);
            materialArrays.normal.push(material.textures.normal);
            materialArrays.roughness.push(material.textures.roughness);
            materialArrays.ao.push(material.textures.ao);
            materialArrays.displacement.push(material.textures.displacement);
            materialArrays.tiling.push(material.tiling);
        });

        this.shaderUniforms.materialTextures.value = materialArrays.diffuse;
        this.shaderUniforms.materialNormals.value = materialArrays.normal;
        this.shaderUniforms.materialRoughness.value = materialArrays.roughness;
        this.shaderUniforms.materialAO.value = materialArrays.ao;
        this.shaderUniforms.materialDisplacement.value = materialArrays.displacement;
        this.shaderUniforms.materialTiling.value = materialArrays.tiling;
    }

    getTerrainVertexShader() {
        return `
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vViewPosition;

            void main() {
                vUv = uv;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                vViewPosition = -mvPosition.xyz;
                vNormal = normalMatrix * normal;
                gl_Position = projectionMatrix * mvPosition;
            }
        `;
    }

    getTerrainFragmentShader() {
        return `
            uniform sampler2D heightMap;
            uniform sampler2D slopeMap;
            uniform sampler2D moistureMap;
            uniform sampler2D materialTextures[5];
            uniform sampler2D materialNormals[5];
            uniform sampler2D materialRoughness[5];
            uniform sampler2D materialAO[5];
            uniform vec2 terrainSize;
            uniform vec2 textureScale;
            uniform float materialTiling[5];

            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vViewPosition;

            void main() {
                vec3 finalColor = vec3(0.0);
                vec3 finalNormal = normalize(vNormal);
                float finalRoughness = 0.0;
                float finalAO = 0.0;

                // Sample control maps
                float height = texture2D(heightMap, vUv).r;
                float slope = texture2D(slopeMap, vUv).r;
                float moisture = texture2D(moistureMap, vUv).r;

                // Calculate blend weights
                vec4 weights = vec4(0.0);
                weights.r = smoothstep(0.0, 0.2, height); // rock
                weights.g = smoothstep(0.2, 0.4, height) * (1.0 - slope); // grass
                weights.b = smoothstep(0.4, 0.7, height) * slope; // snow
                weights.a = (1.0 - smoothstep(0.1, 0.2, height)) * (1.0 - slope); // sand

                // Normalize weights
                weights /= (weights.r + weights.g + weights.b + weights.a);

                // Sample and blend textures
                for(int i = 0; i < 5; i++) {
                    if(weights[i] > 0.0) {
                        vec2 scaledUV = vUv * terrainSize * textureScale * materialTiling[i];
                        
                        vec3 albedo = texture2D(materialTextures[i], scaledUV).rgb;
                        vec3 normal = texture2D(materialNormals[i], scaledUV).rgb * 2.0 - 1.0;
                        float roughness = texture2D(materialRoughness[i], scaledUV).r;
                        float ao = texture2D(materialAO[i], scaledUV).r;

                        finalColor += albedo * weights[i];
                        finalNormal = normalize(finalNormal + normal * weights[i]);
                        finalRoughness += roughness * weights[i];
                        finalAO += ao * weights[i];
                    }
                }

                // Calculate lighting
                vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
                vec3 viewDir = normalize(vViewPosition);
                vec3 halfDir = normalize(lightDir + viewDir);

                float NdotL = max(dot(finalNormal, lightDir), 0.0);
                float NdotH = max(dot(finalNormal, halfDir), 0.0);
                float NdotV = max(dot(finalNormal, viewDir), 0.0);

                // Specular lighting
                float specular = pow(NdotH, (1.0 - finalRoughness) * 100.0);

                // Final color composition
                vec3 ambient = finalColor * 0.3;
                vec3 diffuse = finalColor * NdotL;
                vec3 spec = vec3(specular) * (1.0 - finalRoughness);

                gl_FragColor = vec4(ambient + diffuse + spec, 1.0) * finalAO;
            }
        `;
    }

    getSplatMapVertexShader() {
        return `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
    }

    getHeightSplatMapFragmentShader() {
        return `
            uniform sampler2D heightMap;
            varying vec2 vUv;

            void main() {
                float height = texture2D(heightMap, vUv).r;
                gl_FragColor = vec4(height);
            }
        `;
    }

    getSlopeSplatMapFragmentShader() {
        return `
            uniform sampler2D heightMap;
            varying vec2 vUv;

            void main() {
                vec2 size = vec2(1024.0);
                vec2 texelSize = 1.0 / size;

                float h0 = texture2D(heightMap, vUv).r;
                float h1 = texture2D(heightMap, vUv + vec2(texelSize.x, 0.0)).r;
                float h2 = texture2D(heightMap, vUv + vec2(-texelSize.x, 0.0)).r;
                float h3 = texture2D(heightMap, vUv + vec2(0.0, texelSize.y)).r;
                float h4 = texture2D(heightMap, vUv + vec2(0.0, -texelSize.y)).r;

                vec3 normal = normalize(vec3(
                    h2 - h1,
                    2.0,
                    h4 - h3
                ));

                float slope = 1.0 - normal.y;
                gl_FragColor = vec4(slope);
            }
        `;
    }

    getMoistureSplatMapFragmentShader() {
        return `
            uniform sampler2D moistureMap;
            varying vec2 vUv;

            void main() {
                float moisture = texture2D(moistureMap, vUv).r;
                gl_FragColor = vec4(moisture);
            }
        `;
    }

    dispose() {
        // Dispose textures
        Object.values(this.materials).forEach(material => {
            Object.values(material.textures).forEach(texture => {
                texture.dispose();
            });
        });

        // Dispose render targets
        Object.values(this.splatMaps).forEach(renderTarget => {
            renderTarget.dispose();
        });
    }
} 