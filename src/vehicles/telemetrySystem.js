import { EventEmitter } from 'events';

export class VehicleTelemetrySystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            metrics: {
                performance: {
                    engine: {
                        rpm: { min: 0, max: 8000, warning: 7000 },
                        temperature: { min: 60, max: 120, warning: 100 },
                        oil: { min: 0, max: 100, warning: 20 },
                        boost: { min: 0, max: 30, warning: 25 }
                    },
                    transmission: {
                        gear: { min: -1, max: 6 },
                        clutch: { min: 0, max: 100 },
                        efficiency: { min: 0, max: 100, warning: 40 }
                    },
                    wheels: {
                        speed: { min: 0, max: 200 },
                        slip: { min: 0, max: 100, warning: 80 },
                        temperature: { min: 20, max: 100, warning: 90 }
                    }
                },
                terrain: {
                    slope: { min: -90, max: 90, warning: 45 },
                    height: { min: 0, max: 1000 },
                    grip: { min: 0, max: 100, warning: 20 }
                },
                forces: {
                    suspension: { min: 0, max: 100, warning: 90 },
                    impact: { min: 0, max: 1000, warning: 800 },
                    lateral: { min: 0, max: 100, warning: 80 }
                }
            },
            sampling: {
                rate: 60,
                bufferSize: 3600,
                precision: 2
            },
            analysis: {
                intervals: [1, 5, 15, 30, 60],
                thresholds: {
                    performance: 0.7,
                    efficiency: 0.8,
                    stress: 0.9
                }
            },
            alerts: {
                levels: ['info', 'warning', 'critical'],
                cooldown: 5000
            }
        };

        this.state = {
            current: new Map(),
            history: new Map(),
            alerts: new Set(),
            analysis: {
                performance: new Map(),
                efficiency: new Map(),
                stress: new Map()
            },
            stats: {
                samplesCollected: 0,
                alertsTriggered: 0,
                analysisRuns: 0
            }
        };

        this.initialize();
    }

    initialize() {
        this.initializeMetrics();
        this.setupEventListeners();
        this.startSampling();
    }

    initializeMetrics() {
        // Initialize all metric categories
        Object.entries(this.settings.metrics).forEach(([category, metrics]) => {
            this.state.current.set(category, new Map());
            this.state.history.set(category, new Map());

            Object.entries(metrics).forEach(([system, parameters]) => {
                this.state.current.get(category).set(system, new Map());
                this.state.history.get(category).set(system, new Map());

                Object.keys(parameters).forEach(param => {
                    this.state.current.get(category).get(system).set(param, 0);
                    this.state.history.get(category).get(system).set(param, []);
                });
            });
        });
    }

    setupEventListeners() {
        this.vehicle.on('physics', this.updateMetrics.bind(this));
        this.vehicle.on('stateChange', this.handleStateChange.bind(this));
        this.vehicle.on('warning', this.handleWarning.bind(this));
    }

    startSampling() {
        setInterval(() => {
            this.sampleMetrics();
        }, 1000 / this.settings.sampling.rate);
    }

    updateMetrics(data) {
        // Update performance metrics
        this.updatePerformanceMetrics(data);
        // Update terrain metrics
        this.updateTerrainMetrics(data);
        // Update force metrics
        this.updateForceMetrics(data);

        this.checkAlerts();
        this.state.stats.samplesCollected++;
    }

    updatePerformanceMetrics(data) {
        const performance = this.state.current.get('performance');

        // Engine metrics
        performance.get('engine').set('rpm', data.rpm);
        performance.get('engine').set('temperature', data.engineTemp);
        performance.get('engine').set('oil', data.oilLevel);
        performance.get('engine').set('boost', data.boost);

        // Transmission metrics
        performance.get('transmission').set('gear', data.currentGear);
        performance.get('transmission').set('clutch', data.clutchPosition);
        performance.get('transmission').set('efficiency', data.transmissionEfficiency);

        // Wheel metrics
        performance.get('wheels').set('speed', data.wheelSpeed);
        performance.get('wheels').set('slip', data.wheelSlip);
        performance.get('wheels').set('temperature', data.wheelTemp);
    }

    updateTerrainMetrics(data) {
        const terrain = this.state.current.get('terrain');

        terrain.get('slope').set('value', data.terrainSlope);
        terrain.get('height').set('value', data.terrainHeight);
        terrain.get('grip').set('value', data.terrainGrip);
    }

    updateForceMetrics(data) {
        const forces = this.state.current.get('forces');

        forces.get('suspension').set('value', data.suspensionForce);
        forces.get('impact').set('value', data.impactForce);
        forces.get('lateral').set('value', data.lateralForce);
    }

    sampleMetrics() {
        this.state.current.forEach((category, categoryName) => {
            category.forEach((system, systemName) => {
                system.forEach((value, parameter) => {
                    const history = this.state.history
                        .get(categoryName)
                        .get(systemName)
                        .get(parameter);

                    history.push({
                        timestamp: Date.now(),
                        value: Number(value.toFixed(this.settings.sampling.precision))
                    });

                    // Maintain buffer size
                    if (history.length > this.settings.sampling.bufferSize) {
                        history.shift();
                    }
                });
            });
        });

        this.analyzeMetrics();
    }

    analyzeMetrics() {
        this.settings.analysis.intervals.forEach(interval => {
            this.analyzeInterval(interval);
        });

        this.state.stats.analysisRuns++;
    }

    analyzeInterval(minutes) {
        const timeWindow = minutes * 60 * 1000; // Convert to milliseconds
        const now = Date.now();

        // Analyze performance
        this.analyzePerformance(timeWindow, now);
        // Analyze efficiency
        this.analyzeEfficiency(timeWindow, now);
        // Analyze stress
        this.analyzeStress(timeWindow, now);
    }

    analyzePerformance(timeWindow, now) {
        const performance = this.state.current.get('performance');
        let totalScore = 0;
        let metrics = 0;

        performance.forEach((system, systemName) => {
            system.forEach((value, parameter) => {
                const history = this.getMetricHistory(
                    'performance',
                    systemName,
                    parameter,
                    timeWindow,
                    now
                );

                const score = this.calculateMetricScore(
                    history,
                    this.settings.metrics.performance[systemName][parameter]
                );

                totalScore += score;
                metrics++;
            });
        });

        const averageScore = totalScore / metrics;
        this.state.analysis.performance.set(timeWindow, averageScore);

        if (averageScore < this.settings.analysis.thresholds.performance) {
            this.triggerAlert('performance', averageScore);
        }
    }

    analyzeEfficiency(timeWindow, now) {
        const efficiency = new Map();
        let totalEfficiency = 0;
        let systems = 0;

        // Calculate efficiency for each system
        this.state.current.forEach((category, categoryName) => {
            category.forEach((system, systemName) => {
                const systemEfficiency = this.calculateSystemEfficiency(
                    categoryName,
                    systemName,
                    timeWindow,
                    now
                );

                efficiency.set(systemName, systemEfficiency);
                totalEfficiency += systemEfficiency;
                systems++;
            });
        });

        const averageEfficiency = totalEfficiency / systems;
        this.state.analysis.efficiency.set(timeWindow, averageEfficiency);

        if (averageEfficiency < this.settings.analysis.thresholds.efficiency) {
            this.triggerAlert('efficiency', averageEfficiency);
        }
    }

    analyzeStress(timeWindow, now) {
        const forces = this.state.current.get('forces');
        let totalStress = 0;
        let measurements = 0;

        forces.forEach((system, systemName) => {
            const history = this.getMetricHistory(
                'forces',
                systemName,
                'value',
                timeWindow,
                now
            );

            const stress = this.calculateStressLevel(
                history,
                this.settings.metrics.forces[systemName]
            );

            totalStress += stress;
            measurements++;
        });

        const averageStress = totalStress / measurements;
        this.state.analysis.stress.set(timeWindow, averageStress);

        if (averageStress > this.settings.analysis.thresholds.stress) {
            this.triggerAlert('stress', averageStress);
        }
    }

    getMetricHistory(category, system, parameter, timeWindow, now) {
        return this.state.history
            .get(category)
            .get(system)
            .get(parameter)
            .filter(sample => now - sample.timestamp <= timeWindow);
    }

    calculateMetricScore(history, parameters) {
        if (history.length === 0) return 1;

        const values = history.map(h => h.value);
        const average = values.reduce((a, b) => a + b) / values.length;
        const range = parameters.max - parameters.min;
        
        return Math.max(0, Math.min(1, 
            1 - Math.abs(average - (parameters.max + parameters.min) / 2) / (range / 2)
        ));
    }

    calculateSystemEfficiency(category, system, timeWindow, now) {
        const metrics = this.state.current.get(category).get(system);
        let totalEfficiency = 0;
        let parameters = 0;

        metrics.forEach((value, parameter) => {
            const history = this.getMetricHistory(
                category,
                system,
                parameter,
                timeWindow,
                now
            );

            const efficiency = this.calculateMetricEfficiency(
                history,
                this.settings.metrics[category][system][parameter]
            );

            totalEfficiency += efficiency;
            parameters++;
        });

        return totalEfficiency / parameters;
    }

    calculateMetricEfficiency(history, parameters) {
        if (history.length === 0) return 1;

        const values = history.map(h => h.value);
        const average = values.reduce((a, b) => a + b) / values.length;
        
        if (parameters.warning) {
            return Math.max(0, Math.min(1, 
                1 - (average / parameters.warning)
            ));
        }

        return 1;
    }

    calculateStressLevel(history, parameters) {
        if (history.length === 0) return 0;

        const values = history.map(h => h.value);
        const max = Math.max(...values);
        
        return Math.max(0, Math.min(1, 
            max / parameters.warning
        ));
    }

    checkAlerts() {
        this.state.current.forEach((category, categoryName) => {
            category.forEach((system, systemName) => {
                system.forEach((value, parameter) => {
                    const params = this.settings.metrics[categoryName][systemName][parameter];
                    
                    if (params.warning && value > params.warning) {
                        this.triggerAlert('warning', {
                            category: categoryName,
                            system: systemName,
                            parameter,
                            value
                        });
                    }
                });
            });
        });
    }

    triggerAlert(type, data) {
        const alert = {
            type,
            data,
            timestamp: Date.now()
        };

        // Check cooldown
        const existing = Array.from(this.state.alerts)
            .find(a => a.type === type && 
                  Date.now() - a.timestamp < this.settings.alerts.cooldown);

        if (!existing) {
            this.state.alerts.add(alert);
            this.state.stats.alertsTriggered++;
            this.emit('alert', alert);
        }
    }

    getMetricValue(category, system, parameter) {
        return this.state.current
            .get(category)
            .get(system)
            .get(parameter);
    }

    getMetricHistory(category, system, parameter, duration) {
        const history = this.state.history
            .get(category)
            .get(system)
            .get(parameter);

        if (duration) {
            const now = Date.now();
            return history.filter(sample => 
                now - sample.timestamp <= duration * 1000
            );
        }

        return history;
    }

    getAnalysis(interval) {
        return {
            performance: this.state.analysis.performance.get(interval),
            efficiency: this.state.analysis.efficiency.get(interval),
            stress: this.state.analysis.stress.get(interval)
        };
    }

    dispose() {
        // Clear state
        this.state.current.clear();
        this.state.history.clear();
        this.state.alerts.clear();
        this.state.analysis.performance.clear();
        this.state.analysis.efficiency.clear();
        this.state.analysis.stress.clear();

        // Remove event listeners
        this.removeAllListeners();
    }
} 