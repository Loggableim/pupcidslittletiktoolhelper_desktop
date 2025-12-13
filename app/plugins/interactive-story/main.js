const path = require('path');
const fs = require('fs');

// Engines
const LLMService = require('./engines/llm-service');
const ImageService = require('./engines/image-service');
const TTSService = require('./engines/tts-service');
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

      // Get SiliconFlow API key from global settings
      const apiKey = this._getSiliconFlowApiKey();
      
      // DEBUG: Log exact API key details for troubleshooting
      if (apiKey) {
        this.logger.info(`[DEBUG] API Key retrieved from database: length=${apiKey.length}, prefix="${apiKey.substring(0, 10)}...", hasWhitespace=${/\s/.test(apiKey)}`);
      } else {
        this.logger.warn('[DEBUG] No API key found in database');
      }

      // Initialize services
      if (apiKey) {
        // Create debug callback that respects debugLogging config
        const debugCallback = (level, message, data) => this._debugLog(level, message, data);
        
        this.llmService = new LLMService(apiKey, this.logger, debugCallback);
        this.imageService = new ImageService(apiKey, this.logger, this.imageCacheDir);
        this.ttsService = new TTSService(apiKey, this.logger, this.audioCacheDir);
        this.storyEngine = new StoryEngine(this.llmService, this.logger);
        
        this._debugLog('info', '✅ SiliconFlow services initialized', { 
          apiKeyLength: apiKey.length,
          apiKeyPrefix: apiKey.substring(0, 6) + '...'
        });
        this.api.log('✅ SiliconFlow services initialized', 'info');
      } else {
        this._debugLog('error', '⚠️ SiliconFlow API key not configured in global settings', null);
        this.api.log('⚠️ SiliconFlow API key not configured in global settings', 'warn');
        this.api.log('Please configure API key in Settings → TTS API Keys → Fish Speech 1.5 API Key (SiliconFlow)', 'warn');
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
      if (this.imageService) {
        this.imageService.cleanOldCache(7);
      }
      if (this.ttsService) {
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
   * Load plugin configuration
   */
  _loadConfig() {
    const defaultConfig = {
      defaultModel: 'deepseek',
      defaultImageModel: 'flux-schnell',
      votingDuration: 60,
      minVotes: 5,
      useMinSwing: false,
      swingThreshold: 10,
      numChoices: 4,
      autoGenerateImages: true,
      autoGenerateTTS: false,
      ttsVoiceMapping: {
        narrator: 'narrator',
        default: 'narrator'
      },
      offlineMode: false,
      debugLogging: false,
      apiLogging: false
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
        
        // Reinitialize services if API key changed
        if (config.siliconFlowApiKey && config.siliconFlowApiKey !== '***configured***') {
          this.llmService = new LLMService(config.siliconFlowApiKey, this.logger);
          this.imageService = new ImageService(config.siliconFlowApiKey, this.logger, this.imageCacheDir);
          this.ttsService = new TTSService(config.siliconFlowApiKey, this.logger, this.audioCacheDir);
          this.storyEngine = new StoryEngine(this.llmService, this.logger);
        } else if (!this.storyEngine) {
          // If services not initialized, check for API key in database
          const apiKey = this._getSiliconFlowApiKey();
          if (apiKey) {
            const debugCallback = (level, message, data) => this._debugLog(level, message, data);
            this.llmService = new LLMService(apiKey, this.logger, debugCallback);
            this.imageService = new ImageService(apiKey, this.logger, this.imageCacheDir);
            this.ttsService = new TTSService(apiKey, this.logger, this.audioCacheDir);
            this.storyEngine = new StoryEngine(this.llmService, this.logger);
            this._debugLog('info', '✅ SiliconFlow services initialized from database API key', { 
              apiKeyLength: apiKey.length,
              apiKeyPrefix: apiKey.substring(0, 6) + '...'
            });
          }
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
          const style = this.imageService.getStyleForTheme(theme);
          const imagePrompt = `${firstChapter.title}: ${firstChapter.content.substring(0, 200)}`;
          firstChapter.imagePath = await this.imageService.generateImage(imagePrompt, config.defaultImageModel, style);
        }

        // Save chapter
        this.db.saveChapter(sessionId, firstChapter);
        this.currentChapter = firstChapter;

        this.isGenerating = false;

        // Emit chapter to clients
        this.io.emit('story:chapter-ready', firstChapter);

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
          const style = this.imageService.getStyleForTheme(this.currentSession.theme);
          const imagePrompt = `${nextChapter.title}: ${nextChapter.content.substring(0, 200)}`;
          nextChapter.imagePath = await this.imageService.generateImage(imagePrompt, config.defaultImageModel, style);
        }

        // Save chapter
        this.db.saveChapter(this.currentSession.id, nextChapter);
        this.currentChapter = nextChapter;

        this.isGenerating = false;

        // Emit chapter
        this.io.emit('story:chapter-ready', nextChapter);

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
          const style = this.imageService.getStyleForTheme(this.currentSession.theme);
          const imagePrompt = `${nextChapter.title}: ${nextChapter.content.substring(0, 200)}`;
          nextChapter.imagePath = await this.imageService.generateImage(imagePrompt, config.defaultImageModel, style);
        }
        
        // Save chapter with admin choice
        this.db.saveChapter(this.currentSession.id, nextChapter);
        this.db.saveVote(this.currentSession.id, this.currentChapter.chapterNumber, choiceIndex, 1);
        this.currentChapter = nextChapter;
        
        this.isGenerating = false;
        
        // Emit chapter
        this.io.emit('story:chapter-ready', nextChapter);
        
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
