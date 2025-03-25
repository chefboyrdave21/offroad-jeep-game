export class GameLoop {
    constructor() {
        // Core systems
        this.systems = new Map();
        
        // Timing
        this.time = {
            current: 0,
            previous: 0,
            delta: 0,
            elapsed: 0,
            fps: 0,
            frameCount: 0,
            fpsUpdateInterval: 1000, // Update FPS every second
            lastFpsUpdate: 0,
            timeScale: 1.0,
            maxDelta: 1/30 // Cap maximum delta time to prevent large jumps
        };

        // State
        this.state = {
            isRunning: false,
            isPaused: false,
            debugMode: false
        };

        // Performance monitoring
        this.performance = {
            systemTimes: new Map(),
            averageFps: 0,
            minFps: Infinity,
            maxFps: 0,
            frameTimeHistory: [],
            historySize: 60 // Keep last 60 frames of timing data
        };

        // Debug info
        this.debug = {
            showFps: false,
            showSystemTimes: false,
            showMemoryUsage: false
        };

        this.initialize();
    }

    initialize() {
        // Bind update method to maintain context
        this.boundUpdate = this.update.bind(this);

        // Setup performance monitoring
        this.setupPerformanceMonitoring();
    }

    setupPerformanceMonitoring() {
        if (typeof window !== 'undefined' && window.performance) {
            this.performance.now = () => window.performance.now();
        } else {
            this.performance.now = () => Date.now();
        }
    }

    addSystem(name, system, priority = 0) {
        this.systems.set(name, {
            system,
            priority,
            enabled: true,
            timeSpent: 0
        });

        // Sort systems by priority
        this.sortSystems();
    }

    removeSystem(name) {
        this.systems.delete(name);
    }

    sortSystems() {
        // Convert map to array, sort, and convert back to map
        const sortedEntries = Array.from(this.systems.entries())
            .sort(([, a], [, b]) => b.priority - a.priority);
        
        this.systems = new Map(sortedEntries);
    }

    start() {
        if (this.state.isRunning) return;

        this.state.isRunning = true;
        this.time.previous = this.performance.now();
        this.time.lastFpsUpdate = this.time.previous;
        requestAnimationFrame(this.boundUpdate);
    }

    stop() {
        this.state.isRunning = false;
    }

    pause() {
        this.state.isPaused = true;
    }

    resume() {
        this.state.isPaused = false;
        this.time.previous = this.performance.now();
    }

    update() {
        if (!this.state.isRunning) return;

        // Calculate timing
        this.time.current = this.performance.now();
        this.time.delta = (this.time.current - this.time.previous) / 1000;
        
        // Cap maximum delta time
        this.time.delta = Math.min(this.time.delta, this.time.maxDelta);
        
        // Apply time scale
        const scaledDelta = this.time.delta * this.time.timeScale;

        // Update elapsed time
        this.time.elapsed += this.time.delta;

        // Update FPS counter
        this.updateFps();

        // Run system updates if not paused
        if (!this.state.isPaused) {
            this.updateSystems(scaledDelta);
        }

        // Store performance data
        this.updatePerformanceData();

        // Store current time for next frame
        this.time.previous = this.time.current;

        // Request next frame
        requestAnimationFrame(this.boundUpdate);
    }

    updateSystems(deltaTime) {
        for (const [name, systemData] of this.systems) {
            if (!systemData.enabled) continue;

            const startTime = this.performance.now();

            try {
                systemData.system.update(deltaTime);
            } catch (error) {
                console.error(`Error in system ${name}:`, error);
                systemData.enabled = false;
            }

            const endTime = this.performance.now();
            systemData.timeSpent = endTime - startTime;
            this.performance.systemTimes.set(name, systemData.timeSpent);
        }
    }

    updateFps() {
        this.time.frameCount++;

        const timeSinceLastUpdate = this.time.current - this.time.lastFpsUpdate;

        if (timeSinceLastUpdate >= this.time.fpsUpdateInterval) {
            this.time.fps = Math.round(
                (this.time.frameCount * 1000) / timeSinceLastUpdate
            );

            // Update FPS statistics
            this.performance.minFps = Math.min(this.performance.minFps, this.time.fps);
            this.performance.maxFps = Math.max(this.performance.maxFps, this.time.fps);
            this.performance.averageFps = (
                this.performance.averageFps * 0.9 + this.time.fps * 0.1
            );

            // Reset counters
            this.time.frameCount = 0;
            this.time.lastFpsUpdate = this.time.current;
        }
    }

    updatePerformanceData() {
        // Store frame time
        this.performance.frameTimeHistory.push(this.time.delta * 1000);
        if (this.performance.frameTimeHistory.length > this.performance.historySize) {
            this.performance.frameTimeHistory.shift();
        }
    }

    setTimeScale(scale) {
        this.time.timeScale = Math.max(0, scale);
    }

    enableSystem(name) {
        const systemData = this.systems.get(name);
        if (systemData) {
            systemData.enabled = true;
        }
    }

    disableSystem(name) {
        const systemData = this.systems.get(name);
        if (systemData) {
            systemData.enabled = false;
        }
    }

    toggleDebug() {
        this.state.debugMode = !this.state.debugMode;
    }

    getDebugInfo() {
        if (!this.state.debugMode) return null;

        return {
            fps: this.time.fps,
            frameTime: this.time.delta * 1000,
            systemTimes: Object.fromEntries(this.performance.systemTimes),
            averageFps: Math.round(this.performance.averageFps),
            minFps: this.performance.minFps,
            maxFps: this.performance.maxFps,
            memoryUsage: this.getMemoryUsage(),
            activeSystemCount: Array.from(this.systems.values())
                .filter(sys => sys.enabled).length
        };
    }

    getMemoryUsage() {
        if (typeof window !== 'undefined' && window.performance && 
            window.performance.memory) {
            const memory = window.performance.memory;
            return {
                total: memory.totalJSHeapSize / (1024 * 1024),
                used: memory.usedJSHeapSize / (1024 * 1024),
                limit: memory.jsHeapSizeLimit / (1024 * 1024)
            };
        }
        return null;
    }

    getSystemStatus(name) {
        const systemData = this.systems.get(name);
        if (!systemData) return null;

        return {
            enabled: systemData.enabled,
            priority: systemData.priority,
            timeSpent: systemData.timeSpent
        };
    }

    cleanup() {
        // Stop the game loop
        this.stop();

        // Clear all systems
        this.systems.clear();

        // Clear performance data
        this.performance.systemTimes.clear();
        this.performance.frameTimeHistory = [];
    }
} 