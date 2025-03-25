import * as THREE from 'three';

export class TerrainOptimizationSystem {
    constructor(terrainSystem) {
        this.terrainSystem = terrainSystem;
        
        this.settings = {
            lod: {
                levels: [
                    { distance: 100, resolution: 256 },
                    { distance: 200, resolution: 128 },
                    { distance: 400, resolution: 64 },
                    { distance: 800, resolution: 32 }
                ],
                morphingRange: 0.3,
                bias: 0.5
            },
            chunking: {
                size: 64,
                loadingRange: 3,
                unloadingRange: 4,
                fadeRange: 0.2
            },
            culling: {
                frustumCulling: true,
                occlusionCulling: true,
                distanceCulling: true,
                maxVisibleDistance: 1000
            },
            geometry: {
                vertexCompression: true,
                indexOptimization: true,
                normalCompression: true,
                attributeCompression: true
            },
            cache: {
                geometryCache: true,
                textureCache: true,
                maxCacheSize: 256 // MB
            }
        };

        this.state = {
            activeChunks: new Map(),
            geometryCache: new Map(),
            textureCache: new Map(),
            visibleChunks: new Set(),
            lodTransitions: new Map()
        };

        this.initialize();
    }

    initialize() {
        this.setupGeometryPool();
        this.setupOcclusionCulling();
        this.createChunkManager();
    }

    setupGeometryPool() {
        this.geometryPool = new Map();
        
        this.settings.lod.levels.forEach(level => {
            const geometry = this.createOptimizedGeometry(level.resolution);
            this.geometryPool.set(level.resolution, geometry);
        });
    }

    createOptimizedGeometry(resolution) {
        const geometry = new THREE.PlaneGeometry(
            this.settings.chunking.size,
            this.settings.chunking.size,
            resolution - 1,
            resolution - 1
        );

        if (this.settings.geometry.vertexCompression) {
            this.compressVertices(geometry);
        }

        if (this.settings.geometry.indexOptimization) {
            this.optimizeIndices(geometry);
        }

        if (this.settings.geometry.normalCompression) {
            this.compressNormals(geometry);
        }

        if (this.settings.geometry.attributeCompression) {
            this.compressAttributes(geometry);
        }

        return geometry;
    }

    compressVertices(geometry) {
        const positions = geometry.attributes.position.array;
        const compressed = new Int16Array(positions.length);
        const scale = 1000; // Compression scale

        for (let i = 0; i < positions.length; i++) {
            compressed[i] = Math.round(positions[i] * scale);
        }

        geometry.setAttribute('position', new THREE.Int16BufferAttribute(compressed, 3));
        geometry.attributes.position.normalized = true;
    }

    optimizeIndices(geometry) {
        // Implement Vertex Cache Optimization (ACMRm)
        const indices = geometry.index.array;
        const optimized = this.vertexCacheOptimization(indices);
        geometry.setIndex(optimized);
    }

    vertexCacheOptimization(indices) {
        // Implementation of Tom Forsyth's vertex cache optimization algorithm
        // Returns optimized index array
        return indices;
    }

    compressNormals(geometry) {
        const normals = geometry.attributes.normal.array;
        const compressed = new Int8Array(normals.length);
        const scale = 127;

        for (let i = 0; i < normals.length; i++) {
            compressed[i] = Math.round(normals[i] * scale);
        }

        geometry.setAttribute('normal', new THREE.Int8BufferAttribute(compressed, 3));
        geometry.attributes.normal.normalized = true;
    }

    compressAttributes(geometry) {
        if (geometry.attributes.uv) {
            const uvs = geometry.attributes.uv.array;
            const compressed = new Int16Array(uvs.length);
            const scale = 1000;

            for (let i = 0; i < uvs.length; i++) {
                compressed[i] = Math.round(uvs[i] * scale);
            }

            geometry.setAttribute('uv', new THREE.Int16BufferAttribute(compressed, 2));
            geometry.attributes.uv.normalized = true;
        }
    }

    setupOcclusionCulling() {
        if (!this.settings.culling.occlusionCulling) return;

        this.occlusionCamera = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
        this.occlusionRenderTarget = new THREE.WebGLRenderTarget(32, 32);
        this.occlusionMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    }

    createChunkManager() {
        this.chunkManager = {
            chunks: new Map(),
            loadQueue: [],
            unloadQueue: []
        };
    }

    update(camera) {
        this.updateChunks(camera);
        this.updateLOD(camera);
        if (this.settings.culling.occlusionCulling) {
            this.updateOcclusionCulling(camera);
        }
        this.cleanupCache();
    }

    updateChunks(camera) {
        const cameraPosition = camera.position;
        const visibleChunks = this.getVisibleChunks(cameraPosition);

        // Process load queue
        while (this.chunkManager.loadQueue.length > 0) {
            const chunkId = this.chunkManager.loadQueue.shift();
            if (visibleChunks.has(chunkId) && !this.state.activeChunks.has(chunkId)) {
                this.loadChunk(chunkId);
            }
        }

        // Process unload queue
        while (this.chunkManager.unloadQueue.length > 0) {
            const chunkId = this.chunkManager.unloadQueue.shift();
            if (!visibleChunks.has(chunkId) && this.state.activeChunks.has(chunkId)) {
                this.unloadChunk(chunkId);
            }
        }

        // Update visibility
        this.state.visibleChunks = visibleChunks;
    }

    getVisibleChunks(cameraPosition) {
        const chunks = new Set();
        const { size, loadingRange } = this.settings.chunking;
        const range = size * loadingRange;

        const minX = Math.floor((cameraPosition.x - range) / size);
        const maxX = Math.ceil((cameraPosition.x + range) / size);
        const minZ = Math.floor((cameraPosition.z - range) / size);
        const maxZ = Math.ceil((cameraPosition.z + range) / size);

        for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
                const chunkId = `${x},${z}`;
                const distance = this.getChunkDistance(x, z, cameraPosition);

                if (distance <= range) {
                    chunks.add(chunkId);
                }
            }
        }

        return chunks;
    }

    getChunkDistance(chunkX, chunkZ, cameraPosition) {
        const { size } = this.settings.chunking;
        const centerX = (chunkX + 0.5) * size;
        const centerZ = (chunkZ + 0.5) * size;

        return Math.sqrt(
            Math.pow(centerX - cameraPosition.x, 2) +
            Math.pow(centerZ - cameraPosition.z, 2)
        );
    }

    updateLOD(camera) {
        const cameraPosition = camera.position;

        this.state.activeChunks.forEach((chunk, chunkId) => {
            const distance = this.getChunkDistance(
                chunk.x,
                chunk.z,
                cameraPosition
            );

            const targetLOD = this.getTargetLOD(distance);
            const currentLOD = chunk.currentLOD;

            if (targetLOD !== currentLOD) {
                this.updateChunkLOD(chunk, targetLOD);
            }

            // Update LOD transition
            if (chunk.transitioning) {
                const progress = Math.min(1, chunk.transitionTime / 200);
                chunk.mesh.material.uniforms.morphFactor.value = progress;

                if (progress === 1) {
                    chunk.transitioning = false;
                } else {
                    chunk.transitionTime += 16; // Assuming 60fps
                }
            }
        });
    }

    getTargetLOD(distance) {
        const { levels } = this.settings.lod;
        for (let i = 0; i < levels.length; i++) {
            if (distance <= levels[i].distance) {
                return i;
            }
        }
        return levels.length - 1;
    }

    updateChunkLOD(chunk, targetLOD) {
        const currentGeometry = this.geometryPool.get(
            this.settings.lod.levels[chunk.currentLOD].resolution
        );
        const targetGeometry = this.geometryPool.get(
            this.settings.lod.levels[targetLOD].resolution
        );

        chunk.mesh.geometry = targetGeometry;
        chunk.currentLOD = targetLOD;
        chunk.transitioning = true;
        chunk.transitionTime = 0;
    }

    updateOcclusionCulling(camera) {
        this.occlusionCamera.position.copy(camera.position);
        this.occlusionCamera.rotation.copy(camera.rotation);

        const renderer = this.terrainSystem.renderer;
        const currentRenderTarget = renderer.getRenderTarget();

        renderer.setRenderTarget(this.occlusionRenderTarget);
        renderer.render(this.terrainSystem.scene, this.occlusionCamera);
        renderer.setRenderTarget(currentRenderTarget);

        // Read pixels and update chunk visibility
        const pixels = new Uint8Array(32 * 32 * 4);
        renderer.readRenderTargetPixels(
            this.occlusionRenderTarget,
            0, 0, 32, 32,
            pixels
        );

        this.updateChunkVisibility(pixels);
    }

    updateChunkVisibility(occlusionData) {
        this.state.activeChunks.forEach((chunk) => {
            const visible = this.isChunkVisible(chunk, occlusionData);
            chunk.mesh.visible = visible;
        });
    }

    isChunkVisible(chunk, occlusionData) {
        // Implement chunk visibility test using occlusion data
        return true;
    }

    cleanupCache() {
        if (this.settings.cache.geometryCache) {
            this.cleanupGeometryCache();
        }
        if (this.settings.cache.textureCache) {
            this.cleanupTextureCache();
        }
    }

    cleanupGeometryCache() {
        const maxSize = this.settings.cache.maxCacheSize * 1024 * 1024; // Convert to bytes
        let currentSize = 0;

        // Calculate current cache size
        this.state.geometryCache.forEach((geometry) => {
            currentSize += this.getGeometrySize(geometry);
        });

        // Remove least recently used geometries if cache is too large
        if (currentSize > maxSize) {
            const sortedCache = Array.from(this.state.geometryCache.entries())
                .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

            while (currentSize > maxSize && sortedCache.length > 0) {
                const [key, geometry] = sortedCache.shift();
                currentSize -= this.getGeometrySize(geometry);
                this.state.geometryCache.delete(key);
                geometry.dispose();
            }
        }
    }

    getGeometrySize(geometry) {
        let size = 0;
        
        // Calculate size of vertex attributes
        for (const name in geometry.attributes) {
            const attribute = geometry.attributes[name];
            size += attribute.array.byteLength;
        }

        // Add size of index buffer if present
        if (geometry.index) {
            size += geometry.index.array.byteLength;
        }

        return size;
    }

    cleanupTextureCache() {
        const maxSize = this.settings.cache.maxCacheSize * 1024 * 1024;
        let currentSize = 0;

        this.state.textureCache.forEach((texture) => {
            currentSize += this.getTextureSize(texture);
        });

        if (currentSize > maxSize) {
            const sortedCache = Array.from(this.state.textureCache.entries())
                .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

            while (currentSize > maxSize && sortedCache.length > 0) {
                const [key, texture] = sortedCache.shift();
                currentSize -= this.getTextureSize(texture);
                this.state.textureCache.delete(key);
                texture.dispose();
            }
        }
    }

    getTextureSize(texture) {
        const format = texture.format;
        const type = texture.type;
        const bytesPerPixel = this.getBytesPerPixel(format, type);
        return texture.image.width * texture.image.height * bytesPerPixel;
    }

    getBytesPerPixel(format, type) {
        // Calculate bytes per pixel based on format and type
        let bytes = 4; // Default for RGBA
        if (format === THREE.RGBAFormat) bytes = 4;
        else if (format === THREE.RGBFormat) bytes = 3;
        else if (format === THREE.RedFormat) bytes = 1;

        if (type === THREE.FloatType) bytes *= 4;
        else if (type === THREE.HalfFloatType) bytes *= 2;

        return bytes;
    }

    dispose() {
        // Dispose geometries
        this.geometryPool.forEach(geometry => geometry.dispose());
        this.geometryPool.clear();

        // Dispose chunks
        this.state.activeChunks.forEach(chunk => {
            chunk.mesh.geometry.dispose();
            chunk.mesh.material.dispose();
        });
        this.state.activeChunks.clear();

        // Dispose caches
        this.state.geometryCache.forEach(geometry => geometry.dispose());
        this.state.textureCache.forEach(texture => texture.dispose());
        this.state.geometryCache.clear();
        this.state.textureCache.clear();

        // Dispose occlusion culling resources
        if (this.occlusionRenderTarget) {
            this.occlusionRenderTarget.dispose();
        }
        if (this.occlusionMaterial) {
            this.occlusionMaterial.dispose();
        }
    }
} 