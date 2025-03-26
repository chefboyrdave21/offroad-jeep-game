import { EventEmitter } from 'events';

export class VehicleResourceSystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            resources: {
                fuel: {
                    maxCapacity: 100,
                    consumptionRate: 0.1,
                    warningThreshold: 20,
                    criticalThreshold: 10,
                    effects: {
                        performance: -0.5,
                        damage: 0.2
                    }
                },
                oil: {
                    maxCapacity: 50,
                    consumptionRate: 0.05,
                    warningThreshold: 15,
                    criticalThreshold: 5,
                    effects: {
                        engineHealth: -1.0,
                        heat: 0.3
                    }
                },
                coolant: {
                    maxCapacity: 30,
                    consumptionRate: 0.03,
                    warningThreshold: 10,
                    criticalThreshold: 3,
                    effects: {
                        engineHealth: -0.8,
                        heat: 0.5
                    }
                },
                hydraulics: {
                    maxCapacity: 40,
                    consumptionRate: 0.02,
                    warningThreshold: 12,
                    criticalThreshold: 4,
                    effects: {
                        suspension: -0.6,
                        steering: -0.4
                    }
                }
            },
            upgrades: {
                capacity: {
                    levels: [1.2, 1.4, 1.6, 1.8, 2.0],
                    costs: [1000, 2000, 4000, 8000, 16000]
                },
                efficiency: {
                    levels: [0.9, 0.8, 0.7, 0.6, 0.5],
                    costs: [1500, 3000, 6000, 12000, 24000]
                }
            },
            environmental: {
                temperature: {
                    normal: { min: 60, max: 90 },
                    warning: { min: 90, max: 100 },
                    critical: { min: 100, max: 120 }
                },
                terrain: {
                    modifiers: {
                        mud: { consumption: 1.5 },
                        sand: { consumption: 1.3 },
                        water: { consumption: 1.2 },
                        rock: { consumption: 1.1 }
                    }
                }
            }
        };

        this.state = {
            resources: new Map(),
            temperature: 70,
            upgrades: {
                capacity: 0,
                efficiency: 0
            },
            stats: {
                totalConsumed: new Map(),
                refills: new Map(),
                warnings: new Map(),
                criticals: new Map()
            }
        };

        this.initialize();
    }

    initialize() {
        this.initializeResources();
        this.setupEventListeners();
    }

    initializeResources() {
        Object.entries(this.settings.resources).forEach(([name, config]) => {
            this.state.resources.set(name, {
                current: config.maxCapacity,
                max: config.maxCapacity,
                consumption: config.consumptionRate,
                status: 'normal'
            });

            this.state.stats.totalConsumed.set(name, 0);
            this.state.stats.refills.set(name, 0);
            this.state.stats.warnings.set(name, 0);
            this.state.stats.criticals.set(name, 0);
        });
    }

    setupEventListeners() {
        this.vehicle.on('update', this.update.bind(this));
        this.vehicle.on('terrainChange', this.handleTerrainChange.bind(this));
        this.vehicle.on('engineLoad', this.handleEngineLoad.bind(this));
    }

    update(deltaTime) {
        this.updateResources(deltaTime);
        this.updateTemperature(deltaTime);
        this.checkResourceLevels();
        this.applyResourceEffects();
    }

    updateResources(deltaTime) {
        this.state.resources.forEach((resource, name) => {
            const config = this.settings.resources[name];
            const consumption = this.calculateConsumption(name, deltaTime);

            resource.current = Math.max(0, resource.current - consumption);
            this.state.stats.totalConsumed.set(
                name,
                this.state.stats.totalConsumed.get(name) + consumption
            );

            this.updateResourceStatus(name, resource);
        });
    }

    calculateConsumption(resourceName, deltaTime) {
        const resource = this.state.resources.get(resourceName);
        const config = this.settings.resources[resourceName];
        let consumption = config.consumptionRate * deltaTime;

        // Apply efficiency upgrade
        consumption *= this.settings.upgrades.efficiency.levels[this.state.upgrades.efficiency];

        // Apply terrain modifier
        if (this.vehicle.currentTerrain) {
            const terrainMod = this.settings.environmental.terrain.modifiers[this.vehicle.currentTerrain];
            if (terrainMod) {
                consumption *= terrainMod.consumption;
            }
        }

        // Apply temperature effects
        if (this.state.temperature > this.settings.environmental.temperature.warning.min) {
            const tempFactor = 1 + (this.state.temperature - 
                this.settings.environmental.temperature.warning.min) / 50;
            consumption *= tempFactor;
        }

        return consumption;
    }

    updateResourceStatus(name, resource) {
        const config = this.settings.resources[name];
        const prevStatus = resource.status;
        let newStatus = 'normal';

        if (resource.current <= config.criticalThreshold) {
            newStatus = 'critical';
            if (prevStatus !== 'critical') {
                this.state.stats.criticals.set(
                    name,
                    this.state.stats.criticals.get(name) + 1
                );
            }
        } else if (resource.current <= config.warningThreshold) {
            newStatus = 'warning';
            if (prevStatus !== 'warning' && prevStatus !== 'critical') {
                this.state.stats.warnings.set(
                    name,
                    this.state.stats.warnings.get(name) + 1
                );
            }
        }

        if (newStatus !== prevStatus) {
            resource.status = newStatus;
            this.emit('resourceStatusChange', { name, status: newStatus });
        }
    }

    updateTemperature(deltaTime) {
        let tempChange = 0;

        // Base temperature change from engine load
        tempChange += (this.vehicle.engineLoad || 0) * 0.1;

        // Coolant effect
        const coolant = this.state.resources.get('coolant');
        if (coolant.current < coolant.max * 0.5) {
            tempChange += (1 - coolant.current / coolant.max) * 0.2;
        }

        // Environmental effect
        const ambientTemp = 70; // Could be dynamic based on environment
        tempChange += (ambientTemp - this.state.temperature) * 0.01;

        this.state.temperature = Math.max(
            ambientTemp,
            Math.min(
                this.settings.environmental.temperature.critical.max,
                this.state.temperature + tempChange * deltaTime
            )
        );

        this.checkTemperature();
    }

    checkTemperature() {
        const temp = this.state.temperature;
        const tempConfig = this.settings.environmental.temperature;

        if (temp >= tempConfig.critical.min) {
            this.emit('temperatureCritical', { temperature: temp });
        } else if (temp >= tempConfig.warning.min) {
            this.emit('temperatureWarning', { temperature: temp });
        }
    }

    checkResourceLevels() {
        this.state.resources.forEach((resource, name) => {
            if (resource.current === 0) {
                this.handleResourceDepletion(name);
            }
        });
    }

    applyResourceEffects() {
        this.state.resources.forEach((resource, name) => {
            const config = this.settings.resources[name];
            if (resource.current <= config.criticalThreshold) {
                Object.entries(config.effects).forEach(([stat, effect]) => {
                    this.vehicle.modifyStats(stat, effect);
                });
            }
        });
    }

    handleResourceDepletion(resourceName) {
        const effects = this.settings.resources[resourceName].effects;
        
        // Apply depletion effects
        Object.entries(effects).forEach(([stat, effect]) => {
            this.vehicle.modifyStats(stat, effect * 2);
        });

        this.emit('resourceDepleted', { resource: resourceName });
    }

    handleTerrainChange(terrain) {
        // Update consumption rates based on terrain
        this.state.resources.forEach((resource, name) => {
            const terrainMod = this.settings.environmental.terrain.modifiers[terrain];
            if (terrainMod) {
                resource.consumption = 
                    this.settings.resources[name].consumptionRate * 
                    terrainMod.consumption;
            }
        });
    }

    handleEngineLoad(load) {
        // Adjust consumption based on engine load
        this.state.resources.forEach((resource, name) => {
            resource.consumption = 
                this.settings.resources[name].consumptionRate * 
                (1 + load * 0.5);
        });
    }

    addResource(name, amount) {
        const resource = this.state.resources.get(name);
        if (!resource) return false;

        const prevAmount = resource.current;
        resource.current = Math.min(resource.max, resource.current + amount);
        const added = resource.current - prevAmount;

        if (added > 0) {
            this.state.stats.refills.set(
                name,
                this.state.stats.refills.get(name) + 1
            );
            this.emit('resourceAdded', { name, amount: added });
        }

        return added;
    }

    upgradeCapacity(resourceName) {
        const resource = this.state.resources.get(resourceName);
        const currentLevel = this.state.upgrades.capacity;

        if (currentLevel >= this.settings.upgrades.capacity.levels.length - 1) {
            return false;
        }

        const cost = this.settings.upgrades.capacity.costs[currentLevel];
        if (!this.vehicle.spendCurrency(cost)) {
            return false;
        }

        const multiplier = this.settings.upgrades.capacity.levels[currentLevel + 1];
        resource.max = this.settings.resources[resourceName].maxCapacity * multiplier;
        this.state.upgrades.capacity++;

        this.emit('capacityUpgraded', {
            resource: resourceName,
            level: this.state.upgrades.capacity,
            newCapacity: resource.max
        });

        return true;
    }

    upgradeEfficiency() {
        const currentLevel = this.state.upgrades.efficiency;

        if (currentLevel >= this.settings.upgrades.efficiency.levels.length - 1) {
            return false;
        }

        const cost = this.settings.upgrades.efficiency.costs[currentLevel];
        if (!this.vehicle.spendCurrency(cost)) {
            return false;
        }

        this.state.upgrades.efficiency++;

        this.emit('efficiencyUpgraded', {
            level: this.state.upgrades.efficiency,
            multiplier: this.settings.upgrades.efficiency.levels[this.state.upgrades.efficiency]
        });

        return true;
    }

    getResourceInfo(name) {
        const resource = this.state.resources.get(name);
        const config = this.settings.resources[name];

        return {
            current: resource.current,
            max: resource.max,
            percentage: (resource.current / resource.max) * 100,
            status: resource.status,
            consumption: resource.consumption,
            stats: {
                totalConsumed: this.state.stats.totalConsumed.get(name),
                refills: this.state.stats.refills.get(name),
                warnings: this.state.stats.warnings.get(name),
                criticals: this.state.stats.criticals.get(name)
            }
        };
    }

    getTemperatureInfo() {
        const temp = this.state.temperature;
        const tempConfig = this.settings.environmental.temperature;
        let status = 'normal';

        if (temp >= tempConfig.critical.min) {
            status = 'critical';
        } else if (temp >= tempConfig.warning.min) {
            status = 'warning';
        }

        return {
            current: temp,
            status,
            warning: tempConfig.warning,
            critical: tempConfig.critical
        };
    }

    dispose() {
        // Clear state
        this.state.resources.clear();
        this.state.stats.totalConsumed.clear();
        this.state.stats.refills.clear();
        this.state.stats.warnings.clear();
        this.state.stats.criticals.clear();

        // Remove event listeners
        this.removeAllListeners();
    }
} 