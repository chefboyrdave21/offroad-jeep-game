import { EventEmitter } from 'events';
import * as THREE from 'three';

export class VehicleMissionSystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            missionTypes: {
                delivery: {
                    name: "Delivery Mission",
                    description: "Transport cargo between locations",
                    rewards: {
                        base: 1000,
                        timeBonus: 500,
                        cargoCondition: 1000
                    },
                    parameters: {
                        timeLimit: true,
                        cargoFragility: true,
                        weightLimit: true
                    }
                },
                rescue: {
                    name: "Rescue Mission",
                    description: "Rescue stranded vehicles",
                    rewards: {
                        base: 1500,
                        timeBonus: 750,
                        vehicleCondition: 1000
                    },
                    parameters: {
                        timeLimit: true,
                        terrainDifficulty: true,
                        requiredEquipment: ['winch']
                    }
                },
                exploration: {
                    name: "Exploration Mission",
                    description: "Discover new locations and paths",
                    rewards: {
                        base: 800,
                        discoveryBonus: 400,
                        photoPoints: 300
                    },
                    parameters: {
                        discoveryPoints: true,
                        photoLocations: true,
                        terrainCoverage: true
                    }
                },
                racing: {
                    name: "Racing Challenge",
                    description: "Complete time trials and races",
                    rewards: {
                        base: 1200,
                        timeBonus: 1000,
                        skillPoints: 500
                    },
                    parameters: {
                        checkpoints: true,
                        timeLimit: true,
                        optimalPath: true
                    }
                },
                construction: {
                    name: "Construction Mission",
                    description: "Transport and deliver construction materials",
                    rewards: {
                        base: 1800,
                        materialCondition: 1000,
                        timeBonus: 600
                    },
                    parameters: {
                        cargoTypes: true,
                        stabilityCheck: true,
                        deliveryOrder: true
                    }
                }
            },
            difficulties: {
                easy: {
                    name: "Easy",
                    multiplier: 1.0,
                    timeLimit: 1.3, // 30% more time
                    checkpoints: 1.5, // 50% more checkpoints
                    rewards: 0.8 // 20% less rewards
                },
                normal: {
                    name: "Normal",
                    multiplier: 1.0,
                    timeLimit: 1.0,
                    checkpoints: 1.0,
                    rewards: 1.0
                },
                hard: {
                    name: "Hard",
                    multiplier: 1.0,
                    timeLimit: 0.7, // 30% less time
                    checkpoints: 0.7, // 30% fewer checkpoints
                    rewards: 1.3 // 30% more rewards
                },
                extreme: {
                    name: "Extreme",
                    multiplier: 1.0,
                    timeLimit: 0.5,
                    checkpoints: 0.5,
                    rewards: 1.8
                }
            },
            progression: {
                levels: {
                    1: { xpRequired: 0, missions: ['delivery', 'exploration'] },
                    2: { xpRequired: 1000, missions: ['rescue'] },
                    3: { xpRequired: 2500, missions: ['racing'] },
                    4: { xpRequired: 5000, missions: ['construction'] },
                    5: { xpRequired: 10000, missions: ['all'] }
                },
                rewards: {
                    levelUp: {
                        currency: 2000,
                        items: ['repair_kit', 'fuel_can']
                    }
                }
            }
        };

        this.state = {
            activeMission: null,
            completedMissions: new Set(),
            failedMissions: new Set(),
            missionProgress: new Map(),
            playerLevel: 1,
            playerXP: 0,
            statistics: {
                totalMissions: 0,
                successRate: 0,
                totalRewards: 0,
                bestTimes: new Map(),
                achievements: new Set()
            },
            discoveredLocations: new Set(),
            unlockedMissions: new Set(['delivery', 'exploration'])
        };

        this.initialize();
    }

    initialize() {
        this.setupEventListeners();
        this.loadSavedState();
        this.initializeMarkers();
    }

    setupEventListeners() {
        this.vehicle.on('locationReached', this.handleLocationReached.bind(this));
        this.vehicle.on('cargoLoaded', this.handleCargoLoaded.bind(this));
        this.vehicle.on('cargoUnloaded', this.handleCargoUnloaded.bind(this));
        this.vehicle.on('checkpointReached', this.handleCheckpointReached.bind(this));
        this.vehicle.on('vehicleRescued', this.handleVehicleRescued.bind(this));
        this.vehicle.on('photoTaken', this.handlePhotoTaken.bind(this));
    }

    loadSavedState() {
        const savedState = localStorage.getItem('vehicleMissions');
        if (savedState) {
            const parsed = JSON.parse(savedState);
            this.state = {
                ...this.state,
                ...parsed,
                completedMissions: new Set(parsed.completedMissions),
                failedMissions: new Set(parsed.failedMissions),
                missionProgress: new Map(Object.entries(parsed.missionProgress)),
                statistics: {
                    ...parsed.statistics,
                    bestTimes: new Map(Object.entries(parsed.statistics.bestTimes)),
                    achievements: new Set(parsed.statistics.achievements)
                },
                discoveredLocations: new Set(parsed.discoveredLocations),
                unlockedMissions: new Set(parsed.unlockedMissions)
            };
        }
    }

    saveState() {
        const saveData = {
            ...this.state,
            completedMissions: Array.from(this.state.completedMissions),
            failedMissions: Array.from(this.state.failedMissions),
            missionProgress: Object.fromEntries(this.state.missionProgress),
            statistics: {
                ...this.state.statistics,
                bestTimes: Object.fromEntries(this.state.statistics.bestTimes),
                achievements: Array.from(this.state.statistics.achievements)
            },
            discoveredLocations: Array.from(this.state.discoveredLocations),
            unlockedMissions: Array.from(this.state.unlockedMissions)
        };
        localStorage.setItem('vehicleMissions', JSON.stringify(saveData));
    }

    initializeMarkers() {
        this.markers = {
            mission: new THREE.Group(),
            checkpoint: new THREE.Group(),
            discovery: new THREE.Group()
        };

        // Create marker geometries and materials
        const markerGeometry = new THREE.CylinderGeometry(0.5, 0, 2, 4);
        const materials = {
            mission: new THREE.MeshBasicMaterial({ color: 0xffff00 }),
            checkpoint: new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
            discovery: new THREE.MeshBasicMaterial({ color: 0x0000ff })
        };

        Object.entries(this.markers).forEach(([type, group]) => {
            const marker = new THREE.Mesh(markerGeometry, materials[type]);
            group.add(marker);
            this.vehicle.scene.add(group);
        });
    }

    startMission(missionId, difficulty = 'normal') {
        if (this.state.activeMission) {
            throw new Error('Mission already in progress');
        }

        if (!this.state.unlockedMissions.has(missionId)) {
            throw new Error('Mission not unlocked');
        }

        const missionType = this.settings.missionTypes[missionId];
        const difficultySettings = this.settings.difficulties[difficulty];

        if (!missionType || !difficultySettings) {
            throw new Error('Invalid mission or difficulty');
        }

        // Check required equipment
        if (missionType.parameters.requiredEquipment) {
            const hasRequiredEquipment = missionType.parameters.requiredEquipment.every(
                equipment => this.vehicle.hasEquipment(equipment)
            );
            if (!hasRequiredEquipment) {
                throw new Error('Missing required equipment');
            }
        }

        // Generate mission parameters
        const mission = this.generateMission(missionId, difficulty);

        // Initialize mission state
        this.state.activeMission = {
            id: missionId,
            type: missionType,
            difficulty: difficultySettings,
            parameters: mission,
            progress: {
                started: Date.now(),
                checkpoints: new Set(),
                discoveries: new Set(),
                cargo: new Map(),
                photos: new Set(),
                rescues: new Set()
            },
            status: 'active'
        };

        // Set up mission markers and objectives
        this.setupMissionMarkers(mission);

        // Emit mission start event
        this.emit('missionStarted', {
            id: missionId,
            type: missionType,
            difficulty,
            parameters: mission
        });

        return mission;
    }

    generateMission(missionId, difficulty) {
        const missionType = this.settings.missionTypes[missionId];
        const difficultySettings = this.settings.difficulties[difficulty];

        switch (missionId) {
            case 'delivery':
                return this.generateDeliveryMission(missionType, difficultySettings);
            case 'rescue':
                return this.generateRescueMission(missionType, difficultySettings);
            case 'exploration':
                return this.generateExplorationMission(missionType, difficultySettings);
            case 'racing':
                return this.generateRacingMission(missionType, difficultySettings);
            case 'construction':
                return this.generateConstructionMission(missionType, difficultySettings);
            default:
                throw new Error('Invalid mission type');
        }
    }

    generateDeliveryMission(missionType, difficulty) {
        return {
            startLocation: this.getRandomLocation(),
            endLocation: this.getRandomLocation(),
            cargo: {
                type: this.getRandomCargo(),
                weight: Math.random() * 1000 + 500,
                fragility: Math.random(),
                condition: 100
            },
            timeLimit: 300 * difficulty.timeLimit, // 5 minutes base
            bonus: {
                time: missionType.rewards.timeBonus,
                condition: missionType.rewards.cargoCondition
            }
        };
    }

    generateRescueMission(missionType, difficulty) {
        return {
            vehicleLocation: this.getRandomLocation(),
            vehicleType: this.getRandomVehicle(),
            condition: Math.random() * 50 + 25, // 25-75% damaged
            timeLimit: 400 * difficulty.timeLimit,
            terrainDifficulty: Math.random(),
            bonus: {
                time: missionType.rewards.timeBonus,
                condition: missionType.rewards.vehicleCondition
            }
        };
    }

    generateExplorationMission(missionType, difficulty) {
        const points = Array(5).fill().map(() => this.getRandomLocation());
        return {
            discoveryPoints: points,
            photoLocations: points.slice(0, 3),
            coverage: {
                required: 0.7,
                current: 0
            },
            bonus: {
                discovery: missionType.rewards.discoveryBonus,
                photos: missionType.rewards.photoPoints
            }
        };
    }

    generateRacingMission(missionType, difficulty) {
        const checkpoints = this.generateCheckpoints(10 * difficulty.checkpoints);
        return {
            checkpoints,
            timeLimit: 600 * difficulty.timeLimit,
            bestTime: this.state.statistics.bestTimes.get(missionType.name) || Infinity,
            bonus: {
                time: missionType.rewards.timeBonus,
                skill: missionType.rewards.skillPoints
            }
        };
    }

    generateConstructionMission(missionType, difficulty) {
        const materials = ['concrete', 'steel', 'wood', 'pipes'].map(type => ({
            type,
            weight: Math.random() * 500 + 250,
            condition: 100,
            order: Math.floor(Math.random() * 4)
        }));

        return {
            materials,
            deliveryPoints: this.generateDeliveryPoints(materials.length),
            timeLimit: 800 * difficulty.timeLimit,
            bonus: {
                condition: missionType.rewards.materialCondition,
                time: missionType.rewards.timeBonus
            }
        };
    }

    setupMissionMarkers(mission) {
        // Clear existing markers
        Object.values(this.markers).forEach(group => {
            while (group.children.length > 0) {
                group.remove(group.children[0]);
            }
        });

        // Add new markers based on mission type
        if (mission.checkpoints) {
            mission.checkpoints.forEach(checkpoint => {
                this.addMarker('checkpoint', checkpoint);
            });
        }

        if (mission.discoveryPoints) {
            mission.discoveryPoints.forEach(point => {
                this.addMarker('discovery', point);
            });
        }

        if (mission.startLocation) {
            this.addMarker('mission', mission.startLocation);
        }

        if (mission.endLocation) {
            this.addMarker('mission', mission.endLocation);
        }
    }

    addMarker(type, position) {
        const marker = this.markers[type].children[0].clone();
        marker.position.copy(position);
        this.markers[type].add(marker);
    }

    updateMission(deltaTime) {
        if (!this.state.activeMission) return;

        const mission = this.state.activeMission;
        const progress = mission.progress;

        // Update time-based objectives
        if (mission.parameters.timeLimit) {
            const elapsed = (Date.now() - progress.started) / 1000;
            if (elapsed > mission.parameters.timeLimit) {
                this.failMission('Time limit exceeded');
                return;
            }
        }

        // Update cargo condition
        if (mission.parameters.cargo) {
            const cargo = mission.parameters.cargo;
            const terrainImpact = this.vehicle.getTerrainImpact();
            cargo.condition = Math.max(0, cargo.condition - (terrainImpact * cargo.fragility * deltaTime));
        }

        // Update exploration coverage
        if (mission.parameters.coverage) {
            mission.parameters.coverage.current = this.calculateTerrainCoverage();
        }

        // Check mission completion
        this.checkMissionCompletion();
    }

    checkMissionCompletion() {
        const mission = this.state.activeMission;
        if (!mission) return;

        let completed = false;
        let reward = mission.type.rewards.base * mission.difficulty.rewards;

        switch (mission.id) {
            case 'delivery':
                completed = this.checkDeliveryCompletion(mission, reward);
                break;
            case 'rescue':
                completed = this.checkRescueCompletion(mission, reward);
                break;
            case 'exploration':
                completed = this.checkExplorationCompletion(mission, reward);
                break;
            case 'racing':
                completed = this.checkRacingCompletion(mission, reward);
                break;
            case 'construction':
                completed = this.checkConstructionCompletion(mission, reward);
                break;
        }

        if (completed) {
            this.completeMission(reward);
        }
    }

    checkDeliveryCompletion(mission, reward) {
        const distance = this.vehicle.position.distanceTo(mission.parameters.endLocation);
        if (distance < 5) { // Within 5 meters of delivery point
            const timeBonus = this.calculateTimeBonus(mission);
            const conditionBonus = mission.parameters.cargo.condition / 100 * mission.parameters.bonus.condition;
            reward += timeBonus + conditionBonus;
            return true;
        }
        return false;
    }

    checkRescueCompletion(mission, reward) {
        if (mission.progress.rescues.has(mission.parameters.vehicleLocation)) {
            const timeBonus = this.calculateTimeBonus(mission);
            const conditionBonus = this.vehicle.getLastRescueCondition() / 100 * mission.parameters.bonus.condition;
            reward += timeBonus + conditionBonus;
            return true;
        }
        return false;
    }

    checkExplorationCompletion(mission, reward) {
        const discoveredAll = mission.parameters.discoveryPoints.every(
            point => mission.progress.discoveries.has(point.toString())
        );
        const photosComplete = mission.parameters.photoLocations.every(
            point => mission.progress.photos.has(point.toString())
        );
        const coverageComplete = mission.parameters.coverage.current >= mission.parameters.coverage.required;

        if (discoveredAll && photosComplete && coverageComplete) {
            reward += mission.parameters.bonus.discovery * mission.progress.discoveries.size;
            reward += mission.parameters.bonus.photos * mission.progress.photos.size;
            return true;
        }
        return false;
    }

    checkRacingCompletion(mission, reward) {
        const allCheckpoints = mission.parameters.checkpoints.every(
            checkpoint => mission.progress.checkpoints.has(checkpoint.toString())
        );

        if (allCheckpoints) {
            const timeBonus = this.calculateTimeBonus(mission);
            const skillBonus = this.calculateSkillBonus(mission);
            reward += timeBonus + skillBonus;
            return true;
        }
        return false;
    }

    checkConstructionCompletion(mission, reward) {
        const allDelivered = mission.parameters.materials.every(
            material => mission.progress.cargo.has(material.type)
        );

        if (allDelivered) {
            const timeBonus = this.calculateTimeBonus(mission);
            const conditionBonus = Array.from(mission.progress.cargo.values())
                .reduce((sum, condition) => sum + condition, 0) / mission.progress.cargo.size;
            reward += timeBonus + (conditionBonus * mission.parameters.bonus.condition);
            return true;
        }
        return false;
    }

    calculateTimeBonus(mission) {
        const elapsed = (Date.now() - mission.progress.started) / 1000;
        const timeLimit = mission.parameters.timeLimit;
        const timeRatio = Math.max(0, (timeLimit - elapsed) / timeLimit);
        return mission.parameters.bonus.time * timeRatio;
    }

    calculateSkillBonus(mission) {
        const drivingScore = this.vehicle.getDrivingScore();
        return mission.parameters.bonus.skill * (drivingScore / 100);
    }

    calculateTerrainCoverage() {
        // Simplified coverage calculation
        const discoveredArea = this.state.discoveredLocations.size;
        const totalArea = 100; // Example total area points
        return discoveredArea / totalArea;
    }

    completeMission(reward) {
        const mission = this.state.activeMission;
        
        // Update statistics
        this.state.statistics.totalMissions++;
        this.state.statistics.totalRewards += reward;
        this.state.statistics.successRate = 
            this.state.completedMissions.size / 
            (this.state.completedMissions.size + this.state.failedMissions.size);

        // Update best times for racing missions
        if (mission.id === 'racing') {
            const elapsed = (Date.now() - mission.progress.started) / 1000;
            const currentBest = this.state.statistics.bestTimes.get(mission.id) || Infinity;
            if (elapsed < currentBest) {
                this.state.statistics.bestTimes.set(mission.id, elapsed);
            }
        }

        // Add XP and check for level up
        this.addExperience(reward * 0.1);

        // Add to completed missions
        this.state.completedMissions.add(mission.id);

        // Clear active mission
        this.state.activeMission = null;

        // Save state
        this.saveState();

        // Emit completion event
        this.emit('missionCompleted', {
            id: mission.id,
            reward,
            statistics: this.state.statistics
        });

        return reward;
    }

    failMission(reason) {
        const mission = this.state.activeMission;
        
        // Update statistics
        this.state.statistics.totalMissions++;
        this.state.failedMissions.add(mission.id);
        this.state.statistics.successRate = 
            this.state.completedMissions.size / 
            (this.state.completedMissions.size + this.state.failedMissions.size);

        // Clear active mission
        this.state.activeMission = null;

        // Save state
        this.saveState();

        // Emit failure event
        this.emit('missionFailed', {
            id: mission.id,
            reason,
            statistics: this.state.statistics
        });
    }

    addExperience(amount) {
        this.state.playerXP += amount;

        // Check for level up
        Object.entries(this.settings.progression.levels).forEach(([level, data]) => {
            if (this.state.playerXP >= data.xpRequired && this.state.playerLevel < parseInt(level)) {
                this.levelUp(parseInt(level));
            }
        });
    }

    levelUp(newLevel) {
        const oldLevel = this.state.playerLevel;
        this.state.playerLevel = newLevel;

        // Unlock new missions
        const unlockedMissions = this.settings.progression.levels[newLevel].missions;
        if (unlockedMissions.includes('all')) {
            Object.keys(this.settings.missionTypes).forEach(mission => {
                this.state.unlockedMissions.add(mission);
            });
        } else {
            unlockedMissions.forEach(mission => {
                this.state.unlockedMissions.add(mission);
            });
        }

        // Apply rewards
        const rewards = this.settings.progression.rewards.levelUp;
        this.state.currency += rewards.currency;

        // Emit level up event
        this.emit('levelUp', {
            oldLevel,
            newLevel,
            unlockedMissions: Array.from(this.state.unlockedMissions),
            rewards
        });
    }

    // Event handlers
    handleLocationReached(location) {
        if (!this.state.activeMission) return;

        const mission = this.state.activeMission;
        const locationString = location.toString();

        if (mission.parameters.discoveryPoints?.includes(location)) {
            mission.progress.discoveries.add(locationString);
        }

        if (mission.parameters.checkpoints?.includes(location)) {
            mission.progress.checkpoints.add(locationString);
        }
    }

    handleCargoLoaded(cargo) {
        if (!this.state.activeMission) return;

        const mission = this.state.activeMission;
        if (mission.id === 'delivery' || mission.id === 'construction') {
            mission.progress.cargo.set(cargo.type, cargo.condition);
        }
    }

    handleCargoUnloaded(cargo) {
        if (!this.state.activeMission) return;

        const mission = this.state.activeMission;
        if (mission.id === 'delivery' || mission.id === 'construction') {
            mission.progress.cargo.delete(cargo.type);
        }
    }

    handleCheckpointReached(checkpoint) {
        if (!this.state.activeMission) return;

        const mission = this.state.activeMission;
        if (mission.id === 'racing') {
            mission.progress.checkpoints.add(checkpoint.toString());
        }
    }

    handleVehicleRescued(vehicle) {
        if (!this.state.activeMission) return;

        const mission = this.state.activeMission;
        if (mission.id === 'rescue') {
            mission.progress.rescues.add(vehicle.position.toString());
        }
    }

    handlePhotoTaken(location) {
        if (!this.state.activeMission) return;

        const mission = this.state.activeMission;
        if (mission.id === 'exploration') {
            mission.progress.photos.add(location.toString());
        }
    }

    // Utility methods
    getRandomLocation() {
        return new THREE.Vector3(
            Math.random() * 1000 - 500,
            0,
            Math.random() * 1000 - 500
        );
    }

    getRandomCargo() {
        const cargoTypes = ['wood', 'metal', 'fuel', 'food', 'construction'];
        return cargoTypes[Math.floor(Math.random() * cargoTypes.length)];
    }

    getRandomVehicle() {
        const vehicleTypes = ['truck', 'suv', 'tractor', 'military'];
        return vehicleTypes[Math.floor(Math.random() * vehicleTypes.length)];
    }

    generateCheckpoints(count) {
        const checkpoints = [];
        for (let i = 0; i < count; i++) {
            checkpoints.push(this.getRandomLocation());
        }
        return checkpoints;
    }

    generateDeliveryPoints(count) {
        const points = [];
        for (let i = 0; i < count; i++) {
            points.push(this.getRandomLocation());
        }
        return points;
    }

    dispose() {
        // Clean up THREE.js objects
        Object.values(this.markers).forEach(group => {
            group.children.forEach(marker => {
                marker.geometry.dispose();
                marker.material.dispose();
            });
            this.vehicle.scene.remove(group);
        });

        // Save final state
        this.saveState();

        // Remove event listeners
        this.removeAllListeners();
    }
} 