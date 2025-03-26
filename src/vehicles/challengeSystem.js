import { EventEmitter } from 'events';
import * as THREE from 'three';

export class VehicleChallengeSystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            challenges: {
                race: {
                    types: {
                        circuit: {
                            laps: [3, 5, 7],
                            timeLimit: 300,
                            checkpointRadius: 10
                        },
                        sprint: {
                            timeLimit: 180,
                            checkpointRadius: 8
                        },
                        hillClimb: {
                            heightGoal: 500,
                            timeLimit: 240,
                            checkpointRadius: 12
                        }
                    },
                    scoring: {
                        time: { weight: 0.4, bonus: 100 },
                        position: { weight: 0.3, bonus: 150 },
                        style: { weight: 0.2, bonus: 75 },
                        damage: { weight: 0.1, penalty: 50 }
                    }
                },
                timeTrials: {
                    types: {
                        speed: {
                            distance: 1000,
                            minSpeed: 60
                        },
                        technical: {
                            gates: 20,
                            precision: 0.9
                        },
                        endurance: {
                            duration: 600,
                            minDistance: 5000
                        }
                    },
                    bonuses: {
                        perfect: 1.5,
                        clean: 1.3,
                        efficient: 1.2
                    }
                },
                special: {
                    types: {
                        stunt: {
                            targets: ['flip', 'spin', 'jump'],
                            timeLimit: 120
                        },
                        recovery: {
                            scenarios: ['mud', 'cliff', 'river'],
                            timeLimit: 300
                        },
                        exploration: {
                            objectives: ['viewpoints', 'secrets', 'trails'],
                            timeLimit: 600
                        }
                    },
                    rewards: {
                        base: 1000,
                        multiplier: {
                            easy: 1.0,
                            medium: 1.5,
                            hard: 2.0
                        }
                    }
                }
            },
            leaderboards: {
                categories: ['time', 'score', 'distance'],
                updateInterval: 60,
                displayLimit: 100
            },
            rewards: {
                currency: {
                    base: 500,
                    multiplier: {
                        position: [2.0, 1.5, 1.2],
                        difficulty: [1.0, 1.3, 1.6]
                    }
                },
                experience: {
                    base: 200,
                    multiplier: {
                        completion: 1.0,
                        performance: 0.5,
                        bonus: 0.3
                    }
                }
            }
        };

        this.state = {
            active: null,
            completed: new Map(),
            records: new Map(),
            statistics: {
                totalAttempts: 0,
                completions: 0,
                bestTimes: new Map(),
                highScores: new Map()
            }
        };

        this.initialize();
    }

    initialize() {
        this.setupEventListeners();
        this.loadChallengeData();
    }

    setupEventListeners() {
        this.vehicle.on('checkpoint', this.handleCheckpoint.bind(this));
        this.vehicle.on('collision', this.handleCollision.bind(this));
        this.vehicle.on('stunt', this.handleStunt.bind(this));
    }

    loadChallengeData() {
        try {
            const saved = localStorage.getItem('vehicleChallenges');
            if (saved) {
                const data = JSON.parse(saved);
                this.loadSavedData(data);
            }
        } catch (error) {
            console.error('Failed to load challenge data:', error);
        }
    }

    loadSavedData(data) {
        // Load completed challenges
        data.completed.forEach((challenge, id) => {
            this.state.completed.set(id, challenge);
        });

        // Load records
        data.records.forEach((record, id) => {
            this.state.records.set(id, record);
        });

        // Load statistics
        Object.assign(this.state.statistics, data.statistics);

        this.emit('challengeDataLoaded', this.state);
    }

    startChallenge(type, config) {
        if (this.state.active) {
            throw new Error('Challenge already in progress');
        }

        const challenge = this.createChallenge(type, config);
        this.state.active = challenge;
        this.state.statistics.totalAttempts++;

        this.setupChallenge(challenge);
        this.emit('challengeStarted', challenge);

        return challenge;
    }

    createChallenge(type, config) {
        const settings = this.settings.challenges[type].types[config.subtype];
        
        return {
            id: `${type}_${config.subtype}_${Date.now()}`,
            type,
            subtype: config.subtype,
            settings: { ...settings, ...config },
            state: {
                started: Date.now(),
                checkpoints: [],
                score: 0,
                bonuses: [],
                penalties: [],
                completed: false
            }
        };
    }

    setupChallenge(challenge) {
        switch (challenge.type) {
            case 'race':
                this.setupRaceChallenge(challenge);
                break;
            case 'timeTrials':
                this.setupTimeTrialChallenge(challenge);
                break;
            case 'special':
                this.setupSpecialChallenge(challenge);
                break;
        }
    }

    setupRaceChallenge(challenge) {
        const checkpoints = this.generateCheckpoints(challenge);
        challenge.state.checkpoints = checkpoints.map(pos => ({
            position: pos,
            reached: false,
            time: null
        }));
    }

    setupTimeTrialChallenge(challenge) {
        challenge.state.metrics = {
            distance: 0,
            speed: [],
            precision: 0
        };
    }

    setupSpecialChallenge(challenge) {
        challenge.state.objectives = this.generateObjectives(challenge);
    }

    generateCheckpoints(challenge) {
        // Placeholder for checkpoint generation logic
        return [];
    }

    generateObjectives(challenge) {
        // Placeholder for objective generation logic
        return [];
    }

    updateChallenge(deltaTime) {
        if (!this.state.active) return;

        const challenge = this.state.active;
        this.updateChallengeState(challenge, deltaTime);
        this.checkChallengeCompletion(challenge);
    }

    updateChallengeState(challenge, deltaTime) {
        switch (challenge.type) {
            case 'race':
                this.updateRaceState(challenge, deltaTime);
                break;
            case 'timeTrials':
                this.updateTimeTrialState(challenge, deltaTime);
                break;
            case 'special':
                this.updateSpecialState(challenge, deltaTime);
                break;
        }
    }

    updateRaceState(challenge, deltaTime) {
        const position = this.vehicle.position;
        
        challenge.state.checkpoints.forEach(checkpoint => {
            if (!checkpoint.reached && 
                this.isCheckpointReached(position, checkpoint.position)) {
                this.reachCheckpoint(checkpoint);
            }
        });
    }

    updateTimeTrialState(challenge, deltaTime) {
        const metrics = challenge.state.metrics;
        metrics.distance += this.vehicle.speed * deltaTime;
        metrics.speed.push(this.vehicle.speed);
        
        if (challenge.subtype === 'technical') {
            this.updatePrecisionMetrics(challenge);
        }
    }

    updateSpecialState(challenge, deltaTime) {
        challenge.state.objectives.forEach(objective => {
            if (!objective.completed && 
                this.isObjectiveComplete(objective)) {
                this.completeObjective(objective);
            }
        });
    }

    isCheckpointReached(position, checkpointPos) {
        return position.distanceTo(checkpointPos) <= 
            this.state.active.settings.checkpointRadius;
    }

    reachCheckpoint(checkpoint) {
        checkpoint.reached = true;
        checkpoint.time = Date.now() - this.state.active.state.started;
        
        this.emit('checkpointReached', checkpoint);
    }

    updatePrecisionMetrics(challenge) {
        // Update precision based on vehicle's path adherence
        const idealPath = challenge.settings.idealPath;
        const currentPos = this.vehicle.position;
        const deviation = this.calculatePathDeviation(currentPos, idealPath);
        
        challenge.state.metrics.precision = 
            (challenge.state.metrics.precision + 
             Math.max(0, 1 - deviation / 5)) / 2;
    }

    calculatePathDeviation(position, idealPath) {
        // Placeholder for path deviation calculation
        return 0;
    }

    isObjectiveComplete(objective) {
        switch (objective.type) {
            case 'stunt':
                return this.checkStuntCompletion(objective);
            case 'recovery':
                return this.checkRecoveryCompletion(objective);
            case 'exploration':
                return this.checkExplorationCompletion(objective);
            default:
                return false;
        }
    }

    completeObjective(objective) {
        objective.completed = true;
        objective.time = Date.now() - this.state.active.state.started;
        
        this.emit('objectiveCompleted', objective);
    }

    checkChallengeCompletion(challenge) {
        let completed = false;

        switch (challenge.type) {
            case 'race':
                completed = this.checkRaceCompletion(challenge);
                break;
            case 'timeTrials':
                completed = this.checkTimeTrialCompletion(challenge);
                break;
            case 'special':
                completed = this.checkSpecialCompletion(challenge);
                break;
        }

        if (completed) {
            this.completeChallenge(challenge);
        }
    }

    completeChallenge(challenge) {
        challenge.state.completed = true;
        challenge.state.endTime = Date.now();

        const results = this.calculateResults(challenge);
        this.updateRecords(challenge, results);
        this.awardRewards(challenge, results);

        this.state.active = null;
        this.state.completed.set(challenge.id, {
            ...challenge,
            results
        });

        this.state.statistics.completions++;
        this.saveChallengeData();

        this.emit('challengeCompleted', {
            challenge,
            results
        });
    }

    calculateResults(challenge) {
        const results = {
            time: Date.now() - challenge.state.started,
            score: 0,
            bonuses: [],
            penalties: []
        };

        switch (challenge.type) {
            case 'race':
                this.calculateRaceResults(challenge, results);
                break;
            case 'timeTrials':
                this.calculateTimeTrialResults(challenge, results);
                break;
            case 'special':
                this.calculateSpecialResults(challenge, results);
                break;
        }

        return results;
    }

    calculateRaceResults(challenge, results) {
        const scoring = this.settings.challenges.race.scoring;
        
        // Time score
        const timeScore = Math.max(0, 
            1 - (results.time / challenge.settings.timeLimit)
        ) * scoring.time.weight * scoring.time.bonus;

        // Position score
        const positionScore = this.calculatePositionScore(challenge) * 
            scoring.position.weight * scoring.position.bonus;

        // Style score
        const styleScore = this.calculateStyleScore(challenge) *
            scoring.style.weight * scoring.style.bonus;

        // Damage penalty
        const damagePenalty = this.vehicle.damage * 
            scoring.damage.weight * scoring.damage.penalty;

        results.score = timeScore + positionScore + styleScore - damagePenalty;
    }

    calculateTimeTrialResults(challenge, results) {
        const metrics = challenge.state.metrics;
        const bonuses = this.settings.challenges.timeTrials.bonuses;

        // Base score
        results.score = metrics.distance * 
            (challenge.subtype === 'speed' ? 
                Math.max(0, metrics.speed.reduce((a, b) => a + b) / metrics.speed.length - 
                challenge.settings.minSpeed) / 50 : 1);

        // Apply bonuses
        if (metrics.precision >= 0.95) results.bonuses.push(['perfect', bonuses.perfect]);
        if (this.vehicle.damage === 0) results.bonuses.push(['clean', bonuses.clean]);
        if (this.vehicle.efficiency > 0.8) results.bonuses.push(['efficient', bonuses.efficient]);

        // Apply bonus multipliers
        results.bonuses.forEach(([_, multiplier]) => {
            results.score *= multiplier;
        });
    }

    calculateSpecialResults(challenge, results) {
        const objectives = challenge.state.objectives;
        const rewards = this.settings.challenges.special.rewards;

        // Base score from completed objectives
        results.score = objectives.filter(obj => obj.completed).length * 
            rewards.base;

        // Apply difficulty multiplier
        results.score *= rewards.multiplier[challenge.settings.difficulty];

        // Time bonus
        if (results.time < challenge.settings.timeLimit * 0.7) {
            results.bonuses.push(['quick_completion', 1.3]);
        }
    }

    updateRecords(challenge, results) {
        const currentRecord = this.state.records.get(challenge.id);
        
        if (!currentRecord || results.score > currentRecord.score) {
            this.state.records.set(challenge.id, {
                score: results.score,
                time: results.time,
                date: Date.now()
            });

            this.emit('recordBroken', {
                challenge,
                results,
                previousRecord: currentRecord
            });
        }
    }

    awardRewards(challenge, results) {
        const rewards = this.calculateRewards(challenge, results);
        
        this.vehicle.addCurrency(rewards.currency);
        this.vehicle.addExperience(rewards.experience);

        this.emit('rewardsAwarded', {
            challenge,
            rewards
        });
    }

    calculateRewards(challenge, results) {
        const rewardSettings = this.settings.rewards;
        
        // Calculate currency reward
        let currency = rewardSettings.currency.base;
        
        // Position multiplier
        const position = this.getLeaderboardPosition(challenge.id, results.score);
        if (position < 3) {
            currency *= rewardSettings.currency.multiplier.position[position];
        }
        
        // Difficulty multiplier
        currency *= rewardSettings.currency.multiplier.difficulty[
            challenge.settings.difficulty === 'easy' ? 0 :
            challenge.settings.difficulty === 'medium' ? 1 : 2
        ];

        // Calculate experience reward
        let experience = rewardSettings.experience.base;
        
        // Completion bonus
        experience *= rewardSettings.experience.multiplier.completion;
        
        // Performance bonus
        if (results.score > this.getAverageScore(challenge.id)) {
            experience *= rewardSettings.experience.multiplier.performance;
        }
        
        // Special bonuses
        results.bonuses.forEach(() => {
            experience *= rewardSettings.experience.multiplier.bonus;
        });

        return { currency, experience };
    }

    getLeaderboardPosition(challengeId, score) {
        const scores = this.getLeaderboardScores(challengeId);
        return scores.findIndex(s => score > s);
    }

    getAverageScore(challengeId) {
        const scores = this.getLeaderboardScores(challengeId);
        return scores.reduce((a, b) => a + b, 0) / scores.length;
    }

    getLeaderboardScores(challengeId) {
        const completed = Array.from(this.state.completed.values())
            .filter(c => c.id === challengeId)
            .map(c => c.results.score)
            .sort((a, b) => b - a);

        return completed.slice(0, this.settings.leaderboards.displayLimit);
    }

    saveChallengeData() {
        try {
            const data = {
                completed: Array.from(this.state.completed.entries()),
                records: Array.from(this.state.records.entries()),
                statistics: this.state.statistics
            };

            localStorage.setItem('vehicleChallenges', 
                               JSON.stringify(data));
            
            this.emit('challengeDataSaved', data);
        } catch (error) {
            console.error('Failed to save challenge data:', error);
        }
    }

    dispose() {
        // Clear state
        this.state.completed.clear();
        this.state.records.clear();
        this.state.active = null;

        // Remove event listeners
        this.removeAllListeners();
    }
} 