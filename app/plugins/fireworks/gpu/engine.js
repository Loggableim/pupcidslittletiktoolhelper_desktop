/**
 * Advanced Fireworks Engine - Professional Grade Particle System
 * 
 * Inspired by OpenProcessing sketch 1539861 but taken to the next level
 * 
 * Advanced Features:
 * - Multi-stage firework rockets with realistic physics
 * - Secondary explosions and sparkle effects
 * - Advanced color palettes with smooth gradients
 * - Efficient particle management (no object pooling to reduce complexity)
 * - Custom explosion shapes with mathematical precision
 * - Trail effects with motion blur
 * - Gift image integration with proper blending and XSS protection
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
    minFps: 24, // Adaptive performance threshold - user configurable down to 24 FPS
    gravity: 0.08,
    airResistance: 0.99,
    rocketSpeed: -12,
    rocketAcceleration: -0.08,
    trailLength: 20,
    trailFadeAlpha: 10,
    trailFadeSpeed: 0.02,
    sparkleChance: 0.15,
    secondaryExplosionChance: 0.1,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    resolution: 1.0, // Canvas resolution multiplier (0.5 = half res, 1.0 = full res)
    giftPopupPosition: 'bottom', // 'top', 'middle', 'bottom', 'none', or {x, y} coordinates
    giftPopupEnabled: true, // Whether to show gift popup at all
    despawnFadeDuration: 1.5, // Duration in seconds for rocket despawn fade effect (when rockets are removed due to overload)
    defaultColors: ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#ff00ff'],
    colorPalettes: {
        classic: ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#ff00ff'],
        neon: ['#ff006e', '#fb5607', '#ffbe0b', '#8338ec', '#3a86ff'],
        pastel: ['#ffc2d1', '#ffb3ba', '#ffdfba', '#ffffba', '#baffc9', '#bae1ff'],
        fire: ['#ff0000', '#ff4500', '#ff8c00', '#ffd700', '#ffff00'],
        ice: ['#00ffff', '#00ccff', '#0099ff', '#0066ff', '#0033ff'],
        rainbow: ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#9400d3']
    },
    // Combo throttling to prevent extreme lag
    comboThrottleMinInterval: 100, // Minimum ms between combo triggers
    comboSkipRocketsThreshold: 5, // Skip rockets when combo >= this value
    comboInstantExplodeThreshold: 8 // Instant explosions (no rockets) when combo >= this
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
            rotationSpeed: 0,
            isDespawning: false, // Flag for despawn fade effect
            despawnStartTime: 0 // When despawn started
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
        // Handle despawn fade effect
        if (this.isDespawning) {
            const despawnDuration = CONFIG.despawnFadeDuration * 1000; // Convert to ms
            const elapsed = performance.now() - this.despawnStartTime;
            const fadeProgress = Math.min(elapsed / despawnDuration, 1.0);
            
            // Fade out alpha smoothly
            this.alpha = Math.max(0, 1.0 - fadeProgress);
            
            // If fade is complete, mark as done
            if (fadeProgress >= 1.0) {
                this.lifespan = 0;
            }
        }
        
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
        if (!this.isSeed && !this.isDespawning) {
            this.lifespan -= this.decay;
            this.alpha = Math.max(0, this.lifespan / this.maxLifespan);
            
            // Add sparkle flicker effect
            if (this.isSparkle && Math.random() < 0.3) {
                this.brightness = 80 + Math.random() * 20;
            }
        }
        
        // Store trail with fading based on age
        if (this.trail.length > CONFIG.trailLength) {
            this.trail.shift();
        }
        
        // Fade trail points based on their age
        for (let i = 0; i < this.trail.length; i++) {
            if (this.trail[i].alpha) {
                this.trail[i].alpha *= (1 - CONFIG.trailFadeSpeed);
            }
        }
        
        this.trail.push({ 
            x: this.x, 
            y: this.y, 
            alpha: this.alpha * 0.6,
            size: this.size * 0.7
        });
        
        this.age++;
    }
    
    isDone() {
        return this.lifespan <= 0 || this.y > window.innerHeight + 100;
    }
    
    /**
     * Start despawn fade effect
     * Called when particle needs to be removed due to performance
     */
    startDespawn() {
        if (!this.isDespawning) {
            this.isDespawning = true;
            this.despawnStartTime = performance.now();
        }
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
            combo: 1,
            skipRocket: false, // Skip rocket animation for high combos
            instantExplode: false // Explode immediately without delay
        };
        
        Object.assign(this, defaults, args);
        
        // State management
        this.particles = [];
        this.secondaryExplosions = [];
        
        // If instant explode, skip rocket creation entirely
        if (this.instantExplode) {
            this.rocket = null;
            this.exploded = false; // Will be set to true in update() when explode() is called
            this.shouldExplodeImmediately = true;
        } else if (this.skipRocket) {
            // Create a dummy rocket at target position, will explode immediately
            this.exploded = false;
            this.rocket = new Particle({
                x: this.x,
                y: this.y, // Already at target from handleTrigger
                vx: 0,
                vy: 0,
                size: 1,
                hue: 0,
                saturation: 0,
                brightness: 0,
                color: '#000000',
                isSeed: true,
                gravity: 0,
                drag: 1,
                type: 'circle',
                image: null,
                lifespan: 0.01 // Very short lifespan
            });
        } else {
            // Normal mode: Create rocket particle
            this.exploded = false;
            // If user avatar is available, use it as the rocket head
            const rocketType = this.userAvatar ? 'image' : 'circle';
            const rocketImage = this.userAvatar;
            const rocketSize = this.userAvatar ? 8 + this.intensity : 3 + this.intensity;
            
            this.rocket = new Particle({
                x: this.x,
                y: this.y,
                vx: (Math.random() - 0.5) * 1.5,
                vy: CONFIG.rocketSpeed + (Math.random() - 0.5) * 2,
                size: rocketSize,
                hue: Math.random() * 360,
                saturation: 80,
                brightness: 100,
                color: this.colors[Math.floor(Math.random() * this.colors.length)],
                isSeed: true,
                gravity: CONFIG.rocketAcceleration,
                drag: 0.995,
                type: rocketType,
                image: rocketImage
            });
        }
        
        // Color palette for explosion
        this.baseHue = Math.random() * 360;
        this.hueRange = 60 + Math.random() * 60;
    }
    
    shouldExplode() {
        // Instant explode mode
        if (this.shouldExplodeImmediately) {
            return true;
        }
        // Skip rocket mode - explode immediately
        if (this.skipRocket) {
            return true;
        }
        // Normal mode - explode when rocket velocity becomes downward OR reaches target height
        if (this.rocket) {
            return (this.rocket.vy >= 0 || this.rocket.y <= this.targetY) && !this.exploded;
        }
        return false;
    }
    
    explode() {
        this.exploded = true;
        
        // Play explosion sound if callback is set
        if (this.onExplodeSound) {
            this.onExplodeSound(this.intensity);
        }
        
        // For instant explode, use the position from constructor
        const explosionX = this.rocket ? this.rocket.x : this.x;
        const explosionY = this.rocket ? this.rocket.y : this.y;
        
        // Calculate particle count based on intensity and tier
        const tierMultipliers = {
            small: 0.5,
            medium: 1.0,
            big: 1.5,
            massive: 2.0
        };
        const tierMult = tierMultipliers[this.tier] || 1.0;
        const comboMult = 1 + (this.combo - 1) * 0.2;
        
        // Reduce particles for high combos to improve performance
        let baseParticles = 40 + Math.random() * 60;
        if (this.combo >= 10) {
            baseParticles *= 0.5; // 50% particles for combo >= 10
        } else if (this.combo >= 5) {
            baseParticles *= 0.7; // 70% particles for combo >= 5
        }
        
        const particleCount = Math.floor(baseParticles * this.intensity * tierMult * comboMult);
        
        // Get velocities from shape generator
        const generator = ShapeGenerators[this.shape] || ShapeGenerators.burst;
        const velocities = generator(particleCount, this.intensity);
        
        // Create explosion particles
        for (let i = 0; i < velocities.length; i++) {
            const vel = velocities[i];
            const hue = this.baseHue + (Math.random() * this.hueRange);
            const isSparkle = Math.random() < CONFIG.sparkleChance;
            
            // Determine particle appearance
            // Priority: Gift images for explosion particles (not sparkles)
            let particleType = 'circle';
            let particleImage = null;
            
            if (!isSparkle && this.giftImage) {
                // Use gift image for explosion particles (70% chance when available)
                if (Math.random() < 0.7) {
                    particleType = 'image';
                    particleImage = this.giftImage;
                }
            } else if (!isSparkle && this.userAvatar && Math.random() < 0.3) {
                // Use avatar occasionally if no gift image (30% chance)
                particleType = 'image';
                particleImage = this.userAvatar;
            }
            
            const particle = new Particle({
                x: explosionX,
                y: explosionY,
                vx: vel.vx,
                vy: vel.vy,
                size: isSparkle ? 2 + Math.random() * 2 : (particleType === 'image' ? 4 + Math.random() * 4 : 3 + Math.random() * 4),
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
            
            // Chance for secondary explosion (only for non-image particles to avoid lag)
            // Disable for high combos to improve performance
            if (this.combo < 5 && Math.random() < CONFIG.secondaryExplosionChance && !isSparkle && particleType === 'circle') {
                particle.willExplode = true;
                particle.explosionDelay = 20 + Math.floor(Math.random() * 30);
            }
        }
    }
    
    update() {
        // Handle instant explode mode
        if (this.shouldExplodeImmediately && !this.exploded) {
            this.explode();
            this.shouldExplodeImmediately = false;
            return;
        }
        
        // Update rocket (if exists and not exploded)
        if (!this.exploded && this.rocket) {
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
            // Prevent division by zero
            const mag = Math.max(Math.sqrt(x*x + y*y), 1);
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
                // Alternate between outer points (radius 1) and inner points (radius 0.5)
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
        
        // Audio selection constants for performance
        this.TINY_BANG_SOUNDS = ['combined-whistle-tiny1', 'combined-whistle-tiny2', 'combined-whistle-tiny3', 'combined-whistle-tiny4'];
        this.SMALL_SOUNDS = ['combined-whistle-tiny1', 'combined-whistle-tiny2', 'combined-whistle-tiny3'];
        
        // Launch sound variations for more variety
        this.BASIC_LAUNCH_SOUNDS = ['launch-basic', 'launch-basic2', 'rocket-basic'];
        this.SMOOTH_LAUNCH_SOUNDS = ['launch-smooth', 'launch-smooth2'];
        this.ALL_LAUNCH_SOUNDS = ['launch-basic', 'launch-basic2', 'rocket-basic', 'launch-whistle', 'launch-smooth', 'launch-smooth2'];
        
        // Explosion sound (currently only one, but structured for future expansion)
        this.EXPLOSION_SOUNDS = ['explosion-basic'];
        
        // Volume constants for consistent audio levels
        this.COMBINED_AUDIO_VOLUME = 0.6;        // Volume for combined (launch+explosion) audio
        this.LAUNCH_AUDIO_VOLUME = 0.4;          // Volume for separate launch sounds
        this.NORMAL_EXPLOSION_VOLUME = 0.6;      // Volume for normal explosions
        this.INSTANT_EXPLODE_VOLUME = 0.2;       // Volume for instant explosions (high combos)
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
            if (!response.ok) {
                console.info(`[Fireworks Audio] Audio file not found: ${url} (this is normal if not yet added)`);
                return;
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.sounds.set(name, audioBuffer);
            console.log(`[Fireworks Audio] Loaded: ${name}`);
        } catch (e) {
            console.info(`[Fireworks Audio] Could not load ${url}:`, e.message, '(add audio files to enable sounds)');
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

    /**
     * Play a sound after a specified delay (in seconds).
     * Useful for synchronizing explosion sounds with visual explosions when using separate audio files.
     * 
     * @param {string} name - The name of the sound to play (must be preloaded)
     * @param {number} delay - Delay in seconds before playing the sound
     * @param {number} [volume=1.0] - Volume multiplier (0.0 to 1.0), will be multiplied by global volume
     * 
     * @example
     * // Play explosion sound after 2 seconds
     * await audioManager.playDelayed('explosion-basic', 2.0, 0.8);
     */
    async playDelayed(name, delay, volume = 1.0) {
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
            
            // Schedule playback after delay
            const startTime = this.audioContext.currentTime + delay;
            source.start(startTime);
        } catch (e) {
            console.warn('[Fireworks Audio] Delayed playback error:', e.message);
        }
    }

    /**
     * Select appropriate audio based on firework tier and combo.
     * Returns an object with audio configuration for synchronized playback.
     * 
     * @param {string} tier - Firework tier: 'small', 'medium', 'big', or 'massive'
     * @param {number} combo - Current combo count (affects audio selection)
     * @param {boolean} [instantExplode=false] - Whether firework explodes instantly (no rocket animation)
     * @returns {Object} Audio configuration with sound names and timing
     * 
     * @example
     * const audioConfig = audioManager.selectAudio('big', 3, false);
     * // Returns: { useCombinedAudio: true, combinedSound: 'combined-crackling-bang', explosionDelay: 3.2 }
     */
    selectAudio(tier, combo, instantExplode = false) {
        // For instant explosions (high combo), use only explosion sounds
        if (instantExplode) {
            return {
                useCombinedAudio: false,
                launchSound: null,
                explosionSound: this.EXPLOSION_SOUNDS[Math.floor(Math.random() * this.EXPLOSION_SOUNDS.length)],
                explosionDelay: 0
            };
        }

        // For high combos (5+), skip rockets but use combined audio for effect
        if (combo >= 5) {
            return {
                useCombinedAudio: true,
                combinedSound: this.TINY_BANG_SOUNDS[Math.floor(Math.random() * this.TINY_BANG_SOUNDS.length)],
                explosionDelay: 0  // Explosion is already in the audio
            };
        }

        // Tier-based audio selection for normal fireworks with high variety
        const rand = Math.random();
        
        switch (tier) {
            case 'small':
                // Small fireworks: mix of combined tiny bangs and separate basic launches
                if (rand < 0.7) {
                    // 70% chance: use combined tiny bang for synchronized effect
                    return {
                        useCombinedAudio: true,
                        combinedSound: this.SMALL_SOUNDS[Math.floor(Math.random() * this.SMALL_SOUNDS.length)],
                        explosionDelay: 1.2  // Tiny bangs have explosion at ~1.2s
                    };
                } else {
                    // 30% chance: basic launch + explosion for variety
                    return {
                        useCombinedAudio: false,
                        launchSound: this.BASIC_LAUNCH_SOUNDS[Math.floor(Math.random() * this.BASIC_LAUNCH_SOUNDS.length)],
                        explosionSound: this.EXPLOSION_SOUNDS[Math.floor(Math.random() * this.EXPLOSION_SOUNDS.length)],
                        explosionDelay: 0  // Not used; explosion triggers via callback
                    };
                }

            case 'medium':
                // Medium fireworks: varied mix of combined and separate audio
                if (rand < 0.4) {
                    // 40% chance: combined whistle + normal bang
                    return {
                        useCombinedAudio: true,
                        combinedSound: 'combined-whistle-normal',
                        explosionDelay: 2.2  // Normal bang has explosion at ~2.2s in the audio file
                    };
                } else if (rand < 0.7) {
                    // 30% chance: smooth launch + explosion
                    return {
                        useCombinedAudio: false,
                        launchSound: this.SMOOTH_LAUNCH_SOUNDS[Math.floor(Math.random() * this.SMOOTH_LAUNCH_SOUNDS.length)],
                        explosionSound: this.EXPLOSION_SOUNDS[Math.floor(Math.random() * this.EXPLOSION_SOUNDS.length)],
                        explosionDelay: 0  // Not used; explosion triggers via callback
                    };
                } else {
                    // 30% chance: basic or whistle launch + explosion for variety
                    const launches = [...this.BASIC_LAUNCH_SOUNDS, 'launch-whistle'];
                    return {
                        useCombinedAudio: false,
                        launchSound: launches[Math.floor(Math.random() * launches.length)],
                        explosionSound: this.EXPLOSION_SOUNDS[Math.floor(Math.random() * this.EXPLOSION_SOUNDS.length)],
                        explosionDelay: 0  // Not used; explosion triggers via callback
                    };
                }

            case 'big':
                // Big fireworks: powerful combinations emphasizing crackling effects
                if (rand < 0.5) {
                    // 50% chance: use crackling bang (has built-in crackling + explosion)
                    return {
                        useCombinedAudio: true,
                        combinedSound: 'combined-crackling-bang',
                        explosionDelay: 3.2  // Crackling bang has explosion at ~3.2s in the audio file
                    };
                } else if (rand < 0.75) {
                    // 25% chance: whistle launch + explosion
                    return {
                        useCombinedAudio: false,
                        launchSound: 'launch-whistle',
                        explosionSound: this.EXPLOSION_SOUNDS[Math.floor(Math.random() * this.EXPLOSION_SOUNDS.length)],
                        explosionDelay: 0  // Not used; explosion triggers via callback
                    };
                } else {
                    // 25% chance: any launch sound + explosion for maximum variety
                    return {
                        useCombinedAudio: false,
                        launchSound: this.ALL_LAUNCH_SOUNDS[Math.floor(Math.random() * this.ALL_LAUNCH_SOUNDS.length)],
                        explosionSound: this.EXPLOSION_SOUNDS[Math.floor(Math.random() * this.EXPLOSION_SOUNDS.length)],
                        explosionDelay: 0  // Not used; explosion triggers via callback
                    };
                }

            case 'massive':
                // Massive fireworks: always powerful crackling bang, or combined whistle-normal for variety
                if (rand < 0.8) {
                    // 80% chance: crackling bang for maximum impact
                    return {
                        useCombinedAudio: true,
                        combinedSound: 'combined-crackling-bang',
                        explosionDelay: 3.2  // Crackling bang has explosion at ~3.2s
                    };
                } else {
                    // 20% chance: combined whistle-normal for dramatic effect
                    return {
                        useCombinedAudio: true,
                        combinedSound: 'combined-whistle-normal',
                        explosionDelay: 2.2
                    };
                }

            default:
                // Fallback to medium settings with variety
                return {
                    useCombinedAudio: false,
                    launchSound: this.ALL_LAUNCH_SOUNDS[Math.floor(Math.random() * this.ALL_LAUNCH_SOUNDS.length)],
                    explosionSound: this.EXPLOSION_SOUNDS[Math.floor(Math.random() * this.EXPLOSION_SOUNDS.length)],
                    explosionDelay: 0
                };
        }
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
        this.fpsHistory = []; // Track FPS history for adaptive performance
        this.performanceMode = 'normal'; // 'normal', 'reduced', 'minimal'
        
        // Combo throttling to prevent extreme lag
        this.lastComboTriggerTime = 0;
        this.comboTriggerQueue = [];
        
        this.config = { 
            ...CONFIG,
            toasterMode: false,
            audioEnabled: true,
            audioVolume: 0.7,
            trailsEnabled: true,
            glowEnabled: true,
            resolution: CONFIG.resolution,
            targetFps: CONFIG.targetFps,
            minFps: CONFIG.minFps,
            giftPopupPosition: CONFIG.giftPopupPosition
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
        const resolution = this.config.resolution || 1.0;
        
        // Apply resolution multiplier for performance control
        this.canvas.width = rect.width * dpr * resolution;
        this.canvas.height = rect.height * dpr * resolution;
        this.ctx.scale(dpr * resolution, dpr * resolution);
        
        this.width = rect.width;
        this.height = rect.height;
        
        console.log(`[Fireworks] Canvas resolution: ${this.canvas.width}x${this.canvas.height} (${Math.round(resolution * 100)}%)`);
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
                    const oldResolution = this.config.resolution;
                    Object.assign(this.config, data.config);
                    this.audioManager.setEnabled(this.config.audioEnabled);
                    this.audioManager.setVolume(this.config.audioVolume);
                    
                    // Update CONFIG values for despawn and FPS
                    if (data.config.despawnFadeDuration !== undefined) {
                        CONFIG.despawnFadeDuration = data.config.despawnFadeDuration;
                    }
                    if (data.config.minFps !== undefined) {
                        CONFIG.minFps = data.config.minFps;
                    }
                    if (data.config.targetFps !== undefined) {
                        CONFIG.targetFps = data.config.targetFps;
                    }
                    if (data.config.giftPopupEnabled !== undefined) {
                        CONFIG.giftPopupEnabled = data.config.giftPopupEnabled;
                    }
                    if (data.config.giftPopupPosition !== undefined) {
                        CONFIG.giftPopupPosition = data.config.giftPopupPosition;
                    }
                    
                    // Resize canvas if resolution changed
                    if (oldResolution !== this.config.resolution) {
                        this.resize();
                    }
                    
                    console.log('[Fireworks] Config updated:', data.config);
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
            // New config values from trigger
            targetFps = null,
            minFps = null,
            despawnFadeDuration = null,
            giftPopupEnabled = null,
            giftPopupPosition = null
        } = data;

        // Update config values if provided
        if (targetFps !== null) {
            this.config.targetFps = targetFps;
            CONFIG.targetFps = targetFps;
        }
        if (minFps !== null) {
            this.config.minFps = minFps;
            CONFIG.minFps = minFps;
        }
        if (despawnFadeDuration !== null) {
            this.config.despawnFadeDuration = despawnFadeDuration;
            CONFIG.despawnFadeDuration = despawnFadeDuration;
        }
        if (giftPopupEnabled !== null) {
            this.config.giftPopupEnabled = giftPopupEnabled;
            CONFIG.giftPopupEnabled = giftPopupEnabled;
        }
        if (giftPopupPosition !== null) {
            this.config.giftPopupPosition = giftPopupPosition;
            CONFIG.giftPopupPosition = giftPopupPosition;
        }

        // Combo throttling: prevent extreme lag from rapid combos
        const now = performance.now();
        const timeSinceLastTrigger = now - this.lastComboTriggerTime;
        const minInterval = CONFIG.comboThrottleMinInterval;
        
        // Skip if triggered too quickly (except for first trigger)
        if (this.lastComboTriggerTime > 0 && timeSinceLastTrigger < minInterval) {
            console.log('[Fireworks] Combo throttled (too fast)');
            return;
        }
        
        this.lastComboTriggerTime = now;
        
        // High combo optimization: skip rockets entirely for very high combos
        const skipRockets = combo >= CONFIG.comboSkipRocketsThreshold;
        const instantExplode = combo >= CONFIG.comboInstantExplodeThreshold;
        
        if (instantExplode) {
            console.log(`[Fireworks] Instant explosion mode (combo: ${combo})`);
        } else if (skipRockets) {
            console.log(`[Fireworks] Skipping rocket animation (combo: ${combo})`);
        }

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
            y: skipRockets ? targetY : this.height, // Start at target if skipping rockets
            targetY: targetY,
            shape: shape,
            colors: colors,
            intensity: intensity,
            giftImage: giftImg,
            userAvatar: avatarImg,
            avatarParticleChance: avatarParticleChance,
            useImages: !!(giftImg || avatarImg),
            tier: tier,
            combo: combo,
            skipRocket: skipRockets, // Pass flag to Firework class
            instantExplode: instantExplode // Explode immediately without any delay
        });
        
        // Audio selection and playback with synchronization
        if (playSound && this.audioManager.enabled) {
            const audioConfig = this.audioManager.selectAudio(tier, combo, instantExplode);
            
            if (audioConfig.useCombinedAudio) {
                // Play combined audio (launch + explosion in one file)
                // The audio is already synchronized internally
                this.audioManager.play(audioConfig.combinedSound, this.audioManager.COMBINED_AUDIO_VOLUME);
                
                // For combined audio, we don't need the explosion callback
                // because the explosion sound is already in the combined file
            } else {
                // Play separate launch and explosion sounds
                if (audioConfig.launchSound && !skipRockets) {
                    // Play launch sound immediately
                    this.audioManager.play(audioConfig.launchSound, this.audioManager.LAUNCH_AUDIO_VOLUME);
                }
                
                // Set explosion sound callback to trigger when firework explodes
                const soundVolume = instantExplode 
                    ? this.audioManager.INSTANT_EXPLODE_VOLUME 
                    : this.audioManager.NORMAL_EXPLOSION_VOLUME;
                if (audioConfig.explosionSound) {
                    firework.onExplodeSound = (intensity) => {
                        this.audioManager.play(audioConfig.explosionSound, intensity * soundVolume);
                    };
                }
            }
        }

        this.fireworks.push(firework);

        // Show gift popup (always show, even for instant explosions)
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

        // Performance optimization: reduce particles and increase interval
        const optimizedBurstCount = Math.min(burstCount, 10); // Max 10 bursts
        const optimizedInterval = Math.max(burstInterval, 500); // At least 500ms between bursts
        const optimizedIntensity = Math.min(intensity, 2.0); // Cap intensity at 2.0

        let bursts = 0;
        const interval = setInterval(() => {
            if (bursts >= optimizedBurstCount) {
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
                intensity: optimizedIntensity * (0.8 + Math.random() * 0.4),
                particleCount: Math.round(50 * optimizedIntensity), // Reduced from 80
                playSound: bursts === 0 || bursts === optimizedBurstCount - 1 // Only play sound for first and last
            });

            bursts++;
        }, optimizedInterval);
    }

    async loadImage(url) {
        if (this.imageCache.has(url)) {
            return this.imageCache.get(url);
        }

        // Validate URL to prevent XSS - check for dangerous protocols
        if (!url || typeof url !== 'string') return null;
        const lowerUrl = url.toLowerCase();
        const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:', 'about:'];
        if (dangerousProtocols.some(protocol => lowerUrl.startsWith(protocol))) {
            console.warn('[Fireworks] Invalid image URL blocked:', url);
            return null;
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
        // Check if popups are disabled
        const popupPosition = this.config.giftPopupPosition;
        const popupEnabled = this.config.giftPopupEnabled !== false; // Default to true
        
        if (popupPosition === 'none' || !popupEnabled) return;
        
        // Calculate position based on configuration
        let finalX = x;
        let finalY = y;
        
        if (typeof popupPosition === 'string') {
            switch (popupPosition) {
                case 'top':
                    finalX = this.width / 2;
                    finalY = 100;
                    break;
                case 'middle':
                    finalX = this.width / 2;
                    finalY = this.height / 2;
                    break;
                case 'bottom':
                    finalX = x; // Keep horizontal position
                    finalY = this.height - 100;
                    break;
                default:
                    // Use provided coordinates
                    break;
            }
        } else if (typeof popupPosition === 'object' && popupPosition.x !== undefined) {
            // Custom coordinates (normalized 0-1 or pixels)
            finalX = popupPosition.x < 2 ? popupPosition.x * this.width : popupPosition.x;
            finalY = popupPosition.y < 2 ? popupPosition.y * this.height : popupPosition.y;
        }
        
        const popup = document.createElement('div');
        popup.className = 'gift-popup';
        popup.style.cssText = `
            position: absolute;
            left: ${finalX}px;
            top: ${finalY}px;
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

        // Clear with configurable background for trail effect
        const bgColor = this.config.backgroundColor || CONFIG.backgroundColor;
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.fillStyle = bgColor;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Update and render all fireworks
        for (let i = this.fireworks.length - 1; i >= 0; i--) {
            this.fireworks[i].update();
            this.renderFirework(this.fireworks[i]);
            
            if (this.fireworks[i].isDone()) {
                this.fireworks.splice(i, 1);
            }
        }

        // Update FPS and adaptive performance
        this.frameCount++;
        if (now - this.fpsUpdateTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.fpsUpdateTime = now;
            
            // Track FPS history for adaptive performance
            this.fpsHistory.push(this.fps);
            if (this.fpsHistory.length > 5) {
                this.fpsHistory.shift();
            }
            
            // Calculate average FPS over last 5 seconds
            const avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
            
            // Adaptive performance mode
            const targetFps = this.config.targetFps || CONFIG.targetFps;
            const minFps = this.config.minFps || CONFIG.minFps;
            
            if (avgFps < minFps) {
                // Performance is suffering - enter minimal mode
                if (this.performanceMode !== 'minimal') {
                    this.performanceMode = 'minimal';
                    this.applyPerformanceMode();
                    console.log('[Fireworks] Adaptive Performance: MINIMAL mode (FPS:', avgFps.toFixed(1), ')');
                }
            } else if (avgFps < targetFps * 0.8) {
                // Performance is degraded - enter reduced mode
                if (this.performanceMode !== 'reduced') {
                    this.performanceMode = 'reduced';
                    this.applyPerformanceMode();
                    console.log('[Fireworks] Adaptive Performance: REDUCED mode (FPS:', avgFps.toFixed(1), ')');
                }
            } else if (avgFps >= targetFps * 0.95) {
                // Performance is good - return to normal mode
                if (this.performanceMode !== 'normal') {
                    this.performanceMode = 'normal';
                    this.applyPerformanceMode();
                    console.log('[Fireworks] Adaptive Performance: NORMAL mode (FPS:', avgFps.toFixed(1), ')');
                }
            }
            
            if (this.debugMode) {
                const fpsEl = document.getElementById('fps');
                const particleEl = document.getElementById('particle-count');
                const modeEl = document.getElementById('performance-mode');
                if (fpsEl) fpsEl.textContent = this.fps;
                if (particleEl) particleEl.textContent = this.getTotalParticles();
                if (modeEl) modeEl.textContent = this.performanceMode.toUpperCase();
            }
        }

        requestAnimationFrame(() => this.render());
    }
    
    applyPerformanceMode() {
        // Adjust CONFIG based on performance mode
        switch (this.performanceMode) {
            case 'minimal':
                // Extreme reduction for very low FPS
                CONFIG.maxParticlesPerExplosion = 50;
                CONFIG.trailLength = 5;
                CONFIG.sparkleChance = 0.05;
                CONFIG.secondaryExplosionChance = 0;
                this.config.glowEnabled = false;
                this.config.trailsEnabled = false;
                // Limit active fireworks with graceful despawn
                while (this.fireworks.length > 5) {
                    const fw = this.fireworks[this.fireworks.length - 1];
                    // Start despawn fade for rocket
                    if (!fw.exploded && fw.rocket) {
                        fw.rocket.startDespawn();
                    }
                    // Start despawn fade for all particles
                    fw.particles.forEach(p => p.startDespawn());
                    fw.secondaryExplosions.forEach(p => p.startDespawn());
                    // Don't remove immediately - let despawn effect complete
                    // Only remove if already despawning for enough time
                    // Using half of despawn duration ensures smooth fade without premature removal
                    const minDespawnTime = (CONFIG.despawnFadeDuration * 1000) / 2;
                    if (fw.rocket && fw.rocket.isDespawning && 
                        performance.now() - fw.rocket.despawnStartTime > minDespawnTime) {
                        this.fireworks.pop();
                    } else {
                        break; // Wait for despawn to complete
                    }
                }
                break;
                
            case 'reduced':
                // Moderate reduction for low FPS
                CONFIG.maxParticlesPerExplosion = 100;
                CONFIG.trailLength = 10;
                CONFIG.sparkleChance = 0.08;
                CONFIG.secondaryExplosionChance = 0.05;
                this.config.glowEnabled = true;
                this.config.trailsEnabled = true;
                // Limit active fireworks with graceful despawn
                while (this.fireworks.length > 15) {
                    const fw = this.fireworks[this.fireworks.length - 1];
                    // Start despawn fade for rocket
                    if (!fw.exploded && fw.rocket) {
                        fw.rocket.startDespawn();
                    }
                    // Start despawn fade for all particles
                    fw.particles.forEach(p => p.startDespawn());
                    fw.secondaryExplosions.forEach(p => p.startDespawn());
                    // Don't remove immediately - let despawn effect complete
                    // Only remove if already despawning for enough time
                    // Using half of despawn duration ensures smooth fade without premature removal
                    const minDespawnTime = (CONFIG.despawnFadeDuration * 1000) / 2;
                    if (fw.rocket && fw.rocket.isDespawning && 
                        performance.now() - fw.rocket.despawnStartTime > minDespawnTime) {
                        this.fireworks.pop();
                    } else {
                        break; // Wait for despawn to complete
                    }
                }
                break;
                
            case 'normal':
                // Full quality
                CONFIG.maxParticlesPerExplosion = 200;
                CONFIG.trailLength = 20;
                CONFIG.sparkleChance = 0.15;
                CONFIG.secondaryExplosionChance = 0.1;
                this.config.glowEnabled = true;
                this.config.trailsEnabled = true;
                break;
        }
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
    const canvas = document.getElementById('fireworks-canvas');
    if (!canvas) {
        console.error('[Fireworks] Canvas element not found');
        return;
    }
    
    engine = new FireworksEngine('fireworks-canvas');
    await engine.init();

    // Preload sounds - fireworks plugin audio files with synchronized timing
    
    // Basic launch sounds (short)
    await engine.audioManager.preload('/plugins/fireworks/audio/abschussgeraeusch.mp3', 'launch-basic');
    await engine.audioManager.preload('/plugins/fireworks/audio/abschussgeraeusch2.mp3', 'launch-basic2');
    
    // Basic explosion and rocket sounds
    await engine.audioManager.preload('/plugins/fireworks/audio/explosion.mp3', 'explosion-basic');
    await engine.audioManager.preload('/plugins/fireworks/audio/rocket.mp3', 'rocket-basic');
    
    // Combined sounds - synchronized launch + explosion in one file
    // These play the entire sequence from launch to explosion
    await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_crackling_bang.mp3', 'combined-crackling-bang');
    await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_mit-pfeifen_normal-bang.mp3', 'combined-whistle-normal');
    await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_mit-pfeifen_tiny-bang.mp3', 'combined-whistle-tiny1');
    await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_mit-pfeifen_tiny-bang2.mp3', 'combined-whistle-tiny2');
    await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_mit-pfeifen_tiny-bang3.mp3', 'combined-whistle-tiny3');
    await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_mit-pfeifen_tiny-bang4.mp3', 'combined-whistle-tiny4');
    
    // Launch-only sounds (no explosion) - for when we want to play explosion separately
    await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_mit-pfeifen_no-bang.mp3', 'launch-whistle');
    await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_nocrackling_no-bang.mp3', 'launch-smooth');
    await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_nocrackling_no-bang2.mp3', 'launch-smooth2');
    
    // Enable audio context on first user interaction
    const enableAudio = async () => {
        await engine.audioManager.ensureAudioContext();
        document.removeEventListener('click', enableAudio);
        document.removeEventListener('keydown', enableAudio);
    };
    document.addEventListener('click', enableAudio);
    document.addEventListener('keydown', enableAudio);

    // Debug mode toggle
    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'd') {
            engine.toggleDebug();
        }
    });

    console.log('[Fireworks] Advanced engine ready');
});

// Only expose engine after initialization
if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'FireworksEngine', {
        get: () => engine,
        configurable: false,
        enumerable: true
    });
}
