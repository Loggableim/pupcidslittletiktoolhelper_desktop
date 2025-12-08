/**
 * Fireworks GPU Engine - WebGL/Canvas Particle System
 * 
 * Features:
 * - WebGL 2.0 rendering with Canvas 2D fallback
 * - Particle pooling for performance
 * - Custom explosion shapes (burst, heart, star, spiral, ring)
 * - Trail effects
 * - Glow effects
 * - Audio integration
 * - Gift image particles
 * 
 * CSP-Compliant: No inline scripts or eval()
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    maxParticles: 2000,
    targetFps: 60,
    gravity: 0.15,
    friction: 0.98,
    windStrength: 0.02,
    particleSizeRange: [3, 10],
    trailLength: 8,
    glowIntensity: 0.6,
    defaultColors: ['#ff4444', '#44ff44', '#4444ff', '#ffff44', '#ff44ff', '#44ffff']
};

// ============================================================================
// PARTICLE CLASS
// ============================================================================

class Particle {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.life = 0;
        this.maxLife = 0;
        this.size = 5;
        this.color = '#ffffff';
        this.alpha = 1;
        this.trail = [];
        this.rotation = 0;
        this.rotationSpeed = 0;
        this.type = 'circle'; // circle, image, spark
        this.image = null;
        this.gravity = CONFIG.gravity;
        this.friction = CONFIG.friction;
    }

    update(deltaTime) {
        if (this.life <= 0) return false;

        // Store trail position
        if (this.trail.length >= CONFIG.trailLength) {
            this.trail.shift();
        }
        this.trail.push({ x: this.x, y: this.y, alpha: this.alpha });

        // Apply physics
        this.vy += this.gravity * deltaTime;
        this.vx *= this.friction;
        this.vy *= this.friction;

        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;

        // Update life
        this.life -= deltaTime;
        this.alpha = Math.max(0, this.life / this.maxLife);

        // Update rotation
        this.rotation += this.rotationSpeed * deltaTime;

        return this.life > 0;
    }
}

// ============================================================================
// PARTICLE POOL
// ============================================================================

class ParticlePool {
    constructor(size) {
        this.pool = [];
        this.active = [];
        
        for (let i = 0; i < size; i++) {
            this.pool.push(new Particle());
        }
    }

    get() {
        let particle = this.pool.pop();
        if (!particle) {
            particle = new Particle();
        }
        particle.reset();
        this.active.push(particle);
        return particle;
    }

    release(particle) {
        const index = this.active.indexOf(particle);
        if (index > -1) {
            this.active.splice(index, 1);
            particle.reset();
            this.pool.push(particle);
        }
    }

    update(deltaTime) {
        for (let i = this.active.length - 1; i >= 0; i--) {
            if (!this.active[i].update(deltaTime)) {
                this.release(this.active[i]);
            }
        }
    }

    getActiveCount() {
        return this.active.length;
    }
}

// ============================================================================
// SHAPE GENERATORS
// ============================================================================

const ShapeGenerators = {
    burst: (count, intensity) => {
        const particles = [];
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
            const speed = (3 + Math.random() * 5) * intensity;
            particles.push({
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed
            });
        }
        return particles;
    },

    heart: (count, intensity) => {
        const particles = [];
        for (let i = 0; i < count; i++) {
            const t = (i / count) * Math.PI * 2;
            // Heart parametric equation
            const x = 16 * Math.pow(Math.sin(t), 3);
            const y = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));
            const magnitude = Math.sqrt(x*x + y*y);
            const speed = (0.3 + Math.random() * 0.3) * intensity;
            particles.push({
                vx: (x / magnitude) * speed * 8,
                vy: (y / magnitude) * speed * 8
            });
        }
        return particles;
    },

    star: (count, intensity) => {
        const particles = [];
        const points = 5;
        const outerRadius = 1;
        const innerRadius = 0.4;
        
        for (let i = 0; i < count; i++) {
            const pointIndex = Math.floor((i / count) * points * 2);
            const radius = pointIndex % 2 === 0 ? outerRadius : innerRadius;
            const angle = (Math.PI * 2 * pointIndex) / (points * 2) - Math.PI / 2;
            const speed = (3 + Math.random() * 4) * intensity * radius;
            particles.push({
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed
            });
        }
        return particles;
    },

    spiral: (count, intensity) => {
        const particles = [];
        const turns = 3;
        
        for (let i = 0; i < count; i++) {
            const t = (i / count) * turns * Math.PI * 2;
            const radius = (i / count) * intensity;
            const speed = 2 + Math.random() * 3;
            particles.push({
                vx: Math.cos(t) * radius * speed,
                vy: Math.sin(t) * radius * speed
            });
        }
        return particles;
    },

    ring: (count, intensity) => {
        const particles = [];
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            const speed = 4 * intensity;
            particles.push({
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed
            });
        }
        return particles;
    }
};

// ============================================================================
// AUDIO MANAGER
// ============================================================================

class AudioManager {
    constructor() {
        this.sounds = new Map();
        this.audioContext = null;
        this.volume = 0.7;
        this.enabled = true;
        this.initialized = false;
        this.pendingSounds = new Map(); // Store URLs to preload after init
    }

    async init() {
        // Don't create AudioContext immediately - wait for user gesture
        // Store that init was called
        this.initialized = true;
        console.log('[Fireworks Audio] Audio manager ready (AudioContext will be created on first interaction)');
    }

    async ensureAudioContext() {
        // Create AudioContext on first interaction to avoid autoplay warning
        if (!this.audioContext && this.initialized) {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                
                // Resume if suspended (some browsers start in suspended state)
                if (this.audioContext.state === 'suspended') {
                    await this.audioContext.resume();
                }
                
                // Preload any pending sounds
                for (const [name, url] of this.pendingSounds.entries()) {
                    await this.preload(url, name);
                }
                this.pendingSounds.clear();
                
                console.log('[Fireworks Audio] AudioContext created and resumed');
            } catch (e) {
                console.warn('[Fireworks Audio] AudioContext not available:', e.message);
            }
        }
    }

    async preload(url, name) {
        // If AudioContext not created yet, store for later (overwrite if already exists)
        if (!this.audioContext) {
            this.pendingSounds.set(name, url);
            return;
        }
        
        // Skip if already loaded
        if (this.sounds.has(name)) {
            return;
        }
        
        try {
            const response = await fetch(url);
            if (!response.ok) return;
            
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.sounds.set(name, audioBuffer);
        } catch (e) {
            console.warn(`[Fireworks Audio] Failed to load ${url}:`, e.message);
        }
    }

    async play(name, volume = 1.0) {
        if (!this.enabled) return;
        
        // Ensure AudioContext is created
        await this.ensureAudioContext();
        
        if (!this.audioContext || !this.sounds.has(name)) return;
        
        try {
            // Resume if suspended
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            
            source.buffer = this.sounds.get(name);
            gainNode.gain.value = this.volume * volume;
            
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            source.start(0);
        } catch (e) {
            console.warn('[Fireworks Audio] Playback error:', e.message);
        }
    }

    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }
}

// ============================================================================
// FIREWORKS ENGINE
// ============================================================================

class FireworksEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = null;
        this.gl = null;
        this.useWebGL = false;
        
        this.particlePool = new ParticlePool(CONFIG.maxParticles);
        this.audioManager = new AudioManager();
        
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.fps = 0;
        this.fpsUpdateTime = performance.now();
        
        this.config = { ...CONFIG };
        this.running = false;
        this.socket = null;
        
        // Image cache for gift particles
        this.imageCache = new Map();
        
        // Debug mode
        this.debugMode = false;
    }

    async init() {
        // Check if toaster mode is requested via config
        // Toaster mode forces Canvas 2D rendering for maximum compatibility
        const toasterModeRequested = this.config.toasterMode === true;
        
        if (toasterModeRequested) {
            // Toaster Mode: Force Canvas 2D rendering
            this.ctx = this.canvas.getContext('2d');
            this.useWebGL = false;
            document.getElementById('renderer-type').textContent = 'Canvas 2D (Toaster Mode)';
            console.log('[Fireworks Engine] Toaster Mode enabled - using Canvas 2D');
        } else {
            // Try WebGL first for better performance
            this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
            
            if (this.gl) {
                this.useWebGL = true;
                this.initWebGL();
                document.getElementById('renderer-type').textContent = 'WebGL';
            } else {
                // Fallback to Canvas 2D if WebGL not available
                this.ctx = this.canvas.getContext('2d');
                document.getElementById('renderer-type').textContent = 'Canvas 2D (Fallback)';
            }
        }

        // Set canvas size
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Initialize audio
        await this.audioManager.init();

        // Connect to Socket.io
        this.connectSocket();

        // Start render loop
        this.running = true;
        this.render();

        console.log('[Fireworks Engine] Initialized with', this.useWebGL ? 'WebGL' : 'Canvas 2D');
    }

    initWebGL() {
        const gl = this.gl;
        
        // Enable blending for transparency
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        // Clear color (transparent)
        gl.clearColor(0, 0, 0, 0);
        
        // Compile shaders
        this.webglProgram = this.createShaderProgram();
        if (!this.webglProgram) {
            console.warn('[Fireworks Engine] Failed to create shader program, falling back to Canvas 2D');
            this.useWebGL = false;
            this.ctx = this.canvas.getContext('2d');
            return;
        }
        
        // Get attribute and uniform locations
        this.webglLocations = {
            position: gl.getAttribLocation(this.webglProgram, 'a_position'),
            size: gl.getAttribLocation(this.webglProgram, 'a_size'),
            color: gl.getAttribLocation(this.webglProgram, 'a_color'),
            alpha: gl.getAttribLocation(this.webglProgram, 'a_alpha'),
            resolution: gl.getUniformLocation(this.webglProgram, 'u_resolution'),
            texture: gl.getUniformLocation(this.webglProgram, 'u_texture'),
            useTexture: gl.getUniformLocation(this.webglProgram, 'u_useTexture')
        };
        
        // Validate attribute locations
        if (this.webglLocations.position === -1 || this.webglLocations.size === -1 ||
            this.webglLocations.color === -1 || this.webglLocations.alpha === -1) {
            console.error('[Fireworks Engine] Failed to get attribute locations');
            this.useWebGL = false;
            this.ctx = this.canvas.getContext('2d');
            return;
        }
        
        // Validate uniform locations
        if (!this.webglLocations.resolution || !this.webglLocations.useTexture) {
            console.error('[Fireworks Engine] Failed to get uniform locations');
            this.useWebGL = false;
            this.ctx = this.canvas.getContext('2d');
            return;
        }
        
        // Create buffers
        this.webglBuffers = {
            position: gl.createBuffer(),
            size: gl.createBuffer(),
            color: gl.createBuffer(),
            alpha: gl.createBuffer()
        };
        
        // Texture cache for gift images and avatars
        this.webglTextures = new Map();
        
        console.log('[Fireworks Engine] WebGL shaders initialized successfully');
    }
    
    createShaderProgram() {
        const gl = this.gl;
        
        // Vertex shader - transforms particle positions to clip space
        const vertexShaderSource = `
            attribute vec2 a_position;
            attribute float a_size;
            attribute vec4 a_color;
            attribute float a_alpha;
            
            uniform vec2 u_resolution;
            
            varying vec4 v_color;
            varying float v_alpha;
            
            void main() {
                // Convert from pixels to clip space (-1 to +1)
                vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
                clipSpace.y *= -1.0; // Flip Y axis
                
                gl_Position = vec4(clipSpace, 0.0, 1.0);
                gl_PointSize = a_size;
                
                v_color = a_color;
                v_alpha = a_alpha;
            }
        `;
        
        // Fragment shader - renders particles with glow effect
        const fragmentShaderSource = `
            precision mediump float;
            
            varying vec4 v_color;
            varying float v_alpha;
            
            uniform sampler2D u_texture;
            uniform bool u_useTexture;
            
            void main() {
                vec2 coord = gl_PointCoord - vec2(0.5);
                float dist = length(coord);
                
                if (u_useTexture) {
                    // Render textured particle (for gift images/avatars)
                    vec4 texColor = texture2D(u_texture, gl_PointCoord);
                    gl_FragColor = vec4(texColor.rgb, texColor.a * v_alpha);
                } else {
                    // Render colored particle with radial gradient glow
                    float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
                    
                    // Glow effect - brighter in center
                    float glow = exp(-dist * 8.0);
                    vec3 color = v_color.rgb * (0.5 + 0.5 * glow);
                    
                    gl_FragColor = vec4(color, alpha * v_alpha);
                }
            }
        `;
        
        // Compile vertex shader
        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader, vertexShaderSource);
        gl.compileShader(vertexShader);
        
        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            console.error('[Fireworks Engine] Vertex shader compilation error:', gl.getShaderInfoLog(vertexShader));
            gl.deleteShader(vertexShader);
            return null;
        }
        
        // Compile fragment shader
        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader, fragmentShaderSource);
        gl.compileShader(fragmentShader);
        
        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            console.error('[Fireworks Engine] Fragment shader compilation error:', gl.getShaderInfoLog(fragmentShader));
            gl.deleteShader(fragmentShader);
            gl.deleteShader(vertexShader);
            return null;
        }
        
        // Link shader program
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('[Fireworks Engine] Shader program linking error:', gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
            return null;
        }
        
        // Clean up shaders (no longer needed after linking)
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        
        return program;
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        if (this.useWebGL) {
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            
            // Also resize trail canvas if it exists
            if (this.trailCanvas) {
                this.trailCanvas.width = rect.width * dpr;
                this.trailCanvas.height = rect.height * dpr;
            }
        } else if (this.ctx) {
            this.ctx.scale(dpr, dpr);
        }
        
        this.width = rect.width;
        this.height = rect.height;
    }

    connectSocket() {
        try {
            this.socket = io({
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 1000
            });

            this.socket.on('connect', () => {
                console.log('[Fireworks Engine] Connected to server');
            });

            this.socket.on('fireworks:trigger', (data) => {
                this.handleTrigger(data);
            });

            this.socket.on('fireworks:finale', (data) => {
                this.handleFinale(data);
            });

            this.socket.on('fireworks:config-update', (data) => {
                if (data.config) {
                    Object.assign(this.config, data.config);
                    this.audioManager.setEnabled(this.config.audioEnabled);
                    this.audioManager.setVolume(this.config.audioVolume);
                }
            });

            this.socket.on('disconnect', () => {
                console.log('[Fireworks Engine] Disconnected from server');
            });
        } catch (e) {
            console.error('[Fireworks Engine] Socket connection error:', e);
        }
    }

    async handleTrigger(data) {
        const {
            position = { x: 0.5, y: 0.5 },
            shape = 'burst',
            colors = this.config.defaultColors,
            intensity = 1.0,
            particleCount = 50,
            giftImage = null,
            userAvatar = null,
            avatarParticleChance = 0.3,
            tier = 'medium',
            username = null,
            coins = 0,
            combo = 1,
            playSound = true,
            trailsEnabled = true,
            glowEnabled = true
        } = data;

        // Convert normalized position to canvas coordinates
        const x = position.x * this.width;
        const y = position.y * this.height;

        // Get shape generator
        const generator = ShapeGenerators[shape] || ShapeGenerators.burst;
        const velocities = generator(particleCount, intensity);

        // Load gift image if provided
        let giftImg = null;
        if (giftImage) {
            giftImg = await this.loadImage(giftImage);
        }
        
        // Load user avatar if provided
        let avatarImg = null;
        if (userAvatar) {
            avatarImg = await this.loadImage(userAvatar);
        }

        // Spawn particles
        for (let i = 0; i < velocities.length; i++) {
            const p = this.particlePool.get();
            if (!p) break; // Pool exhausted

            p.x = x;
            p.y = y;
            p.vx = velocities[i].vx;
            p.vy = velocities[i].vy;
            p.life = 2 + Math.random() * 2;
            p.maxLife = p.life;
            p.size = this.config.particleSizeRange[0] + 
                Math.random() * (this.config.particleSizeRange[1] - this.config.particleSizeRange[0]);
            p.size *= intensity;
            p.color = colors[Math.floor(Math.random() * colors.length)];
            p.gravity = this.config.gravity;
            p.friction = this.config.friction;
            p.rotation = Math.random() * Math.PI * 2;
            p.rotationSpeed = (Math.random() - 0.5) * 0.2;
            
            // Decide which image to use based on availability and configuration
            // Default to colored circles if no images
            p.type = 'circle';
            
            if (avatarImg || giftImg) {
                // Base image usage chance
                const baseImageChance = 0.3; // 30% of particles use images
                
                if (Math.random() < baseImageChance) {
                    p.type = 'image';
                    
                    // If both images available, use avatarParticleChance to decide
                    if (avatarImg && giftImg) {
                        // avatarParticleChance determines avatar vs gift probability
                        p.image = Math.random() < avatarParticleChance ? avatarImg : giftImg;
                    } else if (avatarImg) {
                        // Only avatar available
                        p.image = avatarImg;
                    } else {
                        // Only gift available
                        p.image = giftImg;
                    }
                    
                    p.size *= 2; // Make image particles larger
                }
            }
            
            // Clear trail
            p.trail = [];
        }

        // Play sound
        if (playSound && this.audioManager.enabled) {
            this.audioManager.play('explosion', intensity * 0.5);
        }

        // Show gift popup
        if (username && coins > 0) {
            this.showGiftPopup(x, y, username, coins, combo, giftImage);
        }
    }

    handleFinale(data) {
        const {
            intensity = 3.0,
            duration = 5000,
            burstCount = 5,
            burstInterval = 300,
            shapes = ['burst', 'heart', 'star', 'ring', 'spiral'],
            colors = this.config.defaultColors
        } = data;

        let bursts = 0;
        const interval = setInterval(() => {
            if (bursts >= burstCount) {
                clearInterval(interval);
                return;
            }

            // Random position
            const position = {
                x: 0.1 + Math.random() * 0.8,
                y: 0.2 + Math.random() * 0.5
            };

            // Random shape
            const shape = shapes[Math.floor(Math.random() * shapes.length)];

            this.handleTrigger({
                position,
                shape,
                colors,
                intensity: intensity * (0.8 + Math.random() * 0.4),
                particleCount: Math.round(100 * intensity),
                playSound: true
            });

            bursts++;
        }, burstInterval);
    }

    async loadImage(url) {
        if (this.imageCache.has(url)) {
            return this.imageCache.get(url);
        }

        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                this.imageCache.set(url, img);
                resolve(img);
            };
            img.onerror = () => resolve(null);
            img.src = url;
        });
    }

    showGiftPopup(x, y, username, coins, combo, giftImage) {
        const popup = document.createElement('div');
        popup.className = 'gift-popup';
        
        // Create elements safely to prevent XSS
        if (giftImage) {
            const img = document.createElement('img');
            img.alt = 'gift';
            // Validate URL before setting src
            try {
                const url = new URL(giftImage, window.location.origin);
                if (url.protocol === 'https:' || url.protocol === 'http:') {
                    img.src = url.href;
                }
            } catch (e) {
                // Invalid URL, skip image
            }
            popup.appendChild(img);
        }
        
        const infoSpan = document.createElement('span');
        infoSpan.textContent = `${username}: ${coins} coins`;
        popup.appendChild(infoSpan);
        
        if (combo > 1) {
            const comboSpan = document.createElement('span');
            comboSpan.className = 'combo';
            comboSpan.textContent = `${combo}x COMBO!`;
            popup.appendChild(comboSpan);
        }
        
        popup.style.left = `${x}px`;
        popup.style.top = `${y - 50}px`;
        popup.style.transform = 'translateX(-50%)';
        
        document.getElementById('fireworks-container').appendChild(popup);
        
        // Remove after animation
        setTimeout(() => {
            popup.remove();
        }, 2500);
    }

    render() {
        if (!this.running) return;

        const now = performance.now();
        const deltaTime = Math.min((now - this.lastTime) / 16.67, 3); // Cap delta time
        this.lastTime = now;

        // Update particles
        this.particlePool.update(deltaTime);

        // Clear canvas
        if (this.useWebGL) {
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);
            this.renderWebGL();
        } else {
            this.ctx.clearRect(0, 0, this.width, this.height);
            this.renderCanvas();
        }

        // Update FPS counter
        this.frameCount++;
        if (now - this.fpsUpdateTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.fpsUpdateTime = now;
            
            if (this.debugMode) {
                document.getElementById('fps').textContent = this.fps;
                document.getElementById('particle-count').textContent = this.particlePool.getActiveCount();
            }
        }

        requestAnimationFrame(() => this.render());
    }

    renderCanvas() {
        const ctx = this.ctx;
        const particles = this.particlePool.active;

        for (const p of particles) {
            ctx.save();
            ctx.globalAlpha = p.alpha;

            // Draw trail
            if (p.trail.length > 1 && this.config.trailsEnabled) {
                ctx.beginPath();
                ctx.moveTo(p.trail[0].x, p.trail[0].y);
                for (let i = 1; i < p.trail.length; i++) {
                    ctx.lineTo(p.trail[i].x, p.trail[i].y);
                }
                ctx.strokeStyle = p.color;
                ctx.lineWidth = p.size * 0.3;
                ctx.globalAlpha = p.alpha * 0.3;
                ctx.stroke();
                ctx.globalAlpha = p.alpha;
            }

            // Draw particle
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);

            if (p.type === 'image' && p.image) {
                const size = p.size * 3;
                ctx.drawImage(p.image, -size/2, -size/2, size, size);
            } else {
                // Draw glow
                if (this.config.glowEnabled) {
                    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * 2);
                    gradient.addColorStop(0, p.color);
                    gradient.addColorStop(0.5, p.color + '80');
                    gradient.addColorStop(1, 'transparent');
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(0, 0, p.size * 2, 0, Math.PI * 2);
                    ctx.fill();
                }

                // Draw core
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(0, 0, p.size, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
    }

    renderWebGL() {
        const gl = this.gl;
        const particles = this.particlePool.active;
        
        if (particles.length === 0) return;
        
        // Prepare data arrays
        const positions = [];
        const sizes = [];
        const colors = [];
        const alphas = [];
        
        // Extract particle data
        for (const p of particles) {
            positions.push(p.x, p.y);
            sizes.push(p.size * 2); // Scale for visibility
            
            // Parse color to RGB components
            const rgb = this.parseColor(p.color);
            colors.push(rgb.r, rgb.g, rgb.b, 1.0);
            
            alphas.push(p.alpha);
        }
        
        // Use shader program
        gl.useProgram(this.webglProgram);
        
        // Set resolution uniform
        gl.uniform2f(this.webglLocations.resolution, this.canvas.width, this.canvas.height);
        gl.uniform1i(this.webglLocations.useTexture, false);
        
        // Upload position data
        gl.bindBuffer(gl.ARRAY_BUFFER, this.webglBuffers.position);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(this.webglLocations.position);
        gl.vertexAttribPointer(this.webglLocations.position, 2, gl.FLOAT, false, 0, 0);
        
        // Upload size data
        gl.bindBuffer(gl.ARRAY_BUFFER, this.webglBuffers.size);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sizes), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(this.webglLocations.size);
        gl.vertexAttribPointer(this.webglLocations.size, 1, gl.FLOAT, false, 0, 0);
        
        // Upload color data
        gl.bindBuffer(gl.ARRAY_BUFFER, this.webglBuffers.color);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(this.webglLocations.color);
        gl.vertexAttribPointer(this.webglLocations.color, 4, gl.FLOAT, false, 0, 0);
        
        // Upload alpha data
        gl.bindBuffer(gl.ARRAY_BUFFER, this.webglBuffers.alpha);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(alphas), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(this.webglLocations.alpha);
        gl.vertexAttribPointer(this.webglLocations.alpha, 1, gl.FLOAT, false, 0, 0);
        
        // Draw particles as points
        gl.drawArrays(gl.POINTS, 0, particles.length);
        
        // Render trails using Canvas 2D overlay (WebGL line rendering is complex)
        if (this.config.trailsEnabled) {
            this.renderTrailsCanvas(particles);
        }
    }
    
    parseColor(color) {
        // Parse hex color to RGB (0-1 range)
        if (color.startsWith('#')) {
            const hex = color.substring(1);
            
            // Validate hex length and expand 3-char format
            if (hex.length === 3) {
                // Expand shorthand (e.g., #f0a -> #ff00aa)
                const r = parseInt(hex[0] + hex[0], 16) / 255;
                const g = parseInt(hex[1] + hex[1], 16) / 255;
                const b = parseInt(hex[2] + hex[2], 16) / 255;
                return { r, g, b };
            } else if (hex.length === 6) {
                return {
                    r: parseInt(hex.substring(0, 2), 16) / 255,
                    g: parseInt(hex.substring(2, 4), 16) / 255,
                    b: parseInt(hex.substring(4, 6), 16) / 255
                };
            }
            // Invalid hex format, fall through to default
        }
        
        // Parse hsl color (support both integer and decimal values)
        if (color.startsWith('hsl')) {
            const match = color.match(/hsl\(([0-9.]+),\s*([0-9.]+)%,\s*([0-9.]+)%\)/);
            if (match) {
                const h = parseFloat(match[1]) / 360;
                const s = parseFloat(match[2]) / 100;
                const l = parseFloat(match[3]) / 100;
                return this.hslToRgb(h, s, l);
            }
        }
        
        // Parse rgb/rgba color (support both integer and decimal values)
        if (color.startsWith('rgb')) {
            const match = color.match(/rgba?\(([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/);
            if (match) {
                return {
                    r: parseFloat(match[1]) / 255,
                    g: parseFloat(match[2]) / 255,
                    b: parseFloat(match[3]) / 255
                };
            }
        }
        
        // Default to white
        return { r: 1.0, g: 1.0, b: 1.0 };
    }
    
    hslToRgb(h, s, l) {
        let r, g, b;
        
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        
        return { r, g, b };
    }
    
    renderTrailsCanvas(particles) {
        // Create temporary 2D context for trails if needed
        if (!this.trailCtx) {
            // Validate parent element exists
            if (!this.canvas.parentElement) {
                console.warn('[Fireworks Engine] Cannot create trail canvas: parent element not found');
                return;
            }
            
            const trailCanvas = document.createElement('canvas');
            trailCanvas.width = this.canvas.width;
            trailCanvas.height = this.canvas.height;
            trailCanvas.style.position = 'absolute';
            trailCanvas.style.top = '0';
            trailCanvas.style.left = '0';
            trailCanvas.style.pointerEvents = 'none';
            this.canvas.parentElement.appendChild(trailCanvas);
            this.trailCtx = trailCanvas.getContext('2d');
            this.trailCanvas = trailCanvas;
        }
        
        // Clear trail canvas
        this.trailCtx.clearRect(0, 0, this.trailCanvas.width, this.trailCanvas.height);
        
        // Render trails
        for (const p of particles) {
            if (p.trail.length > 1) {
                this.trailCtx.save();
                this.trailCtx.globalAlpha = p.alpha * 0.3;
                this.trailCtx.beginPath();
                this.trailCtx.moveTo(p.trail[0].x, p.trail[0].y);
                for (let i = 1; i < p.trail.length; i++) {
                    this.trailCtx.lineTo(p.trail[i].x, p.trail[i].y);
                }
                this.trailCtx.strokeStyle = p.color;
                this.trailCtx.lineWidth = p.size * 0.3;
                this.trailCtx.stroke();
                this.trailCtx.restore();
            }
        }
    }

    toggleDebug() {
        this.debugMode = !this.debugMode;
        document.getElementById('debug-panel').classList.toggle('visible', this.debugMode);
    }

    destroy() {
        this.running = false;
        if (this.socket) {
            this.socket.disconnect();
        }
        
        // Clean up trail canvas if it exists
        if (this.trailCanvas) {
            this.trailCanvas.remove();
            this.trailCanvas = null;
            this.trailCtx = null;
        }
        
        // Clean up WebGL resources
        if (this.useWebGL && this.gl) {
            // Delete buffers
            if (this.webglBuffers) {
                Object.values(this.webglBuffers).forEach(buffer => {
                    if (buffer) this.gl.deleteBuffer(buffer);
                });
            }
            
            // Delete program
            if (this.webglProgram) {
                this.gl.deleteProgram(this.webglProgram);
            }
            
            // Delete textures
            if (this.webglTextures) {
                this.webglTextures.forEach(texture => {
                    this.gl.deleteTexture(texture);
                });
                this.webglTextures.clear();
            }
        }
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let engine = null;

document.addEventListener('DOMContentLoaded', async () => {
    engine = new FireworksEngine('fireworks-canvas');
    await engine.init();

    // Preload default sounds
    await engine.audioManager.preload('/plugins/fireworks/audio/explosion.mp3', 'explosion');
    await engine.audioManager.preload('/plugins/fireworks/audio/rocket.mp3', 'rocket');

    // Enable debug mode with 'D' key
    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'd') {
            engine.toggleDebug();
        }
    });

    console.log('[Fireworks] Engine ready');
});

// Export for external access
window.FireworksEngine = engine;
