import * as THREE from 'three';

export class MultiplayerSystem {
    constructor(gameState) {
        this.gameState = gameState;
        
        this.settings = {
            networkTickRate: 60,
            interpolationDelay: 100, // ms
            maxPlayers: 8,
            syncDistance: 300, // units
            predictionEnabled: true,
            reconciliationThreshold: 0.1,
            regions: ['na', 'eu', 'asia'],
            modes: {
                freeRoam: {
                    maxPlayers: 8,
                    allowCollision: false
                },
                race: {
                    maxPlayers: 4,
                    allowCollision: true,
                    countdown: true
                },
                challenge: {
                    maxPlayers: 2,
                    allowCollision: true,
                    timeLimit: 300 // seconds
                }
            }
        };

        this.state = {
            isHost: false,
            isConnected: false,
            roomId: null,
            players: new Map(),
            localPlayer: null,
            gameMode: null,
            latency: 0,
            lastUpdate: Date.now(),
            pendingInputs: [],
            serverTime: 0
        };

        this.initialize();
    }

    initialize() {
        this.setupNetworking();
        this.setupStateSync();
        this.setupPrediction();
        this.setupReconciliation();
    }

    setupNetworking() {
        this.connection = {
            socket: null,
            peer: null,
            dataChannels: new Map()
        };

        this.messageHandlers = {
            'player_join': this.handlePlayerJoin.bind(this),
            'player_leave': this.handlePlayerLeave.bind(this),
            'state_update': this.handleStateUpdate.bind(this),
            'input_update': this.handleInputUpdate.bind(this),
            'game_start': this.handleGameStart.bind(this),
            'game_end': this.handleGameEnd.bind(this),
            'collision': this.handleCollision.bind(this),
            'chat_message': this.handleChatMessage.bind(this)
        };
    }

    setupStateSync() {
        this.syncState = {
            buffer: new Map(),
            lastProcessedTick: 0,
            interpolation: {
                positions: new Map(),
                rotations: new Map()
            }
        };

        setInterval(() => {
            this.syncGameState();
        }, 1000 / this.settings.networkTickRate);
    }

    setupPrediction() {
        if (this.settings.predictionEnabled) {
            this.prediction = {
                lastProcessedInput: 0,
                pendingInputs: [],
                stateBuffer: []
            };
        }
    }

    setupReconciliation() {
        this.reconciliation = {
            threshold: this.settings.reconciliationThreshold,
            corrections: new Map(),
            lastReconcileTime: 0
        };
    }

    async createRoom(options = {}) {
        try {
            const roomConfig = {
                mode: options.mode || 'freeRoam',
                maxPlayers: options.maxPlayers || this.settings.maxPlayers,
                private: options.private || false,
                region: options.region || 'na'
            };

            const response = await this.networkRequest('create_room', roomConfig);
            this.state.roomId = response.roomId;
            this.state.isHost = true;
            
            await this.initializeHostState(roomConfig);
            return this.state.roomId;
        } catch (error) {
            console.error('Error creating room:', error);
            throw error;
        }
    }

    async joinRoom(roomId) {
        try {
            const response = await this.networkRequest('join_room', { roomId });
            this.state.roomId = roomId;
            this.state.isHost = false;

            await this.initializeClientState(response.gameState);
            return true;
        } catch (error) {
            console.error('Error joining room:', error);
            throw error;
        }
    }

    async initializeHostState(config) {
        this.state.gameMode = config.mode;
        this.state.localPlayer = this.createLocalPlayer();
        this.state.players.set(this.state.localPlayer.id, this.state.localPlayer);

        // Setup host-specific systems
        this.setupHostSystems();
    }

    async initializeClientState(gameState) {
        this.state.gameMode = gameState.mode;
        this.state.localPlayer = this.createLocalPlayer();
        this.state.players.set(this.state.localPlayer.id, this.state.localPlayer);

        // Initialize other players
        gameState.players.forEach(playerData => {
            if (playerData.id !== this.state.localPlayer.id) {
                this.addRemotePlayer(playerData);
            }
        });

        // Setup client-specific systems
        this.setupClientSystems();
    }

    createLocalPlayer() {
        return {
            id: this.generatePlayerId(),
            position: new THREE.Vector3(),
            rotation: new THREE.Euler(),
            velocity: new THREE.Vector3(),
            input: {
                sequence: 0,
                actions: new Set()
            },
            vehicle: null,
            stats: {
                score: 0,
                checkpoints: 0,
                bestLap: Infinity
            }
        };
    }

    addRemotePlayer(playerData) {
        const player = {
            id: playerData.id,
            position: new THREE.Vector3().fromArray(playerData.position),
            rotation: new THREE.Euler().fromArray(playerData.rotation),
            velocity: new THREE.Vector3().fromArray(playerData.velocity),
            vehicle: null,
            stats: playerData.stats
        };

        this.state.players.set(player.id, player);
        this.createRemoteVehicle(player);
    }

    createRemoteVehicle(player) {
        // Create visual representation of remote player's vehicle
        const vehicle = this.gameState.vehicleFactory.createNetworkedVehicle();
        player.vehicle = vehicle;
        this.gameState.scene.add(vehicle.mesh);
    }

    update(deltaTime) {
        if (!this.state.isConnected) return;

        this.updateLocalPlayer(deltaTime);
        this.updateRemotePlayers(deltaTime);
        this.processNetworkBuffer();
        
        if (this.settings.predictionEnabled) {
            this.updatePrediction();
        }
    }

    updateLocalPlayer(deltaTime) {
        const player = this.state.localPlayer;
        if (!player) return;

        // Process local input
        const input = this.gameState.input.getState();
        player.input.sequence++;
        player.input.actions = new Set(input.actions);

        // Apply input to local player
        this.applyPlayerInput(player, input, deltaTime);

        // Send input to server
        this.sendPlayerInput(player.input);

        if (this.settings.predictionEnabled) {
            this.prediction.pendingInputs.push({
                sequence: player.input.sequence,
                input: input,
                timestamp: Date.now()
            });
        }
    }

    updateRemotePlayers(deltaTime) {
        this.state.players.forEach(player => {
            if (player.id !== this.state.localPlayer.id) {
                this.interpolatePlayerState(player, deltaTime);
            }
        });
    }

    interpolatePlayerState(player, deltaTime) {
        const positions = this.syncState.interpolation.positions.get(player.id);
        const rotations = this.syncState.interpolation.rotations.get(player.id);

        if (!positions || !rotations || positions.length < 2) return;

        const timestamp = Date.now() - this.settings.interpolationDelay;
        let i = 0;

        // Find the two positions to interpolate between
        while (i < positions.length - 1 && positions[i + 1].timestamp <= timestamp) {
            i++;
        }

        if (i < positions.length - 1) {
            const p1 = positions[i];
            const p2 = positions[i + 1];
            const r1 = rotations[i];
            const r2 = rotations[i + 1];

            const alpha = (timestamp - p1.timestamp) / (p2.timestamp - p1.timestamp);

            player.position.lerpVectors(p1.position, p2.position, alpha);
            player.rotation.set(
                THREE.MathUtils.lerp(r1.x, r2.x, alpha),
                THREE.MathUtils.lerp(r1.y, r2.y, alpha),
                THREE.MathUtils.lerp(r1.z, r2.z, alpha)
            );

            // Update vehicle position
            if (player.vehicle) {
                player.vehicle.mesh.position.copy(player.position);
                player.vehicle.mesh.rotation.copy(player.rotation);
            }
        }
    }

    processNetworkBuffer() {
        const now = Date.now();
        const buffer = this.syncState.buffer;

        buffer.forEach((state, timestamp) => {
            if (now - timestamp > this.settings.interpolationDelay) {
                this.applyNetworkState(state);
                buffer.delete(timestamp);
            }
        });
    }

    updatePrediction() {
        // Process server reconciliation
        while (this.prediction.pendingInputs.length > 0) {
            const oldestInput = this.prediction.pendingInputs[0];
            if (oldestInput.sequence <= this.prediction.lastProcessedInput) {
                this.prediction.pendingInputs.shift();
            } else {
                break;
            }
        }

        // Reapply pending inputs
        this.prediction.pendingInputs.forEach(inputData => {
            this.applyPlayerInput(
                this.state.localPlayer,
                inputData.input,
                (Date.now() - inputData.timestamp) / 1000
            );
        });
    }

    sendPlayerInput(input) {
        this.sendNetworkMessage('input_update', {
            sequence: input.sequence,
            actions: Array.from(input.actions),
            timestamp: Date.now()
        });
    }

    handleStateUpdate(data) {
        this.syncState.buffer.set(data.timestamp, data.state);
        this.state.serverTime = data.serverTime;
        this.updateLatency(data.timestamp);
    }

    handlePlayerJoin(data) {
        if (!this.state.players.has(data.player.id)) {
            this.addRemotePlayer(data.player);
            this.gameState.events.emit('player_joined', {
                id: data.player.id,
                name: data.player.name
            });
        }
    }

    handlePlayerLeave(data) {
        const player = this.state.players.get(data.playerId);
        if (player) {
            if (player.vehicle) {
                this.gameState.scene.remove(player.vehicle.mesh);
                player.vehicle.dispose();
            }
            this.state.players.delete(data.playerId);
            this.gameState.events.emit('player_left', {
                id: data.playerId
            });
        }
    }

    handleInputUpdate(data) {
        const player = this.state.players.get(data.playerId);
        if (player && player.id !== this.state.localPlayer.id) {
            player.input = {
                sequence: data.sequence,
                actions: new Set(data.actions)
            };
        }
    }

    handleCollision(data) {
        if (this.state.gameMode.allowCollision) {
            this.processCollision(data);
        }
    }

    processCollision(data) {
        const player1 = this.state.players.get(data.player1Id);
        const player2 = this.state.players.get(data.player2Id);

        if (player1 && player2) {
            // Apply collision response
            this.applyCollisionResponse(player1, player2, data.impact);
        }
    }

    applyCollisionResponse(player1, player2, impact) {
        if (player1.vehicle && player2.vehicle) {
            // Calculate collision forces
            const force = impact.force;
            const direction = new THREE.Vector3().fromArray(impact.direction);

            // Apply forces to vehicles
            player1.vehicle.applyForce(direction.multiplyScalar(force));
            player2.vehicle.applyForce(direction.multiplyScalar(-force));
        }
    }

    updateLatency(timestamp) {
        this.state.latency = (Date.now() - timestamp) / 2;
    }

    dispose() {
        // Cleanup network connections
        if (this.connection.socket) {
            this.connection.socket.close();
        }

        this.connection.dataChannels.forEach(channel => {
            channel.close();
        });

        // Clear state
        this.state.players.forEach(player => {
            if (player.vehicle) {
                player.vehicle.dispose();
            }
        });

        this.state.players.clear();
        this.syncState.buffer.clear();
        this.syncState.interpolation.positions.clear();
        this.syncState.interpolation.rotations.clear();
    }
} 