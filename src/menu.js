export class MenuSystem {
    constructor(gameState) {
        this.gameState = gameState;
        this.activeMenu = null;
        this.menuStack = [];
        
        // Define menu structures
        this.menus = {
            main: {
                title: "Offroad Jeep Game",
                options: [
                    { id: 'play', text: 'Play Game', action: () => this.showMenu('levelSelect') },
                    { id: 'garage', text: 'Garage', action: () => this.gameState.setState('GARAGE') },
                    { id: 'options', text: 'Options', action: () => this.showMenu('options') },
                    { id: 'credits', text: 'Credits', action: () => this.showMenu('credits') }
                ]
            },
            levelSelect: {
                title: "Select Level",
                options: [
                    { id: 'beginner', text: 'Beginner Trail', action: () => this.startLevel('level_1') },
                    { id: 'intermediate', text: 'Rock Crawler', action: () => this.startLevel('level_2') },
                    { id: 'expert', text: 'Mountain Challenge', action: () => this.startLevel('level_3') },
                    { id: 'back', text: 'Back', action: () => this.goBack() }
                ]
            },
            pause: {
                title: "Paused",
                options: [
                    { id: 'resume', text: 'Resume Game', action: () => this.resumeGame() },
                    { id: 'restart', text: 'Restart Level', action: () => this.restartLevel() },
                    { id: 'options', text: 'Options', action: () => this.showMenu('options') },
                    { id: 'quit', text: 'Quit to Main Menu', action: () => this.quitToMain() }
                ]
            },
            options: {
                title: "Options",
                options: [
                    { id: 'graphics', text: 'Graphics', action: () => this.showMenu('graphicsOptions') },
                    { id: 'audio', text: 'Audio', action: () => this.showMenu('audioOptions') },
                    { id: 'controls', text: 'Controls', action: () => this.showMenu('controlOptions') },
                    { id: 'back', text: 'Back', action: () => this.goBack() }
                ]
            }
        };

        this.createMenuElements();
        this.setupEventListeners();
    }

    createMenuElements() {
        // Create main menu container
        this.container = document.createElement('div');
        this.container.id = 'menu-container';
        this.container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            background: rgba(0, 0, 0, 0.8);
            z-index: 1000;
            display: none;
        `;

        // Create menu content
        this.menuContent = document.createElement('div');
        this.menuContent.id = 'menu-content';
        this.menuContent.style.cssText = `
            background: rgba(0, 0, 0, 0.9);
            padding: 2rem;
            border-radius: 10px;
            min-width: 300px;
            color: white;
            font-family: Arial, sans-serif;
        `;

        this.container.appendChild(this.menuContent);
        document.body.appendChild(this.container);
    }

    setupEventListeners() {
        // Handle keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (!this.activeMenu) return;

            switch(e.code) {
                case 'Escape':
                    if (this.activeMenu !== 'main') {
                        this.goBack();
                    }
                    break;
                case 'ArrowUp':
                    this.navigateMenu(-1);
                    break;
                case 'ArrowDown':
                    this.navigateMenu(1);
                    break;
                case 'Enter':
                    this.selectCurrentOption();
                    break;
            }
        });
    }

    showMenu(menuId) {
        if (!this.menus[menuId]) return;

        this.activeMenu = menuId;
        this.menuStack.push(menuId);
        this.renderMenu(this.menus[menuId]);
        this.container.style.display = 'flex';
    }

    renderMenu(menu) {
        let html = `
            <h1 style="text-align: center; margin-bottom: 2rem;">${menu.title}</h1>
            <div class="menu-options">
        `;

        menu.options.forEach((option, index) => {
            html += `
                <div class="menu-option" data-id="${option.id}" 
                     style="padding: 1rem; cursor: pointer; transition: all 0.3s;
                     ${index === 0 ? 'background: rgba(255, 255, 255, 0.2);' : ''}">
                    ${option.text}
                </div>
            `;
        });

        html += '</div>';
        this.menuContent.innerHTML = html;

        // Add click handlers
        const options = this.menuContent.querySelectorAll('.menu-option');
        options.forEach((option, index) => {
            option.addEventListener('click', () => {
                menu.options[index].action();
            });

            // Hover effect
            option.addEventListener('mouseenter', () => {
                options.forEach(opt => opt.style.background = 'none');
                option.style.background = 'rgba(255, 255, 255, 0.2)';
            });
        });
    }

    navigateMenu(direction) {
        const options = this.menuContent.querySelectorAll('.menu-option');
        const currentIndex = Array.from(options).findIndex(
            option => option.style.background !== 'none'
        );
        
        options[currentIndex].style.background = 'none';
        
        let newIndex = currentIndex + direction;
        if (newIndex >= options.length) newIndex = 0;
        if (newIndex < 0) newIndex = options.length - 1;
        
        options[newIndex].style.background = 'rgba(255, 255, 255, 0.2)';
    }

    selectCurrentOption() {
        const options = this.menuContent.querySelectorAll('.menu-option');
        const currentIndex = Array.from(options).findIndex(
            option => option.style.background !== 'none'
        );
        
        const menu = this.menus[this.activeMenu];
        menu.options[currentIndex].action();
    }

    goBack() {
        this.menuStack.pop(); // Remove current menu
        const previousMenu = this.menuStack[this.menuStack.length - 1];
        
        if (previousMenu) {
            this.activeMenu = previousMenu;
            this.renderMenu(this.menus[previousMenu]);
        } else {
            this.hideMenu();
        }
    }

    hideMenu() {
        this.container.style.display = 'none';
        this.activeMenu = null;
        this.menuStack = [];
    }

    startLevel(levelId) {
        if (this.gameState.isLevelUnlocked(levelId)) {
            this.hideMenu();
            this.gameState.setState('PLAYING', { levelId });
        }
    }

    resumeGame() {
        this.hideMenu();
        this.gameState.setState('PLAYING');
    }

    restartLevel() {
        const currentState = this.gameState.getCurrentState();
        this.hideMenu();
        this.gameState.setState('PLAYING', { 
            levelId: currentState.data.levelId,
            restart: true 
        });
    }

    quitToMain() {
        this.hideMenu();
        this.gameState.setState('MAIN_MENU');
        this.showMenu('main');
    }
} 