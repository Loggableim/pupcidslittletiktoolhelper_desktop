/**
 * CoinBattle Admin UI JavaScript
 * Handles admin panel interactions and real-time updates
 */

(function() {
  'use strict';

  // Socket.io connection
  const socket = io();

  // Current state
  let currentState = {
    active: false,
    match: null,
    leaderboard: [],
    teamScores: null,
    multiplier: { active: false, value: 1.0 },
    config: {}
  };

  let translations = {};
  let currentLanguage = 'en';

  // Initialize on DOM load
  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initButtons();
    initSocket();
    loadConfig();
    loadTranslations();
    updateOverlayURL();
  });

  /**
   * Initialize tab switching
   */
  function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;

        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(tc => tc.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // Load data for specific tabs
        if (tabName === 'leaderboard') {
          loadLifetimeLeaderboard();
        } else if (tabName === 'history') {
          loadMatchHistory();
        }
      });
    });
  }

  /**
   * Initialize button event listeners
   */
  function initButtons() {
    // Match control buttons
    document.getElementById('btn-start-match').addEventListener('click', startMatch);
    document.getElementById('btn-end-match').addEventListener('click', endMatch);
    document.getElementById('btn-pause-match').addEventListener('click', togglePause);
    document.getElementById('btn-extend-match').addEventListener('click', extendMatch);
    document.getElementById('btn-activate-multiplier').addEventListener('click', activateMultiplier);

    // Simulation buttons
    document.getElementById('btn-start-simulation').addEventListener('click', startSimulation);
    document.getElementById('btn-stop-simulation').addEventListener('click', stopSimulation);

    // Settings buttons
    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
    document.getElementById('btn-reset-settings').addEventListener('click', resetSettings);
    document.getElementById('btn-copy-url').addEventListener('click', copyOverlayURL);
    document.getElementById('btn-preview-overlay').addEventListener('click', previewOverlay);

    // Language selector
    document.getElementById('languageSelector').addEventListener('change', (e) => {
      currentLanguage = e.target.value;
      loadTranslations();
    });
  }

  /**
   * Initialize socket event listeners
   */
  function initSocket() {
    // Request initial state
    socket.emit('coinbattle:get-state');

    // Match state updates
    socket.on('coinbattle:match-state', (state) => {
      currentState = state;
      updateUI();
    });

    // Timer updates
    socket.on('coinbattle:timer-update', (data) => {
      updateTimer(data);
    });

    // Leaderboard updates
    socket.on('coinbattle:leaderboard-update', (data) => {
      currentState.leaderboard = data.leaderboard;
      currentState.teamScores = data.teamScores;
      updateLeaderboard();
    });

    // Match events
    socket.on('coinbattle:match-started', () => {
      showNotification('Match started!', 'success');
      socket.emit('coinbattle:get-state');
    });

    socket.on('coinbattle:match-ended', (data) => {
      showNotification('Match ended!', 'info');
      socket.emit('coinbattle:get-state');
    });

    socket.on('coinbattle:match-paused', () => {
      showNotification('Match paused', 'warning');
    });

    socket.on('coinbattle:match-resumed', () => {
      showNotification('Match resumed', 'success');
    });

    socket.on('coinbattle:match-extended', (data) => {
      showNotification(`Match extended by ${data.additionalSeconds}s`, 'info');
    });

    // Multiplier events
    socket.on('coinbattle:multiplier-activated', (data) => {
      currentState.multiplier = {
        active: true,
        value: data.multiplier,
        endTime: data.endTime
      };
      showNotification(`${data.multiplier}x multiplier activated!`, 'success');
      updateMultiplierDisplay();
    });

    socket.on('coinbattle:multiplier-ended', () => {
      currentState.multiplier = { active: false, value: 1.0 };
      updateMultiplierDisplay();
      showNotification('Multiplier ended', 'info');
    });

    // Gift events
    socket.on('coinbattle:gift-received', (data) => {
      // Could add visual feedback here
    });
  }

  /**
   * Start a match
   */
  async function startMatch() {
    const mode = document.getElementById('match-mode').value;
    const duration = parseInt(document.getElementById('match-duration').value);

    try {
      const response = await fetch('/api/plugins/coinbattle/match/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, duration })
      });

      const result = await response.json();
      if (result.success) {
        showNotification('Match started successfully!', 'success');
      } else {
        showNotification(`Error: ${result.error}`, 'danger');
      }
    } catch (error) {
      showNotification(`Error starting match: ${error.message}`, 'danger');
    }
  }

  /**
   * End current match
   */
  async function endMatch() {
    if (!confirm('Are you sure you want to end the current match?')) {
      return;
    }

    try {
      const response = await fetch('/api/plugins/coinbattle/match/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();
      if (result.success) {
        showNotification('Match ended successfully!', 'success');
      } else {
        showNotification(`Error: ${result.error}`, 'danger');
      }
    } catch (error) {
      showNotification(`Error ending match: ${error.message}`, 'danger');
    }
  }

  /**
   * Toggle pause/resume
   */
  async function togglePause() {
    const isPaused = currentState.match?.isPaused;
    const endpoint = isPaused ? 'resume' : 'pause';

    try {
      const response = await fetch(`/api/plugins/coinbattle/match/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();
      if (!result.success) {
        showNotification(`Error: ${result.error}`, 'danger');
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'danger');
    }
  }

  /**
   * Extend match duration
   */
  async function extendMatch() {
    try {
      const response = await fetch('/api/plugins/coinbattle/match/extend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seconds: 60 })
      });

      const result = await response.json();
      if (result.success) {
        showNotification('Match extended by 60 seconds!', 'success');
      } else {
        showNotification(`Error: ${result.error}`, 'danger');
      }
    } catch (error) {
      showNotification(`Error extending match: ${error.message}`, 'danger');
    }
  }

  /**
   * Activate multiplier
   */
  async function activateMultiplier() {
    try {
      const response = await fetch('/api/plugins/coinbattle/multiplier/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          multiplier: 2.0,
          duration: 30,
          activatedBy: 'admin'
        })
      });

      const result = await response.json();
      if (result.success) {
        showNotification('2x Multiplier activated for 30 seconds!', 'success');
      } else {
        showNotification(`Error: ${result.error}`, 'danger');
      }
    } catch (error) {
      showNotification(`Error activating multiplier: ${error.message}`, 'danger');
    }
  }

  /**
   * Start offline simulation
   */
  async function startSimulation() {
    try {
      const response = await fetch('/api/plugins/coinbattle/simulation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();
      if (result.success) {
        showNotification('Simulation started!', 'success');
        document.getElementById('btn-start-simulation').disabled = true;
        document.getElementById('btn-stop-simulation').disabled = false;
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'danger');
    }
  }

  /**
   * Stop offline simulation
   */
  async function stopSimulation() {
    try {
      const response = await fetch('/api/plugins/coinbattle/simulation/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();
      if (result.success) {
        showNotification('Simulation stopped!', 'info');
        document.getElementById('btn-start-simulation').disabled = false;
        document.getElementById('btn-stop-simulation').disabled = true;
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'danger');
    }
  }

  /**
   * Load configuration
   */
  async function loadConfig() {
    try {
      const response = await fetch('/api/plugins/coinbattle/config');
      const result = await response.json();

      if (result.success) {
        const config = result.data;
        currentState.config = config;

        // Populate form fields
        document.getElementById('match-mode').value = config.mode || 'solo';
        document.getElementById('match-duration').value = config.matchDuration || 300;
        document.getElementById('setting-autostart').checked = config.autoStart || false;
        document.getElementById('setting-autoreset').checked = config.autoReset !== false;
        document.getElementById('setting-autoextension').checked = config.autoExtension !== false;
        document.getElementById('setting-multipliers').checked = config.enableMultipliers !== false;
        document.getElementById('setting-extension-threshold').value = config.extensionThreshold || 15;
        document.getElementById('setting-extension-duration').value = config.extensionDuration || 60;
        document.getElementById('setting-team-assignment').value = config.teamAssignment || 'random';
        document.getElementById('setting-theme').value = config.theme || 'dark';
        document.getElementById('setting-skin').value = config.skin || 'gold';
        document.getElementById('setting-layout').value = config.layout || 'fullscreen';
        document.getElementById('setting-fontsize').value = config.fontSize || 16;
        document.getElementById('setting-show-avatars').checked = config.showAvatars !== false;
        document.getElementById('setting-show-badges').checked = config.showBadges !== false;
        document.getElementById('setting-toaster-mode').checked = config.toasterMode || false;
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }
  }

  /**
   * Save configuration
   */
  async function saveSettings() {
    const config = {
      mode: document.getElementById('match-mode').value,
      matchDuration: parseInt(document.getElementById('match-duration').value),
      autoStart: document.getElementById('setting-autostart').checked,
      autoReset: document.getElementById('setting-autoreset').checked,
      autoExtension: document.getElementById('setting-autoextension').checked,
      enableMultipliers: document.getElementById('setting-multipliers').checked,
      extensionThreshold: parseInt(document.getElementById('setting-extension-threshold').value),
      extensionDuration: parseInt(document.getElementById('setting-extension-duration').value),
      teamAssignment: document.getElementById('setting-team-assignment').value,
      theme: document.getElementById('setting-theme').value,
      skin: document.getElementById('setting-skin').value,
      layout: document.getElementById('setting-layout').value,
      fontSize: parseInt(document.getElementById('setting-fontsize').value),
      showAvatars: document.getElementById('setting-show-avatars').checked,
      showBadges: document.getElementById('setting-show-badges').checked,
      toasterMode: document.getElementById('setting-toaster-mode').checked,
      language: currentLanguage
    };

    try {
      const response = await fetch('/api/plugins/coinbattle/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const result = await response.json();
      if (result.success) {
        showNotification('Settings saved successfully!', 'success');
        currentState.config = config;
      } else {
        showNotification(`Error: ${result.error}`, 'danger');
      }
    } catch (error) {
      showNotification(`Error saving settings: ${error.message}`, 'danger');
    }
  }

  /**
   * Reset settings to defaults
   */
  function resetSettings() {
    if (!confirm('Reset all settings to defaults?')) {
      return;
    }
    loadConfig();
    showNotification('Settings reset to defaults', 'info');
  }

  /**
   * Update overlay URL
   */
  function updateOverlayURL() {
    const url = `${window.location.origin}/plugins/coinbattle/overlay`;
    document.getElementById('overlay-url').value = url;
  }

  /**
   * Copy overlay URL
   */
  async function copyOverlayURL() {
    const input = document.getElementById('overlay-url');
    const url = input.value;
    
    try {
      // Try modern Clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        showNotification('URL copied to clipboard!', 'success');
      } else {
        // Fallback to legacy method
        input.select();
        document.execCommand('copy');
        showNotification('URL copied to clipboard!', 'success');
      }
    } catch (error) {
      // Final fallback - manual selection
      input.select();
      showNotification('Please copy the URL manually (Ctrl+C)', 'warning');
    }
  }

  /**
   * Preview overlay
   */
  function previewOverlay() {
    const url = document.getElementById('overlay-url').value;
    window.open(url, '_blank', 'width=1920,height=1080');
  }

  /**
   * Load lifetime leaderboard
   */
  async function loadLifetimeLeaderboard() {
    const container = document.getElementById('lifetime-leaderboard');
    container.innerHTML = '<p class="loading"><span class="spinner"></span></p>';

    try {
      const response = await fetch('/api/plugins/coinbattle/leaderboard/lifetime?limit=20');
      const result = await response.json();

      if (result.success && result.data.length > 0) {
        container.innerHTML = renderLeaderboardTable(result.data, true);
      } else {
        container.innerHTML = '<p class="loading">No data available</p>';
      }
    } catch (error) {
      container.innerHTML = '<p class="loading">Error loading leaderboard</p>';
    }
  }

  /**
   * Load match history
   */
  async function loadMatchHistory() {
    const container = document.getElementById('match-history');
    container.innerHTML = '<p class="loading"><span class="spinner"></span></p>';

    try {
      const response = await fetch('/api/plugins/coinbattle/history?limit=20');
      const result = await response.json();

      if (result.success && result.data.length > 0) {
        container.innerHTML = result.data.map(match => renderHistoryItem(match)).join('');
      } else {
        container.innerHTML = '<p class="loading">No match history</p>';
      }
    } catch (error) {
      container.innerHTML = '<p class="loading">Error loading history</p>';
    }
  }

  /**
   * Render history item
   */
  function renderHistoryItem(match) {
    const date = new Date(match.start_time * 1000).toLocaleString();
    const duration = formatDuration(match.duration || 0);
    
    return `
      <div class="history-item">
        <div class="history-info">
          <div><strong>Match #${match.id}</strong> - ${match.mode === 'team' ? 'Team Battle' : 'Solo'}</div>
          <div class="history-meta">${date} • Duration: ${duration} • Coins: ${match.total_coins || 0}</div>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="exportMatch(${match.id})">📥 Export</button>
      </div>
    `;
  }

  /**
   * Export match data
   */
  window.exportMatch = async function(matchId) {
    try {
      const response = await fetch(`/api/plugins/coinbattle/export/${matchId}`);
      const result = await response.json();

      if (result.success) {
        const dataStr = JSON.stringify(result.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `coinbattle-match-${matchId}.json`;
        link.click();
        showNotification('Match data exported!', 'success');
      }
    } catch (error) {
      showNotification(`Error exporting: ${error.message}`, 'danger');
    }
  };

  /**
   * Update UI based on current state
   */
  function updateUI() {
    const isActive = currentState.active;
    const isPaused = currentState.match?.isPaused;

    // Update status
    const statusText = document.getElementById('match-status-text');
    statusText.textContent = isActive ? (isPaused ? 'Paused' : 'Active') : 'Inactive';
    statusText.className = `stat-value ${isActive ? (isPaused ? 'warning' : 'success') : ''}`;

    // Update buttons
    document.getElementById('btn-start-match').disabled = isActive;
    document.getElementById('btn-end-match').disabled = !isActive;
    document.getElementById('btn-pause-match').disabled = !isActive;
    document.getElementById('btn-pause-match').textContent = isPaused ? '▶️ Resume' : '⏸️ Pause';
    document.getElementById('btn-extend-match').disabled = !isActive;
    document.getElementById('btn-activate-multiplier').disabled = !isActive;

    // Update stats
    if (isActive && currentState.leaderboard) {
      const totalCoins = currentState.leaderboard.reduce((sum, p) => sum + p.coins, 0);
      document.getElementById('total-coins').textContent = totalCoins.toLocaleString();
      document.getElementById('participant-count').textContent = currentState.leaderboard.length;
    } else {
      document.getElementById('total-coins').textContent = '0';
      document.getElementById('participant-count').textContent = '0';
    }

    // Update leaderboard
    updateLeaderboard();
    updateMultiplierDisplay();
  }

  /**
   * Update timer display
   */
  function updateTimer(data) {
    const timerDisplay = document.getElementById('timer-display');
    const timeRemaining = document.getElementById('time-remaining');

    const minutes = Math.floor(data.remaining / 60);
    const seconds = data.remaining % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    timerDisplay.textContent = timeStr;
    timeRemaining.textContent = timeStr;

    // Color coding
    timerDisplay.className = 'timer-display';
    if (data.remaining < 30) {
      timerDisplay.classList.add('danger');
    } else if (data.remaining < 60) {
      timerDisplay.classList.add('warning');
    }
  }

  /**
   * Update leaderboard display
   */
  function updateLeaderboard() {
    const container = document.getElementById('current-leaderboard');

    if (!currentState.active || !currentState.leaderboard || currentState.leaderboard.length === 0) {
      container.innerHTML = '<p class="loading">No active match</p>';
      return;
    }

    container.innerHTML = renderLeaderboardTable(currentState.leaderboard, false);
  }

  /**
   * Render leaderboard table
   */
  function renderLeaderboardTable(data, showLifetimeStats) {
    let html = '<table class="leaderboard-table"><thead><tr>';
    html += '<th>Rank</th>';
    html += '<th>Player</th>';
    if (!showLifetimeStats && currentState.match?.mode === 'team') {
      html += '<th>Team</th>';
    }
    html += '<th>Coins</th>';
    html += '<th>Gifts</th>';
    if (showLifetimeStats) {
      html += '<th>Matches</th>';
      html += '<th>Wins</th>';
    }
    html += '</tr></thead><tbody>';

    data.forEach((player, index) => {
      html += '<tr>';
      html += `<td><strong>#${index + 1}</strong></td>`;
      html += `<td><div class="player-info">`;
      if (player.profile_picture_url) {
        html += `<img class="player-avatar" src="${player.profile_picture_url}" alt="${player.nickname}">`;
      } else {
        html += `<div class="player-avatar"></div>`;
      }
      html += `<div class="player-name">${player.nickname || player.unique_id}</div>`;
      html += `</div></td>`;
      
      if (!showLifetimeStats && currentState.match?.mode === 'team' && player.team) {
        html += `<td><span class="team-badge ${player.team}">${player.team.toUpperCase()}</span></td>`;
      }
      
      html += `<td><strong>${(player.coins || player.total_coins || 0).toLocaleString()}</strong></td>`;
      html += `<td>${(player.gifts || player.total_gifts || 0).toLocaleString()}</td>`;
      
      if (showLifetimeStats) {
        html += `<td>${player.matches_played || 0}</td>`;
        html += `<td>${player.matches_won || 0}</td>`;
      }
      
      html += '</tr>';
    });

    html += '</tbody></table>';
    return html;
  }

  /**
   * Update multiplier display
   */
  function updateMultiplierDisplay() {
    const card = document.getElementById('multiplier-card');
    
    if (currentState.multiplier?.active) {
      card.style.display = 'block';
      document.getElementById('multiplier-value').textContent = `${currentState.multiplier.value}x`;
      
      // Update countdown
      if (currentState.multiplier.endTime) {
        const updateCountdown = () => {
          const remaining = Math.max(0, Math.floor((currentState.multiplier.endTime - Date.now()) / 1000));
          document.getElementById('multiplier-remaining').textContent = `${remaining}s`;
          
          if (remaining > 0) {
            setTimeout(updateCountdown, 1000);
          }
        };
        updateCountdown();
      }
    } else {
      card.style.display = 'none';
    }
  }

  /**
   * Load translations
   */
  async function loadTranslations() {
    try {
      const response = await fetch(`/plugins/coinbattle/locales/${currentLanguage}.json`);
      translations = await response.json();
      // Could apply translations here
    } catch (error) {
      console.error('Error loading translations:', error);
    }
  }

  /**
   * Show notification
   */
  function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Create toast notification element
    const toast = document.createElement('div');
    toast.className = `alert alert-${type}`;
    toast.style.position = 'fixed';
    toast.style.top = '20px';
    toast.style.right = '20px';
    toast.style.zIndex = '9999';
    toast.style.minWidth = '300px';
    toast.style.animation = 'slideInRight 0.3s';
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3000);
  }

  /**
   * Format duration in seconds to readable format
   */
  function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }

})();
