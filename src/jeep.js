import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export function createJeep() {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();

    loader.load(
          './poly.glb',
      (gltf) => {
        const jeep = gltf.scene;
        jeep.scale.set(0.5, 0.5, 0.5); // Adjust scale if needed

        // Apply a placeholder color to the jeep model
        jeep.traverse((child) => {
          if (child.isMesh) {
            child.material = new THREE.MeshBasicMaterial({ color: 0x808080 }); // gray color
          }
        });
        console.log('Jeep model loaded:', jeep);
        // TODO: Implement jeep physics and controls
        resolve(jeep);
      },
      (xhr) => {
        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
      },
      (error) => {
        console.error('An error happened', error);
        reject(error);
      }
    );
  });
}