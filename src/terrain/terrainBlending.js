import * as THREE from 'three';

export class TerrainBlendingSystem {
    constructor(terrainSystem) {
        this.terrainSystem = terrainSystem;
        
        this.settings = {
            transitionWidth: 10,
            blendSharpness: 0.7,
            heightBlendFactor: 0.3,
            slopeBlendFactor: 0.4,
            noiseBlendFactor: 0.2,
            textureScale: 32,
            detailBlending: {
                enabled: true,
                scale: 0.5,
                strength: 0.3
            },
            biomeTransitions: {
                desert: {
                    grass: { width: 15, noise: 0.4 },
                    rock: { width: 8, noise: 0.6 }
                },
                grass: {
                    mountain: { width: 12, noise: 0.5 },
                    snow: { width: 20, noise: 0.3 }
                }
            }
        };

        this.initialize();
    }

    initialize() {
        this.createBlendingTextures();
        this.setupBlendingShader();
    }

    createBlendingTextures() {
        const noiseSize = 1024;
        this.blendingTextures = {
            noise: this.generateNoiseTexture(noiseSize),
            transition: this.generateTransitionTexture(noiseSize)
        };
    }

    generateNoiseTexture(size) {
        const data = new Uint8Array(size * size * 4);
        const simplex = new SimplexNoise();
        
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = (y * size + x) * 4;
                const noise = simplex.noise2D(x / 64, y / 64) * 0.5 + 0.5;
                
                data[idx] = noise * 255;
                data[idx + 1] = noise * 255;
                data[idx + 2] = noise * 255;
                data[idx + 3] = 255;
            }
        }

        const texture = new THREE.DataTexture(
            data,
            size,
            size,
            THREE.RGBAFormat
        );
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;

        return texture;
    }

    generateTransitionTexture(size) {
        const data = new Uint8Array(size * size * 4);
        
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = (y * size + x) * 4;
                const distance = Math.sqrt(
                    Math.pow((x - size/2) / (size/2), 2) +
                    Math.pow((y - size/2) / (size/2), 2)
                );
                const value = Math.max(0, Math.min(1, 1 - distance));
                
                data[idx] = value * 255;
                data[idx + 1] = value * 255;
                data[idx + 2] = value * 255;
                data[idx + 3] = 255;
            }
        }

        const texture = new THREE.DataTexture(
            data,
            size,
            size,
            THREE.RGBAFormat
        );
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;

        return texture;
    }

    setupBlendingShader() {
        this.blendingUniforms = {
            heightMap: { value: null },
            slopeMap: { value: null },
            noiseMap: { value: this.blendingTextures.noise },
            transitionMap: { value: this.blendingTextures.transition },
            textureScale: { value: this.settings.textureScale },
            transitionWidth: { value: this.settings.transitionWidth },
            blendSharpness: { value: this.settings.blendSharpness },
            heightBlendFactor: { value: this.settings.heightBlendFactor },
            slopeBlendFactor: { value: this.settings.slopeBlendFactor },
            noiseBlendFactor: { value: this.settings.noiseBlendFactor }
        };

        this.blendingShader = {
            uniforms: this.blendingUniforms,
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vPosition;
                varying vec3 vNormal;

                void main() {
                    vUv = uv;
                    vPosition = position;
                    vNormal = normal;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D heightMap;
                uniform sampler2D slopeMap;
                uniform sampler2D noiseMap;
                uniform sampler2D transitionMap;
                uniform float textureScale;
                uniform float transitionWidth;
                uniform float blendSharpness;
                uniform float heightBlendFactor;
                uniform float slopeBlendFactor;
                uniform float noiseBlendFactor;

                varying vec2 vUv;
                varying vec3 vPosition;
                varying vec3 vNormal;

                float calculateBlendFactor(float value, float threshold, float width) {
                    return smoothstep(
                        threshold - width * 0.5,
                        threshold + width * 0.5,
                        value
                    );
                }

                void main() {
                    // Sample maps
                    float height = texture2D(heightMap, vUv).r;
                    float slope = texture2D(slopeMap, vUv).r;
                    float noise = texture2D(noiseMap, vUv * textureScale).r;
                    
                    // Calculate blend factors
                    float heightBlend = calculateBlendFactor(height, 0.5, transitionWidth);
                    float slopeBlend = calculateBlendFactor(slope, 0.5, transitionWidth);
                    float noiseBlend = noise * noiseBlendFactor;
                    
                    // Combine blend factors
                    float finalBlend = mix(
                        mix(heightBlend, slopeBlend, slopeBlendFactor),
                        noiseBlend,
                        noiseBlendFactor
                    );
                    
                    // Apply sharpness
                    finalBlend = pow(finalBlend, blendSharpness);
                    
                    gl_FragColor = vec4(finalBlend, finalBlend, finalBlend, 1.0);
                }
            `
        };
    }

    updateBlendMaps() {
        const { resolution } = this.terrainSystem.settings;
        const heightData = new Float32Array(resolution * resolution);
        const slopeData = new Float32Array(resolution * resolution);

        // Calculate height and slope data
        for (let y = 0; y < resolution; y++) {
            for (let x = 0; x < resolution; x++) {
                const idx = y * resolution + x;
                heightData[idx] = this.terrainSystem.getHeight(x, y);
                slopeData[idx] = this.calculateSlope(x, y);
            }
        }

        // Update textures
        this.blendingUniforms.heightMap.value = new THREE.DataTexture(
            heightData,
            resolution,
            resolution,
            THREE.RedFormat,
            THREE.FloatType
        );
        this.blendingUniforms.slopeMap.value = new THREE.DataTexture(
            slopeData,
            resolution,
            resolution,
            THREE.RedFormat,
            THREE.FloatType
        );

        this.blendingUniforms.heightMap.value.needsUpdate = true;
        this.blendingUniforms.slopeMap.value.needsUpdate = true;
    }

    calculateSlope(x, y) {
        const { resolution } = this.terrainSystem.settings;
        if (x <= 0 || x >= resolution - 1 || y <= 0 || y >= resolution - 1) {
            return 0;
        }

        const h = this.terrainSystem.getHeight(x, y);
        const hL = this.terrainSystem.getHeight(x - 1, y);
        const hR = this.terrainSystem.getHeight(x + 1, y);
        const hU = this.terrainSystem.getHeight(x, y - 1);
        const hD = this.terrainSystem.getHeight(x, y + 1);

        const dX = ((hR - h) + (h - hL)) * 0.5;
        const dY = ((hD - h) + (h - hU)) * 0.5;

        return Math.sqrt(dX * dX + dY * dY);
    }

    applyBiomeTransition(sourceBiome, targetBiome, position) {
        const transition = this.settings.biomeTransitions[sourceBiome]?.[targetBiome];
        if (!transition) return 0;

        const noise = this.blendingTextures.noise.image.data[
            Math.floor(position.x * this.settings.textureScale) +
            Math.floor(position.z * this.settings.textureScale) * 1024
        ] / 255;

        const distance = this.calculateTransitionDistance(position);
        const baseBlend = Math.max(0, Math.min(1,
            1 - (distance / transition.width)
        ));

        return baseBlend * (1 - transition.noise * noise);
    }

    calculateTransitionDistance(position) {
        // Calculate distance to biome boundary
        // This would need to be implemented based on your biome system
        return 0;
    }

    applyDetailBlending(material) {
        if (!this.settings.detailBlending.enabled) return;

        material.onBeforeCompile = (shader) => {
            shader.uniforms.detailScale = { value: this.settings.detailBlending.scale };
            shader.uniforms.detailStrength = { value: this.settings.detailBlending.strength };
            shader.uniforms.detailNoise = { value: this.blendingTextures.noise };

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <map_fragment>',
                `
                #include <map_fragment>
                
                vec2 detailUV = vUv * detailScale;
                float detail = texture2D(detailNoise, detailUV).r;
                diffuseColor.rgb += (detail - 0.5) * detailStrength;
                `
            );
        };
    }

    update() {
        this.updateBlendMaps();
    }

    dispose() {
        this.blendingTextures.noise.dispose();
        this.blendingTextures.transition.dispose();
        
        if (this.blendingUniforms.heightMap.value) {
            this.blendingUniforms.heightMap.value.dispose();
        }
        if (this.blendingUniforms.slopeMap.value) {
            this.blendingUniforms.slopeMap.value.dispose();
        }
    }
} 