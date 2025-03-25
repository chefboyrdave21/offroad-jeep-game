export class GameStateManager {
    constructor() {
        this.states = {
            MAIN_MENU: 'mainMenu',
            GARAGE: 'garage',
            LOADING: 'loading',
            PLAYING: 'playing',
            PAUSED: 'paused',
            LEVEL_SELECT: 'levelSelect',
            CUSTOMIZATION: 'customization',
            GAME_OVER: 'gameOver',
            REPLAY: 'replay'
        };

        this.currentState = this.states.MAIN_MENU;
        this.previousState = null;
        this.stateData = new Map();
        this.listeners = new Map();
        
        // Game progress data
        this.gameData = {
            credits: 0,
            unlockedVehicles: new Set(['tj_stock']),
            unlockedLevels: new Set(['level_1']),
            highScores: new Map(),
            achievements: new Set(),
            totalPlayTime: 0
        };

        this.loadGameData();
    }

    setState(newState, data = {}) {
        this.previousState = this.currentState;
        this.currentState = newState;
        this.stateData.set(newState, data);

        // Notify listeners of state change
        this.notifyListeners('stateChange', {
            from: this.previousState,
            to: newState,
            data: data
        });
    }

    getCurrentState() {
        return {
            state: this.currentState,
            data: this.stateData.get(this.currentState) || {}
        };
    }

    getPreviousState() {
        return {
            state: this.previousState,
            data: this.stateData.get(this.previousState) || {}
        };
    }

    addListener(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }

    removeListener(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    notifyListeners(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => callback(data));
        }
    }

    // Game progress management
    addCredits(amount) {
        this.gameData.credits += amount;
        this.saveGameData();
        this.notifyListeners('creditsChanged', this.gameData.credits);
    }

    unlockVehicle(vehicleId) {
        this.gameData.unlockedVehicles.add(vehicleId);
        this.saveGameData();
        this.notifyListeners('vehicleUnlocked', vehicleId);
    }

    unlockLevel(levelId) {
        this.gameData.unlockedLevels.add(levelId);
        this.saveGameData();
        this.notifyListeners('levelUnlocked', levelId);
    }

    updateHighScore(levelId, score) {
        const currentHighScore = this.gameData.highScores.get(levelId) || 0;
        if (score > currentHighScore) {
            this.gameData.highScores.set(levelId, score);
            this.saveGameData();
            this.notifyListeners('highScoreUpdated', { levelId, score });
            return true;
        }
        return false;
    }

    addAchievement(achievementId) {
        if (!this.gameData.achievements.has(achievementId)) {
            this.gameData.achievements.add(achievementId);
            this.saveGameData();
            this.notifyListeners('achievementUnlocked', achievementId);
        }
    }

    updatePlayTime(seconds) {
        this.gameData.totalPlayTime += seconds;
        this.saveGameData();
    }

    // Save/Load game data
    saveGameData() {
        const saveData = {
            credits: this.gameData.credits,
            unlockedVehicles: Array.from(this.gameData.unlockedVehicles),
            unlockedLevels: Array.from(this.gameData.unlockedLevels),
            highScores: Array.from(this.gameData.highScores.entries()),
            achievements: Array.from(this.gameData.achievements),
            totalPlayTime: this.gameData.totalPlayTime
        };

        localStorage.setItem('jeepGameData', JSON.stringify(saveData));
    }

    loadGameData() {
        const savedData = localStorage.getItem('jeepGameData');
        if (savedData) {
            const data = JSON.parse(savedData);
            this.gameData = {
                credits: data.credits || 0,
                unlockedVehicles: new Set(data.unlockedVehicles),
                unlockedLevels: new Set(data.unlockedLevels),
                highScores: new Map(data.highScores),
                achievements: new Set(data.achievements),
                totalPlayTime: data.totalPlayTime || 0
            };
        }
    }

    resetGameData() {
        this.gameData = {
            credits: 0,
            unlockedVehicles: new Set(['tj_stock']),
            unlockedLevels: new Set(['level_1']),
            highScores: new Map(),
            achievements: new Set(),
            totalPlayTime: 0
        };
        this.saveGameData();
        this.notifyListeners('gameDataReset', null);
    }

    // Game state queries
    isVehicleUnlocked(vehicleId) {
        return this.gameData.unlockedVehicles.has(vehicleId);
    }

    isLevelUnlocked(levelId) {
        return this.gameData.unlockedLevels.has(levelId);
    }

    getHighScore(levelId) {
        return this.gameData.highScores.get(levelId) || 0;
    }

    getGameSummary() {
        return {
            credits: this.gameData.credits,
            unlockedVehicles: this.gameData.unlockedVehicles.size,
            unlockedLevels: this.gameData.unlockedLevels.size,
            achievements: this.gameData.achievements.size,
            totalPlayTime: this.gameData.totalPlayTime
        };
    }
} 