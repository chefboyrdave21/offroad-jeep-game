import * as THREE from 'three';

export class SceneManager {
    constructor(renderer, resourceManager) {
        // Core components
        this.renderer = renderer;
        this.resourceManager = resourceManager;
        
        // Scene management
        this.activeScene = null;
        this.scenes = new Map();
        this.cameras = new Map();
        
        // Transition state
        this.transitionState = {
            isTransitioning: false,
            from: null,
            to: null,
            progress: 0,
            duration: 1000,
            type: 'fade'
        };

        // Scene defaults
        this.defaults = {
            fog: {
                color: 0x87ceeb,
                near: 1,
                far: 1000
            },
            ambient: {
                color: 0xffffff,
                intensity: 0.5
            },
            directional: {
                color: 0xffffff,
                intensity: 0.8,
                position: new THREE.Vector3(100, 100, 100)
            }
        };

        this.initialize();
    }

    initialize() {
        // Create base scenes
        this.createScene('main', { fog: true });
        this.createScene('menu');
        this.createScene('garage');
        this.createScene('loading');
        
        // Setup transition render target
        this.setupTransitionRendering();
    }

    createScene(name, options = {}) {
        const scene = new THREE.Scene();
        
        // Setup scene basics
        if (options.fog) {
            scene.fog = new THREE.Fog(
                this.defaults.fog.color,
                this.defaults.fog.near,
                this.defaults.fog.far
            );
        }

        // Add default lighting
        this.setupDefaultLighting(scene);
        
        // Create default camera
        const camera = new THREE.PerspectiveCamera(
            75, window.innerWidth / window.innerHeight, 0.1, 1000
        );
        camera.position.set(0, 5, 10);
        camera.lookAt(0, 0, 0);
        
        // Store scene and camera
        this.scenes.set(name, scene);
        this.cameras.set(name, camera);
        
        return scene;
    }

    setupDefaultLighting(scene) {
        // Ambient light
        const ambient = new THREE.AmbientLight(
            this.defaults.ambient.color,
            this.defaults.ambient.intensity
        );
        scene.add(ambient);
        
        // Directional light
        const directional = new THREE.DirectionalLight(
            this.defaults.directional.color,
            this.defaults.directional.intensity
        );
        directional.position.copy(this.defaults.directional.position);
        directional.castShadow = true;
        
        // Configure shadow properties
        directional.shadow.mapSize.width = 2048;
        directional.shadow.mapSize.height = 2048;
        directional.shadow.camera.near = 0.5;
        directional.shadow.camera.far = 500;
        
        scene.add(directional);
    }

    setupTransitionRendering() {
        // Create render targets for transition effects
        this.renderTargetA = new THREE.WebGLRenderTarget(
            window.innerWidth,
            window.innerHeight
        );
        this.renderTargetB = new THREE.WebGLRenderTarget(
            window.innerWidth,
            window.innerHeight
        );
        
        // Create transition materials
        this.transitionMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse1: { value: null },
                tDiffuse2: { value: null },
                mixRatio: { value: 0.0 },
                threshold: { value: 0.1 },
                noise: { value: 0.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float mixRatio;
                uniform float threshold;
                uniform float noise;
                uniform sampler2D tDiffuse1;
                uniform sampler2D tDiffuse2;
                varying vec2 vUv;
                
                void main() {
                    vec4 texel1 = texture2D(tDiffuse1, vUv);
                    vec4 texel2 = texture2D(tDiffuse2, vUv);
                    gl_FragColor = mix(texel1, texel2, mixRatio);
                }
            `
        });
    }

    async switchToScene(name, transitionOptions = {}) {
        if (!this.scenes.has(name)) {
            throw new Error(`Scene "${name}" not found`);
        }

        const targetScene = this.scenes.get(name);
        const targetCamera = this.cameras.get(name);

        if (this.transitionState.isTransitioning) {
            await this.completeCurrentTransition();
        }

        const options = {
            duration: transitionOptions.duration || this.transitionState.duration,
            type: transitionOptions.type || this.transitionState.type
        };

        await this.startTransition(this.activeScene, targetScene, options);

        this.activeScene = targetScene;
        this.activeCamera = targetCamera;
    }

    async startTransition(fromScene, toScene, options) {
        this.transitionState.isTransitioning = true;
        this.transitionState.from = fromScene;
        this.transitionState.to = toScene;
        this.transitionState.progress = 0;
        this.transitionState.duration = options.duration;
        this.transitionState.type = options.type;

        return new Promise((resolve) => {
            const animate = (timestamp) => {
                if (!this.transitionState.startTime) {
                    this.transitionState.startTime = timestamp;
                }

                const elapsed = timestamp - this.transitionState.startTime;
                this.transitionState.progress = Math.min(
                    elapsed / this.transitionState.duration,
                    1
                );

                this.updateTransition();

                if (this.transitionState.progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    this.completeTransition();
                    resolve();
                }
            };

            requestAnimationFrame(animate);
        });
    }

    updateTransition() {
        if (!this.transitionState.isTransitioning) return;

        // Render scenes to targets
        if (this.transitionState.from) {
            this.renderer.setRenderTarget(this.renderTargetA);
            this.renderer.render(
                this.transitionState.from,
                this.cameras.get(this.getSceneName(this.transitionState.from))
            );
        }

        this.renderer.setRenderTarget(this.renderTargetB);
        this.renderer.render(
            this.transitionState.to,
            this.cameras.get(this.getSceneName(this.transitionState.to))
        );

        // Update transition material
        this.transitionMaterial.uniforms.tDiffuse1.value = this.renderTargetA.texture;
        this.transitionMaterial.uniforms.tDiffuse2.value = this.renderTargetB.texture;
        this.transitionMaterial.uniforms.mixRatio.value = this.transitionState.progress;

        // Render transition
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.getTransitionScene(), this.getTransitionCamera());
    }

    completeTransition() {
        this.transitionState.isTransitioning = false;
        this.transitionState.startTime = null;
        this.transitionState.from = null;
        this.transitionState.progress = 0;
    }

    getSceneName(scene) {
        for (const [name, s] of this.scenes.entries()) {
            if (s === scene) return name;
        }
        return null;
    }

    getTransitionScene() {
        if (!this._transitionScene) {
            this._transitionScene = new THREE.Scene();
            const geometry = new THREE.PlaneGeometry(2, 2);
            const mesh = new THREE.Mesh(geometry, this.transitionMaterial);
            this._transitionScene.add(mesh);
        }
        return this._transitionScene;
    }

    getTransitionCamera() {
        if (!this._transitionCamera) {
            this._transitionCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        }
        return this._transitionCamera;
    }

    update(deltaTime) {
        if (!this.activeScene) return;

        // Update active scene components
        this.activeScene.traverse((object) => {
            if (object.update) {
                object.update(deltaTime);
            }
        });

        // Render scene
        if (!this.transitionState.isTransitioning) {
            this.renderer.render(this.activeScene, this.activeCamera);
        }
    }

    resize(width, height) {
        // Update cameras
        this.cameras.forEach((camera) => {
            if (camera instanceof THREE.PerspectiveCamera) {
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
            }
        });

        // Update render targets
        this.renderTargetA.setSize(width, height);
        this.renderTargetB.setSize(width, height);
    }

    dispose() {
        // Dispose scenes
        this.scenes.forEach((scene) => {
            scene.traverse((object) => {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });
        });

        // Clear collections
        this.scenes.clear();
        this.cameras.clear();

        // Dispose render targets
        this.renderTargetA.dispose();
        this.renderTargetB.dispose();

        // Dispose transition material
        this.transitionMaterial.dispose();
    }
} 