import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import * as CANNON from 'cannon-es';

export class TerrainSystem {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.noise2D = createNoise2D();
        this.init();
    }

    init() {
        // Create terrain geometry
        const geometry = new THREE.PlaneGeometry(100, 100, 128, 128);
        
        // Generate height data
        const vertices = geometry.attributes.position.array;
        const heightData = [];
        
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i] / 25;
            const z = vertices[i + 2] / 25;
            const height = this.generateHeight(x, z);
            vertices[i + 1] = height;
            heightData.push(height);
        }
        
        geometry.computeVertexNormals();

        // Create material
        const material = new THREE.MeshStandardMaterial({
            color: 0x3b7d4e,
            roughness: 0.8,
            metalness: 0.2,
        });

        // Create mesh
        this.terrain = new THREE.Mesh(geometry, material);
        this.terrain.rotation.x = -Math.PI / 2;
        this.terrain.receiveShadow = true;
        
        this.scene.add(this.terrain);

        // Add physics
        const groundShape = new CANNON.Heightfield(heightData, {
            elementSize: 100 / 128
        });
        
        const groundBody = new CANNON.Body({ mass: 0 });
        groundBody.addShape(groundShape);
        groundBody.position.set(0, -1, 0);
        this.world.addBody(groundBody);
    }

    generateHeight(x, z) {
        let height = 0;
        
        // Layer multiple noise frequencies
        height += this.noise2D(x * 1.0, z * 1.0) * 5.0;
        height += this.noise2D(x * 2.0, z * 2.0) * 2.5;
        height += this.noise2D(x * 4.0, z * 4.0) * 1.25;
        
        return height;
    }

    update() {
        // Add any terrain update logic here
    }
}
