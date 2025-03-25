import { EventEmitter } from 'events';

export class VehicleSaveSystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            autosave: {
                enabled: true,
                interval: 300, // seconds
                maxAutosaves: 5
            },
            compression: {
                enabled: true,
                level: 6 // 0-9, higher = better compression
            },
            versioning: {
                current: '1.0.0',
                minCompatible: '1.0.0'
            },
            storage: {
                prefix: 'vehicle_save_',
                maxSaves: 50,
                maxSize: 5 * 1024 * 1024 // 5MB
            },
            backup: {
                enabled: true,
                location: 'backups/',
                maxBackups: 10
            }
        };

        this.state = {
            lastSave: null,
            lastAutosave: null,
            saveCount: 0,
            autosaveCount: 0,
            saves: new Map(),
            backups: new Map(),
            pendingChanges: false,
            loadInProgress: false
        };

        this.initialize();
    }

    initialize() {
        this.setupAutosave();
        this.loadSaveIndex();
        this.validateStorage();
    }

    setupAutosave() {
        if (this.settings.autosave.enabled) {
            this.autosaveInterval = setInterval(() => {
                this.createAutosave();
            }, this.settings.autosave.interval * 1000);
        }
    }

    async loadSaveIndex() {
        try {
            const index = await this.loadFromStorage('save_index');
            if (index) {
                this.state.saves = new Map(Object.entries(index.saves));
                this.state.saveCount = index.saveCount;
                this.state.autosaveCount = index.autosaveCount;
            }
        } catch (error) {
            console.error('Failed to load save index:', error);
            this.emit('error', { type: 'loadIndex', error });
        }
    }

    async validateStorage() {
        try {
            const totalSize = await this.calculateStorageSize();
            if (totalSize > this.settings.storage.maxSize) {
                await this.cleanupStorage();
            }
        } catch (error) {
            console.error('Storage validation failed:', error);
            this.emit('error', { type: 'storageValidation', error });
        }
    }

    async save(name, metadata = {}) {
        try {
            const saveData = await this.createSaveData(name, metadata);
            const compressed = await this.compressSaveData(saveData);
            
            await this.saveToStorage(this.getSaveKey(name), compressed);
            await this.updateSaveIndex(name, metadata);
            
            this.state.lastSave = Date.now();
            this.state.pendingChanges = false;
            
            this.emit('saved', { name, metadata });
            
            if (this.settings.backup.enabled) {
                await this.createBackup(name, compressed);
            }

            return true;
        } catch (error) {
            console.error('Save failed:', error);
            this.emit('error', { type: 'save', error });
            return false;
        }
    }

    async load(name) {
        try {
            this.state.loadInProgress = true;
            this.emit('loadStart', { name });

            const saveKey = this.getSaveKey(name);
            const compressed = await this.loadFromStorage(saveKey);
            
            if (!compressed) {
                throw new Error(`Save '${name}' not found`);
            }

            const saveData = await this.decompressSaveData(compressed);
            
            if (!this.validateSaveData(saveData)) {
                throw new Error(`Save '${name}' is invalid or incompatible`);
            }

            await this.applyVehicleState(saveData.vehicleState);
            
            this.state.loadInProgress = false;
            this.emit('loaded', { name, saveData });
            
            return true;
        } catch (error) {
            console.error('Load failed:', error);
            this.state.loadInProgress = false;
            this.emit('error', { type: 'load', error });
            return false;
        }
    }

    async createSaveData(name, metadata) {
        const vehicleState = await this.captureVehicleState();
        
        return {
            version: this.settings.versioning.current,
            timestamp: Date.now(),
            name,
            metadata,
            vehicleState
        };
    }

    async captureVehicleState() {
        // Capture all relevant vehicle state
        return {
            // Basic properties
            position: this.vehicle.position.toArray(),
            rotation: this.vehicle.quaternion.toArray(),
            velocity: this.vehicle.velocity.toArray(),
            angularVelocity: this.vehicle.angularVelocity.toArray(),

            // Physics state
            mass: this.vehicle.mass,
            inertia: this.vehicle.inertia.toArray(),
            centerOfMass: this.vehicle.centerOfMass.toArray(),

            // Vehicle systems
            engine: this.vehicle.engine.getState(),
            transmission: this.vehicle.transmission.getState(),
            suspension: this.vehicle.suspension.getState(),
            wheels: this.vehicle.wheels.map(wheel => wheel.getState()),
            brakes: this.vehicle.brakes.getState(),
            steering: this.vehicle.steering.getState(),

            // Customization
            customization: this.vehicle.customization.getState(),
            upgrades: this.vehicle.upgrades.getState(),
            damage: this.vehicle.damage.getState(),

            // Progress and stats
            statistics: this.vehicle.statistics.getState(),
            achievements: this.vehicle.achievements.getState(),
            progression: this.vehicle.progression.getState()
        };
    }

    async applyVehicleState(state) {
        // Apply state in the correct order
        await this.applyBasicProperties(state);
        await this.applyPhysicsState(state);
        await this.applyVehicleSystems(state);
        await this.applyCustomization(state);
        await this.applyProgress(state);
    }

    async applyBasicProperties(state) {
        this.vehicle.position.fromArray(state.position);
        this.vehicle.quaternion.fromArray(state.rotation);
        this.vehicle.velocity.fromArray(state.velocity);
        this.vehicle.angularVelocity.fromArray(state.angularVelocity);
    }

    async applyPhysicsState(state) {
        this.vehicle.mass = state.mass;
        this.vehicle.inertia.fromArray(state.inertia);
        this.vehicle.centerOfMass.fromArray(state.centerOfMass);
        this.vehicle.updatePhysics();
    }

    async applyVehicleSystems(state) {
        await this.vehicle.engine.setState(state.engine);
        await this.vehicle.transmission.setState(state.transmission);
        await this.vehicle.suspension.setState(state.suspension);
        
        for (let i = 0; i < state.wheels.length; i++) {
            await this.vehicle.wheels[i].setState(state.wheels[i]);
        }
        
        await this.vehicle.brakes.setState(state.brakes);
        await this.vehicle.steering.setState(state.steering);
    }

    async applyCustomization(state) {
        await this.vehicle.customization.setState(state.customization);
        await this.vehicle.upgrades.setState(state.upgrades);
        await this.vehicle.damage.setState(state.damage);
    }

    async applyProgress(state) {
        await this.vehicle.statistics.setState(state.statistics);
        await this.vehicle.achievements.setState(state.achievements);
        await this.vehicle.progression.setState(state.progression);
    }

    async createAutosave() {
        const name = `autosave_${Date.now()}`;
        const metadata = {
            type: 'autosave',
            index: this.state.autosaveCount + 1
        };

        const success = await this.save(name, metadata);
        
        if (success) {
            this.state.autosaveCount++;
            await this.pruneAutosaves();
        }
    }

    async pruneAutosaves() {
        const autosaves = Array.from(this.state.saves.entries())
            .filter(([_, save]) => save.metadata.type === 'autosave')
            .sort((a, b) => b[1].timestamp - a[1].timestamp);

        while (autosaves.length > this.settings.autosave.maxAutosaves) {
            const [name] = autosaves.pop();
            await this.deleteSave(name);
        }
    }

    async createBackup(name, data) {
        try {
            const backupName = `${name}_${Date.now()}`;
            await this.saveToStorage(
                `${this.settings.backup.location}${backupName}`,
                data
            );

            this.state.backups.set(backupName, {
                originalName: name,
                timestamp: Date.now()
            });

            await this.pruneBackups();
        } catch (error) {
            console.error('Backup creation failed:', error);
            this.emit('error', { type: 'backup', error });
        }
    }

    async pruneBackups() {
        const backups = Array.from(this.state.backups.entries())
            .sort((a, b) => b[1].timestamp - a[1].timestamp);

        while (backups.length > this.settings.backup.maxBackups) {
            const [name] = backups.pop();
            await this.deleteBackup(name);
        }
    }

    async compressSaveData(data) {
        if (!this.settings.compression.enabled) {
            return JSON.stringify(data);
        }

        try {
            const jsonString = JSON.stringify(data);
            const compressed = await this.compress(jsonString);
            return compressed;
        } catch (error) {
            console.error('Compression failed:', error);
            throw error;
        }
    }

    async decompressSaveData(compressed) {
        if (!this.settings.compression.enabled) {
            return JSON.parse(compressed);
        }

        try {
            const decompressed = await this.decompress(compressed);
            return JSON.parse(decompressed);
        } catch (error) {
            console.error('Decompression failed:', error);
            throw error;
        }
    }

    validateSaveData(data) {
        if (!data.version) return false;

        const currentVersion = this.parseVersion(this.settings.versioning.current);
        const saveVersion = this.parseVersion(data.version);
        const minVersion = this.parseVersion(this.settings.versioning.minCompatible);

        return this.compareVersions(saveVersion, minVersion) >= 0 &&
               this.compareVersions(saveVersion, currentVersion) <= 0;
    }

    parseVersion(version) {
        return version.split('.').map(Number);
    }

    compareVersions(v1, v2) {
        for (let i = 0; i < 3; i++) {
            if (v1[i] !== v2[i]) {
                return v1[i] - v2[i];
            }
        }
        return 0;
    }

    async updateSaveIndex(name, metadata) {
        this.state.saves.set(name, {
            timestamp: Date.now(),
            metadata
        });

        this.state.saveCount++;

        await this.saveToStorage('save_index', {
            saves: Object.fromEntries(this.state.saves),
            saveCount: this.state.saveCount,
            autosaveCount: this.state.autosaveCount
        });
    }

    async deleteSave(name) {
        try {
            await this.deleteFromStorage(this.getSaveKey(name));
            this.state.saves.delete(name);
            await this.updateSaveIndex(name);
            
            this.emit('deleted', { name });
            return true;
        } catch (error) {
            console.error('Delete failed:', error);
            this.emit('error', { type: 'delete', error });
            return false;
        }
    }

    async deleteBackup(name) {
        try {
            await this.deleteFromStorage(
                `${this.settings.backup.location}${name}`
            );
            this.state.backups.delete(name);
            return true;
        } catch (error) {
            console.error('Backup deletion failed:', error);
            return false;
        }
    }

    async calculateStorageSize() {
        let totalSize = 0;
        
        for (const [name] of this.state.saves) {
            const data = await this.loadFromStorage(this.getSaveKey(name));
            totalSize += this.getDataSize(data);
        }

        return totalSize;
    }

    async cleanupStorage() {
        const saves = Array.from(this.state.saves.entries())
            .sort((a, b) => b[1].timestamp - a[1].timestamp);

        while (await this.calculateStorageSize() > this.settings.storage.maxSize) {
            if (saves.length === 0) break;
            
            const [name] = saves.pop();
            await this.deleteSave(name);
        }
    }

    getSaveKey(name) {
        return `${this.settings.storage.prefix}${name}`;
    }

    getDataSize(data) {
        return new Blob([data]).size;
    }

    async saveToStorage(key, data) {
        try {
            localStorage.setItem(key, data);
            return true;
        } catch (error) {
            console.error('Storage save failed:', error);
            throw error;
        }
    }

    async loadFromStorage(key) {
        try {
            return localStorage.getItem(key);
        } catch (error) {
            console.error('Storage load failed:', error);
            throw error;
        }
    }

    async deleteFromStorage(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Storage delete failed:', error);
            throw error;
        }
    }

    async compress(data) {
        // Using a simple base64 encoding as placeholder
        // In a real implementation, use proper compression library
        return btoa(data);
    }

    async decompress(data) {
        // Using a simple base64 decoding as placeholder
        // In a real implementation, use proper compression library
        return atob(data);
    }

    markPendingChanges() {
        this.state.pendingChanges = true;
    }

    hasPendingChanges() {
        return this.state.pendingChanges;
    }

    dispose() {
        if (this.autosaveInterval) {
            clearInterval(this.autosaveInterval);
        }
        
        this.removeAllListeners();
    }
} 