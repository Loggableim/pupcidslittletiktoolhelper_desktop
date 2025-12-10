/**
 * WebGPU Emoji Rain - Main Integration Engine
 * 
 * Integrates WebGPU Core, Physics Worker, and Socket.io
 * Maintains API compatibility with original emoji-rain plugin
 * 
 * Features:
 * - RenderGraph architecture
 * - Worker-based physics
 * - Triple-buffered streaming
 * - Texture atlas management
 * - Performance monitoring
 * - Adaptive quality
 * 
 * @version 2.0.0
 */

'use strict';

/**
 * Main Emoji Rain Engine
 */
class WebGPUEmojiRainEngine {
  constructor() {
    this.core = null;
    this.worker = null;
    this.socket = null;
    this.canvas = null;
    
    // Configuration (matches original API)
    this.config = {
      enabled: true,
      emoji_set: ["💧","💙","💚","💜","❤️","🩵","✨","🌟","🔥","🎉"],
      use_custom_images: false,
      image_urls: [],
      
      // Physics
      physics_gravity_y: 1.0,
      physics_air: 0.02,
      
      // Visual
      emoji_min_size_px: 40,
      emoji_max_size_px: 80,
      emoji_lifetime_ms: 8000,
      max_emojis_on_screen: 10000,
      
      // Performance
      target_fps: 60,
      
      // SuperFan
      superfan_burst_enabled: true,
      superfan_burst_intensity: 3.0,
      
      // Gift/Like calculations (keep API compatible)
      like_count_divisor: 10,
      like_min_emojis: 1,
      like_max_emojis: 20,
      gift_base_emojis: 3,
      gift_coin_multiplier: 0.1,
      gift_max_emojis: 50
    };
    
    // User emoji mappings
    this.userEmojiMap = {};
    
    // State
    this.isRunning = false;
    this.isPaused = false;
    this.lastFrameTime = performance.now();
    this.animationFrame = null;
    
    // Performance tracking
    this.stats = {
      fps: 60,
      particles: 0,
      frameTime: 16.67,
      workerTime: 0,
      renderTime: 0
    };
  }

  /**
   * Initialize engine
   */
  async init() {
    try {
      console.log('🎮 Initializing WebGPU Emoji Rain Engine...');

      // Create canvas
      this.canvas = this.createCanvas();
      
      // Initialize WebGPU Core
      this.core = new WebGPUEmojiRainCore();
      const success = await this.core.init(this.canvas);
      
      if (!success) {
        console.error('❌ Failed to initialize WebGPU, falling back to Canvas renderer');
        this.fallbackToCanvas();
        return false;
      }

      // Initialize Physics Worker
      this.worker = new Worker('/js/webgpu-emoji-rain-worker.js');
      this.setupWorkerHandlers();
      
      // Send init message to worker
      this.worker.postMessage({
        type: 'init',
        data: {
          maxParticles: this.config.max_emojis_on_screen,
          canvasWidth: this.canvas.width,
          canvasHeight: this.canvas.height,
          gravity: this.config.physics_gravity_y * 980,
          airResistance: this.config.physics_air
        }
      });

      // Connect to Socket.io
      await this.connectSocket();

      // Load configuration from server
      await this.loadConfig();

      // Load user mappings
      await this.loadUserMappings();

      // Load texture atlas
      await this.loadTextureAtlas();

      console.log('✅ WebGPU Emoji Rain Engine initialized successfully');
      
      return true;
    } catch (error) {
      console.error('❌ Engine initialization error:', error);
      return false;
    }
  }

  /**
   * Create and setup canvas
   */
  createCanvas() {
    const container = document.getElementById('canvas-container');
    if (!container) {
      throw new Error('Canvas container not found');
    }

    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    container.appendChild(canvas);

    // Handle resize
    window.addEventListener('resize', () => this.handleResize());

    return canvas;
  }

  /**
   * Setup worker message handlers
   */
  setupWorkerHandlers() {
    this.worker.onmessage = (e) => {
      const { type, data } = e.data;

      switch (type) {
        case 'ready':
          console.log('✅ Physics worker ready');
          break;

        case 'particleData':
          // Receive particle data from worker
          this.core.updateParticleData(data, data.count);
          this.stats.particles = data.count;
          break;

        case 'stats':
          console.log('📊 Worker stats:', data);
          break;

        default:
          console.warn('Unknown worker message:', type);
      }
    };

    this.worker.onerror = (error) => {
      console.error('❌ Worker error:', error);
    };
  }

  /**
   * Connect to Socket.io
   */
  async connectSocket() {
    return new Promise((resolve) => {
      this.socket = io();

      this.socket.on('connect', () => {
        console.log('✅ Socket.io connected');
        this.registerSocketHandlers();
        resolve();
      });

      this.socket.on('disconnect', () => {
        console.warn('⚠️ Socket.io disconnected');
      });
    });
  }

  /**
   * Register Socket.io event handlers
   */
  registerSocketHandlers() {
    // Spawn emoji rain
    this.socket.on('webgpu-emoji-rain:spawn', (data) => {
      this.handleSpawn(data);
    });

    // Config update
    this.socket.on('webgpu-emoji-rain:config-update', (data) => {
      this.updateConfig(data.config);
    });

    // Toggle
    this.socket.on('webgpu-emoji-rain:toggle', (data) => {
      this.config.enabled = data.enabled;
      if (!data.enabled) {
        this.clear();
      }
    });

    // User mappings update
    this.socket.on('webgpu-emoji-rain:user-mappings-update', (data) => {
      this.userEmojiMap = data.mappings || {};
    });
  }

  /**
   * Load configuration from server
   */
  async loadConfig() {
    try {
      const response = await fetch('/api/webgpu-emoji-rain/config');
      const result = await response.json();
      
      if (result.success && result.config) {
        this.updateConfig(result.config);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  }

  /**
   * Load user emoji mappings
   */
  async loadUserMappings() {
    try {
      const response = await fetch('/api/webgpu-emoji-rain/user-mappings');
      const result = await response.json();
      
      if (result.success) {
        this.userEmojiMap = result.mappings || {};
      }
    } catch (error) {
      console.error('Failed to load user mappings:', error);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    Object.assign(this.config, newConfig);
    
    // Update worker if gravity changed
    if (this.worker) {
      this.worker.postMessage({
        type: 'setWind',
        data: { x: 0, y: 0 }
      });
    }
    
    console.log('⚙️ Configuration updated');
  }

  /**
   * Load texture atlas from emoji/images
   */
  async loadTextureAtlas() {
    // TODO: Implement texture atlas loading
    // For now, use simple emoji rendering
    if (this.core) {
      await this.core.loadTextureAtlas(this.config.emoji_set);
    }
  }

  /**
   * Handle spawn event
   */
  handleSpawn(data) {
    if (!this.config.enabled) return;

    const { count, emoji, x, y, username, burst } = data;
    
    // Check for user-specific emoji mapping
    let finalEmoji = emoji;
    if (username && this.userEmojiMap[username]) {
      finalEmoji = this.userEmojiMap[username];
    }

    // Send spawn command to worker
    if (this.worker) {
      this.worker.postMessage({
        type: 'spawn',
        data: {
          count: count || 10,
          x: x || Math.random(),
          y: y || 0,
          emoji: finalEmoji,
          burst: burst || false
        }
      });
    }

    console.log(`🌧️ Spawned ${count}x ${finalEmoji} for ${username || 'unknown'}`);
  }

  /**
   * Start render loop
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.renderLoop();
    
    console.log('▶️ Engine started');
  }

  /**
   * Stop render loop
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    
    console.log('⏸️ Engine stopped');
  }

  /**
   * Main render loop
   */
  renderLoop() {
    if (!this.isRunning) return;

    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;

    // Update physics in worker
    const workerStartTime = performance.now();
    if (this.worker) {
      this.worker.postMessage({
        type: 'update',
        data: { deltaTime }
      });
    }
    this.stats.workerTime = performance.now() - workerStartTime;

    // Upload to GPU (non-blocking)
    this.core.uploadParticleData();

    // Render frame
    const renderStartTime = performance.now();
    this.core.render(this.canvas.width, this.canvas.height, deltaTime / 1000.0);
    this.stats.renderTime = performance.now() - renderStartTime;

    // Update stats
    this.updateStats(deltaTime);

    // Next frame
    this.animationFrame = requestAnimationFrame(() => this.renderLoop());
  }

  /**
   * Update performance statistics
   */
  updateStats(deltaTime) {
    this.stats.frameTime = deltaTime;
    this.stats.fps = 1000 / deltaTime;
    
    // Get core stats
    const coreStats = this.core.getStats();
    Object.assign(this.stats, coreStats);
  }

  /**
   * Handle window resize
   */
  handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    this.canvas.width = width;
    this.canvas.height = height;
    
    // Notify worker
    if (this.worker) {
      this.worker.postMessage({
        type: 'resize',
        data: { width, height }
      });
    }
    
    console.log(`📐 Resized to ${width}x${height}`);
  }

  /**
   * Clear all particles
   */
  clear() {
    if (this.worker) {
      this.worker.postMessage({ type: 'clear' });
    }
  }

  /**
   * Get current statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Fallback to Canvas renderer (if WebGPU not available)
   */
  fallbackToCanvas() {
    console.warn('⚠️ Falling back to Canvas renderer - WebGPU not available');
    // Load original Matter.js-based engine as fallback
    const script = document.createElement('script');
    script.src = '/js/webgpu-emoji-rain-engine-fallback.js';
    document.head.appendChild(script);
  }

  /**
   * Destroy and clean up
   */
  destroy() {
    this.stop();
    
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    
    if (this.core) {
      this.core.destroy();
      this.core = null;
    }
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    console.log('🧹 Engine destroyed');
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEngine);
} else {
  initEngine();
}

let engine = null;

async function initEngine() {
  try {
    engine = new WebGPUEmojiRainEngine();
    const success = await engine.init();
    
    if (success) {
      engine.start();
      
      // Expose to window for debugging
      window.emojiRainEngine = engine;
      
      // Setup debug keybinds
      setupDebugKeybinds();
    }
  } catch (error) {
    console.error('Failed to initialize engine:', error);
  }
}

/**
 * Setup debug keyboard shortcuts
 */
function setupDebugKeybinds() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+P: Show performance stats
    if (e.ctrlKey && e.key === 'p') {
      e.preventDefault();
      console.log('📊 Performance Stats:', engine.getStats());
    }
    
    // Ctrl+C: Clear all particles
    if (e.ctrlKey && e.key === 'c') {
      e.preventDefault();
      engine.clear();
      console.log('🧹 Cleared all particles');
    }
    
    // Ctrl+T: Test spawn
    if (e.ctrlKey && e.key === 't') {
      e.preventDefault();
      engine.handleSpawn({
        count: 100,
        emoji: '💙',
        x: Math.random(),
        y: 0,
        burst: false
      });
      console.log('🧪 Test spawn triggered');
    }
  });
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (engine) {
    engine.destroy();
  }
});
