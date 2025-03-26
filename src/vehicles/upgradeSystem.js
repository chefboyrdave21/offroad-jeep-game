import { EventEmitter } from 'events';

export class VehicleUpgradeSystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            categories: {
                engine: {
                    name: "Engine",
                    maxLevel: 5,
                    upgrades: {
                        power: {
                            name: "Power Output",
                            baseValue: 100, // HP
                            incrementPerLevel: 50,
                            costs: [1000, 2500, 5000, 10000, 20000]
                        },
                        torque: {
                            name: "Torque",
                            baseValue: 200, // Nm
                            incrementPerLevel: 75,
                            costs: [1200, 3000, 6000, 12000, 24000]
                        },
                        reliability: {
                            name: "Reliability",
                            baseValue: 100,
                            incrementPerLevel: 20,
                            costs: [800, 2000, 4000, 8000, 16000]
                        }
                    }
                },
                transmission: {
                    name: "Transmission",
                    maxLevel: 4,
                    upgrades: {
                        shiftSpeed: {
                            name: "Shift Speed",
                            baseValue: 0.5, // seconds
                            incrementPerLevel: -0.1,
                            costs: [1500, 3500, 7000, 14000]
                        },
                        gearRatios: {
                            name: "Gear Ratios",
                            baseValue: 1.0,
                            incrementPerLevel: 0.15,
                            costs: [2000, 4500, 9000, 18000]
                        }
                    }
                },
                suspension: {
                    name: "Suspension",
                    maxLevel: 4,
                    upgrades: {
                        travel: {
                            name: "Suspension Travel",
                            baseValue: 200, // mm
                            incrementPerLevel: 50,
                            costs: [1200, 3000, 6000, 12000]
                        },
                        stiffness: {
                            name: "Spring Stiffness",
                            baseValue: 1.0,
                            incrementPerLevel: 0.25,
                            costs: [1000, 2500, 5000, 10000]
                        },
                        damping: {
                            name: "Damping",
                            baseValue: 1.0,
                            incrementPerLevel: 0.2,
                            costs: [1100, 2750, 5500, 11000]
                        }
                    }
                },
                tires: {
                    name: "Tires",
                    maxLevel: 3,
                    upgrades: {
                        grip: {
                            name: "Tire Grip",
                            baseValue: 1.0,
                            incrementPerLevel: 0.3,
                            costs: [1500, 3500, 7000]
                        },
                        durability: {
                            name: "Tire Durability",
                            baseValue: 100,
                            incrementPerLevel: 25,
                            costs: [1200, 3000, 6000]
                        }
                    }
                },
                aerodynamics: {
                    name: "Aerodynamics",
                    maxLevel: 3,
                    upgrades: {
                        downforce: {
                            name: "Downforce",
                            baseValue: 0,
                            incrementPerLevel: 100, // Newtons
                            costs: [2000, 4500, 9000]
                        },
                        dragReduction: {
                            name: "Drag Reduction",
                            baseValue: 1.0,
                            incrementPerLevel: -0.15,
                            costs: [1800, 4000, 8000]
                        }
                    }
                },
                weight: {
                    name: "Weight Reduction",
                    maxLevel: 3,
                    upgrades: {
                        reduction: {
                            name: "Weight Reduction",
                            baseValue: 0,
                            incrementPerLevel: 50, // kg
                            costs: [2500, 5500, 11000]
                        }
                    }
                }
            },
            visual: {
                paintJobs: {
                    name: "Paint Jobs",
                    options: [
                        { id: 'stock', name: 'Stock', cost: 0 },
                        { id: 'metallic', name: 'Metallic', cost: 1000 },
                        { id: 'matte', name: 'Matte', cost: 1500 },
                        { id: 'chrome', name: 'Chrome', cost: 3000 },
                        { id: 'camo', name: 'Camouflage', cost: 2000 }
                    ]
                },
                decals: {
                    name: "Decals",
                    options: [
                        { id: 'racing_stripes', name: 'Racing Stripes', cost: 500 },
                        { id: 'flames', name: 'Flames', cost: 750 },
                        { id: 'tribal', name: 'Tribal', cost: 600 },
                        { id: 'numbers', name: 'Racing Numbers', cost: 300 }
                    ]
                },
                wheels: {
                    name: "Wheels",
                    options: [
                        { id: 'stock', name: 'Stock', cost: 0 },
                        { id: 'offroad', name: 'Off-road', cost: 2000 },
                        { id: 'sport', name: 'Sport', cost: 2500 },
                        { id: 'luxury', name: 'Luxury', cost: 3000 }
                    ]
                }
            }
        };

        this.state = {
            upgrades: new Map(),
            visualCustomization: {
                paintJob: 'stock',
                decals: [],
                wheels: 'stock'
            },
            currency: 0,
            experience: 0,
            level: 1
        };

        this.requirements = {
            levelRequirements: {
                engine: { power: [1, 2, 3, 4, 5], torque: [1, 2, 3, 4, 5] },
                transmission: { shiftSpeed: [2, 3, 4, 5], gearRatios: [2, 3, 4, 5] },
                suspension: { travel: [1, 2, 3, 4], stiffness: [1, 2, 3, 4] },
                tires: { grip: [1, 2, 3], durability: [1, 2, 3] },
                aerodynamics: { downforce: [2, 3, 4], dragReduction: [2, 3, 4] },
                weight: { reduction: [3, 4, 5] }
            }
        };

        this.initialize();
    }

    initialize() {
        this.initializeUpgradeState();
        this.setupEventListeners();
        this.loadSavedState();
    }

    initializeUpgradeState() {
        // Initialize all upgrades to level 0
        Object.entries(this.settings.categories).forEach(([category, categoryData]) => {
            Object.keys(categoryData.upgrades).forEach(upgrade => {
                this.state.upgrades.set(`${category}.${upgrade}`, {
                    level: 0,
                    value: categoryData.upgrades[upgrade].baseValue
                });
            });
        });
    }

    setupEventListeners() {
        this.vehicle.on('experienceGained', this.handleExperienceGain.bind(this));
        this.vehicle.on('currencyGained', this.handleCurrencyGain.bind(this));
    }

    loadSavedState() {
        const savedState = localStorage.getItem('vehicleUpgrades');
        if (savedState) {
            const parsed = JSON.parse(savedState);
            this.state = {
                ...this.state,
                ...parsed,
                upgrades: new Map(Object.entries(parsed.upgrades))
            };
            this.applyAllUpgrades();
        }
    }

    saveState() {
        const saveData = {
            ...this.state,
            upgrades: Object.fromEntries(this.state.upgrades)
        };
        localStorage.setItem('vehicleUpgrades', JSON.stringify(saveData));
    }

    canUpgrade(category, upgrade) {
        const currentLevel = this.getUpgradeLevel(category, upgrade);
        const maxLevel = this.settings.categories[category].maxLevel;
        const upgradeCosts = this.settings.categories[category].upgrades[upgrade].costs;
        const levelRequirement = this.requirements.levelRequirements[category]?.[upgrade]?.[currentLevel];

        return {
            possible: currentLevel < maxLevel &&
                     this.state.currency >= upgradeCosts[currentLevel] &&
                     this.state.level >= (levelRequirement || 1),
            reason: currentLevel >= maxLevel ? 'Max level reached' :
                    this.state.currency < upgradeCosts[currentLevel] ? 'Insufficient funds' :
                    this.state.level < (levelRequirement || 1) ? 'Level requirement not met' : null
        };
    }

    upgrade(category, upgrade) {
        const { possible, reason } = this.canUpgrade(category, upgrade);
        
        if (!possible) {
            throw new Error(`Cannot upgrade ${category}.${upgrade}: ${reason}`);
        }

        const currentLevel = this.getUpgradeLevel(category, upgrade);
        const cost = this.settings.categories[category].upgrades[upgrade].costs[currentLevel];
        const upgradeData = this.settings.categories[category].upgrades[upgrade];

        // Apply upgrade
        const newValue = upgradeData.baseValue + (upgradeData.incrementPerLevel * (currentLevel + 1));
        this.state.upgrades.set(`${category}.${upgrade}`, {
            level: currentLevel + 1,
            value: newValue
        });

        // Deduct cost
        this.state.currency -= cost;

        // Apply upgrade effects
        this.applyUpgrade(category, upgrade);

        // Save state
        this.saveState();

        // Emit upgrade event
        this.emit('upgrade', {
            category,
            upgrade,
            level: currentLevel + 1,
            value: newValue,
            cost
        });

        return {
            newLevel: currentLevel + 1,
            newValue,
            cost
        };
    }

    applyUpgrade(category, upgrade) {
        const upgradeState = this.state.upgrades.get(`${category}.${upgrade}`);
        
        switch(category) {
            case 'engine':
                if (upgrade === 'power') {
                    this.vehicle.setEnginePower(upgradeState.value);
                } else if (upgrade === 'torque') {
                    this.vehicle.setEngineTorque(upgradeState.value);
                } else if (upgrade === 'reliability') {
                    this.vehicle.setEngineReliability(upgradeState.value);
                }
                break;

            case 'transmission':
                if (upgrade === 'shiftSpeed') {
                    this.vehicle.setTransmissionShiftSpeed(upgradeState.value);
                } else if (upgrade === 'gearRatios') {
                    this.vehicle.setTransmissionGearRatios(upgradeState.value);
                }
                break;

            case 'suspension':
                if (upgrade === 'travel') {
                    this.vehicle.setSuspensionTravel(upgradeState.value);
                } else if (upgrade === 'stiffness') {
                    this.vehicle.setSuspensionStiffness(upgradeState.value);
                } else if (upgrade === 'damping') {
                    this.vehicle.setSuspensionDamping(upgradeState.value);
                }
                break;

            case 'tires':
                if (upgrade === 'grip') {
                    this.vehicle.setTireGrip(upgradeState.value);
                } else if (upgrade === 'durability') {
                    this.vehicle.setTireDurability(upgradeState.value);
                }
                break;

            case 'aerodynamics':
                if (upgrade === 'downforce') {
                    this.vehicle.setDownforce(upgradeState.value);
                } else if (upgrade === 'dragReduction') {
                    this.vehicle.setDragCoefficient(upgradeState.value);
                }
                break;

            case 'weight':
                if (upgrade === 'reduction') {
                    this.vehicle.setWeightReduction(upgradeState.value);
                }
                break;
        }
    }

    applyAllUpgrades() {
        this.state.upgrades.forEach((_, key) => {
            const [category, upgrade] = key.split('.');
            this.applyUpgrade(category, upgrade);
        });
    }

    applyVisualCustomization(type, option) {
        const visualOptions = this.settings.visual[type].options;
        const selectedOption = visualOptions.find(opt => opt.id === option);

        if (!selectedOption) {
            throw new Error(`Invalid ${type} option: ${option}`);
        }

        if (this.state.currency < selectedOption.cost) {
            throw new Error(`Insufficient funds for ${type} customization`);
        }

        // Apply visual change
        if (type === 'paintJob') {
            this.state.visualCustomization.paintJob = option;
            this.vehicle.setPaintJob(option);
        } else if (type === 'decals') {
            if (!this.state.visualCustomization.decals.includes(option)) {
                this.state.visualCustomization.decals.push(option);
            }
            this.vehicle.setDecals(this.state.visualCustomization.decals);
        } else if (type === 'wheels') {
            this.state.visualCustomization.wheels = option;
            this.vehicle.setWheels(option);
        }

        // Deduct cost
        this.state.currency -= selectedOption.cost;

        // Save state
        this.saveState();

        // Emit customization event
        this.emit('visualCustomization', {
            type,
            option,
            cost: selectedOption.cost
        });
    }

    removeDecal(decalId) {
        const index = this.state.visualCustomization.decals.indexOf(decalId);
        if (index !== -1) {
            this.state.visualCustomization.decals.splice(index, 1);
            this.vehicle.setDecals(this.state.visualCustomization.decals);
            this.saveState();
        }
    }

    getUpgradeLevel(category, upgrade) {
        return this.state.upgrades.get(`${category}.${upgrade}`)?.level || 0;
    }

    getUpgradeValue(category, upgrade) {
        return this.state.upgrades.get(`${category}.${upgrade}`)?.value || 
               this.settings.categories[category].upgrades[upgrade].baseValue;
    }

    getUpgradeCost(category, upgrade) {
        const currentLevel = this.getUpgradeLevel(category, upgrade);
        return this.settings.categories[category].upgrades[upgrade].costs[currentLevel];
    }

    handleExperienceGain(amount) {
        this.state.experience += amount;
        
        // Check for level up
        const newLevel = Math.floor(this.state.experience / 1000) + 1;
        if (newLevel > this.state.level) {
            const oldLevel = this.state.level;
            this.state.level = newLevel;
            this.emit('levelUp', {
                oldLevel,
                newLevel,
                unlockedUpgrades: this.getNewlyUnlockedUpgrades(newLevel)
            });
        }
        
        this.saveState();
    }

    handleCurrencyGain(amount) {
        this.state.currency += amount;
        this.saveState();
    }

    getNewlyUnlockedUpgrades(newLevel) {
        const unlockedUpgrades = [];
        
        Object.entries(this.requirements.levelRequirements).forEach(([category, upgrades]) => {
            Object.entries(upgrades).forEach(([upgrade, levels]) => {
                if (levels.includes(newLevel)) {
                    unlockedUpgrades.push({
                        category,
                        upgrade,
                        level: levels.indexOf(newLevel) + 1
                    });
                }
            });
        });
        
        return unlockedUpgrades;
    }

    getAvailableUpgrades() {
        const available = {};
        
        Object.entries(this.settings.categories).forEach(([category, categoryData]) => {
            available[category] = {};
            Object.keys(categoryData.upgrades).forEach(upgrade => {
                const { possible, reason } = this.canUpgrade(category, upgrade);
                available[category][upgrade] = {
                    possible,
                    reason,
                    currentLevel: this.getUpgradeLevel(category, upgrade),
                    maxLevel: categoryData.maxLevel,
                    cost: this.getUpgradeCost(category, upgrade)
                };
            });
        });
        
        return available;
    }

    dispose() {
        this.saveState();
        this.removeAllListeners();
    }
} 