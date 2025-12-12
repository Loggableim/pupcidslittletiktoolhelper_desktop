/**
 * Talking Heads Admin UI JavaScript
 */

const socket = io();
let currentConfig = null;
let styleTemplates = {};

// Style descriptions (DE)
const styleDescriptions = {
  furry: 'Tierischer Charakter, weich, lebendig',
  tech: 'Futuristisch, Neon/Metallic',
  medieval: 'Fantasy/Mittelalter, Armor',
  noble: 'Aristokratisch, elegant',
  cartoon: 'Comic-Stil, kräftige Farben',
  whimsical: 'Märchenhaft, verspielt',
  realistic: 'Realistischer Portrait-Look'
};

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  setupEventListeners();
  startAnimationPolling();
  
  // Initialize Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
});

/**
 * Load configuration from server
 */
async function loadConfig() {
  try {
    const response = await fetch('/api/talkingheads/config');
    const data = await response.json();

    if (data.success) {
      currentConfig = data.config;
      styleTemplates = data.styleTemplates;
      
      // Populate form fields
      populateForm(currentConfig);
      
      // Populate style grid
      populateStyleGrid();
      
      // Update API status
      updateApiStatus(data.apiConfigured, data.apiKeySource);
      
      // Load cache stats
      await loadCacheStats();
      
      // Enable save button now that config is loaded
      const saveBtn = document.getElementById('saveConfigBtn');
      if (saveBtn) {
        saveBtn.disabled = false;
      }
    } else {
      console.error('Failed to load config:', data);
      showNotification('Fehler beim Laden der Konfiguration: ' + (data.error || 'Unbekannter Fehler'), 'error');
    }
  } catch (error) {
    console.error('Failed to load config:', error);
    showNotification('Fehler beim Laden der Konfiguration: ' + error.message, 'error');
  }
}

/**
 * Populate form with configuration
 */
function populateForm(config) {
  if (!config) {
    console.warn('No config provided to populateForm');
    return;
  }
  
  document.getElementById('enabledSwitch').checked = config.enabled || false;
  document.getElementById('debugLoggingSwitch').checked = config.debugLogging || false;
  document.getElementById('rolePermission').value = config.rolePermission || 'all';
  document.getElementById('minTeamLevel').value = config.minTeamLevel || 0;
  document.getElementById('fadeInDuration').value = config.fadeInDuration || 300;
  document.getElementById('fadeOutDuration').value = config.fadeOutDuration || 300;
  document.getElementById('blinkInterval').value = config.blinkInterval || 3000;
  document.getElementById('obsEnabled').checked = config.obsEnabled || false;
  document.getElementById('cacheEnabled').checked = config.cacheEnabled || false;
  
  // Convert cache duration from ms to days
  const cacheDays = Math.floor((config.cacheDuration || 2592000000) / 86400000);
  document.getElementById('cacheDuration').value = cacheDays;

  // Show/hide team level input
  toggleTeamLevelInput(config.rolePermission || 'all');
  
  // Show/hide debug log section
  toggleDebugLogSection(config.debugLogging || false);
}

/**
 * Populate style grid
 */
function populateStyleGrid() {
  const grid = document.getElementById('styleGrid');
  grid.innerHTML = '';
  
  Object.keys(styleTemplates).forEach(styleKey => {
    const style = styleTemplates[styleKey];
    const card = document.createElement('div');
    card.className = 'style-card';
    card.dataset.style = styleKey;
    
    if (currentConfig.defaultStyle === styleKey) {
      card.classList.add('selected');
    }
    
    card.innerHTML = `
      <div class="style-name">${style.name}</div>
      <div class="style-desc">${styleDescriptions[styleKey] || style.description}</div>
    `;
    
    card.addEventListener('click', () => selectStyle(styleKey));
    grid.appendChild(card);
  });
}

/**
 * Select a style
 */
function selectStyle(styleKey) {
  currentConfig.defaultStyle = styleKey;
  
  // Update visual selection
  document.querySelectorAll('.style-card').forEach(card => {
    if (card.dataset.style === styleKey) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Save button
  document.getElementById('saveConfigBtn').addEventListener('click', saveConfig);
  
  // Test API button
  document.getElementById('testApiBtn').addEventListener('click', testApi);
  
  // Test generation button
  const testGenBtn = document.getElementById('testGenerateBtn');
  if (testGenBtn) {
    testGenBtn.addEventListener('click', testGenerate);
  }
  
  // Clear cache button
  document.getElementById('clearCacheBtn').addEventListener('click', clearCache);
  
  // Debug logging toggle
  document.getElementById('debugLoggingSwitch').addEventListener('change', (e) => {
    toggleDebugLogSection(e.target.checked);
    if (e.target.checked) {
      showNotification('Debug-Logging aktiviert', 'info');
    }
  });
  
  // Role permission change
  document.getElementById('rolePermission').addEventListener('change', (e) => {
    toggleTeamLevelInput(e.target.value);
  });
}

/**
 * Save configuration
 */
async function saveConfig() {
  try {
    // Wait for config to load if not ready
    if (!currentConfig) {
      showNotification('⏳ Bitte warten Sie, bis die Konfiguration geladen ist...', 'info');
      return;
    }
    
    const config = {
      enabled: document.getElementById('enabledSwitch').checked,
      debugLogging: document.getElementById('debugLoggingSwitch').checked,
      defaultStyle: currentConfig.defaultStyle || 'cartoon',
      rolePermission: document.getElementById('rolePermission').value,
      minTeamLevel: parseInt(document.getElementById('minTeamLevel').value) || 0,
      fadeInDuration: parseInt(document.getElementById('fadeInDuration').value) || 300,
      fadeOutDuration: parseInt(document.getElementById('fadeOutDuration').value) || 300,
      blinkInterval: parseInt(document.getElementById('blinkInterval').value) || 3000,
      obsEnabled: document.getElementById('obsEnabled').checked,
      cacheEnabled: document.getElementById('cacheEnabled').checked,
      cacheDuration: parseInt(document.getElementById('cacheDuration').value) * 86400000
    };

    const response = await fetch('/api/talkingheads/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });

    const data = await response.json();

    if (data.success) {
      currentConfig = data.config;
      showNotification('✅ Konfiguration gespeichert', 'success');
      
      // Refresh icons
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    } else {
      showNotification('❌ Fehler beim Speichern: ' + (data.error || 'Unbekannter Fehler'), 'error');
      console.error('Config save error:', data);
    }
  } catch (error) {
    console.error('Failed to save config:', error);
    showNotification('❌ Fehler beim Speichern der Konfiguration: ' + error.message, 'error');
  }
}

/**
 * Test API connection
 */
async function testApi() {
  const btn = document.getElementById('testApiBtn');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="inline-block w-4 h-4 mr-2 animate-spin"></i> Teste...';
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  try {
    const response = await fetch('/api/talkingheads/test-api', {
      method: 'POST'
    });

    const data = await response.json();

    if (data.success) {
      showNotification('✅ API-Verbindung erfolgreich', 'success');
      updateApiStatus(true, 'global_settings');
    } else {
      showNotification('❌ API-Verbindung fehlgeschlagen: ' + (data.error || 'Unbekannter Fehler'), 'error');
      updateApiStatus(false, 'none');
    }
  } catch (error) {
    console.error('API test failed:', error);
    showNotification('❌ API-Test fehlgeschlagen: ' + error.message, 'error');
    updateApiStatus(false, 'none');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}

/**
 * Test avatar generation
 */
async function testGenerate() {
  const btn = document.getElementById('testGenerateBtn');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="inline-block w-4 h-4 mr-2 animate-spin"></i> Generiere...';
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  try {
    const styleKey = currentConfig?.defaultStyle || 'cartoon';
    
    showNotification('🎨 Starte Test-Generierung... (kann 15-30 Sekunden dauern)', 'info');
    
    const response = await fetch('/api/talkingheads/test-generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ styleKey })
    });

    const data = await response.json();

    if (data.success) {
      showNotification(`✅ Test-Avatar erfolgreich generiert! (${data.sprites} Sprites erstellt)`, 'success');
    } else {
      showNotification('❌ Avatar-Generierung fehlgeschlagen: ' + (data.error || 'Unbekannter Fehler'), 'error');
    }
  } catch (error) {
    console.error('Test generation failed:', error);
    showNotification('❌ Test-Generierung fehlgeschlagen: ' + error.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}

/**
 * Clear cache
 */
async function clearCache() {
  if (!confirm('Möchten Sie wirklich alle gecachten Avatare löschen?')) {
    return;
  }

  try {
    const response = await fetch('/api/talkingheads/cache/clear', {
      method: 'POST'
    });

    const data = await response.json();

    if (data.success) {
      showNotification(`✅ ${data.deleted} Avatare gelöscht`, 'success');
      await loadCacheStats();
    } else {
      showNotification('❌ Fehler beim Löschen des Cache', 'error');
    }
  } catch (error) {
    console.error('Failed to clear cache:', error);
    showNotification('❌ Fehler beim Löschen des Cache', 'error');
  }
}

/**
 * Load cache statistics
 */
async function loadCacheStats() {
  try {
    const response = await fetch('/api/talkingheads/cache/stats');
    const data = await response.json();

    if (data.success) {
      const stats = data.stats;
      document.getElementById('cacheCount').textContent = stats.totalAvatars || 0;
    }
  } catch (error) {
    console.error('Failed to load cache stats:', error);
  }
}

/**
 * Update API status indicator
 */
function updateApiStatus(configured, source) {
  const statusBadge = document.getElementById('apiStatus');
  const warning = document.getElementById('apiKeyWarning');
  
  if (configured) {
    statusBadge.className = 'status-badge badge-success';
    statusBadge.innerHTML = '<i data-lucide="check-circle" class="inline-block w-4 h-4"></i> API konfiguriert';
    warning.style.display = 'none';
  } else {
    statusBadge.className = 'status-badge badge-warning';
    statusBadge.innerHTML = '<i data-lucide="alert-triangle" class="inline-block w-4 h-4"></i> Kein API-Key';
    warning.style.display = 'block';
  }
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

/**
 * Toggle debug log section visibility
 */
function toggleDebugLogSection(show) {
  const section = document.getElementById('debugLogSection');
  if (section) {
    section.style.display = show ? 'block' : 'none';
  }
}

/**
 * Toggle team level input visibility
 */
function toggleTeamLevelInput(permission) {
  const wrapper = document.getElementById('minTeamLevelWrapper');
  wrapper.style.display = permission === 'team' ? 'block' : 'none';
}

/**
 * Load active animations
 */
async function loadActiveAnimations() {
  try {
    const response = await fetch('/api/talkingheads/animations');
    
    // Silently ignore 404 errors (endpoint might not be available during initialization)
    if (response.status === 404) {
      return;
    }
    
    const data = await response.json();

    if (data.success) {
      const container = document.getElementById('animationList');
      const section = document.getElementById('activeAnimationsSection');
      const countElement = document.getElementById('activeAnimations');
      
      countElement.textContent = data.animations.length;
      
      if (data.animations.length === 0) {
        section.style.display = 'none';
      } else {
        section.style.display = 'block';
        container.innerHTML = data.animations.map(anim => `
          <div class="animation-item">
            <div>
              <strong>${anim.username}</strong> <span style="color: var(--color-text-secondary);">(${anim.userId})</span>
            </div>
            <div>
              <span class="status-badge badge-info">${anim.state}</span>
              <span style="color: var(--color-text-secondary); margin-left: 8px;">${Math.floor(anim.duration / 1000)}s</span>
            </div>
          </div>
        `).join('');
      }
    }
  } catch (error) {
    // Silently ignore errors during polling
    // console.error('Failed to load active animations:', error);
  }
}

/**
 * Start polling for active animations
 */
function startAnimationPolling() {
  loadActiveAnimations();
  setInterval(loadActiveAnimations, 2000);
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `alert ${type === 'error' ? 'alert-warning' : 'alert-info'}`;
  toast.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; min-width: 300px; animation: slideIn 0.3s ease-out;';
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
