/**
 * HUD Manager for GCCE
 * 
 * Integrated HUD overlay management system with enhancements from Phase 1-3:
 * - Token bucket rate limiting (Phase 1)
 * - Advanced permission system (Phase 2)
 * - Audit logging (Phase 3)
 * - User data caching (Phase 1)
 * - Socket event batching (Phase 3)
 * 
 * Replaces standalone gcce-hud plugin with better integration and performance.
 */

class HUDManager {
  constructor(api, rateLimiter, permissionSystem, auditLog, userCache, socketBatcher) {
    this.api = api;
    this.rateLimiter = rateLimiter;
    this.permissionSystem = permissionSystem;
    this.auditLog = auditLog;
    this.userCache = userCache;
    this.socketBatcher = socketBatcher;
    this.io = api.getSocketIO();

    // Active HUD elements
    this.activeElements = new Map();
    this.elementIdCounter = 0;

    // Statistics
    this.stats = {
      totalDisplayed: 0,
      byPosition: {},
      byType: {},
      totalDuration: 0
    };

    // Default configuration
    this.config = {
      enabled: true,
      chatCommands: {
        enabled: true,
        allowText: true,
        allowImages: true
      },
      defaults: {
        textDuration: 10,
        imageDuration: 10,
        maxDuration: 60,
        minDuration: 3,
        fontSize: 48,
        fontFamily: 'Arial, sans-serif',
        textColor: '#FFFFFF',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        position: 'top-center',
        maxWidth: 800,
        imageMaxWidth: 400,
        imageMaxHeight: 400
      },
      permissions: {
        text: 'all',
        image: 'subscriber',
        clear: 'moderator'
      }
    };
  }

  /**
   * Initialize HUD Manager
   */
  async init() {
    await this.loadConfig();
    this.startCleanupTimer();
    this.api.log('[HUD] HUD Manager initialized', 'info');
  }

  /**
   * Load configuration from database
   */
  async loadConfig() {
    try {
      const savedConfig = await this.api.getConfig('hud_config');
      if (savedConfig) {
        this.config = { ...this.config, ...savedConfig };
      }
      await this.api.setConfig('hud_config', this.config);
    } catch (error) {
      this.api.log(`[HUD] Error loading config: ${error.message}`, 'error');
    }
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return this.config;
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    await this.api.setConfig('hud_config', this.config);
    return this.config;
  }

  /**
   * Handle text display command
   */
  async handleTextCommand(args, context) {
    try {
      if (!this.config.enabled || !this.config.chatCommands.allowText) {
        return { success: false, error: 'HUD text display is disabled' };
      }

      // Permission check
      const hasPermission = await this.permissionSystem.checkPermission(
        context.userId,
        'gcce.hud.text',
        this.config.permissions.text
      );

      if (!hasPermission) {
        return { success: false, error: 'Insufficient permissions' };
      }

      // Rate limiting
      const rateLimitResult = this.rateLimiter.tryConsume(context.userId, 1);
      if (!rateLimitResult.allowed) {
        return {
          success: false,
          error: `Rate limit exceeded. Retry in ${rateLimitResult.retryAfter}s`
        };
      }

      // Parse duration and text
      let duration = this.config.defaults.textDuration;
      let text = args.join(' ');

      const firstArg = parseFloat(args[0]);
      if (!isNaN(firstArg) && args.length > 1) {
        duration = Math.max(
          this.config.defaults.minDuration,
          Math.min(this.config.defaults.maxDuration, firstArg)
        );
        text = args.slice(1).join(' ');
      }

      // Sanitize text
      text = this.sanitizeText(text);

      if (!text || text.length === 0) {
        return { success: false, error: 'Text cannot be empty' };
      }

      if (text.length > 200) {
        text = text.substring(0, 200) + '...';
      }

      // Create HUD element
      const elementId = this.createTextElement(text, duration, context);

      // Audit log
      if (this.auditLog) {
        this.auditLog.logCommand(context.userId, 'hudtext', args, {
          elementId,
          duration,
          textLength: text.length
        });
      }

      return {
        success: true,
        message: `Text displayed for ${duration} seconds`,
        data: { elementId, duration }
      };

    } catch (error) {
      this.api.log(`[HUD] Error in hudtext command: ${error.message}`, 'error');
      return { success: false, error: 'Failed to display text' };
    }
  }

  /**
   * Handle image display command
   */
  async handleImageCommand(args, context) {
    try {
      if (!this.config.enabled || !this.config.chatCommands.allowImages) {
        return { success: false, error: 'HUD image display is disabled' };
      }

      // Permission check
      const hasPermission = await this.permissionSystem.checkPermission(
        context.userId,
        'gcce.hud.image',
        this.config.permissions.image
      );

      if (!hasPermission) {
        return { success: false, error: 'Insufficient permissions' };
      }

      // Rate limiting
      const rateLimitResult = this.rateLimiter.tryConsume(context.userId, 1);
      if (!rateLimitResult.allowed) {
        return {
          success: false,
          error: `Rate limit exceeded. Retry in ${rateLimitResult.retryAfter}s`
        };
      }

      // Parse duration and URL
      let duration = this.config.defaults.imageDuration;
      let imageUrl = args.join(' ');

      const firstArg = parseFloat(args[0]);
      if (!isNaN(firstArg) && args.length > 1) {
        duration = Math.max(
          this.config.defaults.minDuration,
          Math.min(this.config.defaults.maxDuration, firstArg)
        );
        imageUrl = args.slice(1).join(' ');
      }

      // Validate URL
      if (!this.isValidImageUrl(imageUrl)) {
        return { success: false, error: 'Invalid image URL' };
      }

      // Create HUD element
      const elementId = this.createImageElement(imageUrl, duration, context);

      // Audit log
      if (this.auditLog) {
        this.auditLog.logCommand(context.userId, 'hudimage', args, {
          elementId,
          duration,
          url: imageUrl
        });
      }

      return {
        success: true,
        message: `Image displayed for ${duration} seconds`,
        data: { elementId, duration }
      };

    } catch (error) {
      this.api.log(`[HUD] Error in hudimage command: ${error.message}`, 'error');
      return { success: false, error: 'Failed to display image' };
    }
  }

  /**
   * Handle clear command
   */
  async handleClearCommand(args, context) {
    try {
      // Permission check
      const hasPermission = await this.permissionSystem.checkPermission(
        context.userId,
        'gcce.hud.clear',
        this.config.permissions.clear
      );

      if (!hasPermission) {
        return { success: false, error: 'Insufficient permissions' };
      }

      const count = this.activeElements.size;
      this.clearAllElements();

      // Audit log
      if (this.auditLog) {
        this.auditLog.logCommand(context.userId, 'hudclear', args, {
          elementsCleared: count
        });
      }

      return {
        success: true,
        message: `Cleared ${count} HUD element(s)`
      };

    } catch (error) {
      this.api.log(`[HUD] Error in hudclear command: ${error.message}`, 'error');
      return { success: false, error: 'Failed to clear HUD' };
    }
  }

  /**
   * Create text HUD element
   */
  createTextElement(text, duration, context) {
    const elementId = `text-${++this.elementIdCounter}`;
    const element = {
      id: elementId,
      type: 'text',
      content: text,
      username: context.username,
      userId: context.userId,
      timestamp: Date.now(),
      duration: duration * 1000,
      expiresAt: Date.now() + (duration * 1000),
      style: {
        fontSize: this.config.defaults.fontSize,
        fontFamily: this.config.defaults.fontFamily,
        textColor: this.config.defaults.textColor,
        backgroundColor: this.config.defaults.backgroundColor,
        position: this.config.defaults.position,
        maxWidth: this.config.defaults.maxWidth
      }
    };

    this.activeElements.set(elementId, element);
    this.updateStats('text', this.config.defaults.position, duration);
    this.broadcastElement(element);

    return elementId;
  }

  /**
   * Create image HUD element
   */
  createImageElement(imageUrl, duration, context) {
    const elementId = `image-${++this.elementIdCounter}`;
    const element = {
      id: elementId,
      type: 'image',
      content: imageUrl,
      username: context.username,
      userId: context.userId,
      timestamp: Date.now(),
      duration: duration * 1000,
      expiresAt: Date.now() + (duration * 1000),
      style: {
        position: this.config.defaults.position,
        maxWidth: this.config.defaults.imageMaxWidth,
        maxHeight: this.config.defaults.imageMaxHeight
      }
    };

    this.activeElements.set(elementId, element);
    this.updateStats('image', this.config.defaults.position, duration);
    this.broadcastElement(element);

    return elementId;
  }

  /**
   * Broadcast HUD element to overlays
   */
  broadcastElement(element) {
    if (this.io) {
      if (this.socketBatcher) {
        this.socketBatcher.emit('gcce:hud:show', element);
      } else {
        this.io.emit('gcce:hud:show', element);
      }
    }
  }

  /**
   * Clear all HUD elements
   */
  clearAllElements() {
    this.activeElements.clear();
    if (this.io) {
      if (this.socketBatcher) {
        this.socketBatcher.emit('gcce:hud:clear', {});
      } else {
        this.io.emit('gcce:hud:clear');
      }
    }
  }

  /**
   * Remove specific HUD element
   */
  removeElement(elementId) {
    const removed = this.activeElements.delete(elementId);
    if (removed && this.io) {
      if (this.socketBatcher) {
        this.socketBatcher.emit('gcce:hud:remove', { id: elementId });
      } else {
        this.io.emit('gcce:hud:remove', { id: elementId });
      }
    }
    return removed;
  }

  /**
   * Get active elements
   */
  getActiveElements() {
    return Array.from(this.activeElements.values());
  }

  /**
   * Get statistics
   */
  getStats() {
    const mostUsedPosition = Object.entries(this.stats.byPosition)
      .sort((a, b) => b[1] - a[1])[0];

    return {
      totalDisplayed: this.stats.totalDisplayed,
      activeCount: this.activeElements.size,
      mostUsedPosition: mostUsedPosition ? mostUsedPosition[0] : 'none',
      averageDuration: this.stats.totalDisplayed > 0
        ? Math.round(this.stats.totalDuration / this.stats.totalDisplayed)
        : 0,
      byType: this.stats.byType,
      byPosition: this.stats.byPosition
    };
  }

  /**
   * Update statistics
   */
  updateStats(type, position, duration) {
    this.stats.totalDisplayed++;
    this.stats.totalDuration += duration;

    this.stats.byType[type] = (this.stats.byType[type] || 0) + 1;
    this.stats.byPosition[position] = (this.stats.byPosition[position] || 0) + 1;
  }

  /**
   * Sanitize text input
   */
  sanitizeText(text) {
    return text.replace(/<[^>]*>/g, '').trim();
  }

  /**
   * Validate image URL
   */
  isValidImageUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Start cleanup timer for expired elements
   */
  startCleanupTimer() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [id, element] of this.activeElements.entries()) {
        if (now >= element.expiresAt) {
          this.activeElements.delete(id);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.api.log(`[HUD] Cleaned up ${cleaned} expired element(s)`, 'debug');
      }
    }, 5000);
  }

  /**
   * Cleanup and destroy
   */
  async destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clearAllElements();
    this.api.log('[HUD] HUD Manager destroyed', 'info');
  }
}

module.exports = HUDManager;
