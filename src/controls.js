import * as THREE from 'three';

export function setupControls(camera, jeep) {
  const keyboard = {};

  document.addEventListener('keydown', (event) => {
    keyboard[event.code] = true;
  });

  document.addEventListener('keyup', (event) => {
    keyboard[event.code] = false;
  });

  function update(deltaTime) {
    const speed = 5 * deltaTime; // Adjust speed as needed
    const rotationSpeed = 2 * deltaTime;

    if (keyboard['KeyS'] || keyboard['ArrowDown']) {
          jeep.position.z += speed; // Move forward
        }
        if (keyboard['KeyW'] || keyboard['ArrowUp']) {
          jeep.position.z -= speed; // Move backward
        }
    if (keyboard['KeyA'] || keyboard['ArrowLeft']) {
      jeep.rotation.y += rotationSpeed; // Rotate left
    }
    if (keyboard['KeyD'] || keyboard['ArrowRight']) {
      jeep.rotation.y -= rotationSpeed; // Rotate right
    }

    // Update camera position to follow the jeep
    const relativeCameraOffset = new THREE.Vector3(0, 3, 10);
    const cameraOffset = relativeCameraOffset.applyMatrix4(jeep.matrixWorld);
    camera.position.x = cameraOffset.x;
    camera.position.y = cameraOffset.y;
    camera.position.z = cameraOffset.z;
    camera.lookAt(jeep.position);
  }

  // TODO: Implement more advanced input handling and controls
  return { update };
}