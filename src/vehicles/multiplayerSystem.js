import { EventEmitter } from 'events';
import * as THREE from 'three';

export class VehicleMultiplayerSystem extends EventEmitter {
    constructor(vehicle) {
        super();
        this.vehicle = vehicle;

        this.settings = {
            network: {
                updateRate: 60, // Hz
                interpolationDelay: 100, // ms
                maxExtrapolationTime: 250, // ms
                snapshotHistoryLength: 60, // frames
                compressionThresholds: {
                    position: 0.01, // meters
                    rotation: 0.01, // radians
                    velocity: 0.1, // m/s
                    angularVelocity: 0.1 // rad/s
                }
            },
            synchronization: {
                priorityProperties: [
                    'position',
                    'rotation',
                    'velocity',
                    'angularVelocity',
                    'wheelRotation',
                    'suspension'
                ],
                interpolationProperties: [
                    'position',
                    'rotation',
                    'suspension'
                ],
                extrapolationProperties: [
                    'velocity',
                    'angularVelocity'
                ]
            },
            interaction: {
                proximityThreshold: 50, // meters
                voiceChatRange: 100, // meters
                maxPlayers: 16,
                teams: {
                    enabled: true,
                    maxSize: 4
                }
            },
            events: {
                types: {
                    collision: { priority: 'high', reliable: true },
                    recovery: { priority: 'medium', reliable: true },
                    chat: { priority: 'low', reliable: false },
                    position: { priority: 'high', reliable: false }
                },
                maxQueueSize: 100
            }
        };

        this.state = {
            connection: {
                id: null,
                connected: false,
                latency: 0,
                lastPing: 0,
                packetLoss: 0
            },
            players: new Map(),
            localPlayer: {
                id: null,
                team: null,
                ready: false
            },
            snapshots: {
                sent: [],
                received: new Map()
            },
            interpolation: {
                buffer: new Map(),
                lastUpdate: 0
            },
            events: {
                queue: [],
                processed: new Set()
            },
            teams: new Map(),
            voiceChat: {
                active: false,
                peers: new Set()
            }
        };

        this.initialize();
    }

    initialize() {
        this.setupNetworking();
        this.setupEventHandlers();
        this.setupInterpolation();
    }

    setupNetworking() {
        // Initialize WebRTC connection
        this.peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        });

        // Setup data channel for reliable messages
        this.reliableChannel = this.peerConnection.createDataChannel('reliable', {
            ordered: true
        });

        // Setup data channel for unreliable messages
        this.unreliableChannel = this.peerConnection.createDataChannel('unreliable', {
            ordered: false,
            maxRetransmits: 0
        });

        // Setup voice chat
        this.setupVoiceChat();

        // Handle connection events
        this.peerConnection.oniceconnectionstatechange = () => {
            this.handleConnectionStateChange();
        };

        // Start connection monitoring
        this.startNetworkMonitoring();
    }

    setupVoiceChat() {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                this.localStream = stream;
                stream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, stream);
                });
            })
            .catch(error => {
                this.emit('error', 'Voice chat initialization failed');
            });

        this.peerConnection.ontrack = (event) => {
            this.handleRemoteTrack(event);
        };
    }

    setupEventHandlers() {
        // Vehicle events
        this.vehicle.on('update', this.onVehicleUpdate.bind(this));
        this.vehicle.on('collision', this.onVehicleCollision.bind(this));
        this.vehicle.on('stateChange', this.onVehicleStateChange.bind(this));

        // Network events
        this.reliableChannel.onmessage = this.handleReliableMessage.bind(this);
        this.unreliableChannel.onmessage = this.handleUnreliableMessage.bind(this);

        // Game events
        this.setupGameEventHandlers();
    }

    setupInterpolation() {
        this.interpolationTimer = setInterval(() => {
            this.updateInterpolation();
        }, 1000 / this.settings.network.updateRate);
    }

    connect(serverUrl) {
        return new Promise((resolve, reject) => {
            // Create WebSocket connection to signaling server
            this.signaling = new WebSocket(serverUrl);

            this.signaling.onopen = () => {
                this.sendJoinRequest();
            };

            this.signaling.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleSignalingMessage(message);
            };

            this.signaling.onerror = (error) => {
                reject(error);
            };

            // Set timeout for connection
            setTimeout(() => {
                if (!this.state.connection.connected) {
                    reject(new Error('Connection timeout'));
                }
            }, 10000);
        });
    }

    sendJoinRequest() {
        const request = {
            type: 'join',
            vehicle: this.vehicle.getSpecifications(),
            timestamp: Date.now()
        };

        this.signaling.send(JSON.stringify(request));
    }

    handleSignalingMessage(message) {
        switch (message.type) {
            case 'welcome':
                this.state.connection.id = message.clientId;
                this.state.localPlayer.id = message.clientId;
                this.initializeSession(message.session);
                break;

            case 'offer':
                this.handlePeerOffer(message);
                break;

            case 'answer':
                this.handlePeerAnswer(message);
                break;

            case 'ice-candidate':
                this.handleIceCandidate(message);
                break;

            case 'player-joined':
                this.handlePlayerJoined(message);
                break;

            case 'player-left':
                this.handlePlayerLeft(message);
                break;
        }
    }

    initializeSession(session) {
        // Initialize session data
        session.players.forEach(player => {
            this.state.players.set(player.id, {
                ...player,
                lastUpdate: Date.now(),
                interpolation: {
                    position: new THREE.Vector3(),
                    rotation: new THREE.Euler()
                }
            });
        });

        // Initialize teams
        session.teams.forEach(team => {
            this.state.teams.set(team.id, {
                players: new Set(team.players),
                score: team.score
            });
        });

        this.state.connection.connected = true;
        this.emit('connected', {
            id: this.state.connection.id,
            players: Array.from(this.state.players.values()),
            teams: Array.from(this.state.teams.entries())
        });
    }

    sendVehicleState() {
        const state = this.compressVehicleState(this.vehicle.getState());
        
        // Store snapshot
        this.state.snapshots.sent.push({
            timestamp: Date.now(),
            state
        });

        // Maintain snapshot history length
        if (this.state.snapshots.sent.length > this.settings.network.snapshotHistoryLength) {
            this.state.snapshots.sent.shift();
        }

        // Send through unreliable channel
        this.unreliableChannel.send(JSON.stringify({
            type: 'vehicle-state',
            clientId: this.state.connection.id,
            timestamp: Date.now(),
            state
        }));
    }

    compressVehicleState(state) {
        const compressed = {};
        const thresholds = this.settings.network.compressionThresholds;

        // Compress position
        compressed.position = state.position.toArray().map(v => 
            Math.round(v / thresholds.position) * thresholds.position
        );

        // Compress rotation
        compressed.rotation = state.rotation.toArray().map(v => 
            Math.round(v / thresholds.rotation) * thresholds.rotation
        );

        // Compress velocities
        compressed.velocity = state.velocity.toArray().map(v => 
            Math.round(v / thresholds.velocity) * thresholds.velocity
        );
        compressed.angularVelocity = state.angularVelocity.toArray().map(v => 
            Math.round(v / thresholds.angularVelocity) * thresholds.angularVelocity
        );

        // Include other essential state
        compressed.wheelRotation = state.wheelRotation;
        compressed.suspension = state.suspension;

        return compressed;
    }

    handleVehicleState(message) {
        const { clientId, timestamp, state } = message;
        
        // Store received snapshot
        if (!this.state.snapshots.received.has(clientId)) {
            this.state.snapshots.received.set(clientId, []);
        }
        
        const snapshots = this.state.snapshots.received.get(clientId);
        snapshots.push({ timestamp, state });

        // Maintain snapshot history length
        while (snapshots.length > this.settings.network.snapshotHistoryLength) {
            snapshots.shift();
        }

        // Update player last seen time
        const player = this.state.players.get(clientId);
        if (player) {
            player.lastUpdate = Date.now();
        }
    }

    updateInterpolation() {
        const now = Date.now();
        const interpolationTime = now - this.settings.network.interpolationDelay;

        this.state.players.forEach((player, clientId) => {
            if (clientId === this.state.localPlayer.id) return;

            const snapshots = this.state.snapshots.received.get(clientId);
            if (!snapshots || snapshots.length < 2) return;

            // Find surrounding snapshots
            let beforeIndex = -1;
            for (let i = snapshots.length - 1; i >= 0; i--) {
                if (snapshots[i].timestamp <= interpolationTime) {
                    beforeIndex = i;
                    break;
                }
            }

            if (beforeIndex === -1 || beforeIndex === snapshots.length - 1) {
                // Either too old or too new, use extrapolation
                this.extrapolatePlayerState(player, snapshots);
            } else {
                // Interpolate between snapshots
                this.interpolatePlayerState(
                    player,
                    snapshots[beforeIndex],
                    snapshots[beforeIndex + 1],
                    interpolationTime
                );
            }
        });
    }

    interpolatePlayerState(player, before, after, time) {
        const alpha = (time - before.timestamp) / (after.timestamp - before.timestamp);

        // Interpolate position
        player.interpolation.position.lerpVectors(
            new THREE.Vector3().fromArray(before.state.position),
            new THREE.Vector3().fromArray(after.state.position),
            alpha
        );

        // Interpolate rotation
        const beforeRotation = new THREE.Euler().fromArray(before.state.rotation);
        const afterRotation = new THREE.Euler().fromArray(after.state.rotation);
        player.interpolation.rotation.set(
            THREE.MathUtils.lerp(beforeRotation.x, afterRotation.x, alpha),
            THREE.MathUtils.lerp(beforeRotation.y, afterRotation.y, alpha),
            THREE.MathUtils.lerp(beforeRotation.z, afterRotation.z, alpha)
        );

        // Interpolate other properties
        player.interpolation.suspension = before.state.suspension.map((v, i) =>
            THREE.MathUtils.lerp(v, after.state.suspension[i], alpha)
        );

        // Update player vehicle
        if (player.vehicle) {
            player.vehicle.setInterpolatedState(player.interpolation);
        }
    }

    extrapolatePlayerState(player, snapshots) {
        const latest = snapshots[snapshots.length - 1];
        const timeDiff = Date.now() - latest.timestamp;

        // Only extrapolate within maxExtrapolationTime
        if (timeDiff > this.settings.network.maxExtrapolationTime) return;

        // Extrapolate position based on velocity
        const position = new THREE.Vector3()
            .fromArray(latest.state.position)
            .add(new THREE.Vector3()
                .fromArray(latest.state.velocity)
                .multiplyScalar(timeDiff / 1000));

        // Extrapolate rotation based on angular velocity
        const rotation = new THREE.Euler()
            .fromArray(latest.state.rotation)
            .setFromVector3(new THREE.Vector3()
                .fromArray(latest.state.angularVelocity)
                .multiplyScalar(timeDiff / 1000));

        // Update interpolation target
        player.interpolation.position.copy(position);
        player.interpolation.rotation.copy(rotation);

        // Update player vehicle
        if (player.vehicle) {
            player.vehicle.setExtrapolatedState(player.interpolation);
        }
    }

    sendEvent(type, data, priority = 'medium') {
        const event = {
            type,
            clientId: this.state.connection.id,
            timestamp: Date.now(),
            data
        };

        const config = this.settings.events.types[type];
        const channel = config.reliable ? this.reliableChannel : this.unreliableChannel;

        if (config.priority === 'high') {
            // Send immediately
            channel.send(JSON.stringify(event));
        } else {
            // Queue event
            this.state.events.queue.push(event);
            this.processEventQueue();
        }
    }

    processEventQueue() {
        while (this.state.events.queue.length > 0 && 
               this.state.events.queue.length <= this.settings.events.maxQueueSize) {
            const event = this.state.events.queue.shift();
            const config = this.settings.events.types[event.type];
            const channel = config.reliable ? this.reliableChannel : this.unreliableChannel;

            channel.send(JSON.stringify(event));
        }
    }

    handleEvent(event) {
        // Prevent duplicate event processing
        if (this.state.events.processed.has(event.timestamp)) return;
        this.state.events.processed.add(event.timestamp);

        // Process based on event type
        switch (event.type) {
            case 'collision':
                this.handleCollisionEvent(event);
                break;
            case 'recovery':
                this.handleRecoveryEvent(event);
                break;
            case 'chat':
                this.handleChatEvent(event);
                break;
        }

        // Cleanup old processed events
        while (this.state.events.processed.size > this.settings.events.maxQueueSize) {
            const oldest = Math.min(...this.state.events.processed);
            this.state.events.processed.delete(oldest);
        }
    }

    handleCollisionEvent(event) {
        const { clientId, data } = event;
        const player = this.state.players.get(clientId);
        if (!player || !player.vehicle) return;

        player.vehicle.handleNetworkedCollision(data);
        this.emit('playerCollision', {
            player,
            collision: data
        });
    }

    handleRecoveryEvent(event) {
        const { clientId, data } = event;
        const player = this.state.players.get(clientId);
        if (!player || !player.vehicle) return;

        player.vehicle.handleNetworkedRecovery(data);
        this.emit('playerRecovery', {
            player,
            recovery: data
        });
    }

    handleChatEvent(event) {
        const { clientId, data } = event;
        const player = this.state.players.get(clientId);
        if (!player) return;

        this.emit('chat', {
            player,
            message: data.message
        });
    }

    joinTeam(teamId) {
        if (!this.state.teams.has(teamId)) return false;

        const team = this.state.teams.get(teamId);
        if (team.players.size >= this.settings.interaction.teams.maxSize) {
            this.emit('error', 'Team is full');
            return false;
        }

        // Leave current team if any
        if (this.state.localPlayer.team) {
            this.leaveTeam();
        }

        // Join new team
        team.players.add(this.state.localPlayer.id);
        this.state.localPlayer.team = teamId;

        // Notify other players
        this.sendEvent('team-join', { teamId });

        this.emit('teamJoined', {
            teamId,
            players: Array.from(team.players)
        });

        return true;
    }

    leaveTeam() {
        const teamId = this.state.localPlayer.team;
        if (!teamId) return;

        const team = this.state.teams.get(teamId);
        if (team) {
            team.players.delete(this.state.localPlayer.id);
            this.state.localPlayer.team = null;

            // Notify other players
            this.sendEvent('team-leave', { teamId });

            this.emit('teamLeft', { teamId });
        }
    }

    startVoiceChat() {
        if (!this.localStream) return;

        this.state.voiceChat.active = true;
        this.updateVoiceChatPeers();
    }

    stopVoiceChat() {
        this.state.voiceChat.active = false;
        this.updateVoiceChatPeers();
    }

    updateVoiceChatPeers() {
        const position = this.vehicle.position;
        const range = this.settings.interaction.voiceChatRange;

        this.state.players.forEach((player, clientId) => {
            if (clientId === this.state.localPlayer.id) return;

            const distance = position.distanceTo(player.interpolation.position);
            const shouldBeConnected = distance <= range && this.state.voiceChat.active;
            const isConnected = this.state.voiceChat.peers.has(clientId);

            if (shouldBeConnected && !isConnected) {
                this.connectVoiceChatPeer(clientId);
            } else if (!shouldBeConnected && isConnected) {
                this.disconnectVoiceChatPeer(clientId);
            }
        });
    }

    connectVoiceChatPeer(clientId) {
        if (!this.localStream) return;

        const audioTrack = this.localStream.getAudioTracks()[0];
        const sender = this.peerConnection.addTrack(audioTrack, this.localStream);
        
        this.state.voiceChat.peers.add(clientId);
        this.emit('voiceChatPeerConnected', { clientId });
    }

    disconnectVoiceChatPeer(clientId) {
        this.state.voiceChat.peers.delete(clientId);
        this.emit('voiceChatPeerDisconnected', { clientId });
    }

    handleRemoteTrack(event) {
        const stream = event.streams[0];
        const clientId = this.getClientIdFromStream(stream);
        
        if (clientId && this.state.players.has(clientId)) {
            const audioElement = new Audio();
            audioElement.srcObject = stream;
            audioElement.play();

            this.emit('voiceChatStreamReceived', {
                clientId,
                stream
            });
        }
    }

    getClientIdFromStream(stream) {
        // Implementation depends on how client IDs are associated with streams
        return stream.id;
    }

    startNetworkMonitoring() {
        setInterval(() => {
            this.measureLatency();
            this.calculatePacketLoss();
        }, 1000);
    }

    measureLatency() {
        const now = Date.now();
        this.state.connection.lastPing = now;

        this.sendEvent('ping', { timestamp: now }, 'high');
    }

    handlePong(timestamp) {
        const latency = (Date.now() - timestamp) / 2;
        this.state.connection.latency = latency;

        this.emit('latencyUpdate', { latency });
    }

    calculatePacketLoss() {
        // Calculate packet loss based on received/expected packets
        const expected = this.settings.network.updateRate;
        const received = this.state.snapshots.received.size;
        
        this.state.connection.packetLoss = 1 - (received / expected);
        
        this.emit('packetLossUpdate', {
            packetLoss: this.state.connection.packetLoss
        });
    }

    disconnect() {
        // Close voice chat
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }

        // Close data channels
        if (this.reliableChannel) {
            this.reliableChannel.close();
        }
        if (this.unreliableChannel) {
            this.unreliableChannel.close();
        }

        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
        }

        // Close signaling connection
        if (this.signaling) {
            this.signaling.close();
        }

        // Clear state
        this.state.connection.connected = false;
        this.state.players.clear();
        this.state.teams.clear();
        this.state.voiceChat.peers.clear();
        this.state.snapshots.received.clear();
        this.state.snapshots.sent = [];
        this.state.events.queue = [];
        this.state.events.processed.clear();

        clearInterval(this.interpolationTimer);

        this.emit('disconnected');
    }

    dispose() {
        this.disconnect();
        this.removeAllListeners();
    }
} 