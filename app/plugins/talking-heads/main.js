/**
 * Talking Heads Plugin - Main Class
 * AI-generated 2D avatars with synchronized animations for TikTok users speaking via TTS
 */

const path = require('path');
const fs = require('fs').promises;

// Import engines and utilities
const AvatarGenerator = require('./engines/avatar-generator');
const SpriteGenerator = require('./engines/sprite-generator');
const AnimationController = require('./engines/animation-controller');
const CacheManager = require('./utils/cache-manager');
const RoleManager = require('./utils/role-manager');
const { getAllStyleTemplates, getStyleKeys } = require('./utils/style-templates');

class TalkingHeadsPlugin {
  constructor(api) {
    this.api = api;
    this.logger = api.logger;
    this.io = api.getSocketIO();
    this.db = api.getDatabase();
    
    // Load configuration
    this.config = this._loadConfig();
    
    // Initialize managers and engines
    this.cacheManager = null;
    this.roleManager = null;
    this.avatarGenerator = null;
    this.spriteGenerator = null;
    this.animationController = null;
    
    // TTS event tracking
    this.ttsEventQueue = [];
    this.processingTTS = false;
    
    // Custom voice users (loaded from TTS plugin config)
    this.customVoiceUsers = [];
  }

  /**
   * Load plugin configuration from database
   * @returns {object} Configuration object
   * @private
   */
  _loadConfig() {
    const defaultConfig = {
      enabled: false,
      imageApiUrl: 'https://api.siliconflow.cn/v1/image/generations',
      imageApiKey: '',
      defaultStyle: 'cartoon',
      cacheEnabled: true,
      cacheDuration: 2592000000, // 30 days in milliseconds
      obsEnabled: true,
      animationDuration: 5000,
      fadeInDuration: 300,
      fadeOutDuration: 300,
      blinkInterval: 3000,
      rolePermission: 'all',
      minTeamLevel: 0,
      requireSubscriber: false,
      requireCustomVoice: false,
      avatarResolution: 1500,
      spriteResolution: 512,
      debugLogging: false // Enable/disable detailed logging
    };

    const savedConfig = this.api.getConfig('talking_heads_config');
    return savedConfig ? { ...defaultConfig, ...savedConfig } : defaultConfig;
  }

  /**
   * Log message with debug level control
   * @param {string} message - Log message
   * @param {string} level - Log level (info, warn, error, debug)
   * @param {object} data - Additional data to log
   * @private
   */
  _log(message, level = 'info', data = null) {
    const prefix = 'TalkingHeads:';
    const fullMessage = `${prefix} ${message}`;
    
    // Always log errors and warnings
    if (level === 'error' || level === 'warn') {
      this.logger[level](fullMessage, data || '');
      return;
    }
    
    // Log info and debug based on debugLogging setting
    if (level === 'debug' && !this.config.debugLogging) {
      return; // Skip debug logs if debugging is disabled
    }
    
    if (data) {
      this.logger[level](fullMessage, data);
    } else {
      this.logger[level](fullMessage);
    }
  }

  /**
   * Save configuration to database
   * @param {object} newConfig - Configuration to save
   * @private
   */
  _saveConfig(newConfig) {
    const oldDebugLogging = this.config.debugLogging;
    this.config = { ...this.config, ...newConfig };
    this.api.setConfig('talking_heads_config', this.config);
    
    // Log configuration change
    this._log('Configuration saved', 'info');
    
    // If debug logging was toggled, log the change
    if (oldDebugLogging !== this.config.debugLogging) {
      this._log(`Debug logging ${this.config.debugLogging ? 'ENABLED' : 'DISABLED'}`, 'info');
    }
    
    // Log other important config changes
    if (this.config.debugLogging) {
      this._log('Config updated', 'debug', {
        enabled: this.config.enabled,
        defaultStyle: this.config.defaultStyle,
        rolePermission: this.config.rolePermission,
        cacheEnabled: this.config.cacheEnabled,
        debugLogging: this.config.debugLogging
      });
    }
  }

  /**
   * Initialize plugin
   */
  async init() {
    try {
      this._log('Initializing plugin...', 'info');
      this._log(`Debug logging: ${this.config.debugLogging ? 'ENABLED' : 'DISABLED'}`, 'info');

      // Ensure plugin data directory exists
      const pluginDataDir = this.api.getPluginDataDir();
      this._log(`Plugin data directory: ${pluginDataDir}`, 'debug');
      await this.api.ensurePluginDataDir();

      // Initialize cache manager
      this._log('Initializing cache manager...', 'debug');
      this.cacheManager = new CacheManager(pluginDataDir, this.db, this.logger, this.config);
      await this.cacheManager.init();
      this._log('Cache manager initialized', 'debug');

      // Initialize role manager
      this._log('Initializing role manager...', 'debug');
      this.roleManager = new RoleManager(this.config, this.logger);
      this._log(`Role permission: ${this.config.rolePermission}`, 'debug');

      // Initialize avatar and sprite generators if API key is configured
      if (this.config.imageApiKey) {
        this._log('Initializing AI engines...', 'debug');
        this.avatarGenerator = new AvatarGenerator(
          this.config.imageApiUrl,
          this.config.imageApiKey,
          this.logger,
          this.config
        );

        this.spriteGenerator = new SpriteGenerator(
          this.config.imageApiUrl,
          this.config.imageApiKey,
          this.logger,
          this.config
        );

        this._log('✅ Avatar and sprite generators initialized', 'info');
      } else {
        this._log('⚠️  No API key configured - avatar generation disabled', 'warn');
      }

      // Initialize animation controller
      this._log('Initializing animation controller...', 'debug');
      this.animationController = new AnimationController(
        this.io,
        this.logger,
        this.config,
        null // OBS WebSocket integration can be added later
      );
      this._log('Animation controller initialized', 'debug');

      // Register API routes
      this._log('Registering API routes...', 'debug');
      this._registerRoutes();

      // Register socket events
      this._log('Registering socket events...', 'debug');
      this._registerSocketEvents();

      // Register TTS event listener
      this._log('Registering TTS event listeners...', 'debug');
      this._registerTTSEvents();

      // Load custom voice users from TTS plugin
      this._log('Loading custom voice users...', 'debug');
      this._loadCustomVoiceUsers();

      // Start cache cleanup interval (once per day)
      this._startCacheCleanup();

      this.logger.info('TalkingHeads: ✅ Plugin initialized successfully');

    } catch (error) {
      this.logger.error('TalkingHeads: Failed to initialize plugin', error);
      throw error;
    }
  }

  /**
   * Register API routes
   * @private
   */
  _registerRoutes() {
    // Get configuration
    this.api.registerRoute('get', '/api/talkingheads/config', (req, res) => {
      res.json({
        success: true,
        config: this.config,
        styleTemplates: getAllStyleTemplates(),
        apiConfigured: !!this.config.imageApiKey
      });
    });

    // Update configuration
    this.api.registerRoute('post', '/api/talkingheads/config', (req, res) => {
      try {
        const newConfig = req.body;
        this._saveConfig(newConfig);

        // Update managers with new config
        if (this.roleManager) {
          this.roleManager.updateConfig(this.config);
        }

        res.json({ success: true, config: this.config });
      } catch (error) {
        this.logger.error('TalkingHeads: Failed to save config', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get cache statistics
    this.api.registerRoute('get', '/api/talkingheads/cache/stats', (req, res) => {
      try {
        const stats = this.cacheManager.getStats();
        res.json({ success: true, stats });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Clear cache
    this.api.registerRoute('post', '/api/talkingheads/cache/clear', async (req, res) => {
      try {
        const deleted = await this.cacheManager.clearAllCache();
        res.json({ success: true, deleted });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Test API connection
    this.api.registerRoute('post', '/api/talkingheads/test-api', async (req, res) => {
      try {
        if (!this.avatarGenerator) {
          return res.json({ success: false, error: 'API key not configured' });
        }

        const connected = await this.avatarGenerator.testConnection();
        res.json({ success: connected });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Manually generate avatar for user
    this.api.registerRoute('post', '/api/talkingheads/generate', async (req, res) => {
      try {
        const { userId, username, styleKey, profileImageUrl } = req.body;

        if (!userId || !username) {
          return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const result = await this._generateAvatarAndSprites(
          userId,
          username,
          profileImageUrl || '',
          styleKey || this.config.defaultStyle
        );

        res.json({ success: true, result });
      } catch (error) {
        this.logger.error('TalkingHeads: Manual generation failed', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get active animations
    this.api.registerRoute('get', '/api/talkingheads/animations', (req, res) => {
      try {
        const animations = this.animationController.getActiveAnimations();
        res.json({ success: true, animations });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Serve sprite images
    this.api.registerRoute('get', '/api/talkingheads/sprite/:filename', async (req, res) => {
      try {
        const filename = req.params.filename;
        const pluginDataDir = this.api.getPluginDataDir();
        const filepath = path.join(pluginDataDir, 'avatars', filename);

        // Check if file exists
        await fs.access(filepath);
        
        // Send file
        res.sendFile(filepath);
      } catch (error) {
        res.status(404).json({ success: false, error: 'Sprite not found' });
      }
    });

    this.logger.info('TalkingHeads: API routes registered');
  }

  /**
   * Register socket events
   * @private
   */
  _registerSocketEvents() {
    // Client requests animation test
    this.api.registerSocket('talkingheads:test', async (data) => {
      try {
        const { userId, username, duration } = data;
        
        // Get or generate avatar
        const cached = this.cacheManager.getAvatar(userId, this.config.defaultStyle);
        
        if (cached) {
          this.animationController.startAnimation(
            userId,
            username,
            cached.sprites,
            duration || 5000
          );
        } else {
          this.logger.warn('TalkingHeads: No cached avatar for test animation');
        }
      } catch (error) {
        this.logger.error('TalkingHeads: Test animation failed', error);
      }
    });

    this.logger.info('TalkingHeads: Socket events registered');
  }

  /**
   * Register TTS event listeners
   * @private
   */
  _registerTTSEvents() {
    // Listen for TTS events from TTS plugin
    this.io.on('connection', (socket) => {
      socket.on('tts:speaking', async (data) => {
        if (!this.config.enabled) return;

        try {
          await this._handleTTSEvent(data);
        } catch (error) {
          this.logger.error('TalkingHeads: Failed to handle TTS event', error);
        }
      });
    });

    this.logger.info('TalkingHeads: TTS event listeners registered');
  }

  /**
   * Handle TTS speaking event
   * @param {object} data - TTS event data
   * @private
   */
  async _handleTTSEvent(data) {
    const { userId, username, text, duration, userData } = data;

    this._log(`TTS event received for user: ${username}`, 'debug', { userId, duration });

    if (!userId || !username) {
      this._log('Invalid TTS event data - missing userId or username', 'warn');
      return;
    }

    // Check role permission
    this._log(`Checking eligibility for user: ${username}`, 'debug');
    const eligibility = this.roleManager.checkEligibility(userData || {}, this.customVoiceUsers);
    
    if (!eligibility.eligible) {
      this._log(`User ${username} not eligible - ${eligibility.reason}`, 'info');
      return;
    }

    this._log(`User ${username} is eligible for talking head`, 'debug');

    // Check cache first
    this._log(`Checking cache for user ${username} with style ${this.config.defaultStyle}`, 'debug');
    let avatarData = this.cacheManager.getAvatar(userId, this.config.defaultStyle);

    if (!avatarData) {
      // Generate new avatar and sprites
      this._log(`Generating new avatar for ${username}`, 'info');
      this._log(`Profile URL: ${userData?.profilePictureUrl || 'none'}`, 'debug');
      
      try {
        avatarData = await this._generateAvatarAndSprites(
          userId,
          username,
          userData?.profilePictureUrl || '',
          this.config.defaultStyle
        );
        this._log(`Avatar generation completed for ${username}`, 'debug');
      } catch (error) {
        this._log(`Failed to generate avatar for ${username}: ${error.message}`, 'error');
        return;
      }
    } else {
      this._log(`Using cached avatar for ${username}`, 'debug');
    }

    // Start animation
    this._log(`Starting animation for ${username} (duration: ${duration}ms)`, 'debug');
    this.animationController.startAnimation(
      userId,
      username,
      avatarData.sprites,
      duration || 5000
    );
  }

  /**
   * Generate avatar and sprites for user
   * @param {string} userId - TikTok user ID
   * @param {string} username - TikTok username
   * @param {string} profileImageUrl - Profile image URL
   * @param {string} styleKey - Style template key
   * @returns {Promise<object>} Avatar data
   * @private
   */
  async _generateAvatarAndSprites(userId, username, profileImageUrl, styleKey) {
    if (!this.avatarGenerator || !this.spriteGenerator) {
      throw new Error('Avatar generation not configured - API key missing');
    }

    const pluginDataDir = this.api.getPluginDataDir();
    const cacheDir = path.join(pluginDataDir, 'avatars');

    // Generate avatar
    const avatarPath = await this.avatarGenerator.generateAvatar(
      username,
      userId,
      profileImageUrl,
      styleKey,
      cacheDir
    );

    // Generate sprites
    const spritePaths = await this.spriteGenerator.generateSprites(
      username,
      userId,
      avatarPath,
      styleKey,
      cacheDir
    );

    // Save to cache
    this.cacheManager.saveAvatar(
      userId,
      username,
      styleKey,
      avatarPath,
      spritePaths,
      profileImageUrl
    );

    return {
      userId,
      username,
      styleKey,
      avatarPath,
      sprites: spritePaths
    };
  }

  /**
   * Load custom voice users from TTS plugin
   * @private
   */
  _loadCustomVoiceUsers() {
    try {
      // Try to get TTS plugin config
      const ttsConfig = this.api.getConfig('tts_config');
      
      if (ttsConfig && ttsConfig.voiceWhitelist) {
        this.customVoiceUsers = Object.keys(ttsConfig.voiceWhitelist);
        this.logger.info(`TalkingHeads: Loaded ${this.customVoiceUsers.length} custom voice users`);
      }
    } catch (error) {
      this.logger.warn('TalkingHeads: Could not load custom voice users', error);
    }
  }

  /**
   * Start cache cleanup interval
   * @private
   */
  _startCacheCleanup() {
    if (!this.config.cacheEnabled) return;

    // Run cleanup once per day
    this.cacheCleanupInterval = setInterval(async () => {
      try {
        await this.cacheManager.cleanupOldCache();
      } catch (error) {
        this.logger.error('TalkingHeads: Cache cleanup failed', error);
      }
    }, 86400000); // 24 hours

    this.logger.info('TalkingHeads: Cache cleanup scheduled');
  }

  /**
   * Destroy plugin and cleanup
   */
  async destroy() {
    try {
      this.logger.info('TalkingHeads: Destroying plugin...');

      // Stop all animations
      if (this.animationController) {
        this.animationController.stopAllAnimations();
      }

      // Clear cleanup interval
      if (this.cacheCleanupInterval) {
        clearInterval(this.cacheCleanupInterval);
      }

      this.logger.info('TalkingHeads: Plugin destroyed');
    } catch (error) {
      this.logger.error('TalkingHeads: Error during destroy', error);
    }
  }
}

module.exports = TalkingHeadsPlugin;
