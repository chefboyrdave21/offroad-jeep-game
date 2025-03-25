import * as THREE from 'three';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';

export function createTerrain(width = 100, height = 100, widthSegments = 50, heightSegments = 50) {
  // Create a plane geometry for the terrain
  const terrainGeometry = new THREE.PlaneGeometry(width, height, widthSegments, heightSegments);

  // Rotate the terrain to be horizontal
  terrainGeometry.rotateX(-Math.PI / 2);

  // Use ImprovedNoise (Perlin noise) for smoother terrain
  const perlin = new ImprovedNoise();
  const vertices = terrainGeometry.attributes.position.array;
  const seed = Math.random() * 100; // Use a random seed for variety

  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i] / width; // Normalize x to 0-1 range
    const y = vertices[i + 1] / height; // Normalize y to 0-1 range
    const z = perlin.noise(x * 5 + seed, y * 5 + seed, 0) * 10; // Scale and offset noise
    vertices[i + 2] = z;
  }

  // Update the geometry
  terrainGeometry.computeVertexNormals(); // Recompute normals for correct lighting
  terrainGeometry.attributes.position.needsUpdate = true;

  // Create a material for the terrain
  const terrainMaterial = new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide });

  // Create the terrain mesh
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.position.y = -5; // Lower the terrain
  terrain.scale.set(10, 10, 10); // Scale the terrain
  terrain.castShadow = true;
  // TODO: Implement terrain physics
  return terrain;
}