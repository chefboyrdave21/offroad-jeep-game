import { EventEmitter } from 'events';

export class VehicleProgressionSystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            experience: {
                baseXP: 100,
                maxLevel: 50,
                scaling: {
                    distance: 0.1,
                    height: 0.2,
                    time: 0.05,
                    challenge: 0.3,
                    mission: 0.4
                },
                bonuses: {
                    noDamage: 1.2,
                    perfectLanding: 1.1,
                    quickCompletion: 1.3,
                    exploration: 1.15
                }
            },
            levels: {
                thresholds: [],
                rewards: {
                    currency: level => 1000 * Math.pow(1.2, level - 1),
                    parts: level => Math.floor(level / 5),
                    upgrades: level => Math.floor(level / 10)
                }
            },
            unlocks: {
                5: {
                    type: 'upgrade',
                    items: ['engine_tuning', 'suspension_basic']
                },
                10: {
                    type: 'part',
                    items: ['heavy_duty_transmission', 'offroad_tires']
                },
                15: {
                    type: 'feature',
                    items: ['winch_system', 'advanced_telemetry']
                },
                20: {
                    type: 'vehicle',
                    items: ['advanced_jeep', 'rock_crawler']
                },
                25: {
                    type: 'upgrade',
                    items: ['turbocharger', 'racing_suspension']
                },
                30: {
                    type: 'area',
                    items: ['mountain_trails', 'desert_dunes']
                },
                35: {
                    type: 'feature',
                    items: ['nitro_boost', 'terrain_scanner']
                },
                40: {
                    type: 'vehicle',
                    items: ['trophy_truck', 'ultra4_racer']
                },
                45: {
                    type: 'upgrade',
                    items: ['ultimate_engine', 'pro_suspension']
                },
                50: {
                    type: 'mastery',
                    items: ['vehicle_master', 'terrain_master']
                }
            },
            achievements: {
                categories: {
                    driving: ['distance', 'airtime', 'drifting'],
                    exploration: ['areas', 'secrets', 'viewpoints'],
                    challenges: ['races', 'missions', 'competitions'],
                    mastery: ['skills', 'techniques', 'records']
                }
            }
        };

        // Initialize level thresholds
        for (let i = 1; i <= this.settings.experience.maxLevel; i++) {
            this.settings.levels.thresholds[i] = Math.floor(
                this.settings.experience.baseXP * Math.pow(1.5, i - 1)
            );
        }

        this.state = {
            level: 1,
            experience: 0,
            totalExperience: 0,
            unlockedItems: new Set(),
            achievements: new Map(),
            stats: {
                distanceDriven: 0,
                heightClimbed: 0,
                timePlayed: 0,
                challengesCompleted: 0,
                missionsCompleted: 0,
                areasExplored: 0
            }
        };

        this.initialize();
    }

    initialize() {
        this.initializeAchievements();
        this.setupEventListeners();
        this.loadProgress();
    }

    initializeAchievements() {
        Object.entries(this.settings.achievements.categories).forEach(([category, types]) => {
            types.forEach(type => {
                this.state.achievements.set(`${category}_${type}`, {
                    completed: false,
                    progress: 0,
                    timestamp: null
                });
            });
        });
    }

    setupEventListeners() {
        this.vehicle.on('distanceUpdated', this.updateDistance.bind(this));
        this.vehicle.on('heightUpdated', this.updateHeight.bind(this));
        this.vehicle.on('challengeCompleted', this.handleChallenge.bind(this));
        this.vehicle.on('missionCompleted', this.handleMission.bind(this));
        this.vehicle.on('areaDiscovered', this.handleAreaDiscovery.bind(this));
    }

    loadProgress() {
        try {
            const saved = localStorage.getItem('vehicleProgress');
            if (saved) {
                const data = JSON.parse(saved);
                this.loadProgressData(data);
            }
        } catch (error) {
            console.error('Failed to load progress:', error);
        }
    }

    loadProgressData(data) {
        Object.assign(this.state, {
            level: data.level,
            experience: data.experience,
            totalExperience: data.totalExperience
        });

        // Load unlocked items
        data.unlockedItems.forEach(item => {
            this.state.unlockedItems.add(item);
        });

        // Load achievements
        data.achievements.forEach((achievement, id) => {
            this.state.achievements.set(id, achievement);
        });

        // Load stats
        Object.assign(this.state.stats, data.stats);

        this.emit('progressLoaded', this.state);
    }

    addExperience(amount, type, bonuses = []) {
        let xp = amount * this.settings.experience.scaling[type];

        // Apply bonuses
        bonuses.forEach(bonus => {
            if (this.settings.experience.bonuses[bonus]) {
                xp *= this.settings.experience.bonuses[bonus];
            }
        });

        this.state.experience += xp;
        this.state.totalExperience += xp;

        this.checkLevelUp();
        this.saveProgress();

        this.emit('experienceGained', { amount: xp, type, total: this.state.experience });
    }

    checkLevelUp() {
        while (this.canLevelUp()) {
            this.levelUp();
        }
    }

    canLevelUp() {
        if (this.state.level >= this.settings.experience.maxLevel) return false;

        const nextLevel = this.state.level + 1;
        return this.state.experience >= this.settings.levels.thresholds[nextLevel];
    }

    levelUp() {
        const nextLevel = this.state.level + 1;
        this.state.experience -= this.settings.levels.thresholds[nextLevel];
        this.state.level = nextLevel;

        // Award level rewards
        const rewards = this.getLevelRewards(nextLevel);
        this.awardLevelRewards(rewards);

        // Check for unlocks
        this.checkUnlocks(nextLevel);

        this.emit('levelUp', {
            level: nextLevel,
            rewards,
            unlocks: this.getUnlocksForLevel(nextLevel)
        });
    }

    getLevelRewards(level) {
        return {
            currency: this.settings.levels.rewards.currency(level),
            parts: this.settings.levels.rewards.parts(level),
            upgrades: this.settings.levels.rewards.upgrades(level)
        };
    }

    awardLevelRewards(rewards) {
        this.vehicle.addCurrency(rewards.currency);
        // Additional reward distribution logic
    }

    checkUnlocks(level) {
        const unlocks = this.settings.unlocks[level];
        if (unlocks) {
            unlocks.items.forEach(item => {
                this.unlockItem(item, unlocks.type);
            });
        }
    }

    unlockItem(item, type) {
        this.state.unlockedItems.add(item);
        this.emit('itemUnlocked', { item, type });
    }

    getUnlocksForLevel(level) {
        return this.settings.unlocks[level] || null;
    }

    updateDistance(distance) {
        this.state.stats.distanceDriven += distance;
        this.addExperience(distance, 'distance');
        this.checkAchievements('driving', 'distance');
    }

    updateHeight(height) {
        this.state.stats.heightClimbed += height;
        this.addExperience(height, 'height');
        this.checkAchievements('driving', 'height');
    }

    handleChallenge(data) {
        this.state.stats.challengesCompleted++;
        this.addExperience(data.difficulty * 100, 'challenge', data.bonuses);
        this.checkAchievements('challenges', 'races');
    }

    handleMission(data) {
        this.state.stats.missionsCompleted++;
        this.addExperience(data.difficulty * 150, 'mission', data.bonuses);
        this.checkAchievements('challenges', 'missions');
    }

    handleAreaDiscovery(data) {
        this.state.stats.areasExplored++;
        this.addExperience(50, 'exploration', ['exploration']);
        this.checkAchievements('exploration', 'areas');
    }

    checkAchievements(category, type) {
        const achievementId = `${category}_${type}`;
        const achievement = this.state.achievements.get(achievementId);
        
        if (achievement && !achievement.completed) {
            achievement.progress = this.calculateAchievementProgress(category, type);
            
            if (achievement.progress >= 1) {
                this.completeAchievement(achievementId);
            }
        }
    }

    calculateAchievementProgress(category, type) {
        // Example progress calculation logic
        const stats = this.state.stats;
        switch (`${category}_${type}`) {
            case 'driving_distance':
                return Math.min(1, stats.distanceDriven / 10000);
            case 'exploration_areas':
                return Math.min(1, stats.areasExplored / 20);
            case 'challenges_missions':
                return Math.min(1, stats.missionsCompleted / 50);
            default:
                return 0;
        }
    }

    completeAchievement(achievementId) {
        const achievement = this.state.achievements.get(achievementId);
        achievement.completed = true;
        achievement.timestamp = Date.now();

        this.emit('achievementCompleted', { achievementId, achievement });
        this.saveProgress();
    }

    getProgress() {
        return {
            level: this.state.level,
            experience: this.state.experience,
            nextLevel: this.settings.levels.thresholds[this.state.level + 1],
            percentage: (this.state.experience / 
                this.settings.levels.thresholds[this.state.level + 1]) * 100,
            stats: { ...this.state.stats },
            achievements: Array.from(this.state.achievements.entries()),
            unlocks: Array.from(this.state.unlockedItems)
        };
    }

    saveProgress() {
        try {
            const data = {
                level: this.state.level,
                experience: this.state.experience,
                totalExperience: this.state.totalExperience,
                unlockedItems: Array.from(this.state.unlockedItems),
                achievements: Array.from(this.state.achievements.entries()),
                stats: { ...this.state.stats }
            };

            localStorage.setItem('vehicleProgress', JSON.stringify(data));
            this.emit('progressSaved', data);
        } catch (error) {
            console.error('Failed to save progress:', error);
        }
    }

    dispose() {
        // Clear state
        this.state.unlockedItems.clear();
        this.state.achievements.clear();

        // Remove event listeners
        this.removeAllListeners();
    }
} 