/**
 * WebGPU Emoji Rain Plugin
 *
 * GPU-accelerated emoji rain effect using WebGPU instanced rendering.
 * Demonstrates the LTTH WebGPU Engine integration.
 */

const path = require('path');
const fs = require('fs');

// ============================================================================
// WGSL Shaders
// ============================================================================

/**
 * Vertex shader for instanced textured quads
 */
const VERTEX_SHADER = `
struct Uniforms {
  time: f32,
  aspect: f32,
  particleScale: f32,
  _padding: f32,
};

struct Particle {
  position: vec2<f32>,
  velocity: vec2<f32>,
  rotation: f32,
  scale: f32,
  alpha: f32,
  _padding: f32,
};

struct ParticleBuffer {
  particles: array<Particle>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> particleBuffer: ParticleBuffer;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) alpha: f32,
};

// Quad vertices (2 triangles)
const QUAD_POSITIONS = array<vec2<f32>, 6>(
  vec2<f32>(-0.5, -0.5),
  vec2<f32>( 0.5, -0.5),
  vec2<f32>( 0.5,  0.5),
  vec2<f32>(-0.5, -0.5),
  vec2<f32>( 0.5,  0.5),
  vec2<f32>(-0.5,  0.5)
);

const QUAD_UVS = array<vec2<f32>, 6>(
  vec2<f32>(0.0, 1.0),
  vec2<f32>(1.0, 1.0),
  vec2<f32>(1.0, 0.0),
  vec2<f32>(0.0, 1.0),
  vec2<f32>(1.0, 0.0),
  vec2<f32>(0.0, 0.0)
);

@vertex
fn main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
  var output: VertexOutput;

  let particle = particleBuffer.particles[instanceIndex];
  let quadPos = QUAD_POSITIONS[vertexIndex];

  // Apply rotation
  let c = cos(particle.rotation);
  let s = sin(particle.rotation);
  let rotated = vec2<f32>(
    quadPos.x * c - quadPos.y * s,
    quadPos.x * s + quadPos.y * c
  );

  // Apply scale and particle position
  let scale = particle.scale * uniforms.particleScale;
  var worldPos = rotated * scale + particle.position;

  // Apply aspect ratio correction
  worldPos.x /= uniforms.aspect;

  output.position = vec4<f32>(worldPos, 0.0, 1.0);
  output.uv = QUAD_UVS[vertexIndex];
  output.alpha = particle.alpha;

  return output;
}
`;

/**
 * Fragment shader for textured particles
 */
const FRAGMENT_SHADER = `
@group(0) @binding(2) var textureSampler: sampler;
@group(0) @binding(3) var particleTexture: texture_2d<f32>;

@fragment
fn main(
  @location(0) uv: vec2<f32>,
  @location(1) alpha: f32
) -> @location(0) vec4<f32> {
  let color = textureSample(particleTexture, textureSampler, uv);
  return vec4<f32>(color.rgb, color.a * alpha);
}
`;

// ============================================================================
// Constants
// ============================================================================

const MAX_PARTICLES = 1000;
const PARTICLE_SIZE = 32; // bytes: 2 floats pos + 2 floats vel + rot + scale + alpha + padding = 8 floats
const DEFAULT_CONFIG = {
  enabled: true,
  maxParticles: MAX_PARTICLES,
  particleScale: 0.08,
  gravity: 0.5,
  spawnRate: 10,
  lifespan: 5.0,
  rotationSpeed: 2.0,
  fadeOutStart: 0.7
};

// ============================================================================
// Plugin Class
// ============================================================================

/**
 * WebGPU Emoji Rain Plugin
 */
class WebGPUEmojiRainPlugin {
  constructor(api) {
    this.api = api;
    this.io = api.getSocketIO();

    // Plugin state
    this.enabled = false;
    this.webgpuAvailable = false;
    this.registration = null;

    // Render resources
    this.pipeline = null;
    this.uniformBuffer = null;
    this.particleBuffer = null;
    this.bindGroup = null;
    this.texture = null;
    this.sampler = null;

    // Particle data
    this.particles = [];
    this.particleData = new Float32Array(MAX_PARTICLES * 8);

    // Configuration
    this.config = { ...DEFAULT_CONFIG };
  }

  async init() {
    this.api.log('🎮 [WebGPU Emoji Rain] Initializing...', 'info');

    // Load configuration
    this.loadConfig();

    // Check if WebGPU engine is available
    try {
      const webgpuEngine = this.requireWebGPUEngine();
      if (!webgpuEngine || !webgpuEngine.isEngineAvailable()) {
        this.api.log('⚠️ [WebGPU Emoji Rain] WebGPU not available, plugin disabled', 'warn');
        this.webgpuAvailable = false;
        return;
      }
      this.webgpuAvailable = true;
    } catch (error) {
      this.api.log(`⚠️ [WebGPU Emoji Rain] WebGPU engine not found: ${error.message}`, 'warn');
      this.webgpuAvailable = false;
      return;
    }

    // Register routes
    this.registerRoutes();

    // Register socket events
    this.registerSocketEvents();

    // Register TikTok events
    this.registerTikTokEvents();

    // Initialize WebGPU renderer if enabled
    if (this.config.enabled) {
      await this.initializeRenderer();
    }

    this.api.log('✅ [WebGPU Emoji Rain] Plugin initialized', 'info');
  }

  /**
   * Require the WebGPU engine module
   */
  requireWebGPUEngine() {
    try {
      return require('../../modules/webgpu-engine/dist/index.js');
    } catch (error) {
      // Try alternative path
      try {
        return require(path.join(__dirname, '..', '..', 'modules', 'webgpu-engine', 'dist', 'index.js'));
      } catch {
        throw error;
      }
    }
  }

  /**
   * Load configuration from database
   */
  loadConfig() {
    const savedConfig = this.api.getConfig('webgpu-emoji-rain');
    if (savedConfig) {
      this.config = { ...DEFAULT_CONFIG, ...savedConfig };
    }
    this.enabled = this.config.enabled;
  }

  /**
   * Save configuration to database
   */
  saveConfig() {
    this.api.setConfig('webgpu-emoji-rain', this.config);
  }

  /**
   * Initialize WebGPU renderer
   */
  async initializeRenderer() {
    if (!this.webgpuAvailable) {
      return;
    }

    try {
      const { registerPluginRenderer } = this.requireWebGPUEngine();

      this.registration = await registerPluginRenderer(
        this.api,
        {
          wantsSurface: true,
          preferredCanvasSelector: '#webgpu-emoji-rain-canvas'
        },
        {
          onInit: async (ctx) => {
            await this.onRendererInit(ctx);
          },
          onFrame: (ctx) => {
            this.onRendererFrame(ctx);
          },
          onHotReload: async (ctx) => {
            await this.onRendererHotReload(ctx);
          },
          onDispose: async (ctx) => {
            await this.onRendererDispose(ctx);
          },
          onResize: (ctx, width, height) => {
            this.onRendererResize(ctx, width, height);
          },
          onError: (ctx, error) => {
            this.api.log(`❌ [WebGPU Emoji Rain] Render error: ${error.message}`, 'error');
          }
        }
      );

      this.enabled = true;
      this.api.log('✅ [WebGPU Emoji Rain] Renderer initialized', 'info');
    } catch (error) {
      this.api.log(`❌ [WebGPU Emoji Rain] Failed to initialize renderer: ${error.message}`, 'error');
      this.enabled = false;
    }
  }

  /**
   * Renderer initialization callback
   */
  async onRendererInit(ctx) {
    const { engine } = ctx;

    // Create uniform buffer
    this.uniformBuffer = engine.createBuffer({
      size: 16, // 4 floats: time, aspect, particleScale, padding
      usage: 0x0040 | 0x0008, // UNIFORM | COPY_DST
      label: 'emoji-rain-uniforms'
    });

    // Create particle storage buffer
    this.particleBuffer = engine.createBuffer({
      size: MAX_PARTICLES * PARTICLE_SIZE,
      usage: 0x0080 | 0x0008, // STORAGE | COPY_DST
      label: 'emoji-rain-particles'
    });

    // Create sampler
    this.sampler = engine.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      label: 'emoji-rain-sampler'
    });

    // Load default texture
    await this.loadDefaultTexture(engine);

    // Create pipeline
    await this.createPipeline(ctx);

    this.api.log('✅ [WebGPU Emoji Rain] GPU resources created', 'debug');
  }

  /**
   * Load default emoji texture
   */
  async loadDefaultTexture(engine) {
    try {
      // Try to load from assets
      const assetPath = path.join(__dirname, 'assets', 'emoji.png');
      if (fs.existsSync(assetPath)) {
        const buffer = fs.readFileSync(assetPath);
        const blob = new Blob([buffer], { type: 'image/png' });
        this.texture = await engine.createTextureFromBlob(blob, {
          label: 'emoji-rain-texture'
        });
        return;
      }
    } catch (error) {
      this.api.log(`⚠️ [WebGPU Emoji Rain] Failed to load texture: ${error.message}`, 'warn');
    }

    // Fallback: create a simple colored texture
    this.texture = engine.createTexture({
      width: 64,
      height: 64,
      format: 'rgba8unorm',
      usage: 0x0004 | 0x0002, // TEXTURE_BINDING | COPY_DST
      label: 'emoji-rain-fallback-texture'
    });

    // Create gradient fallback texture
    await this.createFallbackTexture(engine);
  }

  /**
   * Create a simple gradient fallback texture
   */
  async createFallbackTexture(engine) {
    // This would need canvas or ImageData - skip for now
    // The texture will just be empty/black
    this.api.log('⚠️ [WebGPU Emoji Rain] Using fallback texture', 'debug');
  }

  /**
   * Create render pipeline
   */
  async createPipeline(ctx) {
    const { engine, surface } = ctx;

    const format = surface ? surface.format : engine.getPreferredFormat();

    this.pipeline = await engine.createPipeline({
      id: 'webgpu-emoji-rain-pipeline',
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      vertexBufferLayouts: [], // No vertex buffers - using instance index
      colorTargetStates: [{
        format: format,
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
      }],
      label: 'webgpu-emoji-rain-pipeline'
    });

    // Create bind group
    this.createBindGroup(engine);
  }

  /**
   * Create bind group
   */
  createBindGroup(engine) {
    if (!this.pipeline || !this.uniformBuffer || !this.particleBuffer || !this.sampler || !this.texture) {
      return;
    }

    this.bindGroup = engine.createBindGroupFromLayout(
      this.pipeline,
      0,
      [
        { binding: 0, resource: { buffer: this.uniformBuffer.resource } },
        { binding: 1, resource: { buffer: this.particleBuffer.resource } },
        { binding: 2, resource: this.sampler.resource },
        { binding: 3, resource: this.texture.createView() }
      ]
    );
  }

  /**
   * Frame render callback
   */
  onRendererFrame(ctx) {
    const { engine, surface, deltaTime, time } = ctx;

    if (!this.enabled || !surface || !this.pipeline || !this.bindGroup) {
      return;
    }

    // Update particles
    this.updateParticles(deltaTime);

    // Update GPU buffers
    this.updateGPUBuffers(engine, surface, time);

    // Render
    engine.encodePass((encoder) => {
      const passDesc = {
        colorAttachments: [{
          view: surface.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store'
        }]
      };

      const pass = encoder.beginRenderPass(passDesc);
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.draw(6, this.particles.length); // 6 vertices per quad, N instances
    });
  }

  /**
   * Update particle simulation
   */
  updateParticles(deltaTime) {
    const gravity = this.config.gravity;
    const fadeOutStart = this.config.fadeOutStart;
    const lifespan = this.config.lifespan;

    // Update existing particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      // Update velocity (gravity)
      p.vy += gravity * deltaTime;

      // Update position
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;

      // Update rotation
      p.rotation += p.rotationSpeed * deltaTime;

      // Update lifetime
      p.life += deltaTime;

      // Fade out
      const lifeRatio = p.life / lifespan;
      if (lifeRatio > fadeOutStart) {
        p.alpha = 1.0 - ((lifeRatio - fadeOutStart) / (1.0 - fadeOutStart));
      }

      // Remove dead particles
      if (p.life >= lifespan || p.y > 1.5) {
        this.particles.splice(i, 1);
      }
    }
  }

  /**
   * Update GPU buffers with particle data
   */
  updateGPUBuffers(engine, surface, time) {
    // Update uniform buffer
    const uniformData = new Float32Array([
      time,
      surface.width / surface.height,
      this.config.particleScale,
      0.0 // padding
    ]);
    this.uniformBuffer.write(uniformData);

    // Update particle buffer
    for (let i = 0; i < this.particles.length && i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      const offset = i * 8;
      this.particleData[offset + 0] = p.x;
      this.particleData[offset + 1] = p.y;
      this.particleData[offset + 2] = p.vx;
      this.particleData[offset + 3] = p.vy;
      this.particleData[offset + 4] = p.rotation;
      this.particleData[offset + 5] = p.scale;
      this.particleData[offset + 6] = p.alpha;
      this.particleData[offset + 7] = 0.0; // padding
    }

    const dataToWrite = new Float32Array(
      this.particleData.buffer,
      0,
      Math.min(this.particles.length * 8, MAX_PARTICLES * 8)
    );
    if (dataToWrite.length > 0) {
      this.particleBuffer.write(dataToWrite);
    }
  }

  /**
   * Hot reload callback
   */
  async onRendererHotReload(ctx) {
    this.api.log('🔄 [WebGPU Emoji Rain] Hot reloading...', 'info');

    // Release old resources
    this.releaseResources();

    // Reinitialize
    await this.onRendererInit(ctx);
  }

  /**
   * Dispose callback
   */
  async onRendererDispose(ctx) {
    this.releaseResources();
    this.api.log('🧹 [WebGPU Emoji Rain] Resources disposed', 'debug');
  }

  /**
   * Resize callback
   */
  onRendererResize(ctx, width, height) {
    this.api.log(`📐 [WebGPU Emoji Rain] Resized to ${width}x${height}`, 'debug');
  }

  /**
   * Release GPU resources
   */
  releaseResources() {
    if (this.uniformBuffer) {
      this.uniformBuffer.release();
      this.uniformBuffer = null;
    }
    if (this.particleBuffer) {
      this.particleBuffer.release();
      this.particleBuffer = null;
    }
    if (this.texture) {
      this.texture.release();
      this.texture = null;
    }
    if (this.sampler) {
      this.sampler.release();
      this.sampler = null;
    }
    if (this.pipeline) {
      this.pipeline.release();
      this.pipeline = null;
    }
    this.bindGroup = null;
  }

  /**
   * Spawn emoji particles
   */
  spawnParticles(count, options = {}) {
    if (!this.enabled || this.particles.length >= MAX_PARTICLES) {
      return;
    }

    const baseX = options.x !== undefined ? options.x * 2 - 1 : 0;
    const baseY = options.y !== undefined ? options.y * 2 - 1 : -1.2;

    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const spread = options.spread || 0.5;
      const x = baseX + (Math.random() - 0.5) * spread;
      const y = baseY;

      this.particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -(Math.random() * 0.5 + 0.3),
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * this.config.rotationSpeed,
        scale: 0.8 + Math.random() * 0.4,
        alpha: 1.0,
        life: 0
      });
    }
  }

  // ============================================================================
  // Routes
  // ============================================================================

  registerRoutes() {
    // Serve UI
    this.api.registerRoute('get', '/webgpu-emoji-rain/ui', (req, res) => {
      const uiPath = path.join(__dirname, 'ui.html');
      if (fs.existsSync(uiPath)) {
        res.sendFile(uiPath);
      } else {
        res.status(404).json({ error: 'UI not found' });
      }
    });

    // Serve overlay
    this.api.registerRoute('get', '/webgpu-emoji-rain/overlay', (req, res) => {
      const overlayPath = path.join(__dirname, 'overlay.html');
      if (fs.existsSync(overlayPath)) {
        res.sendFile(overlayPath);
      } else {
        res.status(404).json({ error: 'Overlay not found' });
      }
    });

    // Get status
    this.api.registerRoute('get', '/api/webgpu-emoji-rain/status', (req, res) => {
      res.json({
        success: true,
        enabled: this.enabled,
        webgpuAvailable: this.webgpuAvailable,
        particleCount: this.particles.length,
        maxParticles: MAX_PARTICLES
      });
    });

    // Get config
    this.api.registerRoute('get', '/api/webgpu-emoji-rain/config', (req, res) => {
      res.json({
        success: true,
        config: this.config
      });
    });

    // Update config
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/config', (req, res) => {
      try {
        const newConfig = req.body.config || req.body;
        this.config = { ...this.config, ...newConfig };
        this.saveConfig();
        res.json({ success: true, config: this.config });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Toggle
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/toggle', async (req, res) => {
      try {
        const { enabled } = req.body;
        const newState = enabled !== undefined ? enabled : !this.enabled;

        if (newState && !this.enabled) {
          await this.initializeRenderer();
        } else if (!newState && this.enabled) {
          this.enabled = false;
          if (this.registration) {
            this.registration.unregister();
            this.registration = null;
          }
        }

        this.config.enabled = this.enabled;
        this.saveConfig();

        res.json({ success: true, enabled: this.enabled });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Test spawn
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/test', (req, res) => {
      try {
        const { count, x, y } = req.body;
        this.spawnParticles(count || 20, { x, y });
        res.json({ success: true, particleCount: this.particles.length });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.log('✅ [WebGPU Emoji Rain] Routes registered', 'debug');
  }

  // ============================================================================
  // Socket Events
  // ============================================================================

  registerSocketEvents() {
    this.api.registerSocket('webgpu-emoji-rain:spawn', (socket, data) => {
      const { count, x, y, spread } = data || {};
      this.spawnParticles(count || 10, { x, y, spread });
    });

    this.api.registerSocket('webgpu-emoji-rain:toggle', (socket, data) => {
      const { enabled } = data || {};
      if (enabled !== undefined) {
        this.enabled = enabled;
      }
    });

    this.api.registerSocket('webgpu-emoji-rain:config', (socket, data) => {
      if (data) {
        this.config = { ...this.config, ...data };
        this.saveConfig();
      }
    });

    this.api.log('✅ [WebGPU Emoji Rain] Socket events registered', 'debug');
  }

  // ============================================================================
  // TikTok Events
  // ============================================================================

  registerTikTokEvents() {
    // Gift event
    this.api.registerTikTokEvent('gift', (data) => {
      if (!this.enabled) return;
      const coins = data.coins || 1;
      const count = Math.min(Math.floor(coins / 10) + 5, 50);
      this.spawnParticles(count);
    });

    // Like event
    this.api.registerTikTokEvent('like', (data) => {
      if (!this.enabled) return;
      const count = Math.min(data.likeCount || 1, 10);
      this.spawnParticles(count);
    });

    // Follow event
    this.api.registerTikTokEvent('follow', () => {
      if (!this.enabled) return;
      this.spawnParticles(15);
    });

    // Share event
    this.api.registerTikTokEvent('share', () => {
      if (!this.enabled) return;
      this.spawnParticles(10);
    });

    this.api.log('✅ [WebGPU Emoji Rain] TikTok events registered', 'debug');
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  async destroy() {
    if (this.registration) {
      this.registration.unregister();
      this.registration = null;
    }
    this.releaseResources();
    this.particles = [];
    this.api.log('🌧️ [WebGPU Emoji Rain] Plugin destroyed', 'info');
  }
}

module.exports = WebGPUEmojiRainPlugin;
