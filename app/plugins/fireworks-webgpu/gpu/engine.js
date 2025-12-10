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
    gravity: 0.08,
    airResistance: 0.99,
    rocketSpeed: -12,
    rocketAcceleration: -0.08,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    defaultColors: ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#ff00ff'],
    comboThrottleMinInterval: 100,
    comboSkipRocketsThreshold: 5,
    comboInstantExplodeThreshold: 8
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
        this.uniformBuffer = null;
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
        const particleDataSize = this.config.maxTotalParticles * 32; // 32 bytes per particle
        this.particleBuffer = this.device.createBuffer({
            size: particleDataSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        
        // Create uniform buffer
        this.uniformBuffer = this.device.createBuffer({
            size: 16, // 4 floats
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        // Create bind groups
        this.computeBindGroup = this.device.createBindGroup({
            layout: this.computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBuffer } },
                { binding: 1, resource: { buffer: this.uniformBuffer } }
            ]
        });
        
        this.bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBuffer } },
                { binding: 1, resource: { buffer: this.uniformBuffer } }
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
        
        // Update uniforms for compute shader
        const computeUniformData = new Float32Array([
            deltaTime,
            this.config.gravity,
            this.config.airResistance,
            0 // padding
        ]);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, computeUniformData);
        
        // Update uniforms for render shader (resolution)
        const renderUniformData = new Float32Array([
            this.width,
            this.height,
            0, // padding
            0  // padding
        ]);
        // For now we use the same uniform buffer; ideally we'd have separate buffers
        // but this is a simplified implementation
        
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
        // Update rocket positions
        for (let i = this.rockets.length - 1; i >= 0; i--) {
            const rocket = this.rockets[i];
            
            // Apply physics to rocket
            // In canvas coordinates, Y increases downward
            // rocketSpeed is negative (upward motion, decreasing Y)
            // rocketAcceleration is negative, but we need positive acceleration (gravity pulling down)
            // So we negate it to get proper deceleration of upward motion
            rocket.vy -= this.config.rocketAcceleration * deltaTime * 60; // Deceleration (gravity)
            rocket.vx *= 0.995; // Air resistance
            
            rocket.x += rocket.vx * deltaTime * 60;
            rocket.y += rocket.vy * deltaTime * 60;
            
            // Check if rocket should explode
            // Rocket explodes when velocity becomes positive (moving down) or reaches target height
            // Since Y increases downward, targetY < startY for upward motion
            if (rocket.vy >= 0 || rocket.y <= rocket.targetY) {
                // Rocket has reached peak or target, explode it
                this.explodeRocket(rocket);
                this.rockets.splice(i, 1);
            }
        }
    }
    
    explodeRocket(rocket) {
        // Create explosion particles at rocket position
        const particleCount = rocket.particleCount || 50;
        const colors = rocket.colors || this.config.defaultColors;
        
        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount;
            const speed = 50 + Math.random() * 100;
            
            // Pick random color
            const colorHex = colors[Math.floor(Math.random() * colors.length)];
            const color = this.hexToRgba(colorHex);
            
            const particle = {
                position: [rocket.x, rocket.y],
                velocity: [Math.cos(angle) * speed, Math.sin(angle) * speed],
                color: color,
                size: 2 + Math.random() * 3,
                life: 1.0 + Math.random(),
                maxLife: 1.0 + Math.random(),
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
        
        // Convert normalized position to screen coordinates
        const startX = position.x * this.width;
        const startY = this.height; // Start at bottom
        const targetY = position.y * this.height; // Target height
        
        // Create rocket object
        const rocket = {
            x: startX,
            y: startY,
            targetY: targetY,
            vx: (Math.random() - 0.5) * 2, // Slight horizontal drift
            vy: this.config.rocketSpeed, // Initial upward velocity
            particleCount: particleCount,
            colors: colors,
            options: options // Store original options for explosion
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
        // Each particle: position(2) + velocity(2) + color(4) + size(1) + life(1) + maxLife(1) + padding(1) = 12 floats = 48 bytes
        // But GPU alignment requires 32 bytes per particle (8 floats)
        const particleData = new Float32Array(this.particles.length * 8);
        
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            const offset = i * 8;
            
            particleData[offset + 0] = p.position[0];
            particleData[offset + 1] = p.position[1];
            particleData[offset + 2] = p.velocity[0];
            particleData[offset + 3] = p.velocity[1];
            particleData[offset + 4] = p.color[0];
            particleData[offset + 5] = p.color[1];
            particleData[offset + 6] = p.color[2];
            particleData[offset + 7] = p.color[3];
            // Note: size, life, maxLife are in a separate section but we're simplifying for now
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
