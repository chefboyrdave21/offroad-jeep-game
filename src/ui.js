export class UISystem {
    constructor() {
        this.elements = new Map();
        this.containers = new Map();
        this.activeOverlay = null;
        
        // Initialize main UI containers
        this.initializeContainers();
        
        // Create UI elements
        this.createUIElements();
        
        // Event listeners
        this.setupEventListeners();
        
        // UI state
        this.state = {
            isMenuOpen: false,
            isPaused: false,
            currentScreen: 'game',
            notifications: []
        };
    }

    initializeContainers() {
        // Main UI container
        const uiContainer = document.createElement('div');
        uiContainer.id = 'game-ui';
        document.body.appendChild(uiContainer);

        // Create and store containers
        const containers = {
            hud: this.createContainer('hud-container'),
            menu: this.createContainer('menu-container'),
            overlay: this.createContainer('overlay-container'),
            notification: this.createContainer('notification-container')
        };

        // Add containers to main UI
        Object.values(containers).forEach(container => {
            uiContainer.appendChild(container);
            this.containers.set(container.id, container);
        });
    }

    createContainer(id) {
        const container = document.createElement('div');
        container.id = id;
        container.className = 'ui-container';
        return container;
    }

    createUIElements() {
        // HUD Elements
        this.createHUDElements();
        
        // Menu Elements
        this.createMenuElements();
        
        // Overlay Elements
        this.createOverlayElements();
        
        // Notification System
        this.createNotificationSystem();
    }

    createHUDElements() {
        // Speed indicator
        this.createElement('speedometer', {
            type: 'div',
            parent: 'hud-container',
            className: 'hud-element speedometer',
            content: `
                <div class="speed-value">0</div>
                <div class="speed-unit">KM/H</div>
            `
        });

        // Gear indicator
        this.createElement('gear-indicator', {
            type: 'div',
            parent: 'hud-container',
            className: 'hud-element gear-indicator',
            content: 'N'
        });

        // Vehicle status
        this.createElement('vehicle-status', {
            type: 'div',
            parent: 'hud-container',
            className: 'hud-element vehicle-status',
            content: `
                <div class="damage-indicator">
                    <div class="damage-bar"></div>
                </div>
                <div class="fuel-indicator">
                    <div class="fuel-bar"></div>
                </div>
            `
        });

        // Minimap
        this.createElement('minimap', {
            type: 'div',
            parent: 'hud-container',
            className: 'hud-element minimap'
        });
    }

    createMenuElements() {
        // Pause menu
        this.createElement('pause-menu', {
            type: 'div',
            parent: 'menu-container',
            className: 'menu pause-menu hidden',
            content: `
                <h2>Paused</h2>
                <button class="menu-button" data-action="resume">Resume</button>
                <button class="menu-button" data-action="settings">Settings</button>
                <button class="menu-button" data-action="quit">Quit to Menu</button>
            `
        });

        // Settings menu
        this.createElement('settings-menu', {
            type: 'div',
            parent: 'menu-container',
            className: 'menu settings-menu hidden',
            content: `
                <h2>Settings</h2>
                <div class="settings-section">
                    <h3>Graphics</h3>
                    <!-- Graphics settings -->
                </div>
                <div class="settings-section">
                    <h3>Audio</h3>
                    <!-- Audio settings -->
                </div>
                <div class="settings-section">
                    <h3>Controls</h3>
                    <!-- Control settings -->
                </div>
                <button class="menu-button" data-action="back">Back</button>
            `
        });
    }

    createOverlayElements() {
        // Loading screen
        this.createElement('loading-screen', {
            type: 'div',
            parent: 'overlay-container',
            className: 'overlay loading-screen hidden',
            content: `
                <div class="loading-spinner"></div>
                <div class="loading-text">Loading...</div>
                <div class="loading-progress">0%</div>
            `
        });

        // Achievement popup
        this.createElement('achievement-popup', {
            type: 'div',
            parent: 'overlay-container',
            className: 'overlay achievement-popup hidden',
            content: `
                <div class="achievement-icon"></div>
                <div class="achievement-text">
                    <h3>Achievement Unlocked!</h3>
                    <p class="achievement-name"></p>
                </div>
            `
        });
    }

    createNotificationSystem() {
        this.createElement('notification-system', {
            type: 'div',
            parent: 'notification-container',
            className: 'notification-system'
        });
    }

    createElement(id, options) {
        const element = document.createElement(options.type || 'div');
        element.id = id;
        element.className = options.className || '';
        
        if (options.content) {
            element.innerHTML = options.content;
        }

        const parent = this.containers.get(options.parent);
        if (parent) {
            parent.appendChild(element);
        }

        this.elements.set(id, element);
        return element;
    }

    setupEventListeners() {
        // Menu button listeners
        document.addEventListener('click', (e) => {
            const button = e.target.closest('.menu-button');
            if (button) {
                const action = button.dataset.action;
                this.handleMenuAction(action);
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            switch(e.key) {
                case 'Escape':
                    this.togglePause();
                    break;
                case 'Tab':
                    e.preventDefault();
                    this.toggleMap();
                    break;
            }
        });
    }

    handleMenuAction(action) {
        switch(action) {
            case 'resume':
                this.togglePause();
                break;
            case 'settings':
                this.showSettings();
                break;
            case 'quit':
                this.quitToMenu();
                break;
            case 'back':
                this.hideSettings();
                break;
        }
    }

    updateHUD(data) {
        // Update speedometer
        const speedElement = this.elements.get('speedometer');
        if (speedElement) {
            speedElement.querySelector('.speed-value').textContent = 
                Math.round(data.speed);
        }

        // Update gear indicator
        const gearElement = this.elements.get('gear-indicator');
        if (gearElement) {
            gearElement.textContent = data.gear;
        }

        // Update vehicle status
        const statusElement = this.elements.get('vehicle-status');
        if (statusElement) {
            const damageBar = statusElement.querySelector('.damage-bar');
            const fuelBar = statusElement.querySelector('.fuel-bar');
            
            damageBar.style.width = `${(1 - data.damage) * 100}%`;
            fuelBar.style.width = `${data.fuel * 100}%`;
        }
    }

    showNotification(data) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.innerHTML = `
            <div class="notification-icon ${data.type}"></div>
            <div class="notification-content">
                <h4>${data.title}</h4>
                <p>${data.message}</p>
            </div>
        `;

        const container = this.elements.get('notification-system');
        container.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 500);
        }, 3000);
    }

    togglePause() {
        this.state.isPaused = !this.state.isPaused;
        const pauseMenu = this.elements.get('pause-menu');
        
        if (this.state.isPaused) {
            pauseMenu.classList.remove('hidden');
        } else {
            pauseMenu.classList.add('hidden');
        }
    }

    showLoading(progress) {
        const loadingScreen = this.elements.get('loading-screen');
        loadingScreen.classList.remove('hidden');
        loadingScreen.querySelector('.loading-progress').textContent = 
            `${Math.round(progress * 100)}%`;
    }

    hideLoading() {
        const loadingScreen = this.elements.get('loading-screen');
        loadingScreen.classList.add('hidden');
    }

    showAchievement(achievement) {
        const popup = this.elements.get('achievement-popup');
        popup.querySelector('.achievement-icon').style.backgroundImage = 
            `url(${achievement.icon})`;
        popup.querySelector('.achievement-name').textContent = achievement.name;
        
        popup.classList.remove('hidden');
        setTimeout(() => popup.classList.add('hidden'), 3000);
    }

    update(deltaTime) {
        // Update any animated UI elements
        // Handle UI transitions
        // Update notification positions
    }
} 