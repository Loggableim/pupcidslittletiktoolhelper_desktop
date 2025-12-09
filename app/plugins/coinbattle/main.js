/**
 * CoinBattle Plugin - Main Entry Point
 * Live battle game where viewers compete by sending TikTok gifts
 */

const CoinBattleDatabase = require('./backend/database');
const CoinBattleEngine = require('./engine/game-engine');
const path = require('path');

class CoinBattlePlugin {
  constructor(api) {
    this.api = api;
    this.io = api.getSocketIO();
    this.db = null;
    this.engine = null;
    this.logger = {
      info: (msg) => this.api.log(msg, 'info'),
      error: (msg) => this.api.log(msg, 'error'),
      warn: (msg) => this.api.log(msg, 'warn')
    };
  }

  async init() {
    this.api.log('Initializing CoinBattle Plugin...', 'info');

    try {
      // Initialize database
      const mainDb = this.api.getDatabase();
      this.db = new CoinBattleDatabase(mainDb, this.logger);
      this.db.initializeTables();

      // Initialize game engine
      this.engine = new CoinBattleEngine(this.db, this.io, this.logger);

      // Load configuration
      const config = this.loadConfiguration();
      this.engine.loadConfig(config);

      // Register routes
      this.registerRoutes();

      // Register socket events
      this.registerSocketEvents();

      // Register TikTok events
      this.registerTikTokEvents();

      this.api.log('✅ CoinBattle Plugin initialized successfully', 'info');
    } catch (error) {
      this.api.log(`Failed to initialize CoinBattle: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Load plugin configuration from database
   */
  loadConfiguration() {
    const defaultConfig = {
      matchDuration: 300,
      autoStart: false,
      autoReset: true,
      autoExtension: true,
      extensionThreshold: 15,
      extensionDuration: 60,
      mode: 'solo',
      teamAssignment: 'random',
      enableMultipliers: true,
      enableOfflineSimulation: false,
      theme: 'dark',
      skin: 'gold',
      layout: 'fullscreen',
      language: 'de',
      font: 'default',
      fontSize: 16,
      showAvatars: true,
      showBadges: true,
      animationSpeed: 'normal',
      toasterMode: false
    };

    const savedConfig = this.api.getConfig('coinbattle_config');
    return { ...defaultConfig, ...(savedConfig || {}) };
  }

  /**
   * Save plugin configuration
   */
  saveConfiguration(config) {
    this.api.setConfig('coinbattle_config', config);
    this.engine.loadConfig(config);
  }

  /**
   * Register API routes with rate limiting and CSP headers
   */
  registerRoutes() {
    // Rate limiter configurations
    const strictLimiter = {
      windowMs: 60 * 1000, // 1 minute
      max: 10, // 10 requests per minute
      message: { success: false, error: 'Too many requests, please try again later.' }
    };

    const moderateLimiter = {
      windowMs: 60 * 1000,
      max: 30,
      message: { success: false, error: 'Rate limit exceeded.' }
    };

    const relaxedLimiter = {
      windowMs: 60 * 1000,
      max: 100,
      message: { success: false, error: 'Too many requests.' }
    };

    // Helper to create rate limiter middleware
    const createLimiter = (config) => {
      const requests = new Map();
      return (req, res, next) => {
        const key = req.ip || req.connection.remoteAddress || 'unknown';
        const now = Date.now();
        
        if (!requests.has(key)) {
          requests.set(key, []);
        }
        
        const userRequests = requests.get(key);
        const recentRequests = userRequests.filter(time => now - time < config.windowMs);
        
        if (recentRequests.length >= config.max) {
          this.logger.warn(`Rate limit exceeded for ${key} on ${req.path}`);
          return res.status(429).json(config.message);
        }
        
        recentRequests.push(now);
        requests.set(key, recentRequests);
        
        // Cleanup old entries periodically (1% chance per request)
        if (Math.random() < 0.01) {
          for (const [k, v] of requests.entries()) {
            const filtered = v.filter(time => now - time < config.windowMs);
            if (filtered.length === 0) {
              requests.delete(k);
            } else {
              requests.set(k, filtered);
            }
          }
        }
        
        next();
      };
    };

    // CSP middleware for overlay and UI routes
    const cspMiddleware = (req, res, next) => {
      res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://cdn.socket.io; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "connect-src 'self' ws: wss:; " +
        "font-src 'self'; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self';"
      );
      next();
    };

    // Helper to wrap handler with rate limiting
    const withRateLimit = (limiter, handler) => {
      return async (req, res) => {
        // Apply rate limiting logic inline
        const key = req.ip || req.connection.remoteAddress || 'unknown';
        const now = Date.now();
        
        if (!limiter.requests) {
          limiter.requests = new Map();
        }
        
        if (!limiter.requests.has(key)) {
          limiter.requests.set(key, []);
        }
        
        const userRequests = limiter.requests.get(key);
        const recentRequests = userRequests.filter(time => now - time < limiter.windowMs);
        
        if (recentRequests.length >= limiter.max) {
          this.logger.warn(`Rate limit exceeded for ${key} on ${req.path}`);
          return res.status(429).json(limiter.message);
        }
        
        recentRequests.push(now);
        limiter.requests.set(key, recentRequests);
        
        // Execute the actual handler
        return handler(req, res);
      };
    };

    // Create rate limiters
    const strictLimit = strictLimiter;
    const moderateLimit = moderateLimiter;
    const relaxedLimit = relaxedLimiter;

    // Get current match state (relaxed - read-only)
    this.api.registerRoute('GET', '/api/plugins/coinbattle/state', (req, res) => {
      try {
        const state = this.engine.getMatchState();
        res.json({ success: true, data: state });
      } catch (error) {
        this.api.log(`Error getting match state: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Start match (strict rate limiting - prevent spam)
    this.api.registerRoute('POST', '/api/plugins/coinbattle/match/start', 
      withRateLimit(strictLimit, (req, res) => {
        try {
          const { mode, duration } = req.body;
          const match = this.engine.startMatch(mode, duration);
          res.json({ success: true, data: match });
        } catch (error) {
          this.api.log(`Error starting match: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // End match (strict rate limiting)
    this.api.registerRoute('POST', '/api/plugins/coinbattle/match/end', 
      withRateLimit(strictLimit, (req, res) => {
        try {
          const result = this.engine.endMatch();
          res.json({ success: true, data: result });
        } catch (error) {
          this.api.log(`Error ending match: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Pause match (strict rate limiting)
    this.api.registerRoute('POST', '/api/plugins/coinbattle/match/pause', 
      withRateLimit(strictLimit, (req, res) => {
        try {
          const success = this.engine.pauseMatch();
          res.json({ success });
        } catch (error) {
          this.api.log(`Error pausing match: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Resume match (strict rate limiting)
    this.api.registerRoute('POST', '/api/plugins/coinbattle/match/resume', 
      withRateLimit(strictLimit, (req, res) => {
        try {
          const success = this.engine.resumeMatch();
          res.json({ success });
        } catch (error) {
          this.api.log(`Error resuming match: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Extend match (strict rate limiting)
    this.api.registerRoute('POST', '/api/plugins/coinbattle/match/extend', 
      withRateLimit(strictLimit, (req, res) => {
        try {
          const { seconds } = req.body;
          const success = this.engine.extendMatch(seconds || 60);
          res.json({ success });
        } catch (error) {
          this.api.log(`Error extending match: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Activate multiplier (strict rate limiting - prevent coin inflation)
    this.api.registerRoute('POST', '/api/plugins/coinbattle/multiplier/activate', 
      withRateLimit(strictLimit, (req, res) => {
        try {
          const { multiplier, duration, activatedBy } = req.body;
          const success = this.engine.activateMultiplier(
            multiplier || 2.0,
            duration || 30,
          activatedBy
        );
        res.json({ success });
      } catch (error) {
        this.api.log(`Error activating multiplier: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    })
    );

    // Get lifetime leaderboard (relaxed)
    this.api.registerRoute('GET', '/api/plugins/coinbattle/leaderboard/lifetime', (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 10;
        const leaderboard = this.db.getLifetimeLeaderboard(limit);
        res.json({ success: true, data: leaderboard });
      } catch (error) {
        this.api.log(`Error getting lifetime leaderboard: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get match history (relaxed)
    this.api.registerRoute('GET', '/api/plugins/coinbattle/history', (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        const history = this.db.getMatchHistory(limit, offset);
        res.json({ success: true, data: history });
      } catch (error) {
        this.api.log(`Error getting match history: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get player stats (relaxed)
    this.api.registerRoute('GET', '/api/plugins/coinbattle/player/:userId', (req, res) => {
      try {
        const { userId } = req.params;
        const stats = this.db.getPlayerStats(userId);
        const badges = stats ? this.db.getPlayerBadges(stats.id) : [];
        res.json({ success: true, data: { ...stats, badges } });
      } catch (error) {
        this.api.log(`Error getting player stats: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get configuration (relaxed)
    this.api.registerRoute('GET', '/api/plugins/coinbattle/config', (req, res) => {
      try {
        const config = this.loadConfiguration();
        res.json({ success: true, data: config });
      } catch (error) {
        this.api.log(`Error getting config: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Update configuration (moderate rate limiting)
    this.api.registerRoute('POST', '/api/plugins/coinbattle/config', 
      withRateLimit(moderateLimit, (req, res) => {
        try {
          const config = req.body;
          this.saveConfiguration(config);
          res.json({ success: true, data: config });
        } catch (error) {
          this.api.log(`Error updating config: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Start offline simulation (moderate rate limiting)
    this.api.registerRoute('POST', '/api/plugins/coinbattle/simulation/start', 
      withRateLimit(moderateLimit, (req, res) => {
        try {
          this.engine.startSimulation();
          res.json({ success: true });
        } catch (error) {
          this.api.log(`Error starting simulation: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Stop offline simulation (moderate rate limiting)
    this.api.registerRoute('POST', '/api/plugins/coinbattle/simulation/stop', 
      withRateLimit(moderateLimit, (req, res) => {
        try {
          this.engine.stopSimulation();
          res.json({ success: true });
        } catch (error) {
          this.api.log(`Error stopping simulation: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Export match data (relaxed)
    this.api.registerRoute('GET', '/api/plugins/coinbattle/export/:matchId', (req, res) => {
      try {
        const { matchId } = req.params;
        const match = this.db.db.prepare('SELECT * FROM coinbattle_matches WHERE id = ?').get(matchId);
        const participants = this.db.getMatchLeaderboard(matchId, 100);
        const gifts = this.db.db.prepare(`
          SELECT * FROM coinbattle_gift_events WHERE match_id = ?
        `).all(matchId);

        res.json({
          success: true,
          data: {
            match,
            participants,
            gifts
          }
        });
      } catch (error) {
        this.api.log(`Error exporting match: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Serve overlay with CSP headers
    this.api.registerRoute('GET', '/plugins/coinbattle/overlay', (req, res) => {
      // Apply CSP headers for XSS protection
      res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://cdn.socket.io; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "connect-src 'self' ws: wss:; " +
        "font-src 'self'; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self';"
      );
      res.sendFile(path.join(__dirname, 'overlay', 'overlay.html'));
    });

    this.api.log('CoinBattle routes registered with rate limiting and CSP', 'info');
  }

  /**
   * Register socket events
   */
  registerSocketEvents() {
    // Client requests current state
    this.api.registerSocket('coinbattle:get-state', (socket) => {
      const state = this.engine.getMatchState();
      socket.emit('coinbattle:match-state', state);
    });

    // Client requests leaderboard update
    this.api.registerSocket('coinbattle:get-leaderboard', () => {
      this.engine.emitLeaderboard();
    });

    // Manual team assignment
    this.api.registerSocket('coinbattle:assign-team', (socket, data) => {
      try {
        const { userId, team } = data;
        if (this.engine.currentMatch) {
          // Update team in database
          this.db.db.prepare(`
            UPDATE coinbattle_match_participants
            SET team = ?
            WHERE match_id = ? AND user_id = ?
          `).run(team, this.engine.currentMatch.id, userId);

          this.engine.emitLeaderboard();
          socket.emit('coinbattle:team-assigned', { userId, team });
        }
      } catch (error) {
        this.api.log(`Error assigning team: ${error.message}`, 'error');
      }
    });

    this.api.log('CoinBattle socket events registered', 'info');
  }

  /**
   * Register TikTok event handlers
   */
  registerTikTokEvents() {
    // Gift received
    this.api.registerTikTokEvent('gift', (data) => {
      try {
        const giftData = {
          giftId: data.giftId,
          giftName: data.giftName,
          diamondCount: data.diamondCount || data.giftValue || 1,
          coins: data.diamondCount || data.giftValue || 1
        };

        const userData = {
          userId: data.userId,
          uniqueId: data.uniqueId,
          nickname: data.nickname,
          profilePictureUrl: data.profilePictureUrl
        };

        this.engine.processGift(giftData, userData);
      } catch (error) {
        this.api.log(`Error processing gift: ${error.message}`, 'error');
      }
    });

    // User joined (for team assignment)
    this.api.registerTikTokEvent('join', (data) => {
      try {
        if (this.engine.currentMatch && this.engine.currentMatch.mode === 'team') {
          const userData = {
            userId: data.userId,
            uniqueId: data.uniqueId,
            nickname: data.nickname,
            profilePictureUrl: data.profilePictureUrl
          };

          const player = this.db.getOrCreatePlayer(userData);
          
          // Don't auto-assign team on join, wait for first gift
          this.api.log(`User joined: ${data.nickname}`, 'info');
        }
      } catch (error) {
        this.api.log(`Error handling user join: ${error.message}`, 'error');
      }
    });

    // Like event (optional - could be used for bonus points)
    this.api.registerTikTokEvent('like', (data) => {
      // Optional: implement like-based bonuses
    });

    this.api.log('CoinBattle TikTok events registered', 'info');
  }

  /**
   * Cleanup on plugin destroy
   */
  async destroy() {
    this.api.log('Destroying CoinBattle Plugin...', 'info');
    
    if (this.engine) {
      this.engine.destroy();
    }

    this.api.log('✅ CoinBattle Plugin destroyed', 'info');
  }
}

module.exports = CoinBattlePlugin;
