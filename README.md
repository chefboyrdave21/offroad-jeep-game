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

### 🚧 In Progress
- Sound system
- Weather effects
- Damage system
- Replay system
- Achievements and statistics

### 📋 Planned Features
- Winch mechanics
- Multiple trails/levels
- Scoring system
- Visual effects (particle systems)
- Vegetation system

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

## Dependencies

- Three.js - 3D graphics
- Cannon-es - Physics engine
- Parcel - Bundler

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
```

</rewritten_file>