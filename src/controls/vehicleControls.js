export class VehicleControls {
    constructor() {
        this.keys = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
            Space: false
        };

        this.steering = 0;
        this.acceleration = 0;
        this.braking = 0;
        this.brake = false;

        this.setupListeners();
    }

    setupListeners() {
        document.addEventListener('keydown', (e) => this.updateKey(e.code, true));
        document.addEventListener('keyup', (e) => this.updateKey(e.code, false));
    }

    updateKey(key, pressed) {
        if (this.keys.hasOwnProperty(key)) {
            this.keys[key] = pressed;
        }
    }

    update() {
        // Update steering
        if (this.keys.ArrowLeft) {
            this.steering = Math.min(this.steering + 0.1, 1);
        } else if (this.keys.ArrowRight) {
            this.steering = Math.max(this.steering - 0.1, -1);
        } else {
            this.steering *= 0.95; // Gradual return to center
        }

        // Update acceleration/braking
        this.acceleration = this.keys.ArrowUp;
        this.braking = this.keys.ArrowDown;
        this.brake = this.keys.Space;

        return {
            steering: this.steering,
            acceleration: this.acceleration,
            braking: this.braking,
            brake: this.brake
        };
    }
} 