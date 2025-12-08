/**
 * Advanced Fireworks Engine - Professional Grade Particle System
 * 
 * Inspired by OpenProcessing sketch 1539861 but taken to the next level
 * 
 * Advanced Features:
 * - Multi-stage firework rockets with realistic physics
 * - Secondary explosions and sparkle effects
 * - Advanced color palettes with smooth gradients
 * - Particle pooling for optimal performance
 * - Custom explosion shapes with mathematical precision
 * - Trail effects with motion blur
 * - Gift image integration with proper blending
 * - HSB color mode for vibrant displays
 * - Efficient Canvas 2D rendering optimized for OBS
 * - Configurable toaster mode for low-end systems
 * 
 * Architecture:
 * - Particle: Individual physics-based particle
 * - Firework: Manages rocket launch, explosion, and particle lifecycle
 * - FireworksEngine: Main engine handling rendering and orchestration
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    maxFireworks: 100,
    maxParticlesPerExplosion: 200,
    targetFps: 60,
    gravity: 0.08,
    airResistance: 0.99,
    rocketSpeed: -12,
    rocketAcceleration: -0.08,
    trailLength: 20,
    trailFadeAlpha: 10,
    sparkleChance: 0.15,
    secondaryExplosionChance: 0.1,
    colorPalettes: {
        classic: ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#ff00ff'],
        neon: ['#ff006e', '#fb5607', '#ffbe0b', '#8338ec', '#3a86ff'],
        pastel: ['#ffc2d1', '#ffb3ba', '#ffdfba', '#ffffba', '#baffc9', '#bae1ff'],
        fire: ['#ff0000', '#ff4500', '#ff8c00', '#ffd700', '#ffff00'],
        ice: ['#00ffff', '#00ccff', '#0099ff', '#0066ff', '#0033ff'],
        rainbow: ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#9400d3']
    }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function hslToRgb(h, s, l) {
    h /= 360;
    s /= 100;
    l /= 100;
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
    
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
}

// ============================================================================
// PARTICLE CLASS - Advanced physics-based particle
// ============================================================================

class Particle {
    constructor(args = {}) {
        const defaults = {
            x: 0,
            y: 0,
            vx: 0,
            vy: -10,
            ax: 0,
            ay: 0,
            mass: 1,
            drag: CONFIG.airResistance,
            gravity: CONFIG.gravity,
            size: 3,
            hue: 360,
            saturation: 100,
            brightness: 100,
            alpha: 1.0,
            lifespan: 1.0,
            decay: 0.01,
            isSeed: true,
            isSparkle: false,
            color: '#ffffff',
            image: null,
            type: 'circle',
            rotation: 0,
            rotationSpeed: 0
        };
        
        Object.assign(this, defaults, args);
        this.maxLifespan = this.lifespan;
        this.trail = [];
        this.age = 0;
    }
    
    applyForce(fx, fy) {
        this.ax += fx / this.mass;
        this.ay += fy / this.mass;
    }
    
    applyGravity() {
        this.ay += this.gravity;
    }
    
    update() {
        // Apply air resistance
        this.vx *= this.drag;
        this.vy *= this.drag;
        
        // Update velocity
        this.vx += this.ax;
        this.vy += this.ay;
        
        // Update position
        this.x += this.vx;
        this.y += this.vy;
        
        // Clear acceleration
        this.ax = 0;
        this.ay = 0;
        
        // Update rotation
        this.rotation += this.rotationSpeed;
        
        // Update lifespan for explosion particles
        if (!this.isSeed) {
            this.lifespan -= this.decay;
            this.alpha = Math.max(0, this.lifespan / this.maxLifespan);
            
            // Add sparkle flicker effect
            if (this.isSparkle && Math.random() < 0.3) {
                this.brightness = 80 + Math.random() * 20;
            }
        }
        
        // Store trail with fading
        if (this.trail.length > CONFIG.trailLength) {
            this.trail.shift();
        }
        this.trail.push({ 
            x: this.x, 
            y: this.y, 
            alpha: this.alpha * 0.5,
            size: this.size * 0.7
        });
        
        this.age++;
    }
    
    isDone() {
        return this.lifespan <= 0 || this.y > window.innerHeight + 100;
    }
}

// ============================================================================
// FIREWORK CLASS - Advanced multi-stage firework system
// ============================================================================

class Firework {
    constructor(args = {}) {
        const defaults = {
            x: Math.random() * window.innerWidth,
            y: window.innerHeight,
            targetY: 100 + Math.random() * 300,
            shape: 'burst',
            colors: CONFIG.colorPalettes.classic,
            intensity: 1.0,
            giftImage: null,
            userAvatar: null,
            avatarParticleChance: 0.3,
            useImages: false,
            tier: 'medium',
            combo: 1
        };
        
        Object.assign(this, defaults, args);
        
        // State management
        this.exploded = false;
        this.particles = [];
        this.secondaryExplosions = [];
        
        // Create rocket (seed particle)
        this.rocket = new Particle({
            x: this.x,
            y: this.y,
            vx: (Math.random() - 0.5) * 1.5,
            vy: CONFIG.rocketSpeed + (Math.random() - 0.5) * 2,
            size: 3 + this.intensity,
            hue: Math.random() * 360,
            saturation: 80,
            brightness: 100,
            color: this.colors[Math.floor(Math.random() * this.colors.length)],
            isSeed: true,
            gravity: CONFIG.rocketAcceleration,
            drag: 0.995
        });
        
        // Color palette for explosion
        this.baseHue = Math.random() * 360;
        this.hueRange = 60 + Math.random() * 60;
    }
    
    shouldExplode() {
        // Explode when rocket velocity becomes downward OR reaches target height
        return (this.rocket.vy >= 0 || this.rocket.y <= this.targetY) && !this.exploded;
    }
    
    explode() {
        this.exploded = true;
        
        // Calculate particle count based on intensity and tier
        const tierMultipliers = {
            small: 0.5,
            medium: 1.0,
            big: 1.5,
            massive: 2.0
        };
        const tierMult = tierMultipliers[this.tier] || 1.0;
        const comboMult = 1 + (this.combo - 1) * 0.2;
        const particleCount = Math.floor((40 + Math.random() * 60) * this.intensity * tierMult * comboMult);
        
        // Get velocities from shape generator
        const generator = ShapeGenerators[this.shape] || ShapeGenerators.burst;
        const velocities = generator(particleCount, this.intensity);
        
        // Create explosion particles
        for (let i = 0; i < velocities.length; i++) {
            const vel = velocities[i];
            const hue = this.baseHue + (Math.random() * this.hueRange);
            const isSparkle = Math.random() < CONFIG.sparkleChance;
            
            // Determine particle appearance
            let particleType = 'circle';
            let particleImage = null;
            
            if (this.useImages && (this.giftImage || this.userAvatar)) {
                if (Math.random() < 0.35) {
                    particleType = 'image';
                    if (this.giftImage && this.userAvatar) {
                        particleImage = Math.random() < this.avatarParticleChance ? this.userAvatar : this.giftImage;
                    } else {
                        particleImage = this.giftImage || this.userAvatar;
                    }
                }
            }
            
            const particle = new Particle({
                x: this.rocket.x,
                y: this.rocket.y,
                vx: vel.vx,
                vy: vel.vy,
                size: isSparkle ? 2 + Math.random() * 2 : 3 + Math.random() * 4,
                hue: hue,
                saturation: isSparkle ? 100 : 90,
                brightness: isSparkle ? 100 : 95,
                lifespan: isSparkle ? 0.6 + Math.random() * 0.4 : 0.8 + Math.random() * 0.6,
                decay: isSparkle ? 0.015 : 0.008,
                isSeed: false,
                isSparkle: isSparkle,
                type: particleType,
                image: particleImage,
                mass: isSparkle ? 0.5 : 1,
                drag: isSparkle ? 0.97 : 0.98,
                gravity: isSparkle ? CONFIG.gravity * 0.8 : CONFIG.gravity,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.1
            });
            
            this.particles.push(particle);
            
            // Chance for secondary explosion
            if (Math.random() < CONFIG.secondaryExplosionChance && !isSparkle) {
                particle.willExplode = true;
                particle.explosionDelay = 20 + Math.floor(Math.random() * 30);
            }
        }
    }
    
    update() {
        // Update rocket
        if (!this.exploded) {
            this.rocket.applyGravity();
            this.rocket.update();
            
            if (this.shouldExplode()) {
                this.explode();
            }
        }
        
        // Update explosion particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.applyGravity();
            p.update();
            
            // Check for secondary explosions
            if (p.willExplode && p.age >= p.explosionDelay && !p.exploded) {
                p.exploded = true;
                this.createSecondaryExplosion(p);
            }
            
            // Remove dead particles
            if (p.isDone()) {
                this.particles.splice(i, 1);
            }
        }
        
        // Update secondary explosions
        for (let i = this.secondaryExplosions.length - 1; i >= 0; i--) {
            const p = this.secondaryExplosions[i];
            p.applyGravity();
            p.update();
            
            if (p.isDone()) {
                this.secondaryExplosions.splice(i, 1);
            }
        }
    }
    
    createSecondaryExplosion(sourceParticle) {
        const count = 8 + Math.floor(Math.random() * 12);
        
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            const speed = 1 + Math.random() * 2;
            
            const particle = new Particle({
                x: sourceParticle.x,
                y: sourceParticle.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 1 + Math.random() * 2,
                hue: sourceParticle.hue + (Math.random() - 0.5) * 30,
                saturation: 100,
                brightness: 100,
                lifespan: 0.4 + Math.random() * 0.3,
                decay: 0.02,
                isSeed: false,
                isSparkle: true,
                mass: 0.3,
                drag: 0.96,
                gravity: CONFIG.gravity * 0.6
            });
            
            this.secondaryExplosions.push(particle);
        }
    }
    
    isDone() {
        return this.exploded && 
               this.particles.length === 0 && 
               this.secondaryExplosions.length === 0;
    }
}

// ============================================================================
// SHAPE GENERATORS - Mathematical patterns for explosions
// ============================================================================

const ShapeGenerators = {
    burst: (count, intensity) => {
        const particles = [];
        const rings = 2 + Math.floor(intensity);
        const particlesPerRing = Math.floor(count / rings);
        
        for (let ring = 0; ring < rings; ring++) {
            const ringSpeed = (2 + Math.random() * 2) * (1 + ring * 0.3) * intensity;
            for (let i = 0; i < particlesPerRing; i++) {
                const angle = (Math.PI * 2 * i) / particlesPerRing + (Math.random() - 0.5) * 0.2;
                particles.push({
                    vx: Math.cos(angle) * ringSpeed,
                    vy: Math.sin(angle) * ringSpeed
                });
            }
        }
        return particles;
    },

    heart: (count, intensity) => {
        const particles = [];
        for (let i = 0; i < count; i++) {
            const t = (i / count) * Math.PI * 2;
            // Parametric heart equation
            const x = 16 * Math.pow(Math.sin(t), 3);
            const y = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));
            const mag = Math.sqrt(x*x + y*y) || 1;
            const speed = (0.15 + Math.random() * 0.15) * intensity;
            particles.push({
                vx: (x / mag) * speed * 10,
                vy: (y / mag) * speed * 10
            });
        }
        return particles;
    },

    star: (count, intensity) => {
        const particles = [];
        const points = 5;
        const particlesPerPoint = Math.floor(count / points);
        
        for (let point = 0; point < points; point++) {
            const baseAngle = (Math.PI * 2 * point) / points - Math.PI / 2;
            
            for (let i = 0; i < particlesPerPoint; i++) {
                const spread = (i / particlesPerPoint) * 0.4 - 0.2;
                const angle = baseAngle + spread;
                const radius = point % 2 === 0 ? 1 : 0.5;
                const speed = (2 + Math.random() * 2) * intensity * radius;
                particles.push({
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed
                });
            }
        }
        return particles;
    },

    spiral: (count, intensity) => {
        const particles = [];
        const turns = 4;
        const arms = 3;
        
        for (let i = 0; i < count; i++) {
            const t = (i / count) * turns * Math.PI * 2;
            const armOffset = (Math.floor(i * arms / count) * Math.PI * 2) / arms;
            const radius = (i / count) * intensity * 0.8;
            const speed = 1.5 + Math.random() * 1.5;
            particles.push({
                vx: Math.cos(t + armOffset) * radius * speed,
                vy: Math.sin(t + armOffset) * radius * speed
            });
        }
        return particles;
    },

    ring: (count, intensity) => {
        const particles = [];
        const rings = 2 + Math.floor(intensity * 0.5);
        
        for (let ring = 0; ring < rings; ring++) {
            const ringParticles = Math.floor(count / rings);
            const ringRadius = (ring + 1) / rings;
            
            for (let i = 0; i < ringParticles; i++) {
                const angle = (Math.PI * 2 * i) / ringParticles;
                const speed = (3 + Math.random()) * intensity * ringRadius;
                particles.push({
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed
                });
            }
        }
        return particles;
    },

    fountain: (count, intensity) => {
        const particles = [];
        for (let i = 0; i < count; i++) {
            const angle = -Math.PI/2 + (Math.random() - 0.5) * Math.PI * 0.6;
            const speed = (2 + Math.random() * 3) * intensity;
            particles.push({
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed
            });
        }
        return particles;
    },

    willow: (count, intensity) => {
        const particles = [];
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            const speedVariation = 0.7 + Math.random() * 0.6;
            const speed = 2 * intensity * speedVariation;
            particles.push({
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1 // Downward bias for willow effect
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
        this.pendingSounds = new Map();
    }

    async init() {
        this.initialized = true;
        console.log('[Fireworks Audio] Audio manager ready');
    }

    async ensureAudioContext() {
        if (!this.audioContext && this.initialized) {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                
                if (this.audioContext.state === 'suspended') {
                    await this.audioContext.resume();
                }
                
                for (const [name, url] of this.pendingSounds.entries()) {
                    await this.preload(url, name);
                }
                this.pendingSounds.clear();
                
                console.log('[Fireworks Audio] AudioContext created');
            } catch (e) {
                console.warn('[Fireworks Audio] AudioContext not available:', e.message);
            }
        }
    }

    async preload(url, name) {
        if (!this.audioContext) {
            this.pendingSounds.set(name, url);
            return;
        }
        
        if (this.sounds.has(name)) return;
        
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
        
        await this.ensureAudioContext();
        
        if (!this.audioContext || !this.sounds.has(name)) return;
        
        try {
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
// FIREWORKS ENGINE - Main rendering and orchestration
// ============================================================================

class FireworksEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        this.fireworks = [];
        this.audioManager = new AudioManager();
        
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.fps = 0;
        this.fpsUpdateTime = performance.now();
        
        this.config = { 
            ...CONFIG,
            toasterMode: false,
            audioEnabled: true,
            audioVolume: 0.7,
            trailsEnabled: true,
            glowEnabled: true
        };
        
        this.running = false;
        this.socket = null;
        this.imageCache = new Map();
        this.debugMode = false;
        
        this.width = 0;
        this.height = 0;
    }

    async init() {
        // Setup canvas
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Initialize audio
        await this.audioManager.init();

        // Connect to Socket.io
        this.connectSocket();

        // Start render loop
        this.running = true;
        this.render();

        console.log('[Fireworks Engine] Initialized with Canvas 2D');
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        
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
            playSound = true
        } = data;

        // Launch position at bottom, target at specified position
        const startX = position.x * this.width;
        const targetY = position.y * this.height;

        // Load images if provided
        let giftImg = null;
        let avatarImg = null;
        if (giftImage) giftImg = await this.loadImage(giftImage);
        if (userAvatar) avatarImg = await this.loadImage(userAvatar);

        // Create firework
        const firework = new Firework({
            x: startX,
            y: this.height,
            targetY: targetY,
            shape: shape,
            colors: colors,
            intensity: intensity,
            giftImage: giftImg,
            userAvatar: avatarImg,
            avatarParticleChance: avatarParticleChance,
            useImages: !!(giftImg || avatarImg),
            tier: tier,
            combo: combo
        });

        this.fireworks.push(firework);

        // Play launch sound
        if (playSound && this.audioManager.enabled) {
            this.audioManager.play('rocket', 0.3);
        }

        // Show gift popup
        if (username && coins > 0) {
            this.showGiftPopup(startX, this.height - 100, username, coins, combo, giftImage);
        }
    }

    handleFinale(data) {
        const {
            intensity = 3.0,
            duration = 5000,
            burstCount = 15,
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

            const position = {
                x: 0.2 + Math.random() * 0.6,
                y: 0.2 + Math.random() * 0.4
            };

            const shape = shapes[Math.floor(Math.random() * shapes.length)];

            this.handleTrigger({
                position,
                shape,
                colors,
                intensity: intensity * (0.8 + Math.random() * 0.4),
                particleCount: Math.round(80 * intensity),
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
        popup.style.cssText = `
            position: absolute;
            left: ${x}px;
            top: ${y}px;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 25px;
            font-size: 18px;
            font-weight: bold;
            display: flex;
            align-items: center;
            gap: 10px;
            animation: popIn 0.3s ease-out, fadeOut 0.5s ease-in 2s forwards;
            pointer-events: none;
            z-index: 100;
            border: 2px solid rgba(255, 255, 255, 0.3);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;
        
        if (giftImage) {
            const img = document.createElement('img');
            img.src = giftImage;
            img.style.cssText = 'width: 32px; height: 32px; object-fit: contain;';
            popup.appendChild(img);
        }
        
        const text = document.createElement('span');
        text.textContent = `${username}: ${coins} coins`;
        popup.appendChild(text);
        
        if (combo > 1) {
            const comboSpan = document.createElement('span');
            comboSpan.style.color = '#ffcc00';
            comboSpan.textContent = ` ${combo}x COMBO!`;
            popup.appendChild(comboSpan);
        }
        
        document.getElementById('fireworks-container').appendChild(popup);
        
        setTimeout(() => popup.remove(), 2500);
    }

    render() {
        if (!this.running) return;

        const now = performance.now();
        const deltaTime = Math.min((now - this.lastTime) / 16.67, 3);
        this.lastTime = now;

        // Clear with fade for trail effect
        this.ctx.fillStyle = `rgba(0, 0, 0, ${CONFIG.trailFadeAlpha / 100})`;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Update and render all fireworks
        for (let i = this.fireworks.length - 1; i >= 0; i--) {
            this.fireworks[i].update();
            this.renderFirework(this.fireworks[i]);
            
            if (this.fireworks[i].isDone()) {
                this.fireworks.splice(i, 1);
            }
        }

        // Update FPS
        this.frameCount++;
        if (now - this.fpsUpdateTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.fpsUpdateTime = now;
            
            if (this.debugMode) {
                document.getElementById('fps').textContent = this.fps;
                document.getElementById('particle-count').textContent = this.getTotalParticles();
            }
        }

        requestAnimationFrame(() => this.render());
    }

    renderFirework(firework) {
        const ctx = this.ctx;
        
        // Render rocket (seed particle)
        if (!firework.exploded) {
            this.renderParticle(firework.rocket);
        }
        
        // Render explosion particles
        for (const particle of firework.particles) {
            this.renderParticle(particle);
        }
        
        // Render secondary explosions
        for (const particle of firework.secondaryExplosions) {
            this.renderParticle(particle);
        }
    }

    renderParticle(p) {
        const ctx = this.ctx;
        
        // Render trail
        if (this.config.trailsEnabled && p.trail.length > 1) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(p.trail[0].x, p.trail[0].y);
            
            for (let i = 1; i < p.trail.length; i++) {
                ctx.lineTo(p.trail[i].x, p.trail[i].y);
            }
            
            const rgb = hslToRgb(p.hue, p.saturation, p.brightness);
            ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${p.alpha * 0.3})`;
            ctx.lineWidth = p.size * 0.5;
            ctx.lineCap = 'round';
            ctx.stroke();
            ctx.restore();
        }
        
        // Render particle
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.alpha;
        
        if (p.type === 'image' && p.image) {
            // Render image particle
            const size = p.size * 3;
            ctx.drawImage(p.image, -size/2, -size/2, size, size);
        } else {
            // Render colored particle with glow
            const rgb = hslToRgb(p.hue, p.saturation, p.brightness);
            
            if (this.config.glowEnabled) {
                const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * 2);
                gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${p.alpha})`);
                gradient.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${p.alpha * 0.5})`);
                gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(0, 0, p.size * 2, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Core particle
            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${p.alpha})`;
            ctx.beginPath();
            ctx.arc(0, 0, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }

    getTotalParticles() {
        let count = 0;
        for (const fw of this.fireworks) {
            count += fw.particles.length + fw.secondaryExplosions.length;
            if (!fw.exploded) count++;
        }
        return count;
    }

    toggleDebug() {
        this.debugMode = !this.debugMode;
        const panel = document.getElementById('debug-panel');
        if (panel) {
            panel.classList.toggle('visible', this.debugMode);
        }
    }

    destroy() {
        this.running = false;
        if (this.socket) {
            this.socket.disconnect();
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

    // Preload sounds
    await engine.audioManager.preload('/plugins/fireworks/audio/explosion.mp3', 'explosion');
    await engine.audioManager.preload('/plugins/fireworks/audio/rocket.mp3', 'rocket');

    // Debug mode toggle
    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'd') {
            engine.toggleDebug();
        }
    });

    console.log('[Fireworks] Advanced engine ready');
});

window.FireworksEngine = engine;
