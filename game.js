// ============================================
// CubeRealm.io - Enhanced Multiplayer Game
// ============================================

class CubeRealmGame {
    constructor() {
        // Canvas & Renderer
        this.canvas = document.getElementById('gameCanvas');
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);
        this.scene.fog = new THREE.Fog(0x1a1a2e, 200, 1000);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 8, 15);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowShadowMap;

        // Game State
        this.gameState = {
            isRunning: false,
            localPlayer: null,
            players: new Map(),
            blocks: new Map(),
            score: 0,
            kills: 0,
            deaths: 0,
            health: 100,
            startTime: null,
        };

        // Socket.io
        this.socket = io(window.location.origin, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5,
        });

        // Input
        this.keys = {};
        this.mousePos = { x: 0, y: 0 };
        this.mouseDown = { left: false, right: false };

        // Performance
        this.frameCount = 0;
        this.lastFrameTime = Date.now();
        this.fps = 60;

        // Meshes Map
        this.blockMeshes = new Map();
        this.playerMeshes = new Map();

        // Initialize
        this.setupLighting();
        this.setupGround();
        this.setupEventListeners();
        this.setupSocketListeners();
        this.setupUI();
        this.startGameLoop();
    }

    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        // Directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 50, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 4096;
        directionalLight.shadow.mapSize.height = 4096;
        directionalLight.shadow.camera.far = 200;
        directionalLight.shadow.camera.left = -100;
        directionalLight.shadow.camera.right = 100;
        directionalLight.shadow.camera.top = 100;
        directionalLight.shadow.camera.bottom = -100;
        this.scene.add(directionalLight);

        // Sky
        const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
        const skyMaterial = new THREE.MeshBasicMaterial({
            color: 0x1a1a2e,
            side: THREE.BackSide,
        });
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(sky);
    }

    setupGround() {
        const groundGeometry = new THREE.PlaneGeometry(500, 500);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d3561,
            roughness: 0.8,
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Grid helper (optional)
        const gridHelper = new THREE.GridHelper(500, 50, 0x0f0f0f, 0x0a0a1a);
        this.scene.add(gridHelper);
    }

    setupEventListeners() {
        // Keyboard
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));

        // Mouse
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mousedown', (e) => this.onMouseDown(e));
        window.addEventListener('mouseup', (e) => this.onMouseUp(e));

        // Window resize
        window.addEventListener('resize', () => this.onWindowResize());

        // UI
        document.getElementById('playButton').addEventListener('click', () => this.startGame());
        document.getElementById('settingsButton').addEventListener('click', () => this.openSettings());
        document.getElementById('closeSettingsButton').addEventListener('click', () => this.closeSettings());
        document.getElementById('playAgainButton').addEventListener('click', () => this.startGame());
        document.getElementById('toggleLeaderboard').addEventListener('click', () => this.toggleLeaderboard());
    }

    setupSocketListeners() {
        this.socket.on('connect', () => console.log('Connected to server'));
        this.socket.on('disconnect', () => console.log('Disconnected from server'));

        this.socket.on('game:player-joined', (data) => {
            if (data.playerId !== this.gameState.localPlayer?.id) {
                this.addRemotePlayer(data);
            }
        });

        this.socket.on('game:player-moved', (data) => {
            const player = this.gameState.players.get(data.playerId);
            if (player) {
                player.position = data.position;
                player.velocity = data.velocity;
            }
        });

        this.socket.on('game:block-placed', (data) => {
            this.addBlock(data.block);
        });

        this.socket.on('game:block-removed', (data) => {
            this.removeBlock(data.blockId);
        });

        this.socket.on('game:player-damaged', (data) => {
            if (data.playerId === this.gameState.localPlayer?.id) {
                this.gameState.health = Math.max(0, data.health);
                this.updateHUD();
            }
        });

        this.socket.on('game:leaderboard-update', (data) => {
            this.updateLeaderboard(data.leaderboard);
        });
    }

    setupUI() {
        // Hide overlays initially
        document.getElementById('gameOverOverlay').classList.remove('active');
    }

    startGame() {
        const username = document.getElementById('usernameInput').value.trim();
        if (!username) {
            alert('Please enter a username');
            return;
        }

        this.gameState.isRunning = true;
        this.gameState.startTime = Date.now();
        this.gameState.score = 0;
        this.gameState.kills = 0;
        this.gameState.deaths = 0;
        this.gameState.health = 100;

        document.getElementById('menuOverlay').classList.remove('active');
        document.getElementById('gameOverOverlay').classList.remove('active');

        // Emit to server
        this.socket.emit('game:join', { username }, (response) => {
            if (response.success) {
                this.gameState.localPlayer = {
                    id: response.playerId,
                    username,
                    position: [0, 2, 0],
                    velocity: [0, 0, 0],
                    health: 100,
                    kills: 0,
                    deaths: 0,
                    score: 0,
                };
                console.log('Joined game as:', username);
            }
        });

        this.updateHUD();
    }

    addBlock(block) {
        if (this.blockMeshes.has(block.id)) return;

        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({
            color: block.color,
            metalness: 0.5,
            roughness: 0.5,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(...block.position);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { blockId: block.id, type: block.type };

        this.scene.add(mesh);
        this.blockMeshes.set(block.id, mesh);
        this.gameState.blocks.set(block.id, block);
    }

    removeBlock(blockId) {
        const mesh = this.blockMeshes.get(blockId);
        if (mesh) {
            this.scene.remove(mesh);
            this.blockMeshes.delete(blockId);
            this.gameState.blocks.delete(blockId);
        }
    }

    addRemotePlayer(data) {
        const player = {
            id: data.playerId,
            username: data.username,
            position: data.position,
            velocity: [0, 0, 0],
            health: 100,
            kills: 0,
            deaths: 0,
            score: 0,
        };

        this.gameState.players.set(data.playerId, player);
        this.createPlayerMesh(data.playerId, player);
    }

    createPlayerMesh(playerId, player) {
        const group = new THREE.Group();

        // Body
        const bodyGeometry = new THREE.BoxGeometry(0.8, 1.8, 0.8);
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x3498db });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        group.add(body);

        // Head
        const headGeometry = new THREE.SphereGeometry(0.4, 32, 32);
        const headMaterial = new THREE.MeshStandardMaterial({ color: 0xe8a66d });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.2;
        head.castShadow = true;
        group.add(head);

        // Health bar background
        const healthBgGeometry = new THREE.BoxGeometry(1.2, 0.15, 0.05);
        const healthBgMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
        const healthBg = new THREE.Mesh(healthBgGeometry, healthBgMaterial);
        healthBg.position.y = 2.3;
        group.add(healthBg);

        // Health bar
        const healthGeometry = new THREE.BoxGeometry(1, 0.1, 0.06);
        const healthMaterial = new THREE.MeshStandardMaterial({ color: 0x2ecc71 });
        const healthBar = new THREE.Mesh(healthGeometry, healthMaterial);
        healthBar.position.y = 2.3;
        healthBar.position.z = 0.02;
        group.add(healthBar);

        // Name label
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0f0';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.username, 128, 48);

        const texture = new THREE.CanvasTexture(canvas);
        const labelGeometry = new THREE.PlaneGeometry(2, 0.5);
        const labelMaterial = new THREE.MeshBasicMaterial({ map: texture });
        const label = new THREE.Mesh(labelGeometry, labelMaterial);
        label.position.y = 2.8;
        label.position.z = 0.5;
        group.add(label);

        group.position.set(...player.position);
        this.scene.add(group);
        this.playerMeshes.set(playerId, { group, healthBar });
    }

    onKeyDown(e) {
        this.keys[e.key.toLowerCase()] = true;

        if (e.key === ' ') {
            this.jump();
            e.preventDefault();
        }

        if (e.key === 'Escape') {
            this.toggleMenu();
        }
    }

    onKeyUp(e) {
        this.keys[e.key.toLowerCase()] = false;
    }

    onMouseMove(e) {
        this.mousePos = { x: e.clientX, y: e.clientY };
    }

    onMouseDown(e) {
        if (e.button === 0) this.mouseDown.left = true;
        if (e.button === 2) this.mouseDown.right = true;

        if (this.mouseDown.left && this.gameState.isRunning) {
            this.placeBlock();
        }
    }

    onMouseUp(e) {
        if (e.button === 0) this.mouseDown.left = false;
        if (e.button === 2) this.mouseDown.right = false;
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    move() {
        if (!this.gameState.localPlayer) return;

        let direction = [0, 0, 0];
        if (this.keys['w']) direction[2] -= 1;
        if (this.keys['s']) direction[2] += 1;
        if (this.keys['a']) direction[0] -= 1;
        if (this.keys['d']) direction[0] += 1;

        if (direction[0] !== 0 || direction[2] !== 0) {
            this.socket.emit('game:move', { direction });
        }
    }

    jump() {
        if (!this.gameState.localPlayer) return;
        this.socket.emit('game:jump');
    }

    placeBlock() {
        if (!this.gameState.localPlayer) return;

        // Cast ray from camera
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(
            (this.mousePos.x / window.innerWidth) * 2 - 1,
            -(this.mousePos.y / window.innerHeight) * 2 + 1
        );
        raycaster.setFromCamera(mouse, this.camera);

        const intersects = raycaster.intersectObjects(this.scene.children);
        if (intersects.length > 0) {
            const point = intersects[0].point;
            const position = [
                Math.round(point.x),
                Math.round(point.y) + 1,
                Math.round(point.z),
            ];

            this.socket.emit('game:place-block', { position, type: 'basic' });
        }
    }

    updateHUD() {
        const player = this.gameState.localPlayer;
        if (!player) return;

        document.getElementById('playerName').textContent = player.username;
        document.getElementById('playerHealth').textContent = this.gameState.health;
        document.getElementById('playerScore').textContent = this.gameState.score;
        document.getElementById('playerKills').textContent = this.gameState.kills;
        document.getElementById('playerCount').textContent = this.gameState.players.size + 1;

        if (this.gameState.startTime) {
            const elapsed = Math.floor((Date.now() - this.gameState.startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            document.getElementById('gameTime').textContent = 
                `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }

        document.getElementById('fps').textContent = Math.round(this.fps);
    }

    updateLeaderboard(leaderboard) {
        const content = document.getElementById('leaderboardContent');
        content.innerHTML = leaderboard
            .slice(0, 10)
            .map((entry, index) => `
                <div class="leaderboard-entry">
                    <span class="rank">${index + 1}</span>
                    <span class="name">${entry.username}</span>
                    <span class="score">${entry.score}</span>
                </div>
            `)
            .join('');
    }

    toggleLeaderboard() {
        const content = document.getElementById('leaderboardContent');
        content.style.display = content.style.display === 'none' ? 'block' : 'none';
    }

    toggleMenu() {
        const menuOverlay = document.getElementById('menuOverlay');
        menuOverlay.classList.toggle('active');
        this.gameState.isRunning = !this.gameState.isRunning;
    }

    openSettings() {
        document.getElementById('settingsModal').classList.add('show');
    }

    closeSettings() {
        document.getElementById('settingsModal').classList.remove('show');
    }

    startGameLoop() {
        const animate = () => {
            requestAnimationFrame(animate);

            if (this.gameState.isRunning) {
                // Update local player movement
                this.move();

                // Update camera
                if (this.gameState.localPlayer) {
                    const target = new THREE.Vector3(
                        this.gameState.localPlayer.position[0],
                        this.gameState.localPlayer.position[1] + 3,
                        this.gameState.localPlayer.position[2] + 8
                    );
                    this.camera.position.lerp(target, 0.1);
                    this.camera.lookAt(
                        this.gameState.localPlayer.position[0],
                        this.gameState.localPlayer.position[1] + 1,
                        this.gameState.localPlayer.position[2]
                    );
                }

                // Update remote players
                this.gameState.players.forEach((player, playerId) => {
                    const playerMesh = this.playerMeshes.get(playerId);
                    if (playerMesh) {
                        playerMesh.group.position.set(...player.position);
                        const scale = player.health / 100;
                        playerMesh.healthBar.scale.x = scale;
                    }
                });
            }

            // Render
            this.renderer.render(this.scene, this.camera);

            // Update FPS
            this.frameCount++;
            const now = Date.now();
            if (now - this.lastFrameTime >= 1000) {
                this.fps = this.frameCount;
                this.frameCount = 0;
                this.lastFrameTime = now;
                this.updateHUD();
            }
        };

        animate();
    }
}

// Initialize game when page loads
window.addEventListener('DOMContentLoaded', () => {
    new CubeRealmGame();
});
