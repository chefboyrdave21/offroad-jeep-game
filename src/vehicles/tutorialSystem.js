import { EventEmitter } from 'events';

export class VehicleTutorialSystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            tutorials: {
                basics: {
                    steps: [
                        {
                            id: 'controls_intro',
                            title: 'Basic Controls',
                            tasks: [
                                { type: 'move_forward', goal: 50 },
                                { type: 'brake_stop', goal: 1 },
                                { type: 'turn_both', goal: 2 }
                            ],
                            rewards: { currency: 100, experience: 50 }
                        },
                        {
                            id: 'camera_views',
                            title: 'Camera Controls',
                            tasks: [
                                { type: 'switch_views', goal: 4 },
                                { type: 'look_around', goal: 1 }
                            ],
                            rewards: { currency: 50, experience: 25 }
                        },
                        {
                            id: 'terrain_basics',
                            title: 'Terrain Navigation',
                            tasks: [
                                { type: 'climb_hill', goal: 1 },
                                { type: 'cross_water', goal: 1 }
                            ],
                            rewards: { currency: 150, experience: 75 }
                        }
                    ]
                },
                advanced: {
                    steps: [
                        {
                            id: 'vehicle_systems',
                            title: 'Vehicle Systems',
                            tasks: [
                                { type: 'check_damage', goal: 1 },
                                { type: 'use_repair', goal: 1 },
                                { type: 'check_fuel', goal: 1 }
                            ],
                            rewards: { currency: 200, experience: 100 }
                        },
                        {
                            id: 'offroad_techniques',
                            title: 'Offroad Techniques',
                            tasks: [
                                { type: 'use_differential', goal: 1 },
                                { type: 'use_winch', goal: 1 },
                                { type: 'rock_crawl', goal: 1 }
                            ],
                            rewards: { currency: 300, experience: 150 }
                        }
                    ]
                },
                expert: {
                    steps: [
                        {
                            id: 'advanced_recovery',
                            title: 'Advanced Recovery',
                            tasks: [
                                { type: 'self_recovery', goal: 1 },
                                { type: 'stuck_escape', goal: 1 }
                            ],
                            rewards: { currency: 400, experience: 200 }
                        },
                        {
                            id: 'extreme_terrain',
                            title: 'Extreme Terrain',
                            tasks: [
                                { type: 'vertical_climb', goal: 1 },
                                { type: 'deep_water', goal: 1 }
                            ],
                            rewards: { currency: 500, experience: 250 }
                        }
                    ]
                }
            },
            hints: {
                display: {
                    duration: 5000,
                    fadeTime: 1000
                },
                triggers: {
                    stuck: { time: 10, attempts: 3 },
                    damage: { threshold: 0.3 },
                    fuel: { threshold: 0.2 }
                }
            },
            ui: {
                markers: {
                    size: 1,
                    opacity: 0.8,
                    fadeDistance: 50
                },
                highlights: {
                    color: '#ffff00',
                    pulseRate: 1.5
                }
            }
        };

        this.state = {
            active: null,
            completed: new Set(),
            progress: new Map(),
            hints: {
                shown: new Set(),
                current: null
            },
            stats: {
                tutorialsCompleted: 0,
                hintsShown: 0,
                timeSpent: 0
            }
        };

        this.initialize();
    }

    initialize() {
        this.initializeProgress();
        this.setupEventListeners();
        this.loadTutorialData();
    }

    initializeProgress() {
        Object.entries(this.settings.tutorials).forEach(([level, tutorial]) => {
            tutorial.steps.forEach(step => {
                this.state.progress.set(step.id, {
                    completed: false,
                    tasks: step.tasks.map(task => ({
                        ...task,
                        progress: 0,
                        completed: false
                    }))
                });
            });
        });
    }

    setupEventListeners() {
        this.vehicle.on('move', this.handleMovement.bind(this));
        this.vehicle.on('cameraChange', this.handleCameraChange.bind(this));
        this.vehicle.on('terrainContact', this.handleTerrainContact.bind(this));
        this.vehicle.on('systemUse', this.handleSystemUse.bind(this));
        this.vehicle.on('stuck', this.handleStuckState.bind(this));
    }

    loadTutorialData() {
        try {
            const saved = localStorage.getItem('vehicleTutorials');
            if (saved) {
                const data = JSON.parse(saved);
                this.loadSavedData(data);
            }
        } catch (error) {
            console.error('Failed to load tutorial data:', error);
        }
    }

    loadSavedData(data) {
        // Load completed tutorials
        data.completed.forEach(id => {
            this.state.completed.add(id);
        });

        // Load progress
        data.progress.forEach((progress, id) => {
            this.state.progress.set(id, progress);
        });

        // Load stats
        Object.assign(this.state.stats, data.stats);

        this.emit('tutorialDataLoaded', this.state);
    }

    startTutorial(levelId, stepId) {
        const level = this.settings.tutorials[levelId];
        if (!level) throw new Error('Invalid tutorial level');

        const step = level.steps.find(s => s.id === stepId);
        if (!step) throw new Error('Invalid tutorial step');

        if (this.state.active) {
            this.endTutorial(false);
        }

        this.state.active = {
            levelId,
            step,
            started: Date.now(),
            markers: new Map(),
            highlights: new Map()
        };

        this.setupTutorialStep(step);
        this.emit('tutorialStarted', { levelId, step });
    }

    setupTutorialStep(step) {
        // Create markers for objectives
        step.tasks.forEach(task => {
            const marker = this.createTaskMarker(task);
            this.state.active.markers.set(task.type, marker);
        });

        // Setup UI highlights
        this.setupUIHighlights(step);

        // Show initial hint
        this.showHint(step.initialHint);
    }

    createTaskMarker(task) {
        // Placeholder for marker creation logic
        return {
            position: this.getTaskPosition(task),
            visible: true
        };
    }

    setupUIHighlights(step) {
        step.tasks.forEach(task => {
            const highlight = this.createUIHighlight(task);
            this.state.active.highlights.set(task.type, highlight);
        });
    }

    createUIHighlight(task) {
        // Placeholder for UI highlight creation logic
        return {
            element: this.getUIElement(task),
            active: true
        };
    }

    updateTutorial(deltaTime) {
        if (!this.state.active) return;

        const step = this.state.active.step;
        const progress = this.state.progress.get(step.id);

        // Update task progress
        progress.tasks.forEach(task => {
            if (!task.completed) {
                this.updateTaskProgress(task);
            }
        });

        // Check for step completion
        if (this.isStepComplete(progress)) {
            this.completeTutorialStep(step);
        }

        // Update markers and highlights
        this.updateTutorialUI(deltaTime);

        // Update stats
        this.state.stats.timeSpent += deltaTime;
    }

    updateTaskProgress(task) {
        switch (task.type) {
            case 'move_forward':
                task.progress = this.vehicle.distanceDriven / task.goal;
                break;
            case 'brake_stop':
                task.progress = this.vehicle.brakingCount / task.goal;
                break;
            case 'turn_both':
                task.progress = this.vehicle.turningCount / task.goal;
                break;
            // Add more task type handlers
        }

        if (task.progress >= 1) {
            this.completeTask(task);
        }
    }

    completeTask(task) {
        task.completed = true;
        task.completedAt = Date.now();

        // Hide task marker
        const marker = this.state.active.markers.get(task.type);
        if (marker) marker.visible = false;

        // Remove UI highlight
        const highlight = this.state.active.highlights.get(task.type);
        if (highlight) highlight.active = false;

        this.emit('taskCompleted', task);
    }

    isStepComplete(progress) {
        return progress.tasks.every(task => task.completed);
    }

    completeTutorialStep(step) {
        const progress = this.state.progress.get(step.id);
        progress.completed = true;
        this.state.completed.add(step.id);
        this.state.stats.tutorialsCompleted++;

        // Award rewards
        this.awardStepRewards(step);

        // Clean up UI elements
        this.cleanupTutorialUI();

        // Save progress
        this.saveTutorialData();

        this.emit('tutorialStepCompleted', {
            step,
            timeSpent: Date.now() - this.state.active.started
        });

        // Check for next step
        const nextStep = this.getNextStep(step);
        if (nextStep) {
            this.startTutorial(this.state.active.levelId, nextStep.id);
        } else {
            this.endTutorial(true);
        }
    }

    awardStepRewards(step) {
        const { currency, experience } = step.rewards;
        this.vehicle.addCurrency(currency);
        this.vehicle.addExperience(experience);

        this.emit('rewardsAwarded', step.rewards);
    }

    getNextStep(currentStep) {
        const level = this.settings.tutorials[this.state.active.levelId];
        const currentIndex = level.steps.findIndex(s => s.id === currentStep.id);
        return level.steps[currentIndex + 1];
    }

    endTutorial(completed) {
        if (!this.state.active) return;

        this.cleanupTutorialUI();
        
        const result = {
            levelId: this.state.active.levelId,
            step: this.state.active.step,
            completed,
            timeSpent: Date.now() - this.state.active.started
        };

        this.state.active = null;
        this.emit('tutorialEnded', result);
    }

    cleanupTutorialUI() {
        // Remove markers
        this.state.active.markers.clear();

        // Remove highlights
        this.state.active.highlights.clear();

        // Hide hints
        this.hideHint();
    }

    showHint(hint) {
        if (this.state.hints.shown.has(hint.id)) return;

        this.state.hints.current = hint;
        this.state.hints.shown.add(hint.id);
        this.state.stats.hintsShown++;

        this.emit('hintShown', hint);

        // Auto-hide hint after duration
        setTimeout(() => {
            this.hideHint();
        }, this.settings.hints.display.duration);
    }

    hideHint() {
        if (this.state.hints.current) {
            this.state.hints.current = null;
            this.emit('hintHidden');
        }
    }

    handleMovement(data) {
        if (!this.state.active) return;

        const progress = this.state.progress.get(this.state.active.step.id);
        progress.tasks.forEach(task => {
            if (task.type === 'move_forward' || task.type === 'turn_both') {
                this.updateTaskProgress(task);
            }
        });
    }

    handleCameraChange(data) {
        if (!this.state.active) return;

        const progress = this.state.progress.get(this.state.active.step.id);
        progress.tasks.forEach(task => {
            if (task.type === 'switch_views' || task.type === 'look_around') {
                this.updateTaskProgress(task);
            }
        });
    }

    handleTerrainContact(data) {
        if (!this.state.active) return;

        const progress = this.state.progress.get(this.state.active.step.id);
        progress.tasks.forEach(task => {
            if (task.type.includes(data.terrainType)) {
                this.updateTaskProgress(task);
            }
        });
    }

    handleSystemUse(data) {
        if (!this.state.active) return;

        const progress = this.state.progress.get(this.state.active.step.id);
        progress.tasks.forEach(task => {
            if (task.type === `use_${data.system}`) {
                this.updateTaskProgress(task);
            }
        });
    }

    handleStuckState(data) {
        // Show help hint if player is stuck
        if (data.duration > this.settings.hints.triggers.stuck.time) {
            this.showHint({
                id: 'stuck_help',
                text: 'Try using the winch or differential lock to get unstuck'
            });
        }
    }

    getTutorialProgress() {
        return {
            completed: Array.from(this.state.completed),
            current: this.state.active ? {
                levelId: this.state.active.levelId,
                step: this.state.active.step,
                progress: this.state.progress.get(this.state.active.step.id)
            } : null,
            stats: { ...this.state.stats }
        };
    }

    saveTutorialData() {
        try {
            const data = {
                completed: Array.from(this.state.completed),
                progress: Array.from(this.state.progress.entries()),
                stats: this.state.stats
            };

            localStorage.setItem('vehicleTutorials', 
                               JSON.stringify(data));
            
            this.emit('tutorialDataSaved', data);
        } catch (error) {
            console.error('Failed to save tutorial data:', error);
        }
    }

    dispose() {
        this.cleanupTutorialUI();
        
        // Clear state
        this.state.completed.clear();
        this.state.progress.clear();
        this.state.hints.shown.clear();
        this.state.active = null;

        // Remove event listeners
        this.removeAllListeners();
    }
} 