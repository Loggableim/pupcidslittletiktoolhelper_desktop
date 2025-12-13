const path = require('path');
const fs = require('fs');
const axios = require('axios');

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
          this.storyEngine = new StoryEngine(this.llmService, this.logger, {
            language: config.storyLanguage || 'German',
            platform: 'tiktok'
          });
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
          this.storyEngine = new StoryEngine(this.llmService, this.logger, {
            language: config.storyLanguage || 'German',
            platform: 'tiktok'
          });
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

      // Ensure storyEngine is always initialized (even without LLM service for theme access)
      if (!this.storyEngine) {
        this._debugLog('warn', '⚠️ StoryEngine not initialized - creating basic instance for theme access', null);
        // Create a minimal storyEngine without LLM service for theme/configuration access
        this.storyEngine = new StoryEngine(null, this.logger, {
          language: config.storyLanguage || 'German',
          platform: 'tiktok'
        });
        this.api.log('⚠️ StoryEngine initialized in limited mode (themes only - configure API keys for full functionality)', 'warn');
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
   * Splits chapter into sentences and sends them progressively to overlay
   * @param {Object} chapter - Chapter object with title and content
   * @returns {Promise<void>}
   */
  async _generateChapterTTS(chapter) {
    try {
      const config = this._loadConfig();
      
      if (!config.autoGenerateTTS) {
        // If TTS disabled, just show the full chapter immediately
        this.io.emit('story:chapter-display', { 
          mode: 'immediate',
          chapter: chapter
        });
        return;
      }

      const ttsProvider = config.ttsProvider || 'system';
      
      // Split content into sentences for progressive display
      const sentences = this._splitIntoSentences(chapter.content);
      const fullText = `${chapter.title}. ${chapter.content}`;
      
      // Calculate realistic timing based on TTS speed
      const wordCount = fullText.split(/\s+/).length;
      const totalDuration = (wordCount / 2.5) * 1000; // ~2.5 words per second
      
      this.logger.info(`Starting chapter TTS: ${sentences.length} sentences, ${wordCount} words, ~${Math.round(totalDuration/1000)}s total`);
      
      // Signal overlay that chapter TTS is starting (but don't send sentences yet)
      this.io.emit('story:chapter-tts-start', {
        title: chapter.title,
        chapterNumber: chapter.chapterNumber,
        totalSentences: sentences.length,
        estimatedDuration: totalDuration
      });
      
      // Start TTS in parallel with sentence display
      const ttsPromise = (async () => {
        if (ttsProvider === 'system') {
          await this._speakThroughSystemTTS(fullText);
          this.logger.info(`Chapter ${chapter.chapterNumber} TTS completed`);
        } else if (ttsProvider === 'siliconflow' && this.ttsService) {
          await this.ttsService.generateSpeech(fullText, 'narrator');
          this.logger.info(`Chapter ${chapter.chapterNumber} TTS completed (SiliconFlow)`);
        }
      })();
      
      // Display sentences progressively WHILE TTS plays
      // Calculate delay per sentence to match TTS duration
      const sentenceDelay = Math.max(totalDuration / sentences.length, 1500); // At least 1.5s per sentence
      
      for (let i = 0; i < sentences.length; i++) {
        // Emit each sentence for Star Wars scroll display
        this.io.emit('story:chapter-sentence', {
          sentence: sentences[i],
          index: i,
          total: sentences.length,
          chapterNumber: chapter.chapterNumber
        });
        
        // Wait before next sentence (except last one)
        if (i < sentences.length - 1) {
          await this._wait(sentenceDelay);
        }
      }
      
      // Wait for TTS to complete before proceeding
      await ttsPromise;
      
      // Signal that TTS is complete
      this.io.emit('story:chapter-tts-complete', {
        chapterNumber: chapter.chapterNumber
      });
      
    } catch (error) {
      // Don't fail chapter generation if TTS fails
      this.logger.error(`Failed to generate TTS for chapter: ${error.message}`);
      // Show full chapter immediately if TTS fails
      this.io.emit('story:chapter-display', { 
        mode: 'immediate',
        chapter: chapter
      });
    }
  }
  
  /**
   * Wait for specified milliseconds
   * @param {number} ms - Milliseconds to wait
   * @returns {Promise<void>}
   */
  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Split text into sentences for progressive display
   * @param {string} text - Text to split
   * @returns {Array<string>} Array of sentences
   */
  _splitIntoSentences(text) {
    // Split on sentence endings but keep the punctuation
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    return sentences.map(s => s.trim()).filter(s => s.length > 0);
  }

  /**
   * Generate TTS for voting choices if auto-TTS is enabled
   * @param {Array<string>} choices - Array of choice texts
   * @returns {Promise<void>}
   */
  async _generateChoicesTTS(choices) {
    try {
      const config = this._loadConfig();
      
      if (!config.autoGenerateTTS) {
        return; // TTS disabled
      }

      const ttsProvider = config.ttsProvider || 'system';
      
      // Create choice text
      const choiceLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
      const choiceText = choices.map((choice, index) => 
        `Option ${choiceLetters[index]}: ${choice}`
      ).join('. ');
      
      const textToSpeak = `Voting time! ${choiceText}`;
      
      if (ttsProvider === 'system') {
        // Use LTTH TTS plugin (OpenAI TTS)
        await this._speakThroughSystemTTS(textToSpeak);
        this.logger.info(`Choices spoken through system TTS`);
      } else if (ttsProvider === 'siliconflow' && this.ttsService) {
        // Use SiliconFlow TTS (legacy)
        await this.ttsService.generateSpeech(textToSpeak, 'narrator');
        this.logger.info(`Choices TTS generated with SiliconFlow`);
      }
    } catch (error) {
      // Don't fail voting if TTS fails
      this.logger.error(`Failed to generate TTS for choices: ${error.message}`);
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
      openaiModel: 'gpt-5.2',
      openaiImageModel: 'gpt-image-1',
      
      // SiliconFlow models (legacy)
      defaultModel: 'deepseek',
      defaultImageModel: 'flux-schnell',
      
      // Voting settings
      votingDuration: 60,
      minVotes: 5,
      useMinSwing: false,
      swingThreshold: 10,
      numChoices: 3, // Default to 3 choices for TikTok (quick engagement)
      
      // Generation settings
      autoGenerateImages: true,
      autoGenerateTTS: true, // Enable TTS by default
      storyLanguage: 'German', // Language for story generation
      
      // TTS settings
      ttsVoiceMapping: {
        narrator: 'narrator',
        default: 'narrator'
      },
      ttsVoiceId: 'tts-1-alloy', // OpenAI TTS voice (when using system TTS)
      
      // Overlay customization
      overlayOrientation: 'landscape', // 'landscape' or 'portrait'
      overlayResolution: '1920x1080', // Common resolutions
      overlayDisplayMode: 'scroll', // 'full' (entire chapter), 'sentence' (sentence-by-sentence), or 'scroll' (Star Wars-style)
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
          this.storyEngine = new StoryEngine(this.llmService, this.logger, {
            language: config.storyLanguage || 'German',
            platform: 'tiktok'
          });
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
            this.storyEngine = new StoryEngine(this.llmService, this.logger, {
              language: config.storyLanguage || 'German',
              platform: 'tiktok'
            });
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
            const imageModel = config.imageProvider === 'openai' ? config.openaiImageModel : config.defaultImageModel;
            const style = this.imageService.getStyleForTheme ? this.imageService.getStyleForTheme(theme) : '';
            const imagePrompt = `${firstChapter.title}: ${firstChapter.content.substring(0, 200)}`;
            
            this._debugLog('info', `🖼️ Starting image generation`, { 
              provider: config.imageProvider,
              model: imageModel,
              promptLength: imagePrompt.length,
              theme
            });
            
            firstChapter.imagePath = await this.imageService.generateImage(imagePrompt, imageModel, style);
            
            this._debugLog('info', `✅ Image generated successfully`, { 
              imagePath: firstChapter.imagePath,
              model: imageModel
            });
          } catch (imageError) {
            this._debugLog('error', `❌ Image generation failed`, { 
              error: imageError.message,
              stack: imageError.stack,
              statusCode: imageError.response?.status,
              responseData: imageError.response?.data,
              provider: config.imageProvider,
              model: config.imageProvider === 'openai' ? config.openaiImageModel : config.defaultImageModel
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

        // IMPROVED FLOW: Progressive sentence-by-sentence display synchronized with TTS
        // 1. Emit chapter data to clients (overlay prepares but doesn't show yet)
        this.io.emit('story:chapter-ready', firstChapter);
        
        // 2. Start TTS which will progressively send sentences to overlay (WAIT for completion)
        await this._generateChapterTTS(firstChapter);
        
        // 3. Read the voting choices (WAIT for it to complete)
        await this._generateChoicesTTS(firstChapter.choices);
        
        // 4. NOW start voting (after ALL TTS is done)
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
            const imageModel = config.imageProvider === 'openai' ? config.openaiImageModel : config.defaultImageModel;
            const style = this.imageService.getStyleForTheme ? this.imageService.getStyleForTheme(this.currentSession.theme) : '';
            const imagePrompt = `${nextChapter.title}: ${nextChapter.content.substring(0, 200)}`;
            
            this._debugLog('info', `🖼️ Starting image generation for chapter ${chapterNumber}`, { 
              provider: config.imageProvider,
              model: imageModel,
              promptLength: imagePrompt.length
            });
            
            nextChapter.imagePath = await this.imageService.generateImage(imagePrompt, imageModel, style);
            
            this._debugLog('info', `✅ Image generated successfully for chapter ${chapterNumber}`, { 
              imagePath: nextChapter.imagePath,
              model: imageModel
            });
          } catch (imageError) {
            this._debugLog('error', `❌ Image generation failed for chapter ${chapterNumber}`, { 
              error: imageError.message,
              stack: imageError.stack,
              statusCode: imageError.response?.status,
              responseData: imageError.response?.data,
              provider: config.imageProvider,
              model: config.imageProvider === 'openai' ? config.openaiImageModel : config.defaultImageModel
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

        // IMPROVED FLOW: Progressive sentence-by-sentence display synchronized with TTS
        // 1. Emit chapter data to clients (overlay prepares but doesn't show yet)
        this.io.emit('story:chapter-ready', nextChapter);
        
        // 2. Start TTS which will progressively send sentences to overlay (WAIT for completion)
        await this._generateChapterTTS(nextChapter);
        
        // 3. Read the voting choices (WAIT for it to complete)
        await this._generateChoicesTTS(nextChapter.choices);
        
        // 4. NOW start voting (after ALL TTS is done)
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

    // Get random themes for selection
    this.api.registerRoute('get', '/api/interactive-story/random-themes', (req, res) => {
      try {
        if (!this.storyEngine) {
          return res.status(503).json({ error: 'Story engine not initialized' });
        }
        
        const count = parseInt(req.query.count) || 5;
        const themes = this.storyEngine.getRandomThemes(count);
        
        this._debugLog('info', `🎲 Generated ${themes.length} random themes`, {
          themes: themes.map(t => t.name)
        });
        
        res.json({ themes });
      } catch (error) {
        this.logger.error(`Error getting random themes: ${error.message}`);
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
        const config = this._loadConfig();
        const provider = req.body?.provider || config.llmProvider || 'openai';
        
        let apiKey;
        let providerName;
        let testModel;
        let apiUrl;
        
        // Determine which provider to test
        if (provider === 'openai') {
          apiKey = this._getOpenAIApiKey();
          providerName = 'OpenAI';
          testModel = 'gpt-3.5-turbo';
          apiUrl = 'https://api.openai.com/v1/chat/completions';
        } else {
          apiKey = this._getSiliconFlowApiKey();
          providerName = 'SiliconFlow';
          testModel = 'meta-llama/Meta-Llama-3.1-8B-Instruct';
          apiUrl = 'https://api.siliconflow.com/v1/chat/completions';
        }
        
        if (!apiKey) {
          const settingsPath = provider === 'openai' 
            ? 'Settings → OpenAI API Configuration'
            : 'Settings → TTS API Keys → Fish Speech 1.5 API Key (SiliconFlow)';
          
          return res.json({
            valid: false,
            error: `No ${providerName} API key configured`,
            message: `Please configure API key in ${settingsPath}`,
            configured: false,
            provider: providerName
          });
        }
        
        // Log validation attempt
        this._debugLog('info', `🔍 Validating ${providerName} API key...`, {
          provider: providerName,
          keyLength: apiKey.length,
          keyPrefix: apiKey.substring(0, 6) + '...'
        });
        
        // Test API key with a minimal request
        try {
          const response = await axios.post(
            apiUrl,
            {
              model: testModel,
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
          
          this._debugLog('info', `✅ ${providerName} API key validation successful`, {
            statusCode: response.status
          });
          
          res.json({
            valid: true,
            configured: true,
            provider: providerName,
            message: `${providerName} API key is valid and working!`,
            details: {
              keyLength: apiKey.length,
              keyPrefix: apiKey.substring(0, 6) + '...',
              testedModel: testModel
            }
          });
        } catch (error) {
          const statusCode = error.response?.status || 0;
          const responseData = error.response?.data || error.message;
          
          this._debugLog('error', `❌ ${providerName} API key validation failed`, {
            statusCode,
            error: responseData,
            keyLength: apiKey.length,
            keyPrefix: apiKey.substring(0, 6) + '...'
          });
          
          let message = 'API key validation failed';
          let troubleshooting = [];
          
          if (statusCode === 401) {
            message = 'API key is invalid or not authorized';
            const dashboardUrl = provider === 'openai' 
              ? 'https://platform.openai.com/api-keys'
              : 'https://cloud.siliconflow.com/';
            
            troubleshooting = [
              `Check that the API key is correct and active on ${dashboardUrl}`,
              'Make sure you copied the entire API key without extra spaces',
              'Verify the API key hasn\'t expired',
              `Check that you have credits/quota available on ${providerName}`,
              `Try generating a new API key on ${providerName} dashboard`
            ];
          } else if (statusCode === 429) {
            message = 'Rate limit exceeded or quota exhausted';
            troubleshooting = [
              `Check your API usage quota on ${providerName} dashboard`,
              'Wait a few minutes and try again',
              'Consider upgrading your plan if needed'
            ];
          } else if (statusCode === 0) {
            message = `Network error - cannot reach ${providerName} API`;
            const apiDomain = provider === 'openai' ? 'api.openai.com' : 'api.siliconflow.com';
            troubleshooting = [
              'Check your internet connection',
              `Verify that ${apiDomain} is accessible`,
              'Check firewall/proxy settings'
            ];
          }
          
          res.json({
            valid: false,
            configured: true,
            provider: providerName,
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
        
        // NEW FLOW: TTS first (for admin choice path - no voting after)
        // Read the chapter (WAIT for it to complete)
        await this._generateChapterTTS(nextChapter);
        
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
