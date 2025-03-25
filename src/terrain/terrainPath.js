import * as THREE from 'three';

export class TerrainPathSystem {
    constructor(terrainSystem) {
        this.terrainSystem = terrainSystem;
        
        this.settings = {
            pathWidth: 5,
            pathDepth: 0.5,
            smoothingPasses: 3,
            materialIndex: 1, // Index for path material
            edgeHardness: 0.8,
            compressionFactor: 0.2
        };

        this.paths = new Map();
        this.initialize();
    }

    initialize() {
        this.pathMaterial = new THREE.MeshStandardMaterial({
            color: 0x8B4513,
            roughness: 0.8,
            metalness: 0.1
        });
    }

    createPath(points) {
        const pathId = Date.now().toString();
        const path = {
            points: points,
            width: this.settings.pathWidth,
            depth: this.settings.pathDepth,
            modified: true
        };

        this.paths.set(pathId, path);
        this.applyPath(path);
        
        return pathId;
    }

    updatePath(pathId, points) {
        const path = this.paths.get(pathId);
        if (path) {
            path.points = points;
            path.modified = true;
            this.applyPath(path);
        }
    }

    deletePath(pathId) {
        const path = this.paths.get(pathId);
        if (path) {
            this.removePath(path);
            this.paths.delete(pathId);
        }
    }

    applyPath(path) {
        const { resolution } = this.terrainSystem.settings;
        const heightField = this.terrainSystem.heightField;
        const materialField = this.terrainSystem.materialField;

        // Create path geometry
        for (let i = 0; i < path.points.length - 1; i++) {
            const start = path.points[i];
            const end = path.points[i + 1];
            const direction = end.clone().sub(start);
            const length = direction.length();
            direction.normalize();

            // Create perpendicular vector for path width
            const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x);

            // Apply path deformation along segment
            for (let t = 0; t <= length; t++) {
                const position = start.clone().add(direction.clone().multiplyScalar(t));
                
                // Apply width
                for (let w = -path.width; w <= path.width; w++) {
                    const pathPosition = position.clone().add(
                        perpendicular.clone().multiplyScalar(w)
                    );

                    // Convert to heightfield coordinates
                    const x = Math.floor(pathPosition.x * resolution / this.terrainSystem.settings.size);
                    const z = Math.floor(pathPosition.z * resolution / this.terrainSystem.settings.size);

                    if (x >= 0 && x < resolution && z >= 0 && z < resolution) {
                        const index = z * resolution + x;
                        const distanceFromCenter = Math.abs(w) / path.width;
                        const influence = 1 - Math.pow(distanceFromCenter, this.settings.edgeHardness);

                        // Apply height modification
                        heightField[index] -= path.depth * influence;

                        // Apply material
                        materialField[index] = this.settings.materialIndex;

                        // Apply compression to surrounding terrain
                        this.applyCompression(x, z, influence);
                    }
                }
            }
        }

        // Smooth path
        this.smoothPath(path);

        // Update terrain
        this.terrainSystem.updateGeometry();
        this.terrainSystem.updatePhysics();
    }

    applyCompression(centerX, centerZ, influence) {
        const { resolution } = this.terrainSystem.settings;
        const radius = Math.ceil(this.settings.pathWidth * 0.5);
        const compressionStrength = this.settings.compressionFactor * influence;

        for (let z = -radius; z <= radius; z++) {
            for (let x = -radius; x <= radius; x++) {
                const worldX = centerX + x;
                const worldZ = centerZ + z;

                if (worldX >= 0 && worldX < resolution && worldZ >= 0 && worldZ < resolution) {
                    const distance = Math.sqrt(x * x + z * z);
                    if (distance > this.settings.pathWidth) {
                        const index = worldZ * resolution + worldX;
                        const compression = compressionStrength * 
                            (1 - (distance - this.settings.pathWidth) / radius);
                        
                        if (compression > 0) {
                            this.terrainSystem.heightField[index] += compression;
                        }
                    }
                }
            }
        }
    }

    smoothPath(path) {
        const { resolution } = this.terrainSystem.settings;
        const heightField = this.terrainSystem.heightField;
        const tempField = new Float32Array(heightField);

        for (let pass = 0; pass < this.settings.smoothingPasses; pass++) {
            for (let i = 0; i < path.points.length - 1; i++) {
                const start = path.points[i];
                const end = path.points[i + 1];
                const direction = end.clone().sub(start);
                const length = direction.length();
                direction.normalize();

                const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x);

                for (let t = 0; t <= length; t++) {
                    const position = start.clone().add(direction.clone().multiplyScalar(t));
                    
                    for (let w = -path.width; w <= path.width; w++) {
                        const pathPosition = position.clone().add(
                            perpendicular.clone().multiplyScalar(w)
                        );

                        const x = Math.floor(pathPosition.x * resolution / this.terrainSystem.settings.size);
                        const z = Math.floor(pathPosition.z * resolution / this.terrainSystem.settings.size);

                        if (x >= 0 && x < resolution && z >= 0 && z < resolution) {
                            const index = z * resolution + x;
                            let sum = 0;
                            let count = 0;

                            // Average neighboring heights
                            for (let dz = -1; dz <= 1; dz++) {
                                for (let dx = -1; dx <= 1; dx++) {
                                    const nx = x + dx;
                                    const nz = z + dz;

                                    if (nx >= 0 && nx < resolution && nz >= 0 && nz < resolution) {
                                        const nIndex = nz * resolution + nx;
                                        sum += heightField[nIndex];
                                        count++;
                                    }
                                }
                            }

                            tempField[index] = sum / count;
                        }
                    }
                }
            }

            // Apply smoothed heights
            for (let i = 0; i < heightField.length; i++) {
                heightField[i] = tempField[i];
            }
        }
    }

    removePath(path) {
        // Implementation would restore original terrain height
        // and material along the path
    }

    dispose() {
        this.pathMaterial.dispose();
        this.paths.clear();
    }
} 