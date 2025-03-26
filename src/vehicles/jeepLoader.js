import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

// Import the GLB file as a URL
import jeepModel from '../../assets/models/vehicles/1999_jeep_wrangler_tj.glb?url';

export class JeepLoader {
    constructor(scene) {
        this.loader = new GLTFLoader();
        this.scene = scene;
    }

    async loadJeep() {
        return new Promise((resolve, reject) => {
            console.log('Attempting to load model from:', jeepModel);
            
            this.loader.load(
                jeepModel,
                (gltf) => {
                    const model = gltf.scene;
                    if (model) {
                        model.traverse((child) => {
                            if (child instanceof THREE.Mesh) {
                                child.castShadow = true;
                                child.receiveShadow = true;
                            }
                        });
                        console.log('Model loaded successfully');
                        resolve(model);
                    } else {
                        reject(new Error('Model loaded but scene is undefined'));
                    }
                },
                (progress) => {
                    console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
                },
                (error) => {
                    console.error('Error loading Jeep:', error);
                    reject(error);
                }
            );
        });
    }

    getModelPart(partName) {
        return this.modelParts.get(partName);
    }

    dispose() {
        this.modelParts.forEach(part => {
            part.traverse(child => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    child.material.dispose();
                }
            });
        });
    }
} 