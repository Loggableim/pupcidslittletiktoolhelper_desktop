/**
 * Global Chat Command Engine (GCCE) - Main Plugin
 * 
 * Universal chat command interpreter and framework.
 * Provides command registration, parsing, validation, permission checking,
 * and execution routing for all plugins.
 */

const path = require('path');
const CommandRegistry = require('./commandRegistry');
const CommandParser = require('./commandParser');
const PermissionChecker = require('./permissionChecker');
const UserDataCache = require('./utils/UserDataCache');
const CommandMacroManager = require('./utils/CommandMacroManager');
const CommandHistoryManager = require('./utils/CommandHistoryManager');
const CommandScheduler = require('./utils/CommandScheduler');
const AdvancedPermissionSystem = require('./utils/AdvancedPermissionSystem');
const CommandCategoryManager = require('./utils/CommandCategoryManager');
const CommandAutoCompleteEngine = require('./utils/CommandAutoCompleteEngine');
const config = require('./config');

class GlobalChatCommandEngine {
    constructor(api) {
        this.api = api;
        this.pluginDir = api.pluginDir;
        
        // Core components
        this.registry = null;
        this.parser = null;
        this.permissionChecker = null;
        
        // P5: User Data Cache (80-90% fewer DB queries)
        this.userDataCache = null;
        
        // F5: Command Macro Manager
        this.macroManager = null;
        
        // F3: Command History Manager
        this.historyManager = null;
        
        // F7: Command Scheduler
        this.scheduler = null;
        
        // V1: Advanced Permission System
        this.advancedPermissions = null;
        
        // V3: Command Category Manager
        this.categoryManager = null;
        
        // F11: Auto-Complete Engine
        this.autoComplete = null;
        
        // Plugin configuration
        this.pluginConfig = null;
        
        // Built-in commands
        this.builtInCommands = [];
    }

    /**
     * Initialize the GCCE plugin
     */
    async init() {
        this.api.log('🎯 [GCCE] Initializing Global Chat Command Engine...', 'info');

        try {
            // Load configuration
            await this.loadConfiguration();

            // Create logger wrapper for compatibility
            const logger = {
                info: (msg) => this.api.log(msg, 'info'),
                warn: (msg) => this.api.log(msg, 'warn'),
                error: (msg) => this.api.log(msg, 'error'),
                debug: (msg) => this.api.log(msg, 'debug')
            };

            // Initialize core components
            this.permissionChecker = new PermissionChecker(this.api);
            this.registry = new CommandRegistry(logger);
            this.parser = new CommandParser(this.registry, this.permissionChecker, this.api);
            
            // P5: Initialize User Data Cache
            this.userDataCache = new UserDataCache(300000, 1000); // 5 min TTL, max 1000 users
            
            // Phase 2: Game Changers
            this.macroManager = new CommandMacroManager(this.registry, this.parser);
            this.historyManager = new CommandHistoryManager(100);
            this.scheduler = new CommandScheduler(this.parser);
            this.advancedPermissions = new AdvancedPermissionSystem();
            this.categoryManager = new CommandCategoryManager();
            this.autoComplete = new CommandAutoCompleteEngine(this.registry);

            // Register built-in commands
            this.registerBuiltInCommands();

            // Register TikTok event handlers
            this.registerTikTokEvents();

            // Register routes
            this.registerRoutes();

            // Register Socket.io events
            this.registerSocketEvents();

            // Start cleanup timer
            this.startCleanupTimer();

            // Try to integrate with StreamAlchemy if it exists
            this.integrateWithStreamAlchemy();
            
            // Emit ready event for plugins that may be waiting
            this.api.emit('gcce:ready', { timestamp: Date.now() });

            this.api.log('✅ [GCCE] Global Chat Command Engine initialized successfully', 'info');
        } catch (error) {
            this.api.log(`❌ [GCCE] Initialization failed: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Load plugin configuration
     */
    async loadConfiguration() {
        try {
            this.pluginConfig = await this.api.getConfig('gcce_config') || {};
            
            // Apply defaults
            this.pluginConfig = {
                enabled: true,
                enableBuiltInCommands: true,
                enableOverlayMessages: true,
                enableHelpCommand: true,
                commandPrefix: config.COMMAND_PREFIX,
                ...this.pluginConfig
            };

            await this.api.setConfig('gcce_config', this.pluginConfig);
        } catch (error) {
            this.api.log(`[GCCE] Config load error: ${error.message}`, 'error');
            this.pluginConfig = { enabled: true };
        }
    }

    /**
     * Register built-in commands
     */
    registerBuiltInCommands() {
        if (!this.pluginConfig.enableBuiltInCommands) {
            return;
        }

        // Help command
        if (this.pluginConfig.enableHelpCommand) {
            this.registry.registerCommand({
                pluginId: 'gcce',
                name: 'help',
                description: 'Show available commands or help for a specific command',
                syntax: '/help [command]',
                permission: 'all',
                enabled: true,
                minArgs: 0,
                maxArgs: 1,
                category: 'System',
                handler: async (args, context) => await this.handleHelpCommand(args, context)
            });
        }

        // Commands command - list all commands
        this.registry.registerCommand({
            pluginId: 'gcce',
            name: 'commands',
            description: 'List all available commands',
            syntax: '/commands',
            permission: 'all',
            enabled: true,
            minArgs: 0,
            maxArgs: 0,
            category: 'System',
            handler: async (args, context) => await this.handleCommandsCommand(args, context)
        });

        this.api.log('[GCCE] Built-in commands registered', 'debug');
    }

    /**
     * Register TikTok event handlers
     */
    registerTikTokEvents() {
        // Handle chat messages
        this.api.registerTikTokEvent('chat', async (data) => {
            await this.handleChatMessage(data);
        });

        this.api.log('[GCCE] TikTok events registered', 'debug');
    }

    /**
     * Register Express routes
     */
    registerRoutes() {
        // Serve UI HTML
        this.api.registerRoute('GET', '/gcce/ui', (req, res) => {
            try {
                res.sendFile(path.join(this.pluginDir, 'ui.html'));
            } catch (error) {
                this.api.log(`[GCCE] Error serving UI: ${error.message}`, 'error');
                res.status(500).send('Error loading UI');
            }
        });

        // Serve overlay HTML
        this.api.registerRoute('GET', '/gcce/overlay', (req, res) => {
            res.sendFile(path.join(this.pluginDir, 'overlay.html'));
        });

        // Serve CSS
        this.api.registerRoute('GET', '/gcce/style.css', (req, res) => {
            res.sendFile(path.join(this.pluginDir, 'style.css'));
        });

        // API: Get all registered commands
        this.api.registerRoute('GET', '/api/gcce/commands', async (req, res) => {
            const commands = this.registry.getAllCommands();
            res.json({
                success: true,
                commands: commands.map(cmd => ({
                    name: cmd.name,
                    description: cmd.description,
                    syntax: cmd.syntax,
                    permission: cmd.permission,
                    enabled: cmd.enabled,
                    plugin: cmd.pluginId,
                    category: cmd.category
                }))
            });
        });

        // API: Get commands for specific plugin
        this.api.registerRoute('GET', '/api/gcce/commands/:pluginId', async (req, res) => {
            const commands = this.registry.getPluginCommands(req.params.pluginId);
            res.json({
                success: true,
                pluginId: req.params.pluginId,
                commands
            });
        });

        // API: Get statistics
        this.api.registerRoute('GET', '/api/gcce/stats', async (req, res) => {
            const stats = this.registry.getStats();
            res.json({
                success: true,
                stats
            });
        });

        // API: Get enhanced statistics (includes all subsystems)
        this.api.registerRoute('GET', '/api/gcce/stats/enhanced', async (req, res) => {
            const enhancedStats = {
                registry: this.registry.getStats(),
                rateLimiter: this.parser.getRateLimiterStats(),
                cooldowns: this.parser.getCooldownStats(),
                userDataCache: this.userDataCache.getStats(),
                permissionMemoization: this.permissionChecker.getMemoizationStats()
            };
            
            res.json({
                success: true,
                stats: enhancedStats
            });
        });

        // API: Get cache statistics
        this.api.registerRoute('GET', '/api/gcce/cache/stats', async (req, res) => {
            res.json({
                success: true,
                cacheStats: {
                    commandCache: this.registry.getCacheStats(),
                    userDataCache: this.userDataCache.getStats(),
                    permissionCache: this.permissionChecker.getMemoizationStats()
                }
            });
        });

        // API: Invalidate command cache
        this.api.registerRoute('POST', '/api/gcce/cache/invalidate', async (req, res) => {
            const { type, key } = req.body;
            
            try {
                if (type === 'command') {
                    this.registry.invalidateCache(key);
                } else if (type === 'user') {
                    this.userDataCache.delete(key);
                } else if (type === 'permission') {
                    this.permissionChecker.invalidateCache(key);
                } else if (type === 'all') {
                    this.registry.invalidateCache();
                    this.userDataCache.clear();
                    this.permissionChecker.clearCache();
                }
                
                res.json({ success: true, type, key });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Set command cooldown
        this.api.registerRoute('POST', '/api/gcce/commands/:commandName/cooldown', async (req, res) => {
            const { commandName } = req.params;
            const { userCooldown, globalCooldown } = req.body;
            
            try {
                this.parser.setCommandCooldown(
                    commandName,
                    userCooldown || 0,
                    globalCooldown || 0
                );
                
                res.json({
                    success: true,
                    commandName,
                    userCooldown,
                    globalCooldown
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Register command alias
        this.api.registerRoute('POST', '/api/gcce/commands/:commandName/alias', async (req, res) => {
            const { commandName } = req.params;
            const { alias } = req.body;
            
            try {
                const success = this.registry.registerAlias(alias, commandName);
                res.json({
                    success,
                    commandName,
                    alias
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Get command aliases
        this.api.registerRoute('GET', '/api/gcce/commands/:commandName/aliases', async (req, res) => {
            const { commandName } = req.params;
            const aliases = this.registry.getCommandAliases(commandName);
            
            res.json({
                success: true,
                commandName,
                aliases
            });
        });

        // API: Update command enabled status
        this.api.registerRoute('POST', '/api/gcce/commands/:commandName/toggle', async (req, res) => {
            const { commandName } = req.params;
            const { enabled } = req.body;
            
            const success = this.registry.setCommandEnabled(commandName, enabled);
            res.json({
                success,
                commandName,
                enabled
            });
        });

        // API: Get configuration
        this.api.registerRoute('GET', '/api/gcce/config', async (req, res) => {
            res.json({
                success: true,
                config: this.pluginConfig
            });
        });

        // API: Update configuration
        this.api.registerRoute('POST', '/api/gcce/config', async (req, res) => {
            try {
                this.pluginConfig = { ...this.pluginConfig, ...req.body };
                await this.api.setConfig('gcce_config', this.pluginConfig);
                
                res.json({
                    success: true,
                    config: this.pluginConfig
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ===== Phase 2: Game Changers API Endpoints =====

        // API: Execute macro
        this.api.registerRoute('POST', '/api/gcce/macros/:macroName/execute', async (req, res) => {
            const { macroName } = req.params;
            const context = req.body.context || {};
            
            try {
                const result = await this.macroManager.executeMacro(macroName, context);
                res.json({ success: true, ...result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Register macro
        this.api.registerRoute('POST', '/api/gcce/macros', async (req, res) => {
            try {
                const success = this.macroManager.registerMacro(req.body);
                res.json({ success });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Get all macros
        this.api.registerRoute('GET', '/api/gcce/macros', async (req, res) => {
            const macros = this.macroManager.getAllMacros();
            res.json({ success: true, macros });
        });

        // API: Get user command history
        this.api.registerRoute('GET', '/api/gcce/history/:userId', async (req, res) => {
            const { userId } = req.params;
            const limit = parseInt(req.query.limit) || 10;
            const history = this.historyManager.getUserHistory(userId, limit);
            res.json({ success: true, history });
        });

        // API: Get global command history
        this.api.registerRoute('GET', '/api/gcce/history', async (req, res) => {
            const limit = parseInt(req.query.limit) || 50;
            const history = this.historyManager.getGlobalHistory(limit);
            res.json({ success: true, history });
        });

        // API: Undo command
        this.api.registerRoute('POST', '/api/gcce/history/:userId/undo', async (req, res) => {
            const { userId } = req.params;
            try {
                const result = await this.historyManager.undo(userId);
                res.json({ success: true, ...result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Schedule command
        this.api.registerRoute('POST', '/api/gcce/scheduler/schedule', async (req, res) => {
            try {
                const scheduleId = this.scheduler.scheduleCommand(req.body);
                res.json({ success: true, scheduleId });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Cancel scheduled command
        this.api.registerRoute('DELETE', '/api/gcce/scheduler/:scheduleId', async (req, res) => {
            const { scheduleId } = req.params;
            const success = this.scheduler.cancelSchedule(parseInt(scheduleId));
            res.json({ success });
        });

        // API: Get all schedules
        this.api.registerRoute('GET', '/api/gcce/scheduler', async (req, res) => {
            const schedules = this.scheduler.getAllSchedules();
            res.json({ success: true, schedules });
        });

        // API: Define custom role
        this.api.registerRoute('POST', '/api/gcce/roles', async (req, res) => {
            try {
                const success = this.advancedPermissions.defineRole(req.body);
                res.json({ success });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Assign role to user
        this.api.registerRoute('POST', '/api/gcce/roles/:roleName/assign', async (req, res) => {
            const { roleName } = req.params;
            const { userId } = req.body;
            const success = this.advancedPermissions.assignRole(userId, roleName);
            res.json({ success });
        });

        // API: Get all roles
        this.api.registerRoute('GET', '/api/gcce/roles', async (req, res) => {
            const roles = this.advancedPermissions.getAllRoles();
            res.json({ success: true, roles });
        });

        // API: Get command categories
        this.api.registerRoute('GET', '/api/gcce/categories', async (req, res) => {
            const categories = this.categoryManager.getAllCategories(true);
            res.json({ success: true, categories });
        });

        // API: Get commands by category
        this.api.registerRoute('GET', '/api/gcce/categories/:categoryId/commands', async (req, res) => {
            const { categoryId } = req.params;
            const allCommands = this.registry.getAllCommands();
            const commands = this.categoryManager.getCommandsByCategory(categoryId, allCommands);
            res.json({ success: true, commands });
        });

        // API: Get grouped commands
        this.api.registerRoute('GET', '/api/gcce/commands/grouped', async (req, res) => {
            const allCommands = this.registry.getAllCommands();
            const grouped = this.categoryManager.groupCommandsByCategory(allCommands);
            res.json({ success: true, grouped });
        });

        // API: Auto-complete suggestions
        this.api.registerRoute('POST', '/api/gcce/autocomplete', async (req, res) => {
            const { input, context, maxSuggestions } = req.body;
            const suggestions = this.autoComplete.getSuggestions(input, context, maxSuggestions);
            res.json({ success: true, suggestions });
        });

        this.api.log('[GCCE] Routes registered', 'debug');
    }

    /**
     * Register Socket.io events
     */
    registerSocketEvents() {
        // Client can request command list
        this.api.registerSocket('gcce:get_commands', async (socket, data) => {
            try {
                const commands = this.registry.getAllCommands(data.filters || {});
                socket.emit('gcce:commands', { commands });
            } catch (error) {
                socket.emit('gcce:error', { error: error.message });
            }
        });

        this.api.log('[GCCE] Socket events registered', 'debug');
    }

    /**
     * Handle incoming chat messages
     * @param {Object} data - Chat message data from TikTok
     */
    async handleChatMessage(data) {
        try {
            if (!this.pluginConfig.enabled) return;

            const message = data.comment || data.message;
            if (!message) return;

            // Check if it's a command
            if (!this.parser.isCommand(message)) return;

            // Build enriched context with user data
            const context = {
                userId: data.uniqueId || data.userId,
                username: data.nickname || data.username || data.uniqueId,
                userRole: this.permissionChecker.getUserRole(data),
                timestamp: Date.now(),
                rawData: data,
                // Enriched user data (extracted once, reused by all plugins)
                userData: {
                    isFollower: data.isFollower || false,
                    isSubscriber: data.isSubscriber || data.teamMemberLevel > 0 || false,
                    isModerator: data.isModerator || false,
                    isBroadcaster: data.isBroadcaster || data.isHost || false,
                    teamMemberLevel: data.teamMemberLevel || 0,
                    giftsSent: data.giftsSent || 0,
                    coinsSent: data.coinsSent || 0,
                    // Database lookup will be cached
                    dbUser: null
                }
            };

            // P5: Check user data cache first
            let cachedUserData = this.userDataCache.get(context.username);
            
            if (cachedUserData) {
                // Use cached data
                context.userData.dbUser = cachedUserData.dbUser;
                context.userData.isFollower = cachedUserData.isFollower || context.userData.isFollower;
                context.userData.teamMemberLevel = cachedUserData.teamMemberLevel || context.userData.teamMemberLevel;
                context.userData.giftsSent = cachedUserData.giftsSent || context.userData.giftsSent;
                context.userData.coinsSent = cachedUserData.coinsSent || context.userData.coinsSent;
            } else {
                // Optional: Fetch user from database (cached to avoid repeated queries)
                if (this.api.getDatabase) {
                    try {
                        const db = this.api.getDatabase();
                        const dbUser = db.prepare('SELECT * FROM users WHERE username = ?').get(context.username);
                        if (dbUser) {
                            context.userData.dbUser = dbUser;
                            // Override with database values if available
                            context.userData.isFollower = dbUser.is_follower || context.userData.isFollower;
                            context.userData.teamMemberLevel = dbUser.team_member_level || context.userData.teamMemberLevel;
                            context.userData.giftsSent = dbUser.gifts_sent || context.userData.giftsSent;
                            context.userData.coinsSent = dbUser.coins_sent || context.userData.coinsSent;
                        }
                        
                        // Cache the user data
                        this.userDataCache.set(context.username, context.userData);
                    } catch (dbError) {
                        this.api.log(`[GCCE] Database lookup error: ${dbError.message}`, 'debug');
                        // Continue without DB data - not critical
                    }
                }
            }

            // Broadcast command input to overlay
            if (this.pluginConfig.enableOverlayMessages) {
                this.broadcastCommandInput(message, context);
            }

            // Parse and execute
            const result = await this.parser.parse(message, context);

            // Handle result
            if (result.isCommand === false) return;

            // F3: Record command in history (if successful)
            if (result.success && result.commandName) {
                this.historyManager.recordCommand(
                    {
                        name: result.commandName,
                        args: result.args || [],
                        undoable: false // Can be set per command
                    },
                    context,
                    result
                );

                // F11: Track usage for autocomplete
                this.autoComplete.recordUsage(result.commandName, context.userId);
            }

            // Broadcast result to overlay if needed
            if (result.displayOverlay && this.pluginConfig.enableOverlayMessages) {
                this.broadcastCommandResult(result, context);
            }

            this.api.log(`[GCCE] Command executed: ${message} by ${context.username} - ${result.success ? 'SUCCESS' : 'FAILED'}`, 'debug');

        } catch (error) {
            this.api.log(`[GCCE] Error handling chat message: ${error.message}`, 'error');
        }
    }

    /**
     * Broadcast command input to overlay
     * @param {string} command - The command that was typed
     * @param {Object} context - Execution context
     */
    broadcastCommandInput(command, context) {
        this.api.emit('gcce:command_input', {
            command: command,
            username: context.username,
            timestamp: context.timestamp
        });
    }

    /**
     * Broadcast command result to overlay
     * @param {Object} result - Command execution result
     * @param {Object} context - Execution context
     */
    broadcastCommandResult(result, context) {
        this.api.emit('gcce:command_result', {
            success: result.success,
            error: result.error,
            message: result.message,
            data: result.data,
            username: context.username,
            timestamp: context.timestamp
        });
    }

    /**
     * Handle /help command
     * @param {Array} args - Command arguments
     * @param {Object} context - Execution context
     * @returns {Object} Command result
     */
    async handleHelpCommand(args, context) {
        if (args.length === 0) {
            // Show general help
            const commands = this.registry.getAllCommands({ enabled: true });
            
            // Group by category
            const categories = {};
            for (const cmd of commands) {
                if (!categories[cmd.category]) {
                    categories[cmd.category] = [];
                }
                categories[cmd.category].push(cmd);
            }

            return {
                success: true,
                displayOverlay: true,
                data: {
                    type: 'help_list',
                    categories,
                    totalCommands: commands.length
                },
                message: `Available commands: ${commands.length}. Use /help <command> for details.`
            };
        } else {
            // Show help for specific command
            const commandName = args[0].toLowerCase();
            const command = this.registry.getCommand(commandName);

            if (!command) {
                return {
                    success: false,
                    error: `Command '/${commandName}' not found.`,
                    displayOverlay: true
                };
            }

            return {
                success: true,
                displayOverlay: true,
                data: {
                    type: 'help_detail',
                    command
                },
                message: `Help for /${command.name}: ${command.description}\nSyntax: ${command.syntax}`
            };
        }
    }

    /**
     * Handle /commands command
     * @param {Array} args - Command arguments
     * @param {Object} context - Execution context
     * @returns {Object} Command result
     */
    async handleCommandsCommand(args, context) {
        const commands = this.registry.getAllCommands({ enabled: true });
        
        const commandList = commands.map(cmd => `/${cmd.name}`).join(', ');

        return {
            success: true,
            displayOverlay: true,
            data: {
                type: 'command_list',
                commands
            },
            message: `Available commands (${commands.length}): ${commandList}`
        };
    }

    /**
     * Integrate with StreamAlchemy plugin
     */
    integrateWithStreamAlchemy() {
        // This is called during init - StreamAlchemy will register its own commands
        // when it initializes via the public API method registerCommandsForPlugin
        this.api.log('[GCCE] Ready to integrate with StreamAlchemy and other plugins', 'debug');
    }

    /**
     * Public API: Register commands for a plugin
     * This method is called by other plugins to register their commands
     * @param {string} pluginId - Plugin ID
     * @param {Array} commands - Array of command definitions
     * @returns {Object} Registration result
     */
    registerCommandsForPlugin(pluginId, commands) {
        const results = {
            pluginId,
            registered: [],
            failed: []
        };

        for (const commandDef of commands) {
            const success = this.registry.registerCommand({
                ...commandDef,
                pluginId
            });

            if (success) {
                results.registered.push(commandDef.name);
            } else {
                results.failed.push(commandDef.name);
            }
        }

        this.api.log(`[GCCE] Plugin ${pluginId} registered ${results.registered.length} commands`, 'info');
        return results;
    }

    /**
     * Public API: Unregister commands for a plugin
     * @param {string} pluginId - Plugin ID
     */
    unregisterCommandsForPlugin(pluginId) {
        this.registry.unregisterPluginCommands(pluginId);
    }

    /**
     * Start periodic cleanup timer
     */
    startCleanupTimer() {
        this.cleanupInterval = setInterval(() => {
            this.parser.cleanupRateLimits();
        }, 60000); // Every minute

        this.api.log('[GCCE] Cleanup timer started', 'debug');
    }

    /**
     * Clean up plugin resources
     */
    async destroy() {
        this.api.log('[GCCE] Shutting down Global Chat Command Engine...', 'info');

        // Stop cleanup timer
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        // Clear registry
        if (this.registry) {
            this.registry.clear();
        }

        this.api.log('[GCCE] Global Chat Command Engine shut down successfully', 'info');
    }
}

module.exports = GlobalChatCommandEngine;
