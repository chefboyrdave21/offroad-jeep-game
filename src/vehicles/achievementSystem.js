import { EventEmitter } from 'events';

export class VehicleAchievementSystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            achievements: {
                exploration: {
                    trailblazer: {
                        name: "Trailblazer",
                        description: "Discover 10 new trails",
                        tiers: [
                            { count: 10, reward: { experience: 100, title: "Scout" } },
                            { count: 25, reward: { experience: 250, title: "Explorer" } },
                            { count: 50, reward: { experience: 500, title: "Pathfinder" } }
                        ],
                        progress: 0
                    },
                    peakSeeker: {
                        name: "Peak Seeker",
                        description: "Reach high altitude points",
                        tiers: [
                            { height: 1000, reward: { experience: 150, badge: "bronze_peak" } },
                            { height: 2000, reward: { experience: 300, badge: "silver_peak" } },
                            { height: 3000, reward: { experience: 600, badge: "gold_peak" } }
                        ],
                        progress: 0
                    }
                },
                performance: {
                    speedDemon: {
                        name: "Speed Demon",
                        description: "Reach high speeds on different terrains",
                        tiers: [
                            { speed: 100, reward: { experience: 100, vehiclePaint: "racing_stripes" } },
                            { speed: 150, reward: { experience: 200, vehiclePaint: "flame_decal" } },
                            { speed: 200, reward: { experience: 400, vehiclePaint: "lightning_wrap" } }
                        ],
                        progress: 0
                    },
                    mudMaster: {
                        name: "Mud Master",
                        description: "Complete challenges in muddy terrain",
                        tiers: [
                            { time: 300, reward: { experience: 150, tires: "mud_specialist" } },
                            { time: 900, reward: { experience: 300, suspension: "mud_pro" } },
                            { time: 1800, reward: { experience: 600, vehicle: "mud_king" } }
                        ],
                        progress: 0
                    }
                },
                recovery: {
                    rescueRanger: {
                        name: "Rescue Ranger",
                        description: "Help stranded vehicles",
                        tiers: [
                            { rescues: 5, reward: { experience: 200, winch: "basic_plus" } },
                            { rescues: 15, reward: { experience: 400, winch: "advanced" } },
                            { rescues: 30, reward: { experience: 800, winch: "professional" } }
                        ],
                        progress: 0
                    },
                    selfReliant: {
                        name: "Self Reliant",
                        description: "Recover from difficult situations",
                        tiers: [
                            { recoveries: 10, reward: { experience: 100, tool: "recovery_basic" } },
                            { recoveries: 25, reward: { experience: 250, tool: "recovery_pro" } },
                            { recoveries: 50, reward: { experience: 500, tool: "recovery_master" } }
                        ],
                        progress: 0
                    }
                },
                endurance: {
                    ironWheels: {
                        name: "Iron Wheels",
                        description: "Drive long distances without damage",
                        tiers: [
                            { distance: 5000, reward: { experience: 150, armor: "reinforced" } },
                            { distance: 15000, reward: { experience: 300, armor: "heavy_duty" } },
                            { distance: 30000, reward: { experience: 600, armor: "ultimate" } }
                        ],
                        progress: 0
                    },
                    nightRider: {
                        name: "Night Rider",
                        description: "Complete missions at night",
                        tiers: [
                            { missions: 5, reward: { experience: 100, lights: "fog_lights" } },
                            { missions: 15, reward: { experience: 250, lights: "led_bar" } },
                            { missions: 30, reward: { experience: 500, lights: "night_master" } }
                        ],
                        progress: 0
                    }
                }
            },
            milestones: {
                intervals: {
                    distance: 1000, // meters
                    missions: 5,
                    recoveries: 3,
                    discoveries: 2
                },
                rewards: {
                    distance: { experience: 50, currency: 100 },
                    missions: { experience: 100, currency: 200 },
                    recoveries: { experience: 75, currency: 150 },
                    discoveries: { experience: 60, currency: 120 }
                }
            },
            tracking: {
                updateInterval: 1000, // ms
                saveInterval: 300000, // 5 minutes
                metrics: [
                    'distance',
                    'maxSpeed',
                    'maxHeight',
                    'recoveries',
                    'missions',
                    'discoveries'
                ]
            }
        };

        this.state = {
            achievements: new Map(),
            milestones: {
                distance: 0,
                missions: 0,
                recoveries: 0,
                discoveries: 0
            },
            statistics: {
                totalDistance: 0,
                maxSpeed: 0,
                maxHeight: 0,
                totalRecoveries: 0,
                totalMissions: 0,
                totalDiscoveries: 0,
                playTime: 0
            },
            unlocked: new Set(),
            pendingRewards: [],
            lastUpdate: Date.now(),
            lastSave: Date.now()
        };

        this.initialize();
    }

    initialize() {
        this.initializeAchievements();
        this.setupEventListeners();
        this.startTracking();
        this.loadProgress();
    }

    initializeAchievements() {
        Object.entries(this.settings.achievements).forEach(([category, achievements]) => {
            Object.entries(achievements).forEach(([id, achievement]) => {
                this.state.achievements.set(id, {
                    ...achievement,
                    category,
                    id,
                    currentTier: 0,
                    progress: 0,
                    completed: false
                });
            });
        });
    }

    setupEventListeners() {
        // Vehicle events
        this.vehicle.on('update', this.onVehicleUpdate.bind(this));
        this.vehicle.on('collision', this.onVehicleCollision.bind(this));
        this.vehicle.on('recovery', this.onVehicleRecovery.bind(this));
        this.vehicle.on('mission', this.onMissionComplete.bind(this));
        this.vehicle.on('discovery', this.onDiscovery.bind(this));

        // Game events
        this.setupGameEventListeners();
    }

    startTracking() {
        this.trackingInterval = setInterval(() => {
            this.updateTracking();
        }, this.settings.tracking.updateInterval);

        this.saveInterval = setInterval(() => {
            this.saveProgress();
        }, this.settings.tracking.saveInterval);
    }

    updateTracking() {
        const now = Date.now();
        const deltaTime = (now - this.state.lastUpdate) / 1000;
        this.state.lastUpdate = now;

        // Update statistics
        this.updateStatistics(deltaTime);

        // Check milestones
        this.checkMilestones();

        // Check achievements
        this.checkAchievements();

        // Process pending rewards
        this.processPendingRewards();
    }

    updateStatistics(deltaTime) {
        // Update play time
        this.state.statistics.playTime += deltaTime;

        // Update distance
        const distance = this.vehicle.getDistanceTraveled();
        this.state.statistics.totalDistance = distance;

        // Update max speed
        const currentSpeed = this.vehicle.getSpeed();
        this.state.statistics.maxSpeed = Math.max(
            this.state.statistics.maxSpeed,
            currentSpeed
        );

        // Update max height
        const currentHeight = this.vehicle.getHeight();
        this.state.statistics.maxHeight = Math.max(
            this.state.statistics.maxHeight,
            currentHeight
        );
    }

    checkMilestones() {
        Object.entries(this.settings.milestones.intervals).forEach(([type, interval]) => {
            const current = Math.floor(this.state.statistics[`total${type.charAt(0).toUpperCase() + type.slice(1)}`] / interval);
            const previous = Math.floor(this.state.milestones[type] / interval);

            if (current > previous) {
                const count = current - previous;
                this.awardMilestone(type, count);
                this.state.milestones[type] = current * interval;
            }
        });
    }

    awardMilestone(type, count) {
        const reward = this.settings.milestones.rewards[type];
        const totalReward = {
            experience: reward.experience * count,
            currency: reward.currency * count
        };

        this.state.pendingRewards.push({
            type: 'milestone',
            milestone: type,
            reward: totalReward
        });

        this.emit('milestoneReached', {
            type,
            count,
            reward: totalReward
        });
    }

    checkAchievements() {
        this.state.achievements.forEach(achievement => {
            if (achievement.completed) return;

            const currentTier = achievement.tiers[achievement.currentTier];
            if (!currentTier) return;

            let progress = 0;
            switch (achievement.id) {
                case 'trailblazer':
                    progress = this.state.statistics.totalDiscoveries;
                    break;
                case 'peakSeeker':
                    progress = this.state.statistics.maxHeight;
                    break;
                case 'speedDemon':
                    progress = this.state.statistics.maxSpeed;
                    break;
                case 'mudMaster':
                    progress = this.vehicle.getMudTime();
                    break;
                case 'rescueRanger':
                    progress = this.state.statistics.totalRecoveries;
                    break;
                case 'ironWheels':
                    progress = this.state.statistics.totalDistance;
                    break;
                // Add other achievement checks
            }

            achievement.progress = progress;

            // Check if tier is completed
            const requirement = Object.values(currentTier)[0];
            if (progress >= requirement) {
                this.completeAchievementTier(achievement);
            }
        });
    }

    completeAchievementTier(achievement) {
        const tier = achievement.tiers[achievement.currentTier];
        
        // Add rewards to pending
        this.state.pendingRewards.push({
            type: 'achievement',
            achievement: achievement.id,
            tier: achievement.currentTier,
            reward: tier.reward
        });

        // Update achievement state
        achievement.currentTier++;
        if (achievement.currentTier >= achievement.tiers.length) {
            achievement.completed = true;
        }

        // Emit event
        this.emit('achievementProgress', {
            id: achievement.id,
            tier: achievement.currentTier - 1,
            completed: achievement.completed,
            reward: tier.reward
        });
    }

    processPendingRewards() {
        while (this.state.pendingRewards.length > 0) {
            const reward = this.state.pendingRewards.shift();
            this.applyReward(reward);
        }
    }

    applyReward(reward) {
        switch (reward.type) {
            case 'milestone':
                this.vehicle.addExperience(reward.reward.experience);
                this.vehicle.addCurrency(reward.reward.currency);
                break;

            case 'achievement':
                this.vehicle.addExperience(reward.reward.experience);
                
                // Apply special rewards
                if (reward.reward.title) {
                    this.unlockTitle(reward.reward.title);
                }
                if (reward.reward.badge) {
                    this.unlockBadge(reward.reward.badge);
                }
                if (reward.reward.vehiclePaint) {
                    this.unlockVehiclePaint(reward.reward.vehiclePaint);
                }
                if (reward.reward.tires) {
                    this.unlockTires(reward.reward.tires);
                }
                if (reward.reward.suspension) {
                    this.unlockSuspension(reward.reward.suspension);
                }
                if (reward.reward.vehicle) {
                    this.unlockVehicle(reward.reward.vehicle);
                }
                if (reward.reward.winch) {
                    this.unlockWinch(reward.reward.winch);
                }
                if (reward.reward.tool) {
                    this.unlockTool(reward.reward.tool);
                }
                if (reward.reward.armor) {
                    this.unlockArmor(reward.reward.armor);
                }
                if (reward.reward.lights) {
                    this.unlockLights(reward.reward.lights);
                }
                break;
        }

        this.emit('rewardApplied', reward);
    }

    unlockTitle(title) {
        this.state.unlocked.add(`title_${title}`);
        this.emit('titleUnlocked', title);
    }

    unlockBadge(badge) {
        this.state.unlocked.add(`badge_${badge}`);
        this.emit('badgeUnlocked', badge);
    }

    unlockVehiclePaint(paint) {
        this.state.unlocked.add(`paint_${paint}`);
        this.emit('paintUnlocked', paint);
    }

    unlockTires(tires) {
        this.state.unlocked.add(`tires_${tires}`);
        this.emit('tiresUnlocked', tires);
    }

    unlockSuspension(suspension) {
        this.state.unlocked.add(`suspension_${suspension}`);
        this.emit('suspensionUnlocked', suspension);
    }

    unlockVehicle(vehicle) {
        this.state.unlocked.add(`vehicle_${vehicle}`);
        this.emit('vehicleUnlocked', vehicle);
    }

    unlockWinch(winch) {
        this.state.unlocked.add(`winch_${winch}`);
        this.emit('winchUnlocked', winch);
    }

    unlockTool(tool) {
        this.state.unlocked.add(`tool_${tool}`);
        this.emit('toolUnlocked', tool);
    }

    unlockArmor(armor) {
        this.state.unlocked.add(`armor_${armor}`);
        this.emit('armorUnlocked', armor);
    }

    unlockLights(lights) {
        this.state.unlocked.add(`lights_${lights}`);
        this.emit('lightsUnlocked', lights);
    }

    onVehicleUpdate(deltaTime) {
        // Additional vehicle-specific tracking can be added here
    }

    onVehicleCollision(data) {
        // Track collision-related achievements
    }

    onVehicleRecovery(data) {
        this.state.statistics.totalRecoveries++;
    }

    onMissionComplete(data) {
        this.state.statistics.totalMissions++;
    }

    onDiscovery(data) {
        this.state.statistics.totalDiscoveries++;
    }

    getProgress() {
        return {
            achievements: Array.from(this.state.achievements.values()).map(achievement => ({
                id: achievement.id,
                category: achievement.category,
                progress: achievement.progress,
                currentTier: achievement.currentTier,
                completed: achievement.completed
            })),
            milestones: this.state.milestones,
            statistics: this.state.statistics,
            unlocked: Array.from(this.state.unlocked)
        };
    }

    saveProgress() {
        const progress = this.getProgress();
        localStorage.setItem('vehicleAchievements', JSON.stringify(progress));
        this.state.lastSave = Date.now();
    }

    loadProgress() {
        const saved = localStorage.getItem('vehicleAchievements');
        if (saved) {
            const progress = JSON.parse(saved);
            
            // Restore achievements
            progress.achievements.forEach(saved => {
                const achievement = this.state.achievements.get(saved.id);
                if (achievement) {
                    achievement.progress = saved.progress;
                    achievement.currentTier = saved.currentTier;
                    achievement.completed = saved.completed;
                }
            });

            // Restore other state
            this.state.milestones = progress.milestones;
            this.state.statistics = progress.statistics;
            this.state.unlocked = new Set(progress.unlocked);
        }
    }

    dispose() {
        // Save progress before disposing
        this.saveProgress();

        // Clear intervals
        clearInterval(this.trackingInterval);
        clearInterval(this.saveInterval);

        // Clear state
        this.state.achievements.clear();
        this.state.unlocked.clear();
        this.state.pendingRewards = [];

        // Remove listeners
        this.removeAllListeners();
    }
} 