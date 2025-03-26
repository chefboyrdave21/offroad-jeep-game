import { EventEmitter } from 'events';
import * as THREE from 'three';

export class VehicleInventorySystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            storageAreas: {
                trunk: {
                    capacity: 200, // liters
                    maxWeight: 100, // kg
                    dimensions: new THREE.Vector3(1, 0.5, 0.8), // meters
                    position: new THREE.Vector3(0, 0.5, -2),
                    access: ['rear']
                },
                roofRack: {
                    capacity: 150,
                    maxWeight: 50,
                    dimensions: new THREE.Vector3(1.5, 0.2, 1),
                    position: new THREE.Vector3(0, 2.1, 0),
                    access: ['sides', 'rear'],
                    requiresRack: true
                },
                toolBox: {
                    capacity: 50,
                    maxWeight: 30,
                    dimensions: new THREE.Vector3(0.6, 0.3, 0.4),
                    position: new THREE.Vector3(1.2, 0.8, 0),
                    access: ['sides']
                }
            },
            items: {
                recoveryGear: {
                    winchCable: {
                        weight: 8,
                        volume: 10,
                        model: 'models/items/winch_cable.glb',
                        durability: 100,
                        uses: -1, // infinite
                        category: 'recovery'
                    },
                    towStrap: {
                        weight: 3,
                        volume: 5,
                        model: 'models/items/tow_strap.glb',
                        durability: 100,
                        uses: 50,
                        category: 'recovery'
                    },
                    shovel: {
                        weight: 2,
                        volume: 4,
                        model: 'models/items/shovel.glb',
                        durability: 100,
                        uses: -1,
                        category: 'recovery'
                    }
                },
                tools: {
                    jackStand: {
                        weight: 15,
                        volume: 20,
                        model: 'models/items/jack_stand.glb',
                        durability: 100,
                        uses: -1,
                        category: 'maintenance'
                    },
                    toolSet: {
                        weight: 10,
                        volume: 15,
                        model: 'models/items/tool_set.glb',
                        durability: 100,
                        uses: -1,
                        category: 'maintenance'
                    },
                    tirePump: {
                        weight: 3,
                        volume: 6,
                        model: 'models/items/tire_pump.glb',
                        durability: 100,
                        uses: -1,
                        category: 'maintenance'
                    }
                },
                supplies: {
                    fuelCan: {
                        weight: 15, // when full
                        volume: 20,
                        model: 'models/items/fuel_can.glb',
                        durability: 100,
                        uses: 1,
                        category: 'consumable',
                        contents: 20 // liters
                    },
                    waterJug: {
                        weight: 10,
                        volume: 10,
                        model: 'models/items/water_jug.glb',
                        durability: 100,
                        uses: 10,
                        category: 'consumable',
                        contents: 10
                    },
                    firstAidKit: {
                        weight: 2,
                        volume: 4,
                        model: 'models/items/first_aid.glb',
                        durability: 100,
                        uses: 5,
                        category: 'emergency'
                    }
                }
            }
        };

        this.state = {
            storage: new Map(),
            equippedItems: new Map(),
            loadedModels: new Map(),
            activeAnimations: new Set(),
            totalWeight: 0,
            accessibleAreas: new Set()
        };

        this.initialize();
    }

    async initialize() {
        this.setupStorageAreas();
        await this.loadDefaultModels();
        this.setupEventListeners();
        this.updateAccessibleAreas();
    }

    setupStorageAreas() {
        Object.entries(this.settings.storageAreas).forEach(([name, config]) => {
            this.state.storage.set(name, {
                items: new Map(),
                currentWeight: 0,
                currentVolume: 0,
                config
            });
        });
    }

    async loadDefaultModels() {
        const modelLoader = new THREE.GLTFLoader();
        const modelPromises = [];

        // Load all item models
        Object.values(this.settings.items).forEach(category => {
            Object.values(category).forEach(item => {
                if (!this.state.loadedModels.has(item.model)) {
                    modelPromises.push(
                        this.loadModel(item.model)
                            .then(model => this.state.loadedModels.set(item.model, model))
                    );
                }
            });
        });

        await Promise.all(modelPromises);
    }

    async loadModel(path) {
        return new Promise((resolve, reject) => {
            new THREE.GLTFLoader().load(
                path,
                gltf => resolve(gltf.scene),
                undefined,
                error => reject(error)
            );
        });
    }

    setupEventListeners() {
        this.vehicle.on('doorOpen', this.handleDoorState.bind(this));
        this.vehicle.on('doorClose', this.handleDoorState.bind(this));
        this.vehicle.on('update', this.update.bind(this));
        this.vehicle.on('collision', this.handleCollision.bind(this));
    }

    updateAccessibleAreas() {
        this.state.accessibleAreas.clear();
        
        // Check which storage areas are accessible based on door states
        Object.entries(this.settings.storageAreas).forEach(([name, config]) => {
            const isAccessible = config.access.some(side => 
                this.vehicle.isDoorOpen(side)
            );
            if (isAccessible) {
                this.state.accessibleAreas.add(name);
            }
        });

        this.emit('accessibilityChanged', Array.from(this.state.accessibleAreas));
    }

    addItem(itemType, category, storageArea, quantity = 1) {
        // Validate item exists
        const itemConfig = this.settings.items[category]?.[itemType];
        if (!itemConfig) {
            this.emit('error', `Invalid item: ${itemType}`);
            return false;
        }

        // Validate storage area
        const storage = this.state.storage.get(storageArea);
        if (!storage) {
            this.emit('error', `Invalid storage area: ${storageArea}`);
            return false;
        }

        // Check if storage area is accessible
        if (!this.state.accessibleAreas.has(storageArea)) {
            this.emit('error', `Storage area not accessible: ${storageArea}`);
            return false;
        }

        // Check capacity
        const totalVolume = itemConfig.volume * quantity;
        const totalWeight = itemConfig.weight * quantity;

        if (storage.currentVolume + totalVolume > storage.config.capacity) {
            this.emit('error', 'Not enough space');
            return false;
        }

        if (storage.currentWeight + totalWeight > storage.config.maxWeight) {
            this.emit('error', 'Too heavy');
            return false;
        }

        // Add item(s)
        const existingItem = storage.items.get(itemType);
        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            storage.items.set(itemType, {
                config: itemConfig,
                quantity,
                durability: itemConfig.durability,
                contents: itemConfig.contents
            });
        }

        // Update storage stats
        storage.currentVolume += totalVolume;
        storage.currentWeight += totalWeight;
        this.state.totalWeight += totalWeight;

        // Create visual representation
        this.createItemVisual(itemType, storageArea);

        this.emit('itemAdded', {
            type: itemType,
            category,
            quantity,
            storageArea
        });

        return true;
    }

    removeItem(itemType, storageArea, quantity = 1) {
        const storage = this.state.storage.get(storageArea);
        if (!storage) return false;

        const item = storage.items.get(itemType);
        if (!item || item.quantity < quantity) return false;

        // Check accessibility
        if (!this.state.accessibleAreas.has(storageArea)) {
            this.emit('error', `Storage area not accessible: ${storageArea}`);
            return false;
        }

        // Update item quantity
        item.quantity -= quantity;
        const itemConfig = item.config;

        // Update storage stats
        const volumeReduction = itemConfig.volume * quantity;
        const weightReduction = itemConfig.weight * quantity;
        storage.currentVolume -= volumeReduction;
        storage.currentWeight -= weightReduction;
        this.state.totalWeight -= weightReduction;

        // Remove item if quantity is 0
        if (item.quantity <= 0) {
            storage.items.delete(itemType);
            this.removeItemVisual(itemType, storageArea);
        }

        this.emit('itemRemoved', {
            type: itemType,
            quantity,
            storageArea
        });

        return true;
    }

    useItem(itemType, storageArea) {
        const storage = this.state.storage.get(storageArea);
        if (!storage) return false;

        const item = storage.items.get(itemType);
        if (!item) return false;

        // Check if item has uses left
        if (item.config.uses === 0) {
            this.emit('error', 'Item depleted');
            return false;
        }

        // Use item
        if (item.config.uses > 0) {
            item.config.uses--;
        }

        // Reduce durability
        item.durability = Math.max(0, item.durability - 10);

        // Handle consumables
        if (item.config.category === 'consumable' && item.contents) {
            item.contents = Math.max(0, item.contents - 1);
            if (item.contents === 0) {
                this.removeItem(itemType, storageArea, 1);
            }
        }

        this.emit('itemUsed', {
            type: itemType,
            storageArea,
            durability: item.durability,
            uses: item.config.uses,
            contents: item.contents
        });

        return true;
    }

    transferItem(itemType, fromArea, toArea, quantity = 1) {
        // Check if both areas are accessible
        if (!this.state.accessibleAreas.has(fromArea) || 
            !this.state.accessibleAreas.has(toArea)) {
            this.emit('error', 'One or both storage areas not accessible');
            return false;
        }

        // Remove from source
        if (this.removeItem(itemType, fromArea, quantity)) {
            // Add to destination
            if (this.addItem(itemType, this.getItemCategory(itemType), toArea, quantity)) {
                return true;
            } else {
                // Revert removal if addition fails
                this.addItem(itemType, this.getItemCategory(itemType), fromArea, quantity);
            }
        }

        return false;
    }

    getItemCategory(itemType) {
        for (const [category, items] of Object.entries(this.settings.items)) {
            if (items[itemType]) return category;
        }
        return null;
    }

    createItemVisual(itemType, storageArea) {
        const storage = this.state.storage.get(storageArea);
        const item = storage.items.get(itemType);
        if (!item || !this.state.loadedModels.has(item.config.model)) return;

        const model = this.state.loadedModels.get(item.config.model).clone();
        const storageConfig = storage.config;

        // Position within storage area
        model.position.copy(storageConfig.position);
        
        // Add to vehicle's visual hierarchy
        this.vehicle.addToStorage(storageArea, model);

        // Animate appearance
        this.animateItemVisual(model, 'add');
    }

    removeItemVisual(itemType, storageArea) {
        const model = this.vehicle.getStorageItem(storageArea, itemType);
        if (model) {
            this.animateItemVisual(model, 'remove', () => {
                this.vehicle.removeFromStorage(storageArea, itemType);
            });
        }
    }

    animateItemVisual(model, type, callback) {
        const animation = {
            object: model,
            type,
            startTime: performance.now(),
            duration: 300,
            callback
        };

        this.state.activeAnimations.add(animation);
    }

    handleDoorState(door, isOpen) {
        this.updateAccessibleAreas();
    }

    handleCollision(data) {
        // Check for damage to items based on collision force
        if (data.force > 20) {
            this.state.storage.forEach((storage, areaName) => {
                storage.items.forEach((item, itemType) => {
                    // Reduce durability based on collision force
                    const damage = Math.floor(data.force / 10);
                    item.durability = Math.max(0, item.durability - damage);

                    if (item.durability === 0) {
                        this.emit('itemDamaged', {
                            type: itemType,
                            storageArea: areaName,
                            destroyed: true
                        });
                    }
                });
            });
        }
    }

    update(deltaTime) {
        // Update animations
        this.state.activeAnimations.forEach(animation => {
            const progress = (performance.now() - animation.startTime) / animation.duration;
            
            if (progress >= 1) {
                this.state.activeAnimations.delete(animation);
                if (animation.callback) animation.callback();
                return;
            }

            switch (animation.type) {
                case 'add':
                    animation.object.scale.setScalar(progress);
                    break;
                case 'remove':
                    animation.object.scale.setScalar(1 - progress);
                    break;
            }
        });

        // Update physics weight distribution
        this.updateWeightDistribution();
    }

    updateWeightDistribution() {
        const weightDistribution = new THREE.Vector3();

        this.state.storage.forEach((storage, areaName) => {
            if (storage.currentWeight > 0) {
                weightDistribution.add(
                    storage.config.position.clone()
                        .multiplyScalar(storage.currentWeight)
                );
            }
        });

        weightDistribution.divideScalar(this.state.totalWeight || 1);
        this.vehicle.physics.updateCenterOfMass(weightDistribution);
    }

    getInventoryStatus() {
        const status = {};
        
        this.state.storage.forEach((storage, areaName) => {
            status[areaName] = {
                items: Array.from(storage.items.entries()).map(([type, item]) => ({
                    type,
                    quantity: item.quantity,
                    durability: item.durability,
                    uses: item.config.uses,
                    contents: item.contents
                })),
                capacity: {
                    volume: {
                        current: storage.currentVolume,
                        max: storage.config.capacity
                    },
                    weight: {
                        current: storage.currentWeight,
                        max: storage.config.maxWeight
                    }
                },
                accessible: this.state.accessibleAreas.has(areaName)
            };
        });

        return status;
    }

    dispose() {
        // Clean up models
        this.state.loadedModels.forEach(model => {
            model.traverse(child => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    child.material.dispose();
                }
            });
        });

        // Clear states
        this.state.storage.clear();
        this.state.loadedModels.clear();
        this.state.activeAnimations.clear();
        this.state.accessibleAreas.clear();

        // Remove listeners
        this.removeAllListeners();
    }
} 