export class TutorialSystem {
    constructor(gameState) {
        this.gameState = gameState;
        this.currentStep = 0;
        this.isActive = false;
        
        // Tutorial steps definition
        this.tutorials = {
            basics: [
                {
                    title: "Welcome to Offroad Jeep!",
                    message: "Let's learn the basics of controlling your vehicle.",
                    highlight: null,
                    condition: () => true
                },
                {
                    title: "Basic Movement",
                    message: "Use W/S or Up/Down arrows to accelerate and brake. A/D or Left/Right arrows to steer.",
                    highlight: "controls",
                    condition: () => this.checkMovementInput()
                },
                {
                    title: "Camera Controls",
                    message: "Press 1-4 to switch between different camera views. Each view is useful for different situations.",
                    highlight: "camera",
                    condition: () => this.checkCameraSwitch()
                },
                {
                    title: "Terrain Navigation",
                    message: "Different surfaces require different approaches. Watch your speed on rough terrain.",
                    highlight: "terrain",
                    condition: () => this.checkTerrainNavigation()
                },
                {
                    title: "Using the Winch",
                    message: "Press E to activate the winch, then click on a solid object to attach it.",
                    highlight: "winch",
                    condition: () => this.checkWinchUsage()
                }
            ],
            advanced: [
                {
                    title: "Advanced Techniques",
                    message: "Let's learn some advanced driving techniques.",
                    highlight: null,
                    condition: () => true
                },
                {
                    title: "Rock Crawling",
                    message: "Use gentle throttle control and careful wheel placement when climbing rocks.",
                    highlight: "rocks",
                    condition: () => this.checkRockCrawling()
                },
                {
                    title: "Water Crossing",
                    message: "Check water depth before crossing. Deep water can damage your engine.",
                    highlight: "water",
                    condition: () => this.checkWaterCrossing()
                }
            ]
        };

        this.createTutorialElements();
    }

    createTutorialElements() {
        // Create tutorial UI container
        this.container = document.createElement('div');
        this.container.id = 'tutorial-container';
        this.container.style.cssText = `
            position: fixed;
            bottom: 50px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            padding: 20px;
            border-radius: 10px;
            color: white;
            font-family: Arial, sans-serif;
            max-width: 500px;
            display: none;
            z-index: 1000;
        `;

        // Create tutorial content elements
        this.titleElement = document.createElement('h3');
        this.titleElement.style.cssText = `
            margin: 0 0 10px 0;
            color: #4CAF50;
        `;

        this.messageElement = document.createElement('p');
        this.messageElement.style.cssText = `
            margin: 0 0 15px 0;
            line-height: 1.4;
        `;

        this.progressElement = document.createElement('div');
        this.progressElement.style.cssText = `
            width: 100%;
            height: 4px;
            background: #333;
            border-radius: 2px;
            overflow: hidden;
        `;

        this.progressBar = document.createElement('div');
        this.progressBar.style.cssText = `
            width: 0%;
            height: 100%;
            background: #4CAF50;
            transition: width 0.3s ease;
        `;

        // Assemble elements
        this.progressElement.appendChild(this.progressBar);
        this.container.appendChild(this.titleElement);
        this.container.appendChild(this.messageElement);
        this.container.appendChild(this.progressElement);
        document.body.appendChild(this.container);
    }

    startTutorial(tutorialName) {
        if (!this.tutorials[tutorialName]) return;
        
        this.currentTutorial = tutorialName;
        this.currentStep = 0;
        this.isActive = true;
        this.showCurrentStep();
    }

    showCurrentStep() {
        const tutorial = this.tutorials[this.currentTutorial];
        if (!tutorial || this.currentStep >= tutorial.length) {
            this.completeTutorial();
            return;
        }

        const step = tutorial[this.currentStep];
        this.titleElement.textContent = step.title;
        this.messageElement.textContent = step.message;
        this.container.style.display = 'block';

        // Update progress bar
        const progress = (this.currentStep / (tutorial.length - 1)) * 100;
        this.progressBar.style.width = `${progress}%`;

        // Handle highlighting
        if (step.highlight) {
            this.highlightElement(step.highlight);
        }
    }

    highlightElement(elementId) {
        // Remove any existing highlights
        document.querySelectorAll('.tutorial-highlight').forEach(el => {
            el.classList.remove('tutorial-highlight');
        });

        // Add highlight to target element
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.add('tutorial-highlight');
        }
    }

    update() {
        if (!this.isActive) return;

        const tutorial = this.tutorials[this.currentTutorial];
        const currentStep = tutorial[this.currentStep];

        if (currentStep.condition()) {
            this.nextStep();
        }
    }

    nextStep() {
        this.currentStep++;
        if (this.currentStep >= this.tutorials[this.currentTutorial].length) {
            this.completeTutorial();
        } else {
            this.showCurrentStep();
        }
    }

    completeTutorial() {
        this.isActive = false;
        this.container.style.display = 'none';
        this.gameState.addAchievement(`tutorial_${this.currentTutorial}`);
    }

    // Condition checking methods
    checkMovementInput() {
        // Implementation would check for actual player input
        return false;
    }

    checkCameraSwitch() {
        // Implementation would check if player has switched cameras
        return false;
    }

    checkTerrainNavigation() {
        // Implementation would check if player has navigated different terrain
        return false;
    }

    checkWinchUsage() {
        // Implementation would check if player has used the winch
        return false;
    }

    checkRockCrawling() {
        // Implementation would check if player has successfully climbed rocks
        return false;
    }

    checkWaterCrossing() {
        // Implementation would check if player has crossed water
        return false;
    }
} 