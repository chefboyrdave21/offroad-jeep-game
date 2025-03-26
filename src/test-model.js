import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// Create the test scene
function createTestScene() {
    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x808080);

    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 5);

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Add grid helper
    const gridHelper = new THREE.GridHelper(10, 10);
    scene.add(gridHelper);

    // Add orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Test with a simple cube first
    const cube = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshPhongMaterial({ color: 0xff0000 })
    );
    scene.add(cube);

    // Load a sample model from Three.js examples
    const loader = new GLTFLoader();
    const sampleModelUrl = 'https://threejs.org/examples/models/gltf/Duck/Duck.gltf';
    
    console.log('Attempting to load sample model...');
    
    loader.load(
        sampleModelUrl,
        (gltf) => {
            console.log('Sample model loaded successfully!');
            const model = gltf.scene;
            model.position.set(2, 0, 0); // Place it next to the cube
            scene.add(model);
        },
        (progress) => {
            const percent = (progress.loaded / progress.total * 100);
            console.log(`Loading progress: ${percent.toFixed(2)}%`);
        },
        (error) => {
            console.error('Error loading sample model:', error);
        }
    );

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// Start when DOM is loaded
window.addEventListener('DOMContentLoaded', createTestScene); 