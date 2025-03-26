import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { TerrainSystem } from './terrain.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VehiclePhysics } from './physics/vehiclePhysics.js';
import { VehicleControls } from './controls/vehicleControls.js';

class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        
        // Physics world
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0);
        
        this.init();
    }

    init() {
        // Scene setup
        this.scene.background = new THREE.Color(0x87ceeb);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        // Camera setup
        this.camera.position.set(0, 5, 10);

        // Controls setup
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.vehicleControls = new VehicleControls();

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 5, 5);
        directionalLight.castShadow = true;
        this.scene.add(ambientLight, directionalLight);

        // Terrain
        this.terrain = new TerrainSystem(this.scene, this.world);

        // Vehicle physics
        this.vehiclePhysics = new VehiclePhysics(this.world);

        // Load Jeep model
        this.loadJeep();

        // Animation loop
        this.animate();

      // Handle window resize
        window.addEventListener('resize', () => this.onResize());
    }

    loadJeep() {
        const loader = new GLTFLoader();
        loader.load(
            '/models/1999_jeep_wrangler_tj.glb',
            (gltf) => {
                console.log('Jeep model loaded successfully!');
                this.jeepModel = gltf.scene;
                
                // Enable shadows
                this.jeepModel.traverse((node) => {
                    if (node.isMesh) {
                        node.castShadow = true;
                        node.receiveShadow = true;
                    }
                });
                
                this.scene.add(this.jeepModel);
            },
            (progress) => {
                const percent = (progress.loaded / progress.total * 100);
                console.log(`Loading progress: ${percent.toFixed(2)}%`);
            },
            (error) => {
                console.error('Error loading Jeep model:', error);
            }
        );
    }

    updateVehicle() {
        if (this.jeepModel) {
            // Get physics body position and rotation
            const position = this.vehiclePhysics.getChassisWorldPosition();
            const quaternion = this.vehiclePhysics.getChassisWorldQuaternion();

            // Update model position and rotation
            this.jeepModel.position.copy(position);
            this.jeepModel.quaternion.copy(quaternion);

            // Update camera to follow vehicle
            const cameraOffset = new THREE.Vector3(0, 3, -7);
            cameraOffset.applyQuaternion(this.jeepModel.quaternion);
            this.camera.position.copy(this.jeepModel.position).add(cameraOffset);
            this.camera.lookAt(this.jeepModel.position);
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Update physics
        const deltaTime = 1/60;
        this.world.step(deltaTime);

        // Update vehicle controls and physics
        const controlsState = this.vehicleControls.update();
        this.vehiclePhysics.update(controlsState);

        // Update vehicle model
        this.updateVehicle();

        // Render
        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// Start the game when the page loads
window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
