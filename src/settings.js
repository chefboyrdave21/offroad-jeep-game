export class SettingsManager {
    constructor() {
        // Default settings
        this.defaultSettings = {
            graphics: {
                quality: 'high',
                shadows: true,
                antialiasing: true,
                particles: true,
                drawDistance: 1000,
                fov: 75,
                vsync: true
            },
            audio: {
                master: 1.0,
                music: 0.7,
                sfx: 0.8,
                engine: 0.9,
                ambient: 0.6
            },
            controls: {
                mouseSensitivity: 0.5,
                invertY: false,
                invertX: false,
                keyBindings: {
                    forward: 'KeyW',
                    backward: 'KeyS',
                    left: 'KeyA',
                    right: 'KeyD',
                    brake: 'Space',
                    winch: 'KeyE',
                    camera1: 'Digit1',
                    camera2: 'Digit2',
                    camera3: 'Digit3',
                    camera4: 'Digit4'
                }
            },
            gameplay: {
                difficulty: 'normal',
                showHUD: true,
                showTutorials: true,
                autoSave: true,
                cameraShake: true,
                units: 'imperial' // or 'metric'
            }
        };

        // Current settings
        this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
        
        // Load saved settings
        this.loadSettings();
    }

    setSetting(category, setting, value) {
        if (this.settings[category] && this.settings[category][setting] !== undefined) {
            this.settings[category][setting] = value;
            this.saveSettings();
            this.applySettings(category, setting);
            return true;
        }
        return false;
    }

    getSetting(category, setting) {
        if (this.settings[category] && this.settings[category][setting] !== undefined) {
            return this.settings[category][setting];
        }
        return null;
    }

    getCategory(category) {
        return this.settings[category] ? { ...this.settings[category] } : null;
    }

    getAllSettings() {
        return JSON.parse(JSON.stringify(this.settings));
    }

    resetToDefaults() {
        this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
        this.saveSettings();
        this.applyAllSettings();
    }

    resetCategory(category) {
        if (this.settings[category]) {
            this.settings[category] = JSON.parse(
                JSON.stringify(this.defaultSettings[category])
            );
            this.saveSettings();
            this.applySettings(category);
        }
    }

    saveSettings() {
        localStorage.setItem('jeepGameSettings', JSON.stringify(this.settings));
    }

    loadSettings() {
        const savedSettings = localStorage.getItem('jeepGameSettings');
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                // Merge saved settings with defaults to handle new settings
                this.settings = this.mergeSettings(this.defaultSettings, parsed);
            } catch (e) {
                console.error('Failed to load settings:', e);
                this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
            }
        }
    }

    mergeSettings(defaults, saved) {
        const merged = {};
        for (const category in defaults) {
            merged[category] = {};
            for (const setting in defaults[category]) {
                merged[category][setting] = saved[category]?.[setting] ?? defaults[category][setting];
            }
        }
        return merged;
    }

    applySettings(category, setting = null) {
        switch(category) {
            case 'graphics':
                this.applyGraphicsSettings(setting);
                break;
            case 'audio':
                this.applyAudioSettings(setting);
                break;
            case 'controls':
                this.applyControlSettings(setting);
                break;
            case 'gameplay':
                this.applyGameplaySettings(setting);
                break;
        }
    }

    applyAllSettings() {
        this.applySettings('graphics');
        this.applySettings('audio');
        this.applySettings('controls');
        this.applySettings('gameplay');
    }

    applyGraphicsSettings(setting) {
        // These would be implemented based on your rendering setup
        const graphics = this.settings.graphics;
        if (!setting || setting === 'quality') {
            // Apply quality settings
        }
        if (!setting || setting === 'shadows') {
            // Toggle shadows
        }
        if (!setting || setting === 'antialiasing') {
            // Toggle antialiasing
        }
        // etc...
    }

    applyAudioSettings(setting) {
        // These would be implemented based on your audio system
        const audio = this.settings.audio;
        if (!setting || setting === 'master') {
            // Set master volume
        }
        if (!setting || setting === 'music') {
            // Set music volume
        }
        // etc...
    }

    applyControlSettings(setting) {
        // These would be implemented based on your control system
        const controls = this.settings.controls;
        if (!setting || setting === 'mouseSensitivity') {
            // Update mouse sensitivity
        }
        if (!setting || setting === 'invertY') {
            // Update Y-axis inversion
        }
        // etc...
    }

    applyGameplaySettings(setting) {
        // These would be implemented based on your gameplay systems
        const gameplay = this.settings.gameplay;
        if (!setting || setting === 'difficulty') {
            // Update difficulty
        }
        if (!setting || setting === 'showHUD') {
            // Toggle HUD visibility
        }
        // etc...
    }

    validateSettings() {
        // Perform validation of current settings
        let isValid = true;
        const validation = {
            graphics: {
                quality: ['low', 'medium', 'high', 'ultra'],
                drawDistance: { min: 100, max: 2000 },
                fov: { min: 60, max: 120 }
            },
            audio: {
                master: { min: 0, max: 1 },
                music: { min: 0, max: 1 },
                sfx: { min: 0, max: 1 }
            },
            controls: {
                mouseSensitivity: { min: 0.1, max: 2.0 }
            }
        };

        // Implement validation logic
        return isValid;
    }
} 