import * as THREE from 'three';

export class AudioSystem {
    constructor(camera) {
        // Core audio components
        this.listener = new THREE.AudioListener();
        camera.add(this.listener);
        
        // Audio settings
        this.settings = {
            masterVolume: 1.0,
            musicVolume: 0.7,
            sfxVolume: 1.0,
            engineVolume: 0.8,
            environmentVolume: 0.6,
            doppler: 1,
            rolloffFactor: 1,
            distanceModel: 'inverse',
            maxDistance: 100
        };

        // Sound collections
        this.sounds = {
            music: new Map(),
            sfx: new Map(),
            engine: new Map(),
            environment: new Map()
        };

        // Sound states
        this.state = {
            currentMusic: null,
            engineState: {
                rpm: 0,
                load: 0
            },
            environmentState: {
                wind: 0,
                rain: 0
            }
        };

        // Engine sound components
        this.engineSoundComponents = {
            idle: null,
            low: null,
            mid: null,
            high: null
        };

        this.initialize();
    }

    initialize() {
        // Create audio context
        this.context = THREE.AudioContext.getContext();
        
        // Setup audio processing
        this.setupAudioProcessing();
    }

    setupAudioProcessing() {
        // Create master gain node
        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = this.settings.masterVolume;
        this.masterGain.connect(this.context.destination);

        // Create category gain nodes
        this.categoryGains = {
            music: this.context.createGain(),
            sfx: this.context.createGain(),
            engine: this.context.createGain(),
            environment: this.context.createGain()
        };

        // Connect category gains to master
        Object.values(this.categoryGains).forEach(gain => {
            gain.connect(this.masterGain);
        });

        // Set initial volumes
        this.categoryGains.music.gain.value = this.settings.musicVolume;
        this.categoryGains.sfx.gain.value = this.settings.sfxVolume;
        this.categoryGains.engine.gain.value = this.settings.engineVolume;
        this.categoryGains.environment.gain.value = this.settings.environmentVolume;
    }

    async loadSound(category, id, url, options = {}) {
        const audioLoader = new THREE.AudioLoader();
        
        try {
            const buffer = await new Promise((resolve, reject) => {
                audioLoader.load(url, resolve, undefined, reject);
            });

            let sound;
            if (options.positional) {
                sound = new THREE.PositionalAudio(this.listener);
                sound.setRefDistance(options.refDistance || 1);
                sound.setRolloffFactor(this.settings.rolloffFactor);
                sound.setDistanceModel(this.settings.distanceModel);
                sound.setMaxDistance(this.settings.maxDistance);
            } else {
                sound = new THREE.Audio(this.listener);
            }

            sound.setBuffer(buffer);
            sound.setVolume(options.volume || 1);
            sound.setLoop(options.loop || false);

            if (options.filters) {
                this.applyAudioFilters(sound, options.filters);
            }

            this.sounds[category].set(id, sound);
            return sound;

        } catch (error) {
            console.error(`Error loading sound ${id}:`, error);
            return null;
        }
    }

    applyAudioFilters(sound, filters) {
        if (filters.lowpass) {
            const lowpass = this.context.createBiquadFilter();
            lowpass.type = 'lowpass';
            lowpass.frequency.value = filters.lowpass.frequency || 1000;
            lowpass.Q.value = filters.lowpass.Q || 1;
            sound.filters.push(lowpass);
        }

        if (filters.highpass) {
            const highpass = this.context.createBiquadFilter();
            highpass.type = 'highpass';
            highpass.frequency.value = filters.highpass.frequency || 1000;
            highpass.Q.value = filters.highpass.Q || 1;
            sound.filters.push(highpass);
        }

        // Connect filters
        if (sound.filters.length > 0) {
            sound.disconnect();
            let lastNode = sound.source;
            sound.filters.forEach(filter => {
                lastNode.connect(filter);
                lastNode = filter;
            });
            lastNode.connect(sound.gain);
        }
    }

    async setupEngineSounds() {
        // Load engine sound components
        await Promise.all([
            this.loadSound('engine', 'idle', 'sounds/engine/idle.mp3', {
                loop: true,
                filters: { lowpass: { frequency: 800 } }
            }),
            this.loadSound('engine', 'low', 'sounds/engine/low.mp3', {
                loop: true,
                filters: { bandpass: { frequency: 1200 } }
            }),
            this.loadSound('engine', 'mid', 'sounds/engine/mid.mp3', {
                loop: true,
                filters: { bandpass: { frequency: 2400 } }
            }),
            this.loadSound('engine', 'high', 'sounds/engine/high.mp3', {
                loop: true,
                filters: { highpass: { frequency: 4000 } }
            })
        ]);

        // Store references
        this.engineSoundComponents.idle = this.sounds.engine.get('idle');
        this.engineSoundComponents.low = this.sounds.engine.get('low');
        this.engineSoundComponents.mid = this.sounds.engine.get('mid');
        this.engineSoundComponents.high = this.sounds.engine.get('high');
    }

    updateEngineSounds(rpm, load) {
        if (!this.engineSoundComponents.idle) return;

        this.state.engineState.rpm = rpm;
        this.state.engineState.load = load;

        // Calculate component volumes based on RPM and load
        const idleVolume = Math.max(0, 1 - rpm / 2000);
        const lowVolume = Math.min(1, rpm / 2000) * Math.min(1, load);
        const midVolume = Math.min(1, rpm / 4000) * load;
        const highVolume = Math.max(0, rpm - 4000) / 2000 * load;

        // Update volumes
        this.engineSoundComponents.idle.setVolume(idleVolume * this.settings.engineVolume);
        this.engineSoundComponents.low.setVolume(lowVolume * this.settings.engineVolume);
        this.engineSoundComponents.mid.setVolume(midVolume * this.settings.engineVolume);
        this.engineSoundComponents.high.setVolume(highVolume * this.settings.engineVolume);

        // Update playback rate based on RPM
        const playbackRate = 0.5 + (rpm / 6000) * 1.5;
        Object.values(this.engineSoundComponents).forEach(sound => {
            if (sound) sound.setPlaybackRate(playbackRate);
        });
    }

    playMusic(id, fadeTime = 1) {
        const music = this.sounds.music.get(id);
        if (!music) return;

        if (this.state.currentMusic) {
            this.fadeOut(this.state.currentMusic, fadeTime);
        }

        this.fadeIn(music, fadeTime);
        this.state.currentMusic = music;
    }

    fadeIn(sound, duration) {
        if (!sound) return;

        sound.setVolume(0);
        sound.play();

        const startTime = this.context.currentTime;
        sound.gain.gain.setValueAtTime(0, startTime);
        sound.gain.gain.linearRampToValueAtTime(1, startTime + duration);
    }

    fadeOut(sound, duration) {
        if (!sound) return;

        const startTime = this.context.currentTime;
        sound.gain.gain.setValueAtTime(sound.gain.gain.value, startTime);
        sound.gain.gain.linearRampToValueAtTime(0, startTime + duration);

        setTimeout(() => {
            sound.stop();
        }, duration * 1000);
    }

    playSoundAtPosition(id, position, options = {}) {
        const sound = this.sounds.sfx.get(id);
        if (!sound || !sound.isPositionalAudio) return;

        sound.position.copy(position);
        
        if (options.velocity) {
            sound.setVelocity(options.velocity);
        }

        if (options.volume !== undefined) {
            sound.setVolume(options.volume * this.settings.sfxVolume);
        }

        if (options.playbackRate !== undefined) {
            sound.setPlaybackRate(options.playbackRate);
        }

        sound.play();
    }

    updateEnvironmentSounds(params) {
        this.state.environmentState = { ...this.state.environmentState, ...params };

        // Update wind sound
        const windSound = this.sounds.environment.get('wind');
        if (windSound) {
            windSound.setVolume(params.wind * this.settings.environmentVolume);
            windSound.setPlaybackRate(0.5 + params.wind);
        }

        // Update rain sound
        const rainSound = this.sounds.environment.get('rain');
        if (rainSound) {
            rainSound.setVolume(params.rain * this.settings.environmentVolume);
        }
    }

    setVolume(category, volume) {
        if (category === 'master') {
            this.settings.masterVolume = volume;
            this.masterGain.gain.value = volume;
        } else if (this.categoryGains[category]) {
            this.settings[`${category}Volume`] = volume;
            this.categoryGains[category].gain.value = volume;
        }
    }

    stopAll() {
        Object.values(this.sounds).forEach(category => {
            category.forEach(sound => {
                if (sound.isPlaying) {
                    sound.stop();
                }
            });
        });
    }

    dispose() {
        // Stop all sounds
        this.stopAll();

        // Disconnect and clear audio nodes
        this.masterGain.disconnect();
        Object.values(this.categoryGains).forEach(gain => {
            gain.disconnect();
        });

        // Clear collections
        Object.values(this.sounds).forEach(category => {
            category.clear();
        });

        // Remove listener
        if (this.listener.parent) {
            this.listener.parent.remove(this.listener);
        }
    }
} 