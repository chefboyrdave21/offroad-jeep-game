import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

export function setupCamera(camera, renderer) {
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;
  controls.minDistance = 5;
  controls.maxDistance = 20;
  controls.maxPolarAngle = Math.PI / 2;

  camera.position.set(0, 3, 10);
  controls.update();

  function update() {
    controls.update();
  }

  // TODO: Implement different camera views
  return { update };
}