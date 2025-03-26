# Offroad Jeep Game

A physics-based offroad simulation game built with Three.js and Cannon.es, featuring a Jeep Wrangler TJ tackling challenging terrain inspired by the Appalachian Mountains.

## Current Implementation Status

### ✅ Completed Features
- Basic 3D scene setup with Three.js
- Physics integration using Cannon.es
- Vehicle controls with steering, acceleration, and braking
- Dynamic camera system with multiple views
- Enhanced terrain generation with varied elevation
- Basic UI elements
- Multiple camera views (Third Person, Wheel View, FPV, Side View)
- Resource management system
- Scene management system
- Audio system with 3D sound
- Camera system with multiple modes
- Particle system for visual effects
- Weather system with dynamic effects
- Vehicle system with physics
- Damage system with deformation
- UI system with HUD and menus
- Terrain system with dynamic generation
- Advanced terrain features:
  - Terrain blending and transitions
  - Terrain deformation and destruction
  - Terrain erosion and weathering
  - Path creation and management
  - Terrain optimization with LOD and chunking
  - Advanced texturing and materials
- Vehicle Systems:
  - Statistics tracking system
  - Damage and deformation system
  - Advanced physics system
  - Input handling system
  - Audio management system
  - Networking system
  - AI system
  - Mission system with objectives and rewards

### 🚧 In Progress
- Vegetation system
- Level system
- Achievement system
- Save/Load system

### 📋 Planned Features
- Multiplayer support
- Additional vehicles
- More weather conditions

## Installation

1. Clone the repository:
```bash
git clone https://github.com/chefboyrdave21/offroad-jeep-game.git
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npx parcel index.html
```

## Controls

- W/Up Arrow: Accelerate
- S/Down Arrow: Reverse
- A/Left Arrow: Steer Left
- D/Right Arrow: Steer Right
- Space: Brake
- 1-4: Camera Views
  - 1: Third Person
  - 2: Wheel View
  - 3: First Person
  - 4: Side View
- E: Winch Control
- Esc: Pause Menu

## Dependencies

- Three.js - 3D graphics
- Cannon-es - Physics engine
- Parcel - Bundler
- Simplex-noise - Terrain generation

## Project Structure

```
offroad-jeep-game/
├── index.html          // Main HTML file
├── src/               
│   ├── index.js        // Main game initialization
│   ├── jeep.js         // Jeep model and physics
│   ├── terrain.js      // Terrain generation
│   ├── camera.js       // Camera controls
│   ├── controls.js     // Input handling
│   ├── levels.js       // Level management
│   └── utils.js        // Utility functions
├── assets/             
│   ├── models/         // 3D models
│   │   └── vehicles/   // Vehicle models go here
│   ├── textures/       // Textures
│   └── sounds/         // Sound effects
└── .gitignore
```

## Development Roadmap

### Phase 1 (Current)
- ✅ Basic scene setup
- ✅ Vehicle physics integration
- ✅ Basic terrain generation
- ✅ Vehicle controls

### Phase 2
- Enhanced terrain generation
- Multiple camera views
- Winch mechanics
- Basic UI elements

### Phase 3
- Sound implementation
- Level design
- Scoring system
- Visual effects (particle systems)

### Phase 4
- Multiple trails/levels
- Save system
- Performance optimization
- Additional vehicles

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 