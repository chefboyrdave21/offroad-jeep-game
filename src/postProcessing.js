import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { TAARenderPass } from 'three/examples/jsm/postprocessing/TAARenderPass.js';

export class PostProcessingSystem {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;

        // Initialize composer
        this.composer = new EffectComposer(renderer);
        
        // Setup passes
        this.passes = {
            render: new RenderPass(scene, camera),
            bloom: new UnrealBloomPass(
                new THREE.Vector2(window.innerWidth, window.innerHeight),
                1.5, 0.4, 0.85
            ),
            ssao: new SSAOPass(scene, camera, window.innerWidth, window.innerHeight),
            taa: new TAARenderPass(scene, camera)
        };

        // Configure passes
        this.setupPasses();
        
        // Effect settings
        this.settings = {
            bloom: {
                enabled: true,
                strength: 1.5,
                radius: 0.4,
                threshold: 0.85
            },
            ssao: {
                enabled: true,
                radius: 16,
                intensity: 1.0,
                bias: 0.5
            },
            taa: {
                enabled: true,
                sampleLevel: 2
            }
        };
    }

    setupPasses() {
        // Add base render pass
        this.composer.addPass(this.passes.render);

        // Configure SSAO
        this.passes.ssao.kernelRadius = 16;
        this.passes.ssao.minDistance = 0.005;
        this.passes.ssao.maxDistance = 0.1;
        this.composer.addPass(this.passes.ssao);

        // Configure TAA
        this.passes.taa.sampleLevel = 2;
        this.composer.addPass(this.passes.taa);

        // Configure Bloom
        this.composer.addPass(this.passes.bloom);

        // Ensure only last pass renders to screen
        this.updatePassStates();
    }

    updatePassStates() {
        const passes = this.composer.passes;
        passes.forEach((pass, index) => {
            pass.renderToScreen = (index === passes.length - 1);
        });
    }

    setBloomSettings(settings) {
        const bloom = this.passes.bloom;
        bloom.strength = settings.strength ?? this.settings.bloom.strength;
        bloom.radius = settings.radius ?? this.settings.bloom.radius;
        bloom.threshold = settings.threshold ?? this.settings.bloom.threshold;
        this.settings.bloom = { ...this.settings.bloom, ...settings };
    }

    setSSAOSettings(settings) {
        const ssao = this.passes.ssao;
        ssao.kernelRadius = settings.radius ?? this.settings.ssao.radius;
        ssao.minDistance = settings.minDistance ?? 0.005;
        ssao.maxDistance = settings.maxDistance ?? 0.1;
        ssao.intensity = settings.intensity ?? this.settings.ssao.intensity;
        this.settings.ssao = { ...this.settings.ssao, ...settings };
    }

    setTAASettings(settings) {
        const taa = this.passes.taa;
        taa.sampleLevel = settings.sampleLevel ?? this.settings.taa.sampleLevel;
        this.settings.taa = { ...this.settings.taa, ...settings };
    }

    toggleEffect(effect, enabled) {
        if (this.settings[effect]) {
            this.settings[effect].enabled = enabled;
            
            switch(effect) {
                case 'bloom':
                    this.passes.bloom.enabled = enabled;
                    break;
                case 'ssao':
                    this.passes.ssao.enabled = enabled;
                    break;
                case 'taa':
                    this.passes.taa.enabled = enabled;
                    break;
            }
        }
    }

    handleResize(width, height) {
        this.composer.setSize(width, height);
        
        // Update individual passes
        this.passes.bloom.setSize(width, height);
        this.passes.ssao.setSize(width, height);
        this.passes.taa.setSize(width, height);
    }

    update(deltaTime) {
        // Update any time-based effects here
        if (this.settings.taa.enabled) {
            this.passes.taa.accumulate = true;
        }
        
        // Render the frame
        this.composer.render(deltaTime);
    }

    getSettings() {
        return { ...this.settings };
    }

    setQualityPreset(preset) {
        switch(preset) {
            case 'low':
                this.setLowQuality();
                break;
            case 'medium':
                this.setMediumQuality();
                break;
            case 'high':
                this.setHighQuality();
                break;
            case 'ultra':
                this.setUltraQuality();
                break;
        }
    }

    setLowQuality() {
        this.toggleEffect('bloom', false);
        this.toggleEffect('ssao', false);
        this.toggleEffect('taa', true);
        this.setTAASettings({ sampleLevel: 1 });
    }

    setMediumQuality() {
        this.toggleEffect('bloom', true);
        this.toggleEffect('ssao', false);
        this.toggleEffect('taa', true);
        this.setBloomSettings({ strength: 1.0, radius: 0.3, threshold: 0.9 });
        this.setTAASettings({ sampleLevel: 2 });
    }

    setHighQuality() {
        this.toggleEffect('bloom', true);
        this.toggleEffect('ssao', true);
        this.toggleEffect('taa', true);
        this.setBloomSettings({ strength: 1.5, radius: 0.4, threshold: 0.85 });
        this.setSSAOSettings({ radius: 16, intensity: 1.0 });
        this.setTAASettings({ sampleLevel: 3 });
    }

    setUltraQuality() {
        this.toggleEffect('bloom', true);
        this.toggleEffect('ssao', true);
        this.toggleEffect('taa', true);
        this.setBloomSettings({ strength: 2.0, radius: 0.5, threshold: 0.8 });
        this.setSSAOSettings({ radius: 32, intensity: 1.5 });
        this.setTAASettings({ sampleLevel: 4 });
    }
} 