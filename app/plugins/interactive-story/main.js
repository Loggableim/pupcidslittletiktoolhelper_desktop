const path = require('path');
const fs = require('fs');

// Engines
const LLMService = require('./engines/llm-service');
const ImageService = require('./engines/image-service');
const TTSService = require('./engines/tts-service');
const OpenAILLMService = require('./engines/openai-llm-service');
const OpenAIImageService = require('./engines/openai-image-service');
const StoryEngine = require('./engines/story-engine');

// Utils
const VotingSystem = require('./utils/voting-system');
const StoryMemory = require('./utils/story-memory');

// Backend
const StoryDatabase = require('./backend/database');

/**
 * Interactive Story Generator Plugin
 * AI-powered story generation with voting, TTS, images, and OBS overlays
 */
class InteractiveStoryPlugin {
  constructor(api) {
    this.api = api;
    this.io = api.getSocketIO();
    this.logger = api.logger;

    // Initialize database
    this.db = new StoryDatabase(api);

    // Get persistent storage directories
    const pluginDataDir = api.getPluginDataDir();
    this.imageCacheDir = path.join(pluginDataDir, 'images');
    this.audioCacheDir = path.join(pluginDataDir, 'audio');
    this.exportDir = path.join(pluginDataDir, 'exports');

    // Services (initialized in init())
    this.llmService = null;
    this.imageService = null;
    this.ttsService = null;
    this.storyEngine = null;
    this.votingSystem = null;

    // Current session state
    this.currentSession = null;
    this.currentChapter = null;
    this.isGenerating = false;
    this.ttsPaused = false;
    
    // Debug logs for offline testing
    this.debugLogs = [];
    this.maxDebugLogs = 100;
  }
  
  /**
   * Add debug log entry
   */
  _debugLog(level, message, data = null) {
    const config = this._loadConfig();
    if (!config.debugLogging) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };
    
    this.debugLogs.unshift(logEntry);
    if (this.debugLogs.length > this.maxDebugLogs) {
      this.debugLogs.pop();
    }
    
    // Log to Winston logger with appropriate level
    const logMessage = data ? `${message} ${JSON.stringify(data)}` : message;
    switch(level) {
      case 'error':
        this.logger.error(logMessage);
        break;
      case 'warn':
        this.logger.warn(logMessage);
        break;
      case 'debug':
        this.logger.debug(logMessage);
        break;
      default:
        this.logger.info(logMessage);
    }
    
    // Emit to UI
    this.io.emit('story:debug-log', logEntry);
  }

  async init() {
    this.api.log('📖 Initializing Interactive Story Generator Plugin...', 'info');

    try {
      // Ensure data directories exist
      this.api.ensurePluginDataDir();
      [this.imageCacheDir, this.audioCacheDir, this.exportDir].forEach(dir => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });

      // Initialize database
      this.db.initialize();

      // Load configuration
      const config = this._loadConfig();

      // Create debug callback that respects debugLogging config
      const debugCallback = (level, message, data) => this._debugLog(level, message, data);
      
      // Create LLM service options
      const llmOptions = {
        timeout: config.llmTimeout,
        maxRetries: config.llmMaxRetries,
        retryDelay: config.llmRetryDelay
      };

      // Initialize services based on provider selection
      const llmProvider = config.llmProvider || 'openai';
      const imageProvider = config.imageProvider || 'openai';
      const ttsProvider = config.ttsProvider || 'system';

      // Initialize LLM service
      if (llmProvider === 'openai') {
        const openaiApiKey = this._getOpenAIApiKey();
        if (openaiApiKey) {
          this.llmService = new OpenAILLMService(openaiApiKey, this.logger, debugCallback, llmOptions);
          this.storyEngine = new StoryEngine(this.llmService, this.logger);
          this._debugLog('info', '✅ OpenAI LLM service initialized', { 
            apiKeyLength: openaiApiKey.length,
            apiKeyPrefix: openaiApiKey.substring(0, 6) + '...',
            timeout: config.llmTimeout,
            maxRetries: config.llmMaxRetries
          });
          this.api.log('✅ OpenAI LLM service initialized', 'info');
        } else {
          this._debugLog('error', '⚠️ OpenAI API key not configured in global settings', null);
          this.api.log('⚠️ OpenAI API key not configured in global settings', 'warn');
          this.api.log('Please configure API key in Settings → OpenAI API Configuration', 'warn');
        }
      } else {
        // SiliconFlow provider
        const siliconFlowApiKey = this._getSiliconFlowApiKey();
        if (siliconFlowApiKey) {
          this.llmService = new LLMService(siliconFlowApiKey, this.logger, debugCallback, llmOptions);
          this.storyEngine = new StoryEngine(this.llmService, this.logger);
          this._debugLog('info', '✅ SiliconFlow LLM service initialized', { 
            apiKeyLength: siliconFlowApiKey.length,
            apiKeyPrefix: siliconFlowApiKey.substring(0, 6) + '...',
            timeout: config.llmTimeout,
            maxRetries: config.llmMaxRetries
          });
          this.api.log('✅ SiliconFlow LLM service initialized', 'info');
        } else {
          this._debugLog('error', '⚠️ SiliconFlow API key not configured in global settings', null);
          this.api.log('⚠️ SiliconFlow API key not configured in global settings', 'warn');
          this.api.log('Please configure API key in Settings → TTS API Keys → Fish Speech 1.5 API Key (SiliconFlow)', 'warn');
        }
      }

      // Initialize Image service
      if (imageProvider === 'openai') {
        const openaiApiKey = this._getOpenAIApiKey();
        if (openaiApiKey) {
          this.imageService = new OpenAIImageService(openaiApiKey, this.logger, this.imageCacheDir);
          this._debugLog('info', '✅ OpenAI Image service initialized', null);
          this.api.log('✅ OpenAI Image service (DALL-E) initialized', 'info');
        } else {
          this._debugLog('error', '⚠️ OpenAI API key not configured for image generation', null);
          this.api.log('⚠️ OpenAI API key not configured for image generation', 'warn');
        }
      } else {
        // SiliconFlow provider
        const siliconFlowApiKey = this._getSiliconFlowApiKey();
        if (siliconFlowApiKey) {
          this.imageService = new ImageService(siliconFlowApiKey, this.logger, this.imageCacheDir);
          this._debugLog('info', '✅ SiliconFlow Image service initialized', null);
          this.api.log('✅ SiliconFlow Image service initialized', 'info');
        } else {
          this._debugLog('error', '⚠️ SiliconFlow API key not configured for image generation', null);
          this.api.log('⚠️ SiliconFlow API key not configured for image generation', 'warn');
        }
      }

      // Initialize TTS service (only if using SiliconFlow TTS, otherwise use system TTS)
      if (ttsProvider === 'siliconflow') {
        const siliconFlowApiKey = this._getSiliconFlowApiKey();
        if (siliconFlowApiKey) {
          this.ttsService = new TTSService(siliconFlowApiKey, this.logger, this.audioCacheDir);
          this._debugLog('info', '✅ SiliconFlow TTS service initialized', null);
          this.api.log('✅ SiliconFlow TTS service initialized', 'info');
        } else {
          this._debugLog('error', '⚠️ SiliconFlow API key not configured for TTS', null);
          this.api.log('⚠️ SiliconFlow API key not configured for TTS', 'warn');
        }
      } else {
        // Using system TTS plugin - no need to initialize TTS service
        this.api.log('Using system TTS plugin for voice generation', 'info');
      }

      // Initialize voting system
      this.votingSystem = new VotingSystem(this.logger, this.io);

      // Register routes
      this._registerRoutes();

      // Register socket handlers
      this._registerSocketHandlers();

      // Register TikTok event handlers
      this._registerTikTokHandlers();

      // Clean old cache on startup
      if (this.imageService && this.imageService.cleanOldCache) {
        this.imageService.cleanOldCache(7);
      }
      if (this.ttsService && this.ttsService.cleanOldCache) {
        this.ttsService.cleanOldCache(3);
      }

      // Check for active session
      const activeSession = this.db.getActiveSession();
      if (activeSession) {
        this.currentSession = activeSession;
        this.api.log(`Restored active session: ${activeSession.id}`, 'info');
      }

      this.api.log('✅ Interactive Story Plugin initialized successfully', 'info');
      this.api.log(`   📂 Images: ${this.imageCacheDir}`, 'info');
      this.api.log(`   🎵 Audio: ${this.audioCacheDir}`, 'info');
      this.api.log(`   📦 Exports: ${this.exportDir}`, 'info');
    } catch (error) {
      this.api.log(`❌ Error initializing Interactive Story Plugin: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Get SiliconFlow API key from global settings
   * @returns {string|null} API key or null if not configured
   */
  _getSiliconFlowApiKey() {
    try {
      const db = this.api.getDatabase();
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('tts_fishspeech_api_key');
      
      if (row && row.value) {
        // Trim whitespace that might have been accidentally saved
        return row.value.trim();
      }
      
      return null;
    } catch (error) {
      this.logger.error('Error retrieving SiliconFlow API key from settings:', error);
      return null;
    }
  }

  /**
   * Get OpenAI API key from global settings
   * @returns {string|null} API key or null if not configured
   */
  _getOpenAIApiKey() {
    try {
      const db = this.api.getDatabase();
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('openai_api_key');
      
      if (row && row.value) {
        // Trim whitespace that might have been accidentally saved
        return row.value.trim();
      }
      
      return null;
    } catch (error) {
      this.logger.error('Error retrieving OpenAI API key from settings:', error);
      return null;
    }
  }

  /**
   * Speak text using the system TTS (LTTH TTS plugin)
   * @param {string} text - Text to speak
   * @param {Object} options - TTS options
   * @returns {Promise<Object>} TTS result
   */
  async _speakThroughSystemTTS(text, options = {}) {
    try {
      const config = this._loadConfig();
      const axios = require('axios');
      
      // Call the LTTH TTS plugin API
      const response = await axios.post('http://localhost:3000/api/tts/speak', {
        text: text,
        username: 'Story Narrator',
        userId: 'interactive-story',
        voiceId: options.voiceId || config.ttsVoiceId || 'tts-1-alloy',
        engine: 'openai', // Explicitly use OpenAI engine
        source: 'interactive-story'
      }, {
        timeout: 30000
      });
      
      if (response.data && response.data.success) {
        this.logger.info('TTS generated successfully through system TTS');
        return response.data;
      } else {
        throw new Error('TTS generation failed: ' + (response.data.error || 'Unknown error'));
      }
    } catch (error) {
      this.logger.error(`System TTS error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate TTS for a chapter if auto-TTS is enabled
   * @param {Object} chapter - Chapter object with title and content
   */
  async _generateChapterTTS(chapter) {
    try {
      const config = this._loadConfig();
      
      if (!config.autoGenerateTTS) {
        return; // TTS disabled
      }

      const ttsProvider = config.ttsProvider || 'system';
      const textToSpeak = `${chapter.title}. ${chapter.content}`;
      
      if (ttsProvider === 'system') {
        // Use LTTH TTS plugin (OpenAI TTS)
        await this._speakThroughSystemTTS(textToSpeak);
        this.logger.info(`Chapter ${chapter.chapterNumber} spoken through system TTS`);
      } else if (ttsProvider === 'siliconflow' && this.ttsService) {
        // Use SiliconFlow TTS (legacy)
        await this.ttsService.generateSpeech(textToSpeak, 'narrator');
        this.logger.info(`Chapter ${chapter.chapterNumber} TTS generated with SiliconFlow`);
      }
    } catch (error) {
      // Don't fail chapter generation if TTS fails
      this.logger.error(`Failed to generate TTS for chapter: ${error.message}`);
    }
  }

  /**
   * Load plugin configuration
   */
  _loadConfig() {
    const defaultConfig = {
      // Provider selection
      llmProvider: 'openai', // 'openai' or 'siliconflow'
      imageProvider: 'openai', // 'openai' or 'siliconflow'
      ttsProvider: 'system', // 'system' (uses LTTH TTS plugin) or 'siliconflow'
      
      // OpenAI models
      openaiModel: 'gpt-4o-mini',
      openaiImageModel: 'dall-e-2',
      
      // SiliconFlow models (legacy)
      defaultModel: 'deepseek',
      defaultImageModel: 'flux-schnell',
      
      // Voting settings
      votingDuration: 60,
      minVotes: 5,
      useMinSwing: false,
      swingThreshold: 10,
      numChoices: 4,
      
      // Generation settings
      autoGenerateImages: true,
      autoGenerateTTS: false,
      
      // TTS settings
      ttsVoiceMapping: {
        narrator: 'narrator',
        default: 'narrator'
      },
      ttsVoiceId: 'tts-1-alloy', // OpenAI TTS voice (when using system TTS)
      
      // Overlay customization
      overlayOrientation: 'landscape', // 'landscape' or 'portrait'
      overlayResolution: '1920x1080', // Common resolutions
      overlayDisplayMode: 'full', // 'full' (entire chapter) or 'sentence' (sentence-by-sentence)
      overlayFontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
      overlayFontSize: 1.3, // em units
      overlayTitleFontSize: 2.5, // em units
      overlayTextColor: '#ffffff',
      overlayTitleColor: '#e94560',
      overlayBackgroundGradient: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.9) 30%, rgba(0,0,0,0.95) 100%)',
      
      // System settings
      offlineMode: false,
      debugLogging: false,
      apiLogging: false,
      llmTimeout: 120000, // 120 seconds timeout for LLM API calls
      llmMaxRetries: 3, // Maximum retry attempts for failed API calls
      llmRetryDelay: 2000 // Initial retry delay in milliseconds
    };

    const savedConfig = this.api.getConfig('story-config');
    return { ...defaultConfig, ...savedConfig };
  }

  /**
   * Save plugin configuration
   */
  _saveConfig(config) {
    this.api.setConfig('story-config', config);
  }

  /**
   * Register API routes
   */
  _registerRoutes() {
    // Serve UI HTML
    this.api.registerRoute('get', '/interactive-story/ui', (req, res) => {
      res.sendFile(path.join(__dirname, 'ui.html'));
    });

    // Serve overlay HTML
    this.api.registerRoute('get', '/interactive-story/overlay', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlay.html'));
    });

    // Get plugin status
    this.api.registerRoute('get', '/api/interactive-story/status', (req, res) => {
      res.json({
        configured: !!this.llmService,
        session: this.currentSession,
        chapter: this.currentChapter,
        voting: this.votingSystem ? this.votingSystem.getStatus() : null,
        isGenerating: this.isGenerating
      });
    });

    // Get configuration
    this.api.registerRoute('get', '/api/interactive-story/config', (req, res) => {
      const config = this._loadConfig();
      // Don't send API key to client
      const safeConfig = { ...config };
      if (safeConfig.siliconFlowApiKey) {
        safeConfig.siliconFlowApiKey = '***configured***';
      }
      res.json(safeConfig);
    });

    // Save configuration
    this.api.registerRoute('post', '/api/interactive-story/config', (req, res) => {
      try {
        const config = req.body;
        this._saveConfig(config);
        
        // Reinitialize services if API key changed or if timeout settings changed
        if (config.siliconFlowApiKey && config.siliconFlowApiKey !== '***configured***') {
          const debugCallback = (level, message, data) => this._debugLog(level, message, data);
          const llmOptions = {
            timeout: config.llmTimeout || 120000,
            maxRetries: config.llmMaxRetries || 3,
            retryDelay: config.llmRetryDelay || 2000
          };
          this.llmService = new LLMService(config.siliconFlowApiKey, this.logger, debugCallback, llmOptions);
          this.imageService = new ImageService(config.siliconFlowApiKey, this.logger, this.imageCacheDir);
          this.ttsService = new TTSService(config.siliconFlowApiKey, this.logger, this.audioCacheDir);
          this.storyEngine = new StoryEngine(this.llmService, this.logger);
        } else if (!this.storyEngine) {
          // If services not initialized, check for API key in database
          const apiKey = this._getSiliconFlowApiKey();
          if (apiKey) {
            const debugCallback = (level, message, data) => this._debugLog(level, message, data);
            const llmOptions = {
              timeout: config.llmTimeout || 120000,
              maxRetries: config.llmMaxRetries || 3,
              retryDelay: config.llmRetryDelay || 2000
            };
            this.llmService = new LLMService(apiKey, this.logger, debugCallback, llmOptions);
            this.imageService = new ImageService(apiKey, this.logger, this.imageCacheDir);
            this.ttsService = new TTSService(apiKey, this.logger, this.audioCacheDir);
            this.storyEngine = new StoryEngine(this.llmService, this.logger);
            this._debugLog('info', '✅ SiliconFlow services initialized from database API key', { 
              apiKeyConfigured: true
            });
          }
        } else if (this.llmService && (config.llmTimeout || config.llmMaxRetries || config.llmRetryDelay)) {
          // Update timeout settings in existing service
          if (config.llmTimeout) this.llmService.timeout = config.llmTimeout;
          if (config.llmMaxRetries) this.llmService.maxRetries = config.llmMaxRetries;
          if (config.llmRetryDelay) this.llmService.retryDelay = config.llmRetryDelay;
          this._debugLog('info', '✅ LLM service settings updated', {
            timeout: this.llmService.timeout,
            maxRetries: this.llmService.maxRetries,
            retryDelay: this.llmService.retryDelay
          });
        }

        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error saving config: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Start new story
    this.api.registerRoute('post', '/api/interactive-story/start', async (req, res) => {
      try {
        if (!this.storyEngine) {
          this._debugLog('error', 'Services not configured - missing API key', null);
          return res.status(400).json({ error: 'Services not configured. Please add SiliconFlow API key in Settings → TTS API Keys' });
        }

        const { theme, outline, model } = req.body;
        
        this._debugLog('info', `🚀 Starting new story`, { 
          theme, 
          model, 
          hasOutline: !!outline,
          apiKeyConfigured: !!this._getSiliconFlowApiKey()
        });
        
        this.isGenerating = true;
        this.io.emit('story:generation-started', { theme });

        // Initialize story
        this._debugLog('info', `📡 Calling LLM API to generate first chapter...`, { theme, model });
        const firstChapter = await this.storyEngine.initializeStory(theme, outline, model);
        
        this._debugLog('info', `✅ First chapter generated successfully`, { 
          title: firstChapter.title, 
          choiceCount: firstChapter.choices.length,
          contentLength: firstChapter.content.length
        });

        // Create session in database
        const sessionId = this.db.createSession({
          theme,
          outline: this.storyEngine.getMemory().memory.outline,
          model: model || 'deepseek',
          metadata: { startedBy: 'manual' }
        });

        this.currentSession = { id: sessionId, theme, model };
        
        this._debugLog('info', `Session created`, { sessionId, theme });

        // Generate image if enabled
        const config = this._loadConfig();
        if (config.autoGenerateImages && this.imageService) {
          try {
            const style = this.imageService.getStyleForTheme(theme);
            const imagePrompt = `${firstChapter.title}: ${firstChapter.content.substring(0, 200)}`;
            firstChapter.imagePath = await this.imageService.generateImage(imagePrompt, config.defaultImageModel, style);
          } catch (imageError) {
            this._debugLog('warn', `⚠️ Image generation failed, continuing without image`, { 
              error: imageError.message,
              statusCode: imageError.response?.status,
              responseData: imageError.response?.data
            });
            firstChapter.imagePath = null;
            this.io.emit('story:image-generation-failed', { 
              message: 'Image generation failed, but story continues',
              error: imageError.message 
            });
          }
        }

        // Save chapter
        this.db.saveChapter(sessionId, firstChapter);
        this.currentChapter = firstChapter;

        this.isGenerating = false;

        // Emit chapter to clients
        this.io.emit('story:chapter-ready', firstChapter);

        // Generate TTS if enabled (non-blocking)
        this._generateChapterTTS(firstChapter).catch(err => {
          this.logger.warn(`TTS generation failed (non-critical): ${err.message}`);
        });

        // Start voting
        this.votingSystem.start(firstChapter.choices, {
          votingDuration: config.votingDuration,
          minVotes: config.minVotes,
          useMinSwing: config.useMinSwing,
          swingThreshold: config.swingThreshold
        });

        res.json({ success: true, chapter: firstChapter, sessionId });
      } catch (error) {
        this.isGenerating = false;
        this._debugLog('error', `❌ Error starting story: ${error.message}`, { 
          error: error.message,
          stack: error.stack,
          statusCode: error.response?.status,
          responseData: error.response?.data
        });
        this.logger.error(`Error starting story: ${error.message}`, error);
        res.status(500).json({ error: error.message });
      }
    });

    // Generate next chapter
    this.api.registerRoute('post', '/api/interactive-story/next-chapter', async (req, res) => {
      try {
        if (!this.currentSession || !this.storyEngine) {
          return res.status(400).json({ error: 'No active story session' });
        }

        const { choiceIndex } = req.body;
        const previousChoice = this.currentChapter.choices[choiceIndex];

        this.isGenerating = true;
        this.io.emit('story:generation-started', {});

        const config = this._loadConfig();
        const chapterNumber = this.currentChapter.chapterNumber + 1;

        // Generate next chapter
        const nextChapter = await this.storyEngine.generateChapter(
          chapterNumber,
          previousChoice,
          this.currentSession.model,
          config.numChoices
        );

        // Generate image
        if (config.autoGenerateImages && this.imageService) {
          try {
            const style = this.imageService.getStyleForTheme(this.currentSession.theme);
            const imagePrompt = `${nextChapter.title}: ${nextChapter.content.substring(0, 200)}`;
            nextChapter.imagePath = await this.imageService.generateImage(imagePrompt, config.defaultImageModel, style);
          } catch (imageError) {
            this._debugLog('warn', `⚠️ Image generation failed, continuing without image`, { 
              error: imageError.message,
              statusCode: imageError.response?.status,
              responseData: imageError.response?.data
            });
            nextChapter.imagePath = null;
            this.io.emit('story:image-generation-failed', { 
              message: 'Image generation failed, but story continues',
              error: imageError.message 
            });
          }
        }

        // Save chapter
        this.db.saveChapter(this.currentSession.id, nextChapter);
        this.currentChapter = nextChapter;

        this.isGenerating = false;

        // Emit chapter
        this.io.emit('story:chapter-ready', nextChapter);

        // Generate TTS if enabled (non-blocking)
        this._generateChapterTTS(nextChapter).catch(err => {
          this.logger.warn(`TTS generation failed (non-critical): ${err.message}`);
        });

        // Start voting
        this.votingSystem.start(nextChapter.choices, {
          votingDuration: config.votingDuration,
          minVotes: config.minVotes,
          useMinSwing: config.useMinSwing,
          swingThreshold: config.swingThreshold
        });

        res.json({ success: true, chapter: nextChapter });
      } catch (error) {
        this.isGenerating = false;
        this.logger.error(`Error generating chapter: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // End story
    this.api.registerRoute('post', '/api/interactive-story/end', (req, res) => {
      try {
        if (this.currentSession) {
          this.db.updateSessionStatus(this.currentSession.id, 'completed');
          this.currentSession = null;
        }
        
        if (this.votingSystem && this.votingSystem.isActive()) {
          this.votingSystem.stop();
        }

        if (this.storyEngine) {
          this.storyEngine.reset();
        }

        this.io.emit('story:ended', {});
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error ending story: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Get available themes
    this.api.registerRoute('get', '/api/interactive-story/themes', (req, res) => {
      if (!this.storyEngine) {
        return res.status(400).json({ error: 'Services not configured' });
      }
      res.json(this.storyEngine.getThemes());
    });

    // Get story memory
    this.api.registerRoute('get', '/api/interactive-story/memory', (req, res) => {
      if (!this.storyEngine) {
        return res.status(400).json({ error: 'No active story' });
      }
      res.json(this.storyEngine.getMemory().getFullMemory());
    });

    // Get session history
    this.api.registerRoute('get', '/api/interactive-story/sessions', (req, res) => {
      const sessions = this.db.getAllSessions(50);
      res.json(sessions);
    });

    // Get session details
    this.api.registerRoute('get', '/api/interactive-story/session/:id', (req, res) => {
      const sessionId = parseInt(req.params.id);
      const session = this.db.getSession(sessionId);
      const chapters = this.db.getSessionChapters(sessionId);
      const topVoters = this.db.getTopVoters(sessionId, 10);
      
      res.json({ session, chapters, topVoters });
    });

    // Get top voters for current session
    this.api.registerRoute('get', '/api/interactive-story/top-voters', (req, res) => {
      if (!this.currentSession) {
        return res.json([]);
      }
      const topVoters = this.db.getTopVoters(this.currentSession.id, 10);
      res.json(topVoters);
    });

    // Serve cached images
    this.api.registerRoute('get', '/api/interactive-story/image/:filename', (req, res) => {
      const imagePath = path.join(this.imageCacheDir, req.params.filename);
      if (fs.existsSync(imagePath)) {
        res.sendFile(imagePath);
      } else {
        res.status(404).json({ error: 'Image not found' });
      }
    });
    
    // Get debug logs (for offline testing)
    this.api.registerRoute('get', '/api/interactive-story/debug-logs', (req, res) => {
      res.json({ logs: this.debugLogs });
    });
    
    // Validate API key
    this.api.registerRoute('post', '/api/interactive-story/validate-api-key', async (req, res) => {
      try {
        const apiKey = this._getSiliconFlowApiKey();
        
        if (!apiKey) {
          return res.json({
            valid: false,
            error: 'No API key configured',
            message: 'Please configure API key in Settings → TTS API Keys → Fish Speech 1.5 API Key (SiliconFlow)',
            configured: false
          });
        }
        
        // Log validation attempt
        this._debugLog('info', '🔍 Validating SiliconFlow API key...', {
          keyLength: apiKey.length,
          keyPrefix: apiKey.substring(0, 6) + '...'
        });
        
        // Test API key with a minimal request
        const axios = require('axios');
        try {
          const response = await axios.post(
            'https://api.siliconflow.com/v1/chat/completions',  // Fixed: Use .com instead of .cn
            {
              model: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
              messages: [{ role: 'user', content: 'test' }],
              max_tokens: 5,
              temperature: 0.1
            },
            {
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              },
              timeout: 10000
            }
          );
          
          this._debugLog('info', '✅ API key validation successful', {
            statusCode: response.status
          });
          
          res.json({
            valid: true,
            configured: true,
            message: 'API key is valid and working!',
            details: {
              keyLength: apiKey.length,
              keyPrefix: apiKey.substring(0, 6) + '...',
              testedModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct'
            }
          });
        } catch (error) {
          const statusCode = error.response?.status || 0;
          const responseData = error.response?.data || error.message;
          
          this._debugLog('error', '❌ API key validation failed', {
            statusCode,
            error: responseData,
            keyLength: apiKey.length,
            keyPrefix: apiKey.substring(0, 6) + '...'
          });
          
          let message = 'API key validation failed';
          let troubleshooting = [];
          
          if (statusCode === 401) {
            message = 'API key is invalid or not authorized';
            troubleshooting = [
              'Check that the API key is correct and active on https://cloud.siliconflow.com/',
              'Make sure you copied the entire API key without extra spaces',
              'Verify the API key hasn\'t expired',
              'Check that you have credits/quota available on SiliconFlow',
              'Try generating a new API key on SiliconFlow dashboard'
            ];
          } else if (statusCode === 429) {
            message = 'Rate limit exceeded or quota exhausted';
            troubleshooting = [
              'Check your API usage quota on SiliconFlow dashboard',
              'Wait a few minutes and try again',
              'Consider upgrading your plan if needed'
            ];
          } else if (statusCode === 0) {
            message = 'Network error - cannot reach SiliconFlow API';
            troubleshooting = [
              'Check your internet connection',
              'Verify that api.siliconflow.com is accessible',
              'Check firewall/proxy settings'
            ];
          }
          
          res.json({
            valid: false,
            configured: true,
            error: String(responseData),
            message,
            troubleshooting,
            details: {
              statusCode,
              keyLength: apiKey.length,
              keyPrefix: apiKey.substring(0, 6) + '...',
              hasWhitespace: apiKey !== apiKey.trim()
            }
          });
        }
      } catch (error) {
        this.logger.error('Error validating API key:', error);
        res.status(500).json({
          valid: false,
          error: error.message
        });
      }
    });
    
    // Admin manual choice selection (offline mode)
    this.api.registerRoute('post', '/api/interactive-story/admin-choice', async (req, res) => {
      try {
        const config = this._loadConfig();
        
        if (!config.offlineMode) {
          return res.status(403).json({ error: 'Offline mode not enabled' });
        }
        
        if (!this.currentSession || !this.storyEngine) {
          return res.status(400).json({ error: 'No active story session' });
        }
        
        const { choiceIndex } = req.body;
        
        if (choiceIndex === undefined || choiceIndex < 0 || choiceIndex >= this.currentChapter.choices.length) {
          return res.status(400).json({ error: 'Invalid choice index' });
        }
        
        this._debugLog('info', `Admin selected choice ${choiceIndex} in offline mode`, { choice: this.currentChapter.choices[choiceIndex] });
        
        const previousChoice = this.currentChapter.choices[choiceIndex];
        
        this.isGenerating = true;
        this.io.emit('story:generation-started', {});
        
        const chapterNumber = this.currentChapter.chapterNumber + 1;
        
        // Generate next chapter
        const nextChapter = await this.storyEngine.generateChapter(
          chapterNumber,
          previousChoice,
          this.currentSession.model,
          config.numChoices
        );
        
        // Generate image
        if (config.autoGenerateImages && this.imageService) {
          try {
            const style = this.imageService.getStyleForTheme(this.currentSession.theme);
            const imagePrompt = `${nextChapter.title}: ${nextChapter.content.substring(0, 200)}`;
            nextChapter.imagePath = await this.imageService.generateImage(imagePrompt, config.defaultImageModel, style);
          } catch (imageError) {
            this._debugLog('warn', `⚠️ Image generation failed, continuing without image`, { 
              error: imageError.message,
              statusCode: imageError.response?.status,
              responseData: imageError.response?.data
            });
            nextChapter.imagePath = null;
            this.io.emit('story:image-generation-failed', { 
              message: 'Image generation failed, but story continues',
              error: imageError.message 
            });
          }
        }
        
        // Save chapter with admin choice
        this.db.saveChapter(this.currentSession.id, nextChapter);
        this.db.saveVote(this.currentSession.id, this.currentChapter.chapterNumber, choiceIndex, 1);
        this.currentChapter = nextChapter;
        
        this.isGenerating = false;
        
        // Emit chapter
        this.io.emit('story:chapter-ready', nextChapter);
        
        // Generate TTS if enabled (non-blocking)
        this._generateChapterTTS(nextChapter).catch(err => {
          this.logger.warn(`TTS generation failed (non-critical): ${err.message}`);
        });
        
        this._debugLog('info', `Next chapter generated`, { chapterNumber, title: nextChapter.title });
        
        res.json({ success: true, chapter: nextChapter });
      } catch (error) {
        this.isGenerating = false;
        this._debugLog('error', `Error in admin choice: ${error.message}`, { error: error.stack });
        this.logger.error(`Error in admin choice: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });
  }

  /**
   * Register Socket.io event handlers
   */
  _registerSocketHandlers() {
    this.api.registerSocket('story:force-vote-end', () => {
      if (this.votingSystem && this.votingSystem.isActive()) {
        const results = this.votingSystem.end();
        if (results && this.currentSession) {
          this.db.saveVote(
            this.currentSession.id,
            this.currentChapter.chapterNumber,
            results.winnerIndex,
            results.totalVotes
          );
        }
      }
    });

    this.api.registerSocket('story:regenerate-image', async (data) => {
      if (!this.currentChapter || !this.imageService) {
        return;
      }

      try {
        const config = this._loadConfig();
        const style = this.imageService.getStyleForTheme(this.currentSession.theme);
        const imagePrompt = data.customPrompt || `${this.currentChapter.title}: ${this.currentChapter.content.substring(0, 200)}`;
        
        const imagePath = await this.imageService.generateImage(
          imagePrompt,
          config.defaultImageModel,
          style
        );

        this.currentChapter.imagePath = imagePath;
        this.io.emit('story:image-updated', { imagePath });
      } catch (error) {
        this.logger.error(`Error regenerating image: ${error.message}`);
      }
    });
  }

  /**
   * Register TikTok event handlers
   */
  _registerTikTokHandlers() {
    // Listen for chat messages to process votes
    this.api.registerTikTokEvent('chat', (data) => {
      if (!this.votingSystem || !this.votingSystem.isActive()) {
        return;
      }

      const message = data.comment.toLowerCase().trim();
      
      // Check if it's a vote command (!a, !b, !c, etc.)
      if (message.match(/^![a-z]$/)) {
        const accepted = this.votingSystem.processVote(
          data.uniqueId,
          data.nickname,
          message
        );

        if (accepted && this.currentSession) {
          this.db.updateViewerStats(
            this.currentSession.id,
            data.uniqueId,
            data.nickname
          );
        }
      }
    });
  }

  async destroy() {
    this.api.log('Interactive Story Plugin shutting down...', 'info');

    // Stop any active voting
    if (this.votingSystem && this.votingSystem.isActive()) {
      this.votingSystem.stop();
    }

    // Save memory if there's an active session
    if (this.currentSession && this.storyEngine) {
      const memory = this.storyEngine.getMemory().getFullMemory();
      this.db.saveMemory(this.currentSession.id, memory);
    }

    this.api.log('Interactive Story Plugin destroyed', 'info');
  }
}

module.exports = InteractiveStoryPlugin;
