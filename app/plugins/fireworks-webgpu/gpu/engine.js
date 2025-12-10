/**
 * WebGPU Fireworks Engine
 * 
 * High-performance fireworks particle system using WebGPU compute shaders
 * and render pipelines. Based on the Canvas 2D engine but rebuilt for WebGPU.
 * 
 * Features:
 * - WebGPU compute shaders for particle physics
 * - GPU-accelerated rendering
 * - Multi-stage firework rockets
 * - Custom explosion shapes
 * - Audio synchronization
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    maxFireworks: 100,
    maxParticlesPerExplosion: 200,
    maxTotalParticles: 10000,
    targetFps: 60,
    minFps: 24,
    physicsScale: 60, // Converts per-frame values (at 60 FPS) to per-second values for frame-independent physics
    gravity: 0.08,
    airResistance: 0.99,
    rocketAirResistance: 0.995, // Air resistance for rockets (slightly less than particles)
    rocketSpeed: -12, // Negative = upward motion in canvas Y-down coordinates (pixels per frame at 60 FPS)
    defaultTargetY: 0.5, // Default rocket target height as fraction of screen height
    backgroundColor: 'rgba(0, 0, 0, 0)',
    defaultColors: ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#ff00ff'],
    comboThrottleMinInterval: 100,
    comboSkipRocketsThreshold: 5,
    comboInstantExplodeThreshold: 8,
    // Rocket trail configuration
    rocketTrailDensity: 3, // Number of trail particles emitted per frame
    rocketSparkleChance: 0.15, // Probability of sparkle particle per frame (15%)
    // WebGPU-specific constants
    WEBGPU_PHYSICS_SCALE: 25, // Velocity multiplier to convert Canvas 2D physics to WebGPU scale
    PARTICLE_FLOATS_COUNT: 12, // Number of floats per particle: position(2) + velocity(2) + color(4) + size(1) + life(1) + maxLife(1) + padding(1)
    PARTICLE_STRUCT_SIZE: 48, // 12 floats × 4 bytes per float
    COMPUTE_UNIFORM_SIZE: 16, // 4 floats × 4 bytes: deltaTime, gravity, airResistance, padding
    RENDER_UNIFORM_SIZE: 16 // 4 floats × 4 bytes: width, height, padding, padding
};

// ============================================================================
// SHAPE GENERATORS - Create particle velocity patterns for different shapes
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
                    vx: Math.cos(angle) * ringSpeed * 25, // Scale for WebGPU physics (pixels per frame at 60 FPS)
                    vy: Math.sin(angle) * ringSpeed * 25
                });
            }
        }
        return particles;
    },

    heart: (count, intensity) => {
        const particles = [];
        const layers = 4;
        const particlesPerLayer = Math.floor(count / layers);
        
        for (let layer = 0; layer < layers; layer++) {
            const layerScale = 0.5 + (layer * 0.15);
            for (let i = 0; i < particlesPerLayer; i++) {
                const t = (i / particlesPerLayer) * Math.PI * 2;
                // Parametric heart equation
                const x = 16 * Math.pow(Math.sin(t), 3);
                const y = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));
                
                const mag = Math.max(Math.sqrt(x*x + y*y), 1);
                const speed = (0.15 + Math.random() * 0.05) * intensity * layerScale;
                particles.push({
                    vx: (x / mag) * speed * 8 * 25, // Scale for WebGPU physics
                    vy: (y / mag) * speed * 8 * 25
                });
            }
        }
        return particles;
    },

    star: (count, intensity) => {
        const particles = [];
        const points = 5;
        const particlesPerPoint = Math.floor(count / (points * 2));
        
        for (let point = 0; point < points; point++) {
            const outerAngle = (Math.PI * 2 * point) / points - Math.PI / 2;
            const innerAngle = outerAngle + (Math.PI / points);
            
            // Outer point (star tip)
            for (let i = 0; i < particlesPerPoint; i++) {
                const t = i / particlesPerPoint;
                const spread = (Math.random() - 0.5) * 0.15;
                const angle = outerAngle + spread;
                const radiusMix = 0.8 + t * 0.4;
                const speed = (2 + Math.random() * 1) * intensity * radiusMix;
                particles.push({
                    vx: Math.cos(angle) * speed * 25, // Scale for WebGPU physics
                    vy: Math.sin(angle) * speed * 25
                });
            }
            
            // Inner valley
            for (let i = 0; i < particlesPerPoint / 2; i++) {
                const t = i / (particlesPerPoint / 2);
                const spread = (Math.random() - 0.5) * 0.1;
                const angle = innerAngle + spread;
                const radiusMix = 0.3 + t * 0.3;
                const speed = (1.5 + Math.random() * 0.8) * intensity * radiusMix;
                particles.push({
                    vx: Math.cos(angle) * speed * 25, // Scale for WebGPU physics
                    vy: Math.sin(angle) * speed * 25
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
                vx: Math.cos(t + armOffset) * radius * speed * 25, // Scale for WebGPU physics
                vy: Math.sin(t + armOffset) * radius * speed * 25
            });
        }
        return particles;
    },
    
    paws: (count, intensity) => {
        const particles = [];
        const centerPadParticles = Math.floor(count * 0.4);
        const toeParticles = Math.floor((count - centerPadParticles) / 4);
        
        // Center pad
        for (let i = 0; i < centerPadParticles; i++) {
            const angle = (Math.PI * 2 * i) / centerPadParticles + Math.random() * 0.3;
            const radius = 0.3 + Math.random() * 0.2;
            const speed = (0.8 + Math.random() * 0.4) * intensity;
            const offsetY = 0.6; // Position offset for center pad
            particles.push({
                vx: Math.cos(angle) * radius * speed * 25, // Scale for WebGPU physics
                vy: (Math.sin(angle) * radius * speed + offsetY * intensity) * 25
            });
        }
        
        // 4 toe pads
        const toePositions = [
            { angle: -2.4, distance: 1.2 },
            { angle: -1.8, distance: 1.4 },
            { angle: -1.3, distance: 1.4 },
            { angle: -0.7, distance: 1.2 }
        ];
        
        for (let toe = 0; toe < 4; toe++) {
            const toePos = toePositions[toe];
            for (let i = 0; i < toeParticles; i++) {
                const localAngle = (Math.PI * 2 * i) / toeParticles;
                const radius = 0.15 + Math.random() * 0.1;
                const speed = (0.6 + Math.random() * 0.3) * intensity;
                
                const basex = Math.cos(toePos.angle) * toePos.distance;
                const basey = Math.sin(toePos.angle) * toePos.distance;
                
                particles.push({
                    vx: (basex + Math.cos(localAngle) * radius) * speed * 25, // Scale for WebGPU physics
                    vy: (basey + Math.sin(localAngle) * radius) * speed * 25
                });
            }
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
                    vx: Math.cos(angle) * speed * 25, // Scale for WebGPU physics
                    vy: Math.sin(angle) * speed * 25
                });
            }
        }
        return particles;
    }
};


// ============================================================================
// WEBGPU SHADERS
// ============================================================================

const PARTICLE_COMPUTE_SHADER = `
struct Particle {
    position: vec2<f32>,
    velocity: vec2<f32>,
    color: vec4<f32>,
    size: f32,
    life: f32,
    maxLife: f32,
    _padding: f32,
};

struct Uniforms {
    deltaTime: f32,
    gravity: f32,
    airResistance: f32,
    _padding: f32,
};

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    if (index >= arrayLength(&particles)) {
        return;
    }
    
    var p = particles[index];
    
    // Skip dead particles
    if (p.life <= 0.0) {
        return;
    }
    
    // Apply gravity
    p.velocity.y += uniforms.gravity * uniforms.deltaTime;
    
    // Apply air resistance
    p.velocity *= uniforms.airResistance;
    
    // Update position
    p.position += p.velocity * uniforms.deltaTime;
    
    // Update life
    p.life -= uniforms.deltaTime;
    
    // Write back
    particles[index] = p;
}
`;

const PARTICLE_VERTEX_SHADER = `
struct Particle {
    position: vec2<f32>,
    velocity: vec2<f32>,
    color: vec4<f32>,
    size: f32,
    life: f32,
    maxLife: f32,
    _padding: f32,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) uv: vec2<f32>,
};

@group(0) @binding(0) var<storage, read> particles: array<Particle>;

struct Uniforms {
    resolution: vec2<f32>,
    _padding: vec2<f32>,
};

@group(0) @binding(1) var<uniform> uniforms: Uniforms;

// Quad vertices (two triangles)
const QUAD_VERTICES = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0),
);

@vertex
fn vertex_main(
    @builtin(vertex_index) vertex_index: u32,
    @builtin(instance_index) instance_index: u32
) -> VertexOutput {
    var output: VertexOutput;
    
    let p = particles[instance_index];
    
    // Skip dead particles
    if (p.life <= 0.0) {
        output.position = vec4<f32>(2.0, 2.0, 0.0, 1.0); // Off-screen
        output.color = vec4<f32>(0.0);
        output.uv = vec2<f32>(0.0);
        return output;
    }
    
    let quad_vertex = QUAD_VERTICES[vertex_index];
    
    // Calculate alpha based on life
    let alpha = p.life / p.maxLife;
    
    // Convert screen position to NDC
    let ndc_pos = (p.position / uniforms.resolution) * 2.0 - 1.0;
    let ndc_size = (p.size / uniforms.resolution) * 2.0;
    
    // Apply quad offset
    let final_pos = ndc_pos + quad_vertex * ndc_size;
    
    output.position = vec4<f32>(final_pos.x, -final_pos.y, 0.0, 1.0);
    output.color = vec4<f32>(p.color.rgb, p.color.a * alpha);
    output.uv = (quad_vertex + 1.0) * 0.5;
    
    return output;
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Circular particle shape
    let dist = length(input.uv - vec2<f32>(0.5));
    if (dist > 0.5) {
        discard;
    }
    
    // Soft edges
    let edge_softness = 0.1;
    let alpha = smoothstep(0.5, 0.5 - edge_softness, dist);
    
    return vec4<f32>(input.color.rgb, input.color.a * alpha);
}
`;

// ============================================================================
// AUDIO MANAGER (Same as Canvas version)
// ============================================================================

class AudioManager {
    constructor() {
        this.audioContext = null;
        this.sounds = new Map();
        this.enabled = true;
        this.volume = 0.7;
    }

    async init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (error) {
            console.warn('[WebGPU Fireworks] Audio not available:', error);
            this.enabled = false;
        }
    }

    async ensureAudioContext() {
        if (!this.audioContext) {
            await this.init();
        }
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    async preload(url, id) {
        if (!this.enabled) return;
        
        // Ensure audio context exists before preloading
        await this.ensureAudioContext();
        
        if (!this.audioContext) {
            console.warn(`[WebGPU Fireworks] Cannot preload ${id}: No audio context`);
            return;
        }
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.sounds.set(id, audioBuffer);
        } catch (error) {
            console.warn(`[WebGPU Fireworks] Failed to load sound ${id}:`, error);
        }
    }

    play(soundId, volume = 1.0) {
        if (!this.enabled || !this.audioContext || !this.sounds.has(soundId)) {
            return;
        }

        try {
            const buffer = this.sounds.get(soundId);
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            
            source.buffer = buffer;
            gainNode.gain.value = this.volume * volume;
            
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            source.start(0);
        } catch (error) {
            console.warn('[WebGPU Fireworks] Audio playback error:', error);
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
// WEBGPU FIREWORKS ENGINE
// ============================================================================

class FireworksEngine {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        this.device = null;
        this.context = null;
        this.pipeline = null;
        this.computePipeline = null;
        
        this.particles = [];
        this.rockets = []; // Array to track active rockets
        this.particleBuffer = null;
        this.computeUniformBuffer = null;
        this.renderUniformBuffer = null;
        this.bindGroup = null;
        this.computeBindGroup = null;
        
        this.audioManager = new AudioManager();
        this.config = { ...CONFIG };
        this.running = false;
        this.debugMode = false;
        
        this.frameCount = 0;
        this.fps = 0;
        this.lastFrameTime = performance.now();
        this.fpsUpdateTime = performance.now();
        
        this.width = 0;
        this.height = 0;
    }

    async init() {
        console.log('[WebGPU Fireworks] Initializing WebGPU engine...');
        
        // Check WebGPU support
        if (!navigator.gpu) {
            throw new Error('WebGPU is not supported in this browser');
        }
        
        // Get GPU adapter
        const adapter = await navigator.gpu.requestAdapter({
            powerPreference: 'high-performance'
        });
        
        if (!adapter) {
            throw new Error('Failed to get WebGPU adapter');
        }
        
        // Get GPU device
        this.device = await adapter.requestDevice();
        
        // Configure canvas context
        this.context = this.canvas.getContext('webgpu');
        const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        
        this.context.configure({
            device: this.device,
            format: presentationFormat,
            alphaMode: 'premultiplied'
        });
        
        // Initialize size
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        // Create shaders and pipelines
        await this.createPipelines();
        
        // Initialize buffers
        this.createBuffers();
        
        // Initialize audio
        await this.audioManager.init();
        
        console.log('[WebGPU Fireworks] Engine initialized successfully');
    }

    async createPipelines() {
        // Create compute shader module
        const computeShaderModule = this.device.createShaderModule({
            code: PARTICLE_COMPUTE_SHADER
        });
        
        // Create render shader module
        const renderShaderModule = this.device.createShaderModule({
            code: PARTICLE_VERTEX_SHADER
        });
        
        // Create compute pipeline
        this.computePipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: computeShaderModule,
                entryPoint: 'main'
            }
        });
        
        // Create render pipeline
        const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        
        this.pipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: renderShaderModule,
                entryPoint: 'vertex_main'
            },
            fragment: {
                module: renderShaderModule,
                entryPoint: 'fragment_main',
                targets: [{
                    format: presentationFormat,
                    blend: {
                        color: {
                            srcFactor: 'src-alpha',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add'
                        },
                        alpha: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add'
                        }
                    }
                }]
            },
            primitive: {
                topology: 'triangle-list'
            }
        });
    }

    createBuffers() {
        // Create particle buffer (storage buffer)
        // Each particle: position(2) + velocity(2) + color(4) + size(1) + life(1) + maxLife(1) + padding(1) = 12 floats = 48 bytes
        const particleDataSize = this.config.maxTotalParticles * this.config.PARTICLE_STRUCT_SIZE;
        this.particleBuffer = this.device.createBuffer({
            size: particleDataSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        
        // Create uniform buffer for compute shader (deltaTime, gravity, airResistance, padding)
        this.computeUniformBuffer = this.device.createBuffer({
            size: this.config.COMPUTE_UNIFORM_SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        // Create uniform buffer for render shader (resolution.x, resolution.y, padding, padding)
        this.renderUniformBuffer = this.device.createBuffer({
            size: this.config.RENDER_UNIFORM_SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        // Create bind groups
        this.computeBindGroup = this.device.createBindGroup({
            layout: this.computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBuffer } },
                { binding: 1, resource: { buffer: this.computeUniformBuffer } }
            ]
        });
        
        this.bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBuffer } },
                { binding: 1, resource: { buffer: this.renderUniformBuffer } }
            ]
        });
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        this.width = this.canvas.clientWidth * dpr;
        this.height = this.canvas.clientHeight * dpr;
        
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

    start() {
        this.running = true;
        this.connectSocket();
        this.render();
    }

    stop() {
        this.running = false;
    }

    connectSocket() {
        try {
            this.socket = io({
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 1000
            });

            this.socket.on('connect', () => {
                console.log('[WebGPU Fireworks] Connected to server');
            });

            this.socket.on('fireworks-webgpu:trigger', (data) => {
                console.log('[WebGPU Fireworks] Trigger event received:', data);
                this.handleTrigger(data);
            });

            this.socket.on('fireworks-webgpu:finale', (data) => {
                console.log('[WebGPU Fireworks] Finale event received:', data);
                this.handleFinale(data);
            });

            this.socket.on('fireworks-webgpu:config-update', (data) => {
                if (data.config) {
                    this.updateConfig(data.config);
                    console.log('[WebGPU Fireworks] Config updated:', this.config);
                }
            });

            this.socket.on('disconnect', () => {
                console.log('[WebGPU Fireworks] Disconnected from server');
            });
        } catch (error) {
            console.error('[WebGPU Fireworks] Socket connection failed:', error);
        }
    }

    handleTrigger(data) {
        console.log('[WebGPU Fireworks] handleTrigger:', data);
        this.addFirework(data);
    }

    handleFinale(data) {
        console.log('[WebGPU Fireworks] handleFinale:', data);
        const count = data.count || 5;
        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                this.addFirework({
                    ...data,
                    position: {
                        x: Math.random(),
                        y: 0.8 + Math.random() * 0.2
                    }
                });
            }, i * 200);
        }
    }

    render() {
        if (!this.running) return;
        
        const now = performance.now();
        const deltaTime = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;
        
        // Update rockets
        this.updateRockets(deltaTime);
        
        // Update FPS
        this.frameCount++;
        if (now - this.fpsUpdateTime >= 1000) {
            this.fps = Math.round(this.frameCount * 1000 / (now - this.fpsUpdateTime));
            this.frameCount = 0;
            this.fpsUpdateTime = now;
            
            if (this.debugMode) {
                document.getElementById('fps').textContent = this.fps;
                document.getElementById('particle-count').textContent = this.particles.length;
                document.getElementById('renderer-type').textContent = 'WebGPU';
            }
        }
        
        // Update uniforms for compute shader (deltaTime, gravity, airResistance, padding)
        const computeUniformData = new Float32Array([
            deltaTime,
            this.config.gravity,
            this.config.airResistance,
            0 // padding
        ]);
        this.device.queue.writeBuffer(this.computeUniformBuffer, 0, computeUniformData);
        
        // Update uniforms for render shader (resolution.x, resolution.y, padding, padding)
        const renderUniformData = new Float32Array([
            this.width,
            this.height,
            0, // padding
            0  // padding
        ]);
        this.device.queue.writeBuffer(this.renderUniformBuffer, 0, renderUniformData);
        
        // Compute pass - update particle physics
        const commandEncoder = this.device.createCommandEncoder();
        
        if (this.particles.length > 0) {
            const computePass = commandEncoder.beginComputePass();
            computePass.setPipeline(this.computePipeline);
            computePass.setBindGroup(0, this.computeBindGroup);
            const workgroupCount = Math.ceil(this.particles.length / 64);
            computePass.dispatchWorkgroups(workgroupCount);
            computePass.end();
        }
        
        // Render pass
        const textureView = this.context.getCurrentTexture().createView();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });
        
        if (this.particles.length > 0) {
            renderPass.setPipeline(this.pipeline);
            renderPass.setBindGroup(0, this.bindGroup);
            renderPass.draw(6, this.particles.length, 0, 0); // 6 vertices per quad, N instances
        }
        
        renderPass.end();
        this.device.queue.submit([commandEncoder.finish()]);
        
        requestAnimationFrame(() => this.render());
    }
    
    updateRockets(deltaTime) {
        // Pre-calculate physics timestep to avoid redundant multiplications
        const dt = deltaTime * this.config.physicsScale;
        
        // Update rocket positions
        for (let i = this.rockets.length - 1; i >= 0; i--) {
            const rocket = this.rockets[i];
            
            // Apply physics to rocket
            // In canvas Y-down coordinates: positive Y is down, negative velocity = upward motion
            // Gravity acts downward (positive direction), slowing upward rockets
            rocket.vy += this.config.gravity * dt;
            
            // Apply air resistance to both velocity components
            rocket.vx *= this.config.rocketAirResistance;
            rocket.vy *= this.config.rocketAirResistance;
            
            rocket.x += rocket.vx * dt;
            rocket.y += rocket.vy * dt;
            
            // Create rocket trail particles for visualization
            // Add multiple particles per frame for a fuller trail
            const trailDensity = this.config.rocketTrailDensity;
            
            for (let j = 0; j < trailDensity; j++) {
                // Main rocket glow particle (bright core)
                const glowParticle = {
                    position: [
                        rocket.x + (Math.random() - 0.5) * 4,
                        rocket.y + (Math.random() - 0.5) * 4
                    ],
                    velocity: [
                        rocket.vx * 0.2 + (Math.random() - 0.5) * 1.5, 
                        rocket.vy * 0.2 + (Math.random() - 0.5) * 1.5
                    ],
                    color: [1.0, 0.9, 0.3, 1.0], // Bright yellow core
                    size: 4 + Math.random() * 2,
                    life: 0.2 + Math.random() * 0.15,
                    maxLife: 0.35,
                    _padding: 0
                };
                this.particles.push(glowParticle);
                
                // Softer outer glow particles (orange/red)
                const outerGlowParticle = {
                    position: [
                        rocket.x + (Math.random() - 0.5) * 6,
                        rocket.y + (Math.random() - 0.5) * 6
                    ],
                    velocity: [
                        rocket.vx * 0.15 + (Math.random() - 0.5) * 2, 
                        rocket.vy * 0.15 + (Math.random() - 0.5) * 2
                    ],
                    color: [1.0, 0.5 + Math.random() * 0.3, 0.1, 0.8], // Orange/red outer glow
                    size: 5 + Math.random() * 3,
                    life: 0.25 + Math.random() * 0.2,
                    maxLife: 0.45,
                    _padding: 0
                };
                this.particles.push(outerGlowParticle);
            }
            
            // Occasional sparkle particles
            if (Math.random() < this.config.rocketSparkleChance) {
                const sparkle = {
                    position: [
                        rocket.x + (Math.random() - 0.5) * 8,
                        rocket.y + (Math.random() - 0.5) * 8
                    ],
                    velocity: [
                        (Math.random() - 0.5) * 3,
                        (Math.random() - 0.5) * 3
                    ],
                    color: [1.0, 1.0, 0.9, 1.0], // Bright white sparkle
                    size: 2 + Math.random() * 1.5,
                    life: 0.15 + Math.random() * 0.1,
                    maxLife: 0.25,
                    _padding: 0
                };
                this.particles.push(sparkle);
            }
            
            // Check if rocket should explode
            // Rocket explodes when velocity becomes positive (moving down) or reaches target height
            // Since Y increases downward, targetY < startY for upward motion
            if (rocket.vy >= 0 || rocket.y <= rocket.targetY) {
                // Rocket has reached peak or target, explode it
                this.explodeRocket(rocket);
                this.rockets.splice(i, 1);
            }
        }
        
        // Update particle buffer after adding rocket trails
        if (this.particles.length > 0) {
            this.updateParticleBuffer();
        }
    }
    
    explodeRocket(rocket) {
        // Create explosion particles at rocket position using shape generator
        const particleCount = rocket.particleCount || 50;
        const colors = rocket.colors || this.config.defaultColors;
        const shape = rocket.shape || 'burst';
        const intensity = rocket.intensity || 1.0;
        
        // Get velocity patterns from shape generator
        const generator = ShapeGenerators[shape] || ShapeGenerators.burst;
        const velocities = generator(particleCount, intensity);
        
        // Create particles with the generated velocities
        for (let i = 0; i < velocities.length; i++) {
            const vel = velocities[i];
            
            // Pick random color from palette
            const colorHex = colors[Math.floor(Math.random() * colors.length)];
            const color = this.hexToRgba(colorHex);
            
            // Add some variation to particle size
            const baseSize = 2 + Math.random() * 3;
            const sizeVariation = 1 + (Math.random() - 0.5) * 0.4;
            
            const particle = {
                position: [rocket.x, rocket.y],
                velocity: [vel.vx, vel.vy],
                color: color,
                size: baseSize * sizeVariation,
                life: 1.0 + Math.random() * 0.5,
                maxLife: 1.0 + Math.random() * 0.5,
                _padding: 0
            };
            
            this.particles.push(particle);
        }
        
        // Update particle buffer
        this.updateParticleBuffer();
        
        // Play explosion audio
        if (this.audioManager.enabled) {
            this.audioManager.play('explosion-basic', 0.5);
        }
    }

    addFirework(options = {}) {
        console.log('[WebGPU Fireworks] addFirework called:', options);
        
        // Get options with defaults
        const position = options.position || { x: 0.5, y: 0.8 };
        const particleCount = options.particleCount || 50;
        const colors = options.colors || this.config.defaultColors;
        const shape = options.shape || 'burst';
        const intensity = options.intensity || 1.0;
        
        // Convert normalized position to screen coordinates
        const startX = position.x * this.width;
        const startY = this.height; // Start at bottom (max Y in canvas coordinates)
        let targetY = position.y * this.height; // Target height (lower Y value)
        
        // Validate that target is above start (targetY < startY in Y-down coordinates)
        if (targetY >= startY) {
            console.warn('[WebGPU Fireworks] Invalid rocket target: targetY must be < startY. Adjusting to default.');
            targetY = startY * this.config.defaultTargetY; // Default to configured target height
        }
        
        // Create rocket object with shape and intensity information
        const rocket = {
            x: startX,
            y: startY,
            targetY: targetY,
            vx: (Math.random() - 0.5) * 2, // Slight horizontal drift
            vy: this.config.rocketSpeed, // Initial velocity (negative = upward in canvas Y-down coordinates)
            particleCount: particleCount,
            colors: colors,
            shape: shape,
            intensity: intensity
        };
        
        this.rockets.push(rocket);
        
        // Play launch audio
        if (this.audioManager.enabled) {
            this.audioManager.play('rocket-basic', 0.3);
        }
    }
    
    hexToRgba(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result) {
            return [1.0, 1.0, 1.0, 1.0];
        }
        return [
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255,
            1.0
        ];
    }
    
    updateParticleBuffer() {
        // Create typed array for particle data
        // Each particle has PARTICLE_FLOATS_COUNT floats: position(2) + velocity(2) + color(4) + size(1) + life(1) + maxLife(1) + padding(1)
        const floatsPerParticle = this.config.PARTICLE_FLOATS_COUNT;
        const particleData = new Float32Array(this.particles.length * floatsPerParticle);
        
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            const offset = i * floatsPerParticle;
            
            particleData[offset + 0] = p.position[0];
            particleData[offset + 1] = p.position[1];
            particleData[offset + 2] = p.velocity[0];
            particleData[offset + 3] = p.velocity[1];
            particleData[offset + 4] = p.color[0];
            particleData[offset + 5] = p.color[1];
            particleData[offset + 6] = p.color[2];
            particleData[offset + 7] = p.color[3];
            particleData[offset + 8] = p.size || 3.0;
            particleData[offset + 9] = p.life;
            particleData[offset + 10] = p.maxLife;
            particleData[offset + 11] = p._padding || 0;
        }
        
        this.device.queue.writeBuffer(this.particleBuffer, 0, particleData);
        
        // Clean up dead particles
        this.particles = this.particles.filter(p => p.life > 0);
    }

    triggerFirework(options = {}) {
        console.log('[WebGPU Fireworks] triggerFirework called - WebGPU implementation');
        this.addFirework(options);
    }

    toggleDebug() {
        this.debugMode = !this.debugMode;
        const panel = document.getElementById('debug-panel');
        if (panel) {
            panel.style.display = this.debugMode ? 'block' : 'none';
        }
    }

    updateConfig(config) {
        Object.assign(this.config, config);
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let engine = null;

document.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('fireworks-canvas');
    if (!canvas) {
        console.error('[WebGPU Fireworks] Canvas element not found');
        return;
    }
    
    try {
        engine = new FireworksEngine('fireworks-canvas');
        await engine.init();
        engine.start();
        
        // Preload audio files (same as Canvas 2D version)
        const audioFiles = [
            { url: '/plugins/fireworks-webgpu/audio/abschussgeraeusch.mp3', id: 'launch-basic' },
            { url: '/plugins/fireworks-webgpu/audio/explosion.mp3', id: 'explosion-basic' },
            { url: '/plugins/fireworks-webgpu/audio/rocket.mp3', id: 'rocket-basic' }
        ];
        
        for (const {url, id} of audioFiles) {
            await engine.audioManager.preload(url, id);
        }
        
        // Enable audio on user interaction
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
        
        console.log('[WebGPU Fireworks] Engine ready');
    } catch (error) {
        console.error('[WebGPU Fireworks] Initialization failed:', error);
        
        // Show error message to user
        const container = document.getElementById('fireworks-container');
        if (container) {
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.8); color: white; padding: 20px; border-radius: 10px; text-align: center; z-index: 10000;';
            errorDiv.innerHTML = `
                <h2>WebGPU Not Available</h2>
                <p>${error.message}</p>
                <p style="font-size: 0.9em; margin-top: 10px;">Please use a browser that supports WebGPU (Chrome 113+, Edge 113+)</p>
            `;
            container.appendChild(errorDiv);
        }
    }
});

// Export engine
if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'FireworksEngine', {
        get: () => engine,
        configurable: false,
        enumerable: true
    });
}
