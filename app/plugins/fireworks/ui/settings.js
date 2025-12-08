/**
 * Fireworks Superplugin - Settings UI Controller
 * CSP-Compliant - No inline event handlers
 */

// State
let config = {};
let socket = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize i18n first
    if (window.i18n) {
        await window.i18n.init();
        window.i18n.updateDOM();
        
        // Listen for language changes from main app
        window.i18n.onChange(() => {
            window.i18n.updateDOM();
        });
    }
    
    // Connect to socket
    connectSocket();
    
    // Load configuration
    await loadConfig();
    
    // Setup event listeners
    setupEventListeners();
    
    console.log('[Fireworks Settings] Initialized');
});

// ============================================================================
// SOCKET CONNECTION
// ============================================================================

function connectSocket() {
    try {
        socket = io({
            transports: ['websocket', 'polling'],
            reconnection: true
        });

        socket.on('connect', () => {
            console.log('[Fireworks Settings] Connected to server');
        });

        socket.on('fireworks:config-update', (data) => {
            if (data.config) {
                config = data.config;
                updateUI();
            }
        });
    } catch (e) {
        console.error('[Fireworks Settings] Socket error:', e);
    }
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function loadConfig() {
    try {
        const response = await fetch('/api/fireworks/config');
        const data = await response.json();
        
        if (data.success) {
            config = data.config;
            updateUI();
        }
    } catch (e) {
        console.error('[Fireworks Settings] Failed to load config:', e);
        showToast('Failed to load configuration', 'error');
    }
}

async function saveConfig() {
    try {
        const response = await fetch('/api/fireworks/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Settings saved successfully!', 'success');
        } else {
            showToast('Failed to save settings', 'error');
        }
    } catch (e) {
        console.error('[Fireworks Settings] Failed to save config:', e);
        showToast('Failed to save settings', 'error');
    }
}

async function triggerTest() {
    try {
        const selectedShape = document.querySelector('.shape-preview.selected');
        const shape = selectedShape ? selectedShape.dataset.shape : 'burst';
        
        await fetch('/api/fireworks/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shape: shape,
                intensity: 1.5,
                position: { x: 0.5, y: 0.5 }
            })
        });
        
        showToast('Test firework triggered!', 'success');
    } catch (e) {
        console.error('[Fireworks Settings] Failed to trigger test:', e);
        showToast('Failed to trigger test', 'error');
    }
}

async function triggerFinale() {
    try {
        const intensity = parseFloat(document.getElementById('finale-intensity').value);
        
        await fetch('/api/fireworks/finale', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                intensity: intensity,
                duration: 5000
            })
        });
        
        showToast('Finale triggered!', 'success');
    } catch (e) {
        console.error('[Fireworks Settings] Failed to trigger finale:', e);
        showToast('Failed to trigger finale', 'error');
    }
}

// ============================================================================
// UI UPDATE
// ============================================================================

function updateUI() {
    // Master toggle
    updateToggle('master-toggle', config.enabled);
    
    // Gift triggers
    updateToggle('gift-toggle', config.giftTriggersEnabled);
    document.getElementById('min-coins').value = config.minGiftCoins || 1;
    
    // Combo system
    updateToggle('combo-toggle', config.comboEnabled);
    const comboTimeout = (config.comboTimeout || 10000) / 1000;
    document.getElementById('combo-timeout').value = comboTimeout;
    document.getElementById('combo-timeout-value').textContent = comboTimeout + 's';
    document.getElementById('combo-max').value = config.comboMaxMultiplier || 5;
    document.getElementById('combo-max-value').textContent = (config.comboMaxMultiplier || 5) + 'x';
    
    // Escalation
    updateToggle('escalation-toggle', config.escalationEnabled);
    if (config.escalationThresholds) {
        document.getElementById('tier-small').value = config.escalationThresholds.small || 0;
        document.getElementById('tier-medium').value = config.escalationThresholds.medium || 100;
        document.getElementById('tier-big').value = config.escalationThresholds.big || 500;
        document.getElementById('tier-massive').value = config.escalationThresholds.massive || 1000;
    }
    if (config.particleCount) {
        document.getElementById('particle-small').textContent = config.particleCount.small || 30;
        document.getElementById('particle-medium').textContent = config.particleCount.medium || 60;
        document.getElementById('particle-big').textContent = config.particleCount.big || 100;
        document.getElementById('particle-massive').textContent = config.particleCount.massive || 200;
    }
    
    // Audio
    updateToggle('audio-toggle', config.audioEnabled);
    const volume = Math.round((config.audioVolume || 0.7) * 100);
    document.getElementById('audio-volume').value = volume;
    document.getElementById('audio-volume-value').textContent = volume + '%';
    
    // Color mode
    document.getElementById('color-mode').value = config.colorMode || 'gift';
    
    // Visual effects
    updateToggle('trails-toggle', config.trailsEnabled);
    updateToggle('glow-toggle', config.glowEnabled);
    document.getElementById('max-particles').value = config.maxParticles || 1000;
    document.getElementById('max-particles-value').textContent = config.maxParticles || 1000;
    if (config.particleSizeRange) {
        document.getElementById('particle-min').value = config.particleSizeRange[0] || 3;
        document.getElementById('particle-max').value = config.particleSizeRange[1] || 10;
    }
    
    // Goal finale
    updateToggle('finale-toggle', config.goalFinaleEnabled);
    document.getElementById('finale-intensity').value = config.goalFinaleIntensity || 3;
    document.getElementById('finale-intensity-value').textContent = (config.goalFinaleIntensity || 3) + 'x';
    
    // Random shape rotation
    updateToggle('random-shape-toggle', config.randomShapeEnabled);
    
    // Active shapes
    const activeShapes = config.activeShapes || ['burst'];
    document.querySelectorAll('.shape-preview').forEach(el => {
        el.classList.toggle('active-shape', activeShapes.includes(el.dataset.shape));
    });
    updateActiveShapes();
    
    // Default shape
    const defaultShapeSelect = document.getElementById('default-shape');
    if (defaultShapeSelect) {
        defaultShapeSelect.value = config.defaultShape || 'burst';
    }
    
    // User avatar integration
    updateToggle('avatar-toggle', config.userAvatarEnabled);
    const avatarChance = Math.round((config.avatarParticleChance || 0.3) * 100);
    const avatarChanceSlider = document.getElementById('avatar-chance');
    const avatarChanceValue = document.getElementById('avatar-chance-value');
    if (avatarChanceSlider) {
        avatarChanceSlider.value = avatarChance;
    }
    if (avatarChanceValue) {
        avatarChanceValue.textContent = avatarChance + '%';
    }
}

function updateToggle(id, value) {
    const toggle = document.getElementById(id);
    if (toggle) {
        toggle.classList.toggle('active', value !== false);
    }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    // Save button
    document.getElementById('save-btn').addEventListener('click', saveConfig);
    
    // Test buttons
    document.getElementById('test-btn').addEventListener('click', triggerTest);
    document.getElementById('test-finale-btn').addEventListener('click', triggerFinale);
    document.getElementById('test-gift-btn')?.addEventListener('click', () => triggerTestShape('burst', 1.0));
    document.getElementById('test-combo-btn')?.addEventListener('click', () => triggerTestShape('burst', 3.0));
    document.getElementById('test-avatar-btn')?.addEventListener('click', triggerTestAvatar);
    
    // Test tier buttons
    document.getElementById('test-tier-small-btn')?.addEventListener('click', () => triggerTestTier('small'));
    document.getElementById('test-tier-medium-btn')?.addEventListener('click', () => triggerTestTier('medium'));
    document.getElementById('test-tier-big-btn')?.addEventListener('click', () => triggerTestTier('big'));
    document.getElementById('test-tier-massive-btn')?.addEventListener('click', () => triggerTestTier('massive'));
    
    // Test shape buttons
    document.getElementById('test-shape-burst-btn')?.addEventListener('click', () => triggerTestShape('burst'));
    document.getElementById('test-shape-heart-btn')?.addEventListener('click', () => triggerTestShape('heart'));
    document.getElementById('test-shape-star-btn')?.addEventListener('click', () => triggerTestShape('star'));
    document.getElementById('test-shape-ring-btn')?.addEventListener('click', () => triggerTestShape('ring'));
    document.getElementById('test-shape-spiral-btn')?.addEventListener('click', () => triggerTestShape('spiral'));
    document.getElementById('test-shape-random-btn')?.addEventListener('click', triggerTestRandom);
    
    // Master toggle
    document.getElementById('master-toggle').addEventListener('click', function() {
        this.classList.toggle('active');
        config.enabled = this.classList.contains('active');
    });
    
    // All toggle switches
    document.querySelectorAll('.toggle-switch[data-config]').forEach(toggle => {
        toggle.addEventListener('click', function() {
            this.classList.toggle('active');
            const configKey = this.dataset.config;
            config[configKey] = this.classList.contains('active');
        });
    });
    
    // Shape selection - multiple selection support
    document.querySelectorAll('.shape-preview').forEach(shape => {
        shape.addEventListener('click', function() {
            this.classList.toggle('active-shape');
            updateActiveShapes();
        });
    });
    
    // Default shape selector
    document.getElementById('default-shape')?.addEventListener('change', function() {
        config.defaultShape = this.value;
    });
    
    // Range sliders
    setupRangeSlider('combo-timeout', 'combo-timeout-value', 's', (val) => {
        config.comboTimeout = val * 1000;
    });
    
    setupRangeSlider('combo-max', 'combo-max-value', 'x', (val) => {
        config.comboMaxMultiplier = parseFloat(val);
    });
    
    setupRangeSlider('audio-volume', 'audio-volume-value', '%', (val) => {
        config.audioVolume = val / 100;
    });
    
    setupRangeSlider('max-particles', 'max-particles-value', '', (val) => {
        config.maxParticles = parseInt(val);
    });
    
    setupRangeSlider('finale-intensity', 'finale-intensity-value', 'x', (val) => {
        config.goalFinaleIntensity = parseFloat(val);
    });
    
    setupRangeSlider('avatar-chance', 'avatar-chance-value', '%', (val) => {
        config.avatarParticleChance = val / 100;
    });
    
    // Number inputs
    document.getElementById('min-coins').addEventListener('change', function() {
        config.minGiftCoins = parseInt(this.value) || 1;
    });
    
    // Tier thresholds
    ['small', 'medium', 'big', 'massive'].forEach(tier => {
        document.getElementById('tier-' + tier).addEventListener('change', function() {
            if (!config.escalationThresholds) config.escalationThresholds = {};
            config.escalationThresholds[tier] = parseInt(this.value) || 0;
        });
    });
    
    // Particle size
    document.getElementById('particle-min').addEventListener('change', function() {
        if (!config.particleSizeRange) config.particleSizeRange = [3, 10];
        config.particleSizeRange[0] = parseInt(this.value) || 3;
    });
    
    document.getElementById('particle-max').addEventListener('change', function() {
        if (!config.particleSizeRange) config.particleSizeRange = [3, 10];
        config.particleSizeRange[1] = parseInt(this.value) || 10;
    });
    
    // Color mode
    document.getElementById('color-mode').addEventListener('change', function() {
        config.colorMode = this.value;
    });
    
    // Overlay buttons
    document.getElementById('copy-overlay-url').addEventListener('click', () => {
        const url = window.location.origin + '/fireworks/overlay';
        navigator.clipboard.writeText(url).then(() => {
            showToast('Overlay URL copied to clipboard!', 'success');
        });
    });
    
    document.getElementById('open-overlay').addEventListener('click', () => {
        window.open('/fireworks/overlay', '_blank');
    });
    
    // Add color button
    document.getElementById('add-color').addEventListener('click', () => {
        const color = prompt('Enter hex color (e.g., #ff0000):');
        if (color && /^#[0-9A-Fa-f]{6}$/.test(color)) {
            if (!config.themeColors) config.themeColors = [];
            config.themeColors.push(color);
            addColorSwatch(color);
        }
    });
}

function setupRangeSlider(sliderId, valueId, suffix, callback) {
    const slider = document.getElementById(sliderId);
    const valueDisplay = document.getElementById(valueId);
    
    slider.addEventListener('input', function() {
        valueDisplay.textContent = this.value + suffix;
        callback(this.value);
    });
}

function addColorSwatch(color) {
    const container = document.getElementById('color-swatches');
    const addBtn = document.getElementById('add-color');
    
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.background = color;
    swatch.dataset.color = color;
    
    container.insertBefore(swatch, addBtn);
}

// ============================================================================
// NEW HELPER FUNCTIONS
// ============================================================================

/**
 * Update active shapes list
 */
function updateActiveShapes() {
    const activeShapes = [];
    document.querySelectorAll('.shape-preview.active-shape').forEach(shape => {
        activeShapes.push(shape.dataset.shape);
    });
    
    config.activeShapes = activeShapes.length > 0 ? activeShapes : ['burst'];
    
    // Update display
    const listElement = document.getElementById('active-shapes-list');
    if (listElement) {
        listElement.textContent = config.activeShapes.join(', ');
    }
}

/**
 * Test a specific shape
 */
async function triggerTestShape(shape, intensity = 1.5) {
    try {
        await fetch('/api/fireworks/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shape: shape,
                intensity: intensity,
                position: { x: 0.5, y: 0.5 }
            })
        });
        
        showToast(`${shape} firework triggered!`, 'success');
    } catch (e) {
        console.error('[Fireworks Settings] Failed to trigger test:', e);
        showToast('Failed to trigger test', 'error');
    }
}

/**
 * Test a specific tier
 */
async function triggerTestTier(tier) {
    const intensities = {
        small: 0.5,
        medium: 1.0,
        big: 1.5,
        massive: 2.5
    };
    
    const particleCounts = {
        small: 30,
        medium: 60,
        big: 100,
        massive: 200
    };
    
    try {
        await fetch('/api/fireworks/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shape: config.defaultShape || 'burst',
                intensity: intensities[tier],
                particleCount: particleCounts[tier],
                position: { x: 0.5, y: 0.5 }
            })
        });
        
        showToast(`${tier} tier firework triggered!`, 'success');
    } catch (e) {
        console.error('[Fireworks Settings] Failed to trigger tier test:', e);
        showToast('Failed to trigger tier test', 'error');
    }
}

/**
 * Test random shape
 */
async function triggerTestRandom() {
    try {
        await fetch('/api/fireworks/random', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        showToast('Random firework triggered!', 'success');
    } catch (e) {
        console.error('[Fireworks Settings] Failed to trigger random:', e);
        showToast('Failed to trigger random', 'error');
    }
}

/**
 * Test avatar firework
 */
async function triggerTestAvatar() {
    try {
        // Create a simple data URI for a test avatar (small colored circle SVG)
        const avatarDataUri = 'data:image/svg+xml;base64,' + btoa(`
            <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
                <circle cx="50" cy="50" r="45" fill="#FF6B6B"/>
                <text x="50" y="65" font-size="40" text-anchor="middle" fill="white">👤</text>
            </svg>
        `);
        
        // Trigger with the test avatar
        await fetch('/api/fireworks/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shape: config.defaultShape || 'burst',
                intensity: 1.5,
                position: { x: 0.5, y: 0.5 },
                userAvatar: avatarDataUri
            })
        });
        
        showToast('Avatar firework test triggered!', 'success');
    } catch (e) {
        console.error('[Fireworks Settings] Failed to trigger avatar test:', e);
        showToast('Failed to trigger avatar test', 'error');
    }
}

// ============================================================================
// TOAST NOTIFICATION
// ============================================================================

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
