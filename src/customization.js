import * as THREE from 'three';

export class CustomizationSystem {
    constructor(vehicle) {
        this.vehicle = vehicle;

        // Customization categories
        this.categories = {
            BODY: 'body',
            ENGINE: 'engine',
            SUSPENSION: 'suspension',
            WHEELS: 'wheels',
            PAINT: 'paint',
            ACCESSORIES: 'accessories'
        };

        // Available parts and upgrades
        this.parts = {
            body: {
                'stock': { name: 'Stock Body', cost: 0, weight: 0, durability: 1.0 },
                'reinforced': { name: 'Reinforced Body', cost: 1000, weight: 100, durability: 1.5 },
                'lightweight': { name: 'Lightweight Body', cost: 1500, weight: -150, durability: 0.8 }
            },
            engine: {
                'stock': { name: 'Stock Engine', cost: 0, power: 1.0, efficiency: 1.0 },
                'turbo': { name: 'Turbo Engine', cost: 2000, power: 1.4, efficiency: 0.8 },
                'eco': { name: 'Eco Engine', cost: 1500, power: 0.9, efficiency: 1.3 }
            },
            suspension: {
                'stock': { name: 'Stock Suspension', cost: 0, height: 0, stiffness: 1.0 },
                'offroad': { name: 'Offroad Suspension', cost: 1200, height: 0.2, stiffness: 0.8 },
                'sport': { name: 'Sport Suspension', cost: 1500, height: -0.1, stiffness: 1.3 }
            },
            wheels: {
                'stock': { name: 'Stock Wheels', cost: 0, grip: 1.0, durability: 1.0 },
                'offroad': { name: 'Offroad Wheels', cost: 800, grip: 1.3, durability: 1.2 },
                'sport': { name: 'Sport Wheels', cost: 1000, grip: 1.4, durability: 0.8 }
            },
            paint: {
                'red': { name: 'Red Paint', cost: 200, color: 0xff0000 },
                'blue': { name: 'Blue Paint', cost: 200, color: 0x0000ff },
                'green': { name: 'Green Paint', cost: 200, color: 0x00ff00 },
                'black': { name: 'Black Paint', cost: 200, color: 0x000000 },
                'white': { name: 'White Paint', cost: 200, color: 0xffffff }
            },
            accessories: {
                'none': { name: 'No Accessories', cost: 0 },
                'lightbar': { name: 'Light Bar', cost: 300, power: 50 },
                'winch': { name: 'Winch Kit', cost: 500, strength: 1000 },
                'snorkel': { name: 'Snorkel', cost: 400, waterResistance: 1.5 }
            }
        };

        // Current configuration
        this.currentConfig = {
            body: 'stock',
            engine: 'stock',
            suspension: 'stock',
            wheels: 'stock',
            paint: 'red',
            accessories: 'none'
        };

        // Unlocked parts
        this.unlockedParts = {
            body: ['stock'],
            engine: ['stock'],
            suspension: ['stock'],
            wheels: ['stock'],
            paint: ['red'],
            accessories: ['none']
        };

        // Performance stats
        this.stats = {
            power: 0,
            weight: 0,
            handling: 0,
            durability: 0
        };

        this.initialize();
    }

    initialize() {
        this.updateVehicleStats();
        this.applyCustomization();
    }

    unlockPart(category, partId) {
        if (this.parts[category] && this.parts[category][partId]) {
            if (!this.unlockedParts[category].includes(partId)) {
                this.unlockedParts[category].push(partId);
                return true;
            }
        }
        return false;
    }

    setPart(category, partId) {
        if (!this.isPartUnlocked(category, partId)) {
            return false;
        }

        if (this.parts[category] && this.parts[category][partId]) {
            this.currentConfig[category] = partId;
            this.updateVehicleStats();
            this.applyCustomization();
            return true;
        }
        return false;
    }

    isPartUnlocked(category, partId) {
        return this.unlockedParts[category] && 
               this.unlockedParts[category].includes(partId);
    }

    getUnlockedParts(category) {
        return this.unlockedParts[category] || [];
    }

    getCurrentConfig() {
        return { ...this.currentConfig };
    }

    getPartInfo(category, partId) {
        return this.parts[category] && this.parts[category][partId] 
            ? { ...this.parts[category][partId] }
            : null;
    }

    calculateTotalCost() {
        let totalCost = 0;
        Object.entries(this.currentConfig).forEach(([category, partId]) => {
            const part = this.parts[category][partId];
            totalCost += part.cost || 0;
        });
        return totalCost;
    }

    updateVehicleStats() {
        // Reset stats
        this.stats = {
            power: 100,    // Base power
            weight: 1500,  // Base weight
            handling: 100, // Base handling
            durability: 100 // Base durability
        };

        // Apply modifications from parts
        Object.entries(this.currentConfig).forEach(([category, partId]) => {
            const part = this.parts[category][partId];
            
            switch(category) {
                case 'body':
                    this.stats.weight += part.weight || 0;
                    this.stats.durability *= part.durability || 1;
                    break;
                case 'engine':
                    this.stats.power *= part.power || 1;
                    break;
                case 'suspension':
                    this.stats.handling += (part.stiffness - 1) * 50;
                    break;
                case 'wheels':
                    this.stats.handling *= part.grip || 1;
                    break;
            }
        });

        // Normalize stats
        this.stats.power = Math.round(this.stats.power);
        this.stats.weight = Math.round(this.stats.weight);
        this.stats.handling = Math.round(this.stats.handling);
        this.stats.durability = Math.round(this.stats.durability);
    }

    applyCustomization() {
        // Apply body modifications
        this.applyBodyCustomization();

        // Apply engine modifications
        this.applyEngineCustomization();

        // Apply suspension modifications
        this.applySuspensionCustomization();

        // Apply wheel modifications
        this.applyWheelCustomization();

        // Apply paint
        this.applyPaintCustomization();

        // Apply accessories
        this.applyAccessoryCustomization();
    }

    applyBodyCustomization() {
        const bodyConfig = this.parts.body[this.currentConfig.body];
        
        // Update vehicle physics properties
        this.vehicle.chassis.mass = this.stats.weight;
        this.vehicle.damageMultiplier = 1 / bodyConfig.durability;

        // Update visual model if available
        if (this.vehicle.bodyMesh) {
            // Apply body-specific modifications
        }
    }

    applyEngineCustomization() {
        const engineConfig = this.parts.engine[this.currentConfig.engine];
        
        // Update vehicle engine properties
        this.vehicle.engineForceMultiplier = engineConfig.power;
        this.vehicle.fuelConsumptionMultiplier = 1 / engineConfig.efficiency;
    }

    applySuspensionCustomization() {
        const suspConfig = this.parts.suspension[this.currentConfig.suspension];
        
        // Update vehicle suspension properties
        this.vehicle.wheels.forEach(wheel => {
            wheel.suspensionStiffness *= suspConfig.stiffness;
            wheel.suspensionRestLength += suspConfig.height;
        });
    }

    applyWheelCustomization() {
        const wheelConfig = this.parts.wheels[this.currentConfig.wheels];
        
        // Update vehicle wheel properties
        this.vehicle.wheels.forEach(wheel => {
            wheel.frictionSlip *= wheelConfig.grip;
            wheel.damageMultiplier = 1 / wheelConfig.durability;
        });

        // Update wheel meshes if available
        if (this.vehicle.wheelMeshes) {
            // Apply wheel-specific modifications
        }
    }

    applyPaintCustomization() {
        const paintConfig = this.parts.paint[this.currentConfig.paint];
        
        // Update vehicle material color
        if (this.vehicle.bodyMesh) {
            this.vehicle.bodyMesh.material.color.setHex(paintConfig.color);
        }
    }

    applyAccessoryCustomization() {
        const accessoryConfig = this.parts.accessories[this.currentConfig.accessories];
        
        // Toggle visibility of accessory meshes
        Object.keys(this.parts.accessories).forEach(accessoryId => {
            const meshName = `accessory_${accessoryId}`;
            const mesh = this.vehicle.getObjectByName(meshName);
            if (mesh) {
                mesh.visible = (accessoryId === this.currentConfig.accessories);
            }
        });

        // Apply accessory-specific functionality
        switch(this.currentConfig.accessories) {
            case 'lightbar':
                this.vehicle.lightPower = accessoryConfig.power;
                break;
            case 'winch':
                this.vehicle.winchStrength = accessoryConfig.strength;
                break;
            case 'snorkel':
                this.vehicle.waterResistance = accessoryConfig.waterResistance;
                break;
        }
    }

    saveConfig() {
        return {
            config: this.currentConfig,
            stats: this.stats,
            unlocked: this.unlockedParts
        };
    }

    loadConfig(savedConfig) {
        if (!savedConfig) return false;

        this.currentConfig = { ...savedConfig.config };
        this.unlockedParts = { ...savedConfig.unlocked };
        this.updateVehicleStats();
        this.applyCustomization();
        return true;
    }

    resetToDefault() {
        Object.keys(this.currentConfig).forEach(category => {
            this.currentConfig[category] = 'stock';
        });
        this.updateVehicleStats();
        this.applyCustomization();
    }
} 