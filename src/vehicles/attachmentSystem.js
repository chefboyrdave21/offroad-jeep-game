import * as THREE from 'three';
import { EventEmitter } from 'events';

export class VehicleAttachmentSystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            attachmentPoints: {
                front: {
                    position: new THREE.Vector3(0, 0.5, 2.5),
                    rotation: new THREE.Euler(0, 0, 0),
                    allowedTypes: ['winch', 'bullbar', 'lights', 'towHook']
                },
                rear: {
                    position: new THREE.Vector3(0, 0.5, -2.5),
                    rotation: new THREE.Euler(0, Math.PI, 0),
                    allowedTypes: ['winch', 'towHook', 'lights']
                },
                roof: {
                    position: new THREE.Vector3(0, 2, 0),
                    rotation: new THREE.Euler(0, 0, 0),
                    allowedTypes: ['lightBar', 'rackCage', 'snorkel']
                },
                sides: {
                    position: new THREE.Vector3(1.2, 1, 0),
                    rotation: new THREE.Euler(0, Math.PI / 2, 0),
                    allowedTypes: ['sideBars', 'lights', 'storage']
                }
            },
            attachments: {
                winch: {
                    name: "Winch",
                    types: {
                        basic: {
                            name: "Basic Winch",
                            cost: 1000,
                            strength: 2000, // kg
                            ropeLength: 15, // meters
                            speed: 1.0,
                            model: 'models/attachments/winch_basic.glb'
                        },
                        premium: {
                            name: "Premium Winch",
                            cost: 2500,
                            strength: 4000,
                            ropeLength: 25,
                            speed: 1.5,
                            model: 'models/attachments/winch_premium.glb'
                        }
                    }
                },
                bullbar: {
                    name: "Bull Bar",
                    types: {
                        steel: {
                            name: "Steel Bull Bar",
                            cost: 800,
                            protection: 75,
                            weight: 50,
                            model: 'models/attachments/bullbar_steel.glb'
                        },
                        aluminum: {
                            name: "Aluminum Bull Bar",
                            cost: 1200,
                            protection: 60,
                            weight: 30,
                            model: 'models/attachments/bullbar_aluminum.glb'
                        }
                    }
                },
                lights: {
                    name: "Auxiliary Lights",
                    types: {
                        halogen: {
                            name: "Halogen Lights",
                            cost: 300,
                            brightness: 1000, // lumens
                            power: 55, // watts
                            model: 'models/attachments/lights_halogen.glb'
                        },
                        led: {
                            name: "LED Lights",
                            cost: 600,
                            brightness: 2000,
                            power: 30,
                            model: 'models/attachments/lights_led.glb'
                        }
                    }
                },
                lightBar: {
                    name: "Light Bar",
                    types: {
                        single: {
                            name: "Single Row Light Bar",
                            cost: 800,
                            brightness: 5000,
                            power: 100,
                            model: 'models/attachments/lightbar_single.glb'
                        },
                        double: {
                            name: "Double Row Light Bar",
                            cost: 1500,
                            brightness: 10000,
                            power: 180,
                            model: 'models/attachments/lightbar_double.glb'
                        }
                    }
                },
                snorkel: {
                    name: "Snorkel",
                    types: {
                        basic: {
                            name: "Basic Snorkel",
                            cost: 400,
                            waterDepth: 0.8, // meters
                            model: 'models/attachments/snorkel_basic.glb'
                        },
                        safari: {
                            name: "Safari Snorkel",
                            cost: 800,
                            waterDepth: 1.2,
                            model: 'models/attachments/snorkel_safari.glb'
                        }
                    }
                },
                storage: {
                    name: "Storage",
                    types: {
                        toolbox: {
                            name: "Tool Box",
                            cost: 300,
                            capacity: 50, // liters
                            model: 'models/attachments/storage_toolbox.glb'
                        },
                        rack: {
                            name: "Cargo Rack",
                            cost: 600,
                            capacity: 200,
                            model: 'models/attachments/storage_rack.glb'
                        }
                    }
                }
            }
        };

        this.state = {
            installedAttachments: new Map(),
            activeWinch: null,
            activeLights: new Set(),
            storageContents: new Map(),
            currency: 0
        };

        this.initialize();
    }

    initialize() {
        this.loadAttachmentModels();
        this.setupEventListeners();
        this.loadSavedState();
    }

    async loadAttachmentModels() {
        this.models = new Map();
        const loader = new THREE.GLTFLoader();

        for (const [category, data] of Object.entries(this.settings.attachments)) {
            for (const [type, config] of Object.entries(data.types)) {
                try {
                    const model = await loader.loadAsync(config.model);
                    this.models.set(`${category}_${type}`, model.scene.clone());
                } catch (error) {
                    console.error(`Failed to load model for ${category} ${type}:`, error);
                }
            }
        }
    }

    setupEventListeners() {
        this.vehicle.on('collision', this.handleCollision.bind(this));
        this.vehicle.on('underwater', this.handleUnderwater.bind(this));
        this.vehicle.on('nighttime', this.handleNighttime.bind(this));
    }

    loadSavedState() {
        const savedState = localStorage.getItem('vehicleAttachments');
        if (savedState) {
            const parsed = JSON.parse(savedState);
            this.state = {
                ...this.state,
                ...parsed,
                installedAttachments: new Map(Object.entries(parsed.installedAttachments)),
                activeLights: new Set(parsed.activeLights),
                storageContents: new Map(Object.entries(parsed.storageContents))
            };
            this.reapplyAttachments();
        }
    }

    saveState() {
        const saveData = {
            ...this.state,
            installedAttachments: Object.fromEntries(this.state.installedAttachments),
            activeLights: Array.from(this.state.activeLights),
            storageContents: Object.fromEntries(this.state.storageContents)
        };
        localStorage.setItem('vehicleAttachments', JSON.stringify(saveData));
    }

    canInstall(attachmentType, variant, position) {
        const attachmentPoint = this.settings.attachmentPoints[position];
        const attachment = this.settings.attachments[attachmentType]?.types[variant];

        if (!attachmentPoint || !attachment) {
            return { possible: false, reason: 'Invalid attachment or position' };
        }

        if (!attachmentPoint.allowedTypes.includes(attachmentType)) {
            return { possible: false, reason: 'Attachment not allowed at this position' };
        }

        if (this.state.installedAttachments.has(position)) {
            return { possible: false, reason: 'Position already occupied' };
        }

        if (this.state.currency < attachment.cost) {
            return { possible: false, reason: 'Insufficient funds' };
        }

        return { possible: true, reason: null };
    }

    async installAttachment(attachmentType, variant, position) {
        const { possible, reason } = this.canInstall(attachmentType, variant, position);
        
        if (!possible) {
            throw new Error(`Cannot install attachment: ${reason}`);
        }

        const attachment = this.settings.attachments[attachmentType].types[variant];
        const attachmentPoint = this.settings.attachmentPoints[position];

        // Create attachment instance
        const model = this.models.get(`${attachmentType}_${variant}`).clone();
        model.position.copy(attachmentPoint.position);
        model.rotation.copy(attachmentPoint.rotation);

        // Add to vehicle
        this.vehicle.add(model);

        // Update state
        this.state.installedAttachments.set(position, {
            type: attachmentType,
            variant,
            model,
            config: attachment
        });

        // Deduct cost
        this.state.currency -= attachment.cost;

        // Apply attachment effects
        this.applyAttachmentEffects(position);

        // Save state
        this.saveState();

        // Emit event
        this.emit('attachmentInstalled', {
            position,
            type: attachmentType,
            variant,
            config: attachment
        });

        return true;
    }

    removeAttachment(position) {
        const attachment = this.state.installedAttachments.get(position);
        if (!attachment) {
            throw new Error('No attachment installed at this position');
        }

        // Remove from vehicle
        this.vehicle.remove(attachment.model);

        // Remove effects
        this.removeAttachmentEffects(position);

        // Update state
        this.state.installedAttachments.delete(position);

        // Save state
        this.saveState();

        // Emit event
        this.emit('attachmentRemoved', {
            position,
            type: attachment.type,
            variant: attachment.variant
        });

        return true;
    }

    applyAttachmentEffects(position) {
        const attachment = this.state.installedAttachments.get(position);
        if (!attachment) return;

        switch (attachment.type) {
            case 'winch':
                this.setupWinch(position, attachment);
                break;
            case 'bullbar':
                this.vehicle.setCollisionProtection(position, attachment.config.protection);
                break;
            case 'lights':
            case 'lightBar':
                this.setupLights(position, attachment);
                break;
            case 'snorkel':
                this.vehicle.setWaterDepthLimit(attachment.config.waterDepth);
                break;
            case 'storage':
                this.setupStorage(position, attachment);
                break;
        }
    }

    removeAttachmentEffects(position) {
        const attachment = this.state.installedAttachments.get(position);
        if (!attachment) return;

        switch (attachment.type) {
            case 'winch':
                this.disableWinch(position);
                break;
            case 'bullbar':
                this.vehicle.setCollisionProtection(position, 0);
                break;
            case 'lights':
            case 'lightBar':
                this.disableLights(position);
                break;
            case 'snorkel':
                this.vehicle.setWaterDepthLimit(0);
                break;
            case 'storage':
                this.clearStorage(position);
                break;
        }
    }

    setupWinch(position, attachment) {
        const winch = {
            position,
            strength: attachment.config.strength,
            ropeLength: attachment.config.ropeLength,
            speed: attachment.config.speed,
            active: false,
            target: null,
            rope: null
        };

        // Create rope visualization
        const ropeGeometry = new THREE.BufferGeometry();
        const ropeMaterial = new THREE.LineBasicMaterial({ color: 0x888888 });
        winch.rope = new THREE.Line(ropeGeometry, ropeMaterial);
        this.vehicle.add(winch.rope);

        this.state.activeWinch = winch;
    }

    disableWinch(position) {
        if (this.state.activeWinch?.position === position) {
            if (this.state.activeWinch.rope) {
                this.vehicle.remove(this.state.activeWinch.rope);
            }
            this.state.activeWinch = null;
        }
    }

    setupLights(position, attachment) {
        const light = new THREE.SpotLight(
            0xffffff,
            attachment.config.brightness / 1000,
            50,
            Math.PI / 4
        );
        
        const attachmentPoint = this.settings.attachmentPoints[position];
        light.position.copy(attachmentPoint.position);
        light.target.position.copy(attachmentPoint.position.clone().add(new THREE.Vector3(0, 0, 10)));
        
        this.vehicle.add(light);
        this.vehicle.add(light.target);

        const lightData = {
            position,
            light,
            power: attachment.config.power,
            active: false
        };

        this.state.activeLights.add(lightData);
    }

    disableLights(position) {
        for (const lightData of this.state.activeLights) {
            if (lightData.position === position) {
                this.vehicle.remove(lightData.light);
                this.vehicle.remove(lightData.light.target);
                this.state.activeLights.delete(lightData);
                break;
            }
        }
    }

    setupStorage(position, attachment) {
        this.state.storageContents.set(position, {
            capacity: attachment.config.capacity,
            contents: []
        });
    }

    clearStorage(position) {
        this.state.storageContents.delete(position);
    }

    toggleWinch(target) {
        if (!this.state.activeWinch) {
            throw new Error('No winch installed');
        }

        if (!this.state.activeWinch.active) {
            // Activate winch
            const distance = this.vehicle.position.distanceTo(target);
            if (distance > this.state.activeWinch.ropeLength) {
                throw new Error('Target too far');
            }

            this.state.activeWinch.active = true;
            this.state.activeWinch.target = target;

            // Update rope visualization
            this.updateWinchRope();

            this.emit('winchActivated', {
                position: this.state.activeWinch.position,
                target
            });
        } else {
            // Deactivate winch
            this.state.activeWinch.active = false;
            this.state.activeWinch.target = null;
            this.updateWinchRope();

            this.emit('winchDeactivated', {
                position: this.state.activeWinch.position
            });
        }
    }

    updateWinchRope() {
        if (!this.state.activeWinch?.rope) return;

        const positions = [];
        if (this.state.activeWinch.active && this.state.activeWinch.target) {
            positions.push(
                this.state.activeWinch.rope.position.x,
                this.state.activeWinch.rope.position.y,
                this.state.activeWinch.rope.position.z,
                this.state.activeWinch.target.x,
                this.state.activeWinch.target.y,
                this.state.activeWinch.target.z
            );
        }

        this.state.activeWinch.rope.geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        );
    }

    toggleLights() {
        for (const lightData of this.state.activeLights) {
            lightData.active = !lightData.active;
            lightData.light.visible = lightData.active;
        }

        this.emit('lightsToggled', {
            active: Array.from(this.state.activeLights).some(light => light.active)
        });
    }

    addToStorage(position, item) {
        const storage = this.state.storageContents.get(position);
        if (!storage) {
            throw new Error('No storage at this position');
        }

        const currentVolume = storage.contents.reduce((sum, item) => sum + item.volume, 0);
        if (currentVolume + item.volume > storage.capacity) {
            throw new Error('Storage full');
        }

        storage.contents.push(item);
        this.saveState();

        this.emit('itemStored', {
            position,
            item
        });
    }

    removeFromStorage(position, itemIndex) {
        const storage = this.state.storageContents.get(position);
        if (!storage || !storage.contents[itemIndex]) {
            throw new Error('Invalid storage or item');
        }

        const item = storage.contents.splice(itemIndex, 1)[0];
        this.saveState();

        this.emit('itemRemoved', {
            position,
            item
        });

        return item;
    }

    handleCollision(collision) {
        // Check bullbar protection
        for (const [position, attachment] of this.state.installedAttachments) {
            if (attachment.type === 'bullbar') {
                const protection = attachment.config.protection;
                collision.force *= (1 - protection / 100);
            }
        }
    }

    handleUnderwater(depth) {
        // Check snorkel
        let maxDepth = 0;
        for (const attachment of this.state.installedAttachments.values()) {
            if (attachment.type === 'snorkel') {
                maxDepth = Math.max(maxDepth, attachment.config.waterDepth);
            }
        }

        if (depth > maxDepth) {
            this.emit('engineFlooded');
        }
    }

    handleNighttime(isNight) {
        if (isNight) {
            // Auto-enable lights if installed
            if (this.state.activeLights.size > 0 && 
                !Array.from(this.state.activeLights).some(light => light.active)) {
                this.toggleLights();
            }
        }
    }

    reapplyAttachments() {
        for (const [position] of this.state.installedAttachments) {
            this.applyAttachmentEffects(position);
        }
    }

    update(deltaTime) {
        // Update winch physics
        if (this.state.activeWinch?.active) {
            this.updateWinchPhysics(deltaTime);
        }

        // Update attachment positions based on vehicle movement
        this.updateAttachmentTransforms();
    }

    updateWinchPhysics(deltaTime) {
        if (!this.state.activeWinch?.target) return;

        const winchPos = this.vehicle.position.clone().add(
            this.settings.attachmentPoints[this.state.activeWinch.position].position
        );
        const targetPos = this.state.activeWinch.target.clone();
        const direction = targetPos.sub(winchPos).normalize();
        const force = direction.multiplyScalar(this.state.activeWinch.strength * deltaTime);

        this.vehicle.applyForce(force);
        this.updateWinchRope();
    }

    updateAttachmentTransforms() {
        for (const [position, attachment] of this.state.installedAttachments) {
            const point = this.settings.attachmentPoints[position];
            attachment.model.position.copy(point.position);
            attachment.model.rotation.copy(point.rotation);
            attachment.model.updateMatrix();
        }
    }

    dispose() {
        // Clean up THREE.js objects
        for (const attachment of this.state.installedAttachments.values()) {
            attachment.model.geometry?.dispose();
            attachment.model.material?.dispose();
        }

        for (const lightData of this.state.activeLights) {
            lightData.light.dispose();
        }

        if (this.state.activeWinch?.rope) {
            this.state.activeWinch.rope.geometry.dispose();
            this.state.activeWinch.rope.material.dispose();
        }

        // Clear state
        this.state.installedAttachments.clear();
        this.state.activeLights.clear();
        this.state.storageContents.clear();
        this.state.activeWinch = null;

        // Save final state
        this.saveState();

        // Remove event listeners
        this.removeAllListeners();
    }
} 