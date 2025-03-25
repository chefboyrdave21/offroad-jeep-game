import * as THREE from 'three';
import { CustomizationSystem } from './customization.js';

export class GarageSystem {
    constructor(scene, physics) {
        this.scene = scene;
        this.physics = physics;

        // Garage settings
        this.settings = {
            maxVehicles: 10,
            previewHeight: 2,
            rotationSpeed: 0.5,
            cameraDistance: 8,
            lightIntensity: 1.0
        };

        // Vehicle data
        this.vehicles = {
            available: {
                'jeep_basic': {
                    name: 'Basic Jeep',
                    cost: 10000,
                    stats: {
                        speed: 120,
                        handling: 70,
                        offroad: 80,
                        durability: 75
                    },
                    modelPath: 'models/vehicles/jeep_basic.glb',
                    unlocked: true
                },
                'jeep_sport': {
                    name: 'Sport Jeep',
                    cost: 25000,
                    stats: {
                        speed: 150,
                        handling: 85,
                        offroad: 65,
                        durability: 60
                    },
                    modelPath: 'models/vehicles/jeep_sport.glb',
                    unlocked: false
                },
                'jeep_offroad': {
                    name: 'Offroad Jeep',
                    cost: 30000,
                    stats: {
                        speed: 100,
                        handling: 75,
                        offroad: 95,
                        durability: 90
                    },
                    modelPath: 'models/vehicles/jeep_offroad.glb',
                    unlocked: false
                }
            },
            owned: new Map()
        };

        // Garage state
        this.state = {
            isActive: false,
            selectedVehicle: null,
            previewVehicle: null,
            currentRotation: 0,
            funds: 50000
        };

        // Garage scene components
        this.components = {
            lights: [],
            platform: null,
            camera: null
        };

        this.initialize();
    }

    async initialize() {
        await this.setupGarageEnvironment();
        this.setupEventListeners();
    }

    async setupGarageEnvironment() {
        // Create garage platform
        const platformGeometry = new THREE.CylinderGeometry(5, 5, 0.2, 32);
        const platformMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333,
            metalness: 0.7,
            roughness: 0.3
        });
        this.components.platform = new THREE.Mesh(platformGeometry, platformMaterial);
        this.components.platform.receiveShadow = true;

        // Setup lighting
        this.setupLighting();

        // Setup camera
        this.setupCamera();
    }

    setupLighting() {
        // Main light
        const mainLight = new THREE.DirectionalLight(0xffffff, this.settings.lightIntensity);
        mainLight.position.set(5, 10, 5);
        mainLight.castShadow = true;
        this.components.lights.push(mainLight);

        // Fill lights
        const fillLight1 = new THREE.PointLight(0x4477bb, 0.5);
        fillLight1.position.set(-5, 3, -5);
        this.components.lights.push(fillLight1);

        const fillLight2 = new THREE.PointLight(0x44bb77, 0.5);
        fillLight2.position.set(5, 3, -5);
        this.components.lights.push(fillLight2);

        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x333333);
        this.components.lights.push(ambientLight);
    }

    setupCamera() {
        this.components.camera = new THREE.PerspectiveCamera(
            45,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.updateCameraPosition();
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.handleResize());
    }

    async enterGarage() {
        if (this.state.isActive) return;

        this.state.isActive = true;
        
        // Add garage components to scene
        this.components.lights.forEach(light => this.scene.add(light));
        this.scene.add(this.components.platform);

        // Load owned vehicles
        await this.loadOwnedVehicles();

        // Select first vehicle if none selected
        if (!this.state.selectedVehicle && this.vehicles.owned.size > 0) {
            this.selectVehicle(Array.from(this.vehicles.owned.keys())[0]);
        }
    }

    exitGarage() {
        if (!this.state.isActive) return;

        this.state.isActive = false;
        
        // Remove garage components from scene
        this.components.lights.forEach(light => this.scene.remove(light));
        this.scene.remove(this.components.platform);

        // Clear preview vehicle
        this.clearPreviewVehicle();
    }

    async loadOwnedVehicles() {
        const loader = new THREE.GLTFLoader();

        for (const [vehicleId, vehicleData] of this.vehicles.owned) {
            try {
                const gltf = await loader.loadAsync(vehicleData.modelPath);
                vehicleData.model = gltf.scene;
            } catch (error) {
                console.error(`Error loading vehicle model: ${vehicleId}`, error);
            }
        }
    }

    async selectVehicle(vehicleId) {
        if (!this.vehicles.owned.has(vehicleId)) return;

        this.state.selectedVehicle = vehicleId;
        await this.updatePreviewVehicle();
    }

    async updatePreviewVehicle() {
        this.clearPreviewVehicle();

        if (!this.state.selectedVehicle) return;

        const vehicleData = this.vehicles.owned.get(this.state.selectedVehicle);
        if (!vehicleData || !vehicleData.model) return;

        // Create preview vehicle
        this.state.previewVehicle = vehicleData.model.clone();
        this.state.previewVehicle.position.y = this.settings.previewHeight;
        this.state.currentRotation = 0;

        // Add to scene
        this.scene.add(this.state.previewVehicle);
    }

    clearPreviewVehicle() {
        if (this.state.previewVehicle) {
            this.scene.remove(this.state.previewVehicle);
            this.state.previewVehicle = null;
        }
    }

    updateCameraPosition() {
        if (!this.components.camera) return;

        const angle = this.state.currentRotation;
        this.components.camera.position.x = Math.sin(angle) * this.settings.cameraDistance;
        this.components.camera.position.z = Math.cos(angle) * this.settings.cameraDistance;
        this.components.camera.position.y = this.settings.previewHeight + 2;
        this.components.camera.lookAt(0, this.settings.previewHeight, 0);
    }

    rotatePreview(deltaTime) {
        if (!this.state.previewVehicle) return;

        this.state.currentRotation += this.settings.rotationSpeed * deltaTime;
        this.state.previewVehicle.rotation.y = this.state.currentRotation;
        this.updateCameraPosition();
    }

    purchaseVehicle(vehicleId) {
        const vehicle = this.vehicles.available[vehicleId];
        if (!vehicle || vehicle.unlocked || vehicle.cost > this.state.funds) {
            return false;
        }

        // Deduct funds
        this.state.funds -= vehicle.cost;

        // Add to owned vehicles
        this.vehicles.owned.set(vehicleId, {
            ...vehicle,
            purchaseDate: new Date().toISOString(),
            customization: {},
            stats: { ...vehicle.stats }
        });

        // Mark as unlocked
        vehicle.unlocked = true;

        return true;
    }

    sellVehicle(vehicleId) {
        if (!this.vehicles.owned.has(vehicleId)) return false;

        const vehicle = this.vehicles.owned.get(vehicleId);
        const sellPrice = Math.floor(vehicle.cost * 0.7); // 70% of original price

        // Add funds
        this.state.funds += sellPrice;

        // Remove from owned vehicles
        this.vehicles.owned.delete(vehicleId);

        // Clear selection if needed
        if (this.state.selectedVehicle === vehicleId) {
            this.state.selectedVehicle = null;
            this.clearPreviewVehicle();
        }

        return true;
    }

    getVehicleInfo(vehicleId) {
        return this.vehicles.available[vehicleId] || null;
    }

    getOwnedVehicles() {
        return Array.from(this.vehicles.owned.entries()).map(([id, data]) => ({
            id,
            name: data.name,
            stats: data.stats,
            purchaseDate: data.purchaseDate
        }));
    }

    getFunds() {
        return this.state.funds;
    }

    addFunds(amount) {
        this.state.funds += amount;
    }

    update(deltaTime) {
        if (!this.state.isActive) return;

        // Update preview rotation
        this.rotatePreview(deltaTime);
    }

    handleResize() {
        if (!this.components.camera) return;

        this.components.camera.aspect = window.innerWidth / window.innerHeight;
        this.components.camera.updateProjectionMatrix();
    }

    saveGarageState() {
        return {
            funds: this.state.funds,
            vehicles: {
                owned: Array.from(this.vehicles.owned.entries()),
                available: Object.entries(this.vehicles.available)
                    .map(([id, data]) => [id, { unlocked: data.unlocked }])
            }
        };
    }

    loadGarageState(state) {
        if (!state) return false;

        this.state.funds = state.funds;

        // Load owned vehicles
        this.vehicles.owned.clear();
        state.vehicles.owned.forEach(([id, data]) => {
            this.vehicles.owned.set(id, data);
        });

        // Update available vehicles
        state.vehicles.available.forEach(([id, data]) => {
            if (this.vehicles.available[id]) {
                this.vehicles.available[id].unlocked = data.unlocked;
            }
        });

        return true;
    }

    dispose() {
        // Clean up resources
        this.components.lights.forEach(light => {
            if (light.dispose) light.dispose();
        });

        if (this.components.platform) {
            this.components.platform.geometry.dispose();
            this.components.platform.material.dispose();
        }

        this.vehicles.owned.forEach(vehicle => {
            if (vehicle.model) {
                vehicle.model.traverse(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
            }
        });

        this.clearPreviewVehicle();
    }
} 