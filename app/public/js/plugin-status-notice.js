/**
 * Plugin Status Notice Helper
 * Manages dismissible plugin status notices with localStorage persistence
 */

(function() {
  'use strict';

  /**
   * Plugin development status mapping
   */
  const PLUGIN_STATUS_MAP = {
    // Early Beta (Red)
    'gcce-hud': 'early-beta',
    'streamalchemy': 'early-beta',
    'webgpu-emoji-rain': 'early-beta',
    'fireworks': 'early-beta',
    'fireworks-webgpu': 'early-beta',
    'advanced-timer': 'early-beta',
    'chatango': 'early-beta',
    
    // Beta (Yellow)
    'minecraft-connect': 'beta',
    'thermal-printer': 'beta',
    'quiz-show': 'beta',
    'quiz_show': 'beta',
    'viewer-xp': 'beta',
    'leaderboard': 'beta',
    'openshock': 'beta',
    'multicam': 'beta',
    'gift-milestone': 'beta',
    'vdoninja': 'beta',
    'gcce': 'beta',
    'ifttt': 'beta',
    
    // Alpha (Green)
    'weather-control': 'alpha',
    'emoji-rain': 'alpha',
    'soundboard': 'alpha',
    'clarityhud': 'alpha',
    'lastevent-spotlight': 'alpha',
    'tts': 'alpha',
    'goals': 'alpha',
    
    // Final (Blue)
    'osc-bridge': 'final',
    'config-import': 'final'
  };

  /**
   * Status configuration with titles, messages, and icons
   */
  const STATUS_CONFIG = {
    'early-beta': {
      title: 'Plugin Notice',
      titleSuffix: 'Early Beta',
      message: 'Die Funktion ist nicht oder stark eingeschränkt gegeben. Du bist eingeladen das Plugin zu testen und Fehler und Bugs zu melden.',
      icon: 'alert-triangle'
    },
    'beta': {
      title: 'Plugin Notice',
      titleSuffix: 'Beta',
      message: 'Die Funktion ist vorhanden aber es muss mit bugs oder fehlern gerechnet werden. Du bist eingeladen das Plugin zu testen und Fehler und Bugs zu melden.',
      icon: 'alert-circle'
    },
    'alpha': {
      title: 'Plugin Notice',
      titleSuffix: 'Alpha',
      message: 'Diese Apps sollten grundlegend funktionieren, falls du Fehler oder Bugs entdeckst bitte melde diese im github repo.',
      icon: 'info'
    },
    'final': {
      title: 'Plugin Notice',
      titleSuffix: 'Final',
      message: 'Diese Apps funktioniert, falls du Wünsche oder Anregungen hast damit ins github repo.',
      icon: 'check-circle'
    }
  };

  /**
   * Get plugin status from plugin ID
   */
  function getPluginStatus(pluginId) {
    return PLUGIN_STATUS_MAP[pluginId] || null;
  }

  /**
   * Get status badge HTML for plugin manager
   */
  function getStatusBadgeHTML(pluginId) {
    const status = getPluginStatus(pluginId);
    if (!status) return '';

    const config = STATUS_CONFIG[status];
    const iconName = config.icon;

    return `<span class="plugin-dev-status-badge ${status}">
      <i data-lucide="${iconName}"></i>
      ${config.titleSuffix}
    </span>`;
  }

  /**
   * Initialize plugin status notice on a page
   * @param {string} pluginId - The plugin ID (e.g., 'gcce-hud')
   * @param {string} containerId - Optional container ID where to insert notice (defaults to body)
   */
  function initPluginStatusNotice(pluginId, containerId = null) {
    const status = getPluginStatus(pluginId);
    if (!status) return;

    const storageKey = `plugin-notice-dismissed-${pluginId}`;
    const isDismissed = localStorage.getItem(storageKey);

    if (isDismissed) return;

    const config = STATUS_CONFIG[status];
    const noticeHTML = `
      <div id="plugin-status-notice-${pluginId}" class="plugin-status-notice ${status}">
        <div class="plugin-status-notice-icon">
          <i data-lucide="${config.icon}"></i>
        </div>
        <div class="plugin-status-notice-text">
          <h3 class="plugin-status-notice-title">${config.title} - ${config.titleSuffix}</h3>
          <p class="plugin-status-notice-message">${config.message}</p>
        </div>
        <button class="plugin-status-notice-dismiss" aria-label="Dismiss notice" data-plugin-id="${pluginId}">
          <i data-lucide="x"></i>
        </button>
      </div>
    `;

    // Insert notice at beginning of container
    let container;
    if (containerId) {
      container = document.getElementById(containerId);
    } else {
      container = document.body.querySelector('.container') || document.body;
    }

    if (container) {
      container.insertAdjacentHTML('afterbegin', noticeHTML);

      // Initialize Lucide icons if available
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }

      // Add dismiss handler
      const dismissBtn = document.querySelector(`[data-plugin-id="${pluginId}"]`);
      if (dismissBtn) {
        dismissBtn.addEventListener('click', function() {
          const notice = document.getElementById(`plugin-status-notice-${pluginId}`);
          if (notice) {
            notice.style.opacity = '0';
            notice.style.transform = 'translateY(-20px)';
            
            setTimeout(() => {
              notice.remove();
            }, 300);
          }
          
          localStorage.setItem(storageKey, 'true');
        });
      }
    }
  }

  /**
   * Auto-detect plugin ID from URL and initialize notice
   */
  function autoInitNotice() {
    // Try to detect plugin from URL path
    const path = window.location.pathname;
    const pluginMatch = path.match(/\/(?:plugins\/)?([^\/]+)\/(?:ui|admin)/);
    
    if (pluginMatch) {
      const pluginId = pluginMatch[1];
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          initPluginStatusNotice(pluginId);
        });
      } else {
        initPluginStatusNotice(pluginId);
      }
    }
  }

  // Export to global scope
  window.PluginStatusNotice = {
    getPluginStatus,
    getStatusBadgeHTML,
    initPluginStatusNotice,
    autoInitNotice,
    PLUGIN_STATUS_MAP,
    STATUS_CONFIG
  };

  // Auto-initialize if script is loaded in a plugin page
  autoInitNotice();
})();
