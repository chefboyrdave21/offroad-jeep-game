import * as THREE from 'three';

export class TerrainDetailSystem {
    constructor() {
        this.detailLevels = [
            { distance: 0, resolution: 256 },
            { distance: 100, resolution: 128 },
            { distance: 200, resolution: 64 },
            { distance: 400, resolution: 32 }
        ];

        this.detailMeshes = new Map();
        this.activeChunks = new Set();
        
        this.settings = {
            chunkSize: 64,
            maxVisibleDistance: 500,
            loadingRange: 1.5,
            unloadingRange: 2.0,
            morphTargets: true,
            wireframe: false
        };

        this.initialize();
    }

    initialize() {
        this.createGeometryPool();
        this.setupMorphTargets();
    }

    createGeometryPool() {
        this.geometryPool = new Map();
        
        this.detailLevels.forEach(level => {
            const geometry = new THREE.PlaneGeometry(
                this.settings.chunkSize,
                this.settings.chunkSize,
                level.resolution - 1,
                level.resolution - 1
            );
            this.geometryPool.set(level.resolution, geometry);
        });
    }

    setupMorphTargets() {
        if (!this.settings.morphTargets) return;

        this.detailLevels.forEach((level, index) => {
            if (index < this.detailLevels.length - 1) {
                const highRes = this.geometryPool.get(level.resolution);
                const lowRes = this.geometryPool.get(this.detailLevels[index + 1].resolution);
                
                this.createMorphTargets(highRes, lowRes);
            }
        });
    }

    createMorphTargets(highRes, lowRes) {
        const highVertices = highRes.attributes.position.array;
        const lowVertices = lowRes.attributes.position.array;
        const morphTarget = new Float32Array(highVertices.length);

        for (let i = 0; i < highVertices.length; i += 3) {
            const x = Math.floor(i / 3) % highRes.parameters.widthSegments;
            const y = Math.floor(i / (3 * highRes.parameters.widthSegments));
            
            const lowX = Math.floor(x * lowRes.parameters.widthSegments / highRes.parameters.widthSegments);
            const lowY = Math.floor(y * lowRes.parameters.heightSegments / highRes.parameters.heightSegments);
            
            const lowIndex = (lowY * lowRes.parameters.widthSegments + lowX) * 3;
            
            morphTarget[i] = lowVertices[lowIndex] - highVertices[i];
            morphTarget[i + 1] = lowVertices[lowIndex + 1] - highVertices[i + 1];
            morphTarget[i + 2] = lowVertices[lowIndex + 2] - highVertices[i + 2];
        }

        highRes.morphAttributes.position = [new THREE.BufferAttribute(morphTarget, 3)];
    }

    update(camera) {
        const cameraPosition = camera.position;
        const visibleChunks = this.getVisibleChunks(cameraPosition);
        
        // Load new chunks
        visibleChunks.forEach(chunk => {
            if (!this.activeChunks.has(chunk.id)) {
                this.loadChunk(chunk);
            }
        });

        // Unload distant chunks
        this.activeChunks.forEach(chunkId => {
            const chunk = this.detailMeshes.get(chunkId);
            const distance = chunk.position.distanceTo(cameraPosition);
            
            if (distance > this.settings.maxVisibleDistance * this.settings.unloadingRange) {
                this.unloadChunk(chunkId);
            }
        });

        // Update LOD and morph targets
        this.updateLOD(cameraPosition);
    }

    getVisibleChunks(cameraPosition) {
        const chunks = [];
        const range = this.settings.maxVisibleDistance * this.settings.loadingRange;
        const chunkSize = this.settings.chunkSize;

        const minX = Math.floor((cameraPosition.x - range) / chunkSize);
        const maxX = Math.ceil((cameraPosition.x + range) / chunkSize);
        const minZ = Math.floor((cameraPosition.z - range) / chunkSize);
        const maxZ = Math.ceil((cameraPosition.z + range) / chunkSize);

        for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
                const position = new THREE.Vector3(
                    x * chunkSize,
                    0,
                    z * chunkSize
                );

                if (position.distanceTo(cameraPosition) <= range) {
                    chunks.push({
                        id: `${x},${z}`,
                        position: position
                    });
                }
            }
        }

        return chunks;
    }

    loadChunk(chunk) {
        const geometry = this.geometryPool.get(this.detailLevels[0].resolution).clone();
        const material = new THREE.MeshStandardMaterial({
            wireframe: this.settings.wireframe,
            morphTargets: this.settings.morphTargets
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(chunk.position);
        mesh.updateMatrix();

        this.detailMeshes.set(chunk.id, mesh);
        this.activeChunks.add(chunk.id);
    }

    unloadChunk(chunkId) {
        const mesh = this.detailMeshes.get(chunkId);
        mesh.geometry.dispose();
        mesh.material.dispose();
        
        this.detailMeshes.delete(chunkId);
        this.activeChunks.delete(chunkId);
    }

    updateLOD(cameraPosition) {
        this.detailMeshes.forEach(mesh => {
            const distance = mesh.position.distanceTo(cameraPosition);
            let morphInfluence = 0;

            for (let i = 0; i < this.detailLevels.length - 1; i++) {
                const currentLevel = this.detailLevels[i];
                const nextLevel = this.detailLevels[i + 1];

                if (distance >= currentLevel.distance && distance < nextLevel.distance) {
                    morphInfluence = (distance - currentLevel.distance) / 
                        (nextLevel.distance - currentLevel.distance);
                    
                    if (this.settings.morphTargets) {
                        mesh.morphTargetInfluences[i] = morphInfluence;
                    }
                    break;
                }
            }
        });
    }

    dispose() {
        // Dispose geometries
        this.geometryPool.forEach(geometry => {
            geometry.dispose();
        });

        // Dispose active chunks
        this.detailMeshes.forEach(mesh => {
            mesh.geometry.dispose();
            mesh.material.dispose();
        });

        this.detailMeshes.clear();
        this.activeChunks.clear();
    }
} 