import * as THREE from 'three';
import { createJeep } from './jeep.js';
import { createTerrain } from './terrain.js';
import { setupControls } from './controls.js';
import { setupCamera } from './camera.js';

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('gameCanvas');
  if (canvas) {
    // Initialize Three.js renderer
    const renderer = new THREE.WebGLRenderer({ canvas });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor('lightblue');

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('lightblue'); // Set scene background color

    // Add ambient lighting
    const ambientLight = new THREE.AmbientLight(0x404040); // soft white light
    scene.add(ambientLight);

    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

  // Create camera
   const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 2000);

   // Create terrain
    const terrain = createTerrain(200, 200, 100, 100); // Increased size and segments
    scene.add(terrain);

    // Set up camera
    const controls = setupCamera(camera, renderer);

    // Position camera
    camera.position.set(0, 5, 10);
    camera.lookAt(terrain.position);

    // Set up controls

    createJeep().then(jeep => {
      scene.add(jeep);
      const jeepControls = setupControls(camera, jeep);

      // Handle window resize
      function handleResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      }
      window.addEventListener('resize', handleResize);

      // Render the scene
      function animate() {
        requestAnimationFrame(animate);
        jeepControls.update(0.02); // Update controls
        renderer.render(scene, camera);
        console.log('Scene rendered:', scene); // Log scene for debugging
      }
      animate();

      console.log('Three.js scene initialized and rendering.'); // Confirmation log
    });
  } else {
    console.error('Canvas element with id "gameCanvas" not found.');
  }
  // TODO: Implement UI
});