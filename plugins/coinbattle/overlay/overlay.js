/**
 * CoinBattle Overlay JavaScript
 * Real-time overlay with animations, themes, and effects
 */

(function() {
  'use strict';

  // Socket.io connection
  const socket = io();

  // Configuration
  let config = {
    theme: 'dark',
    skin: 'gold',
    layout: 'fullscreen',
    showAvatars: true,
    showBadges: true,
    animationSpeed: 'normal',
    toasterMode: false
  };

  // State
  let currentState = {
    active: false,
    match: null,
    leaderboard: [],
    teamScores: null,
    multiplier: { active: false },
    previousLeaderboard: []
  };

  // Timer state
  let timerInterval = null;
  let multiplierInterval = null;

  // Avatar cache
  const avatarCache = new Map();

  /**
   * Initialize overlay
   */
  function init() {
    loadConfig();
    applyTheme();
    connectSocket();
    startHeartbeat();
  }

  /**
   * Load configuration from URL parameters
   */
  function loadConfig() {
    const params = new URLSearchParams(window.location.search);
    
    config.theme = params.get('theme') || 'dark';
    config.skin = params.get('skin') || 'gold';
    config.layout = params.get('layout') || 'fullscreen';
    config.showAvatars = params.get('showAvatars') !== 'false';
    config.showBadges = params.get('showBadges') !== 'false';
    config.toasterMode = params.get('toasterMode') === 'true';
  }

  /**
   * Apply theme to body
   */
  function applyTheme() {
    document.body.className = `theme-${config.theme} layout-${config.layout} skin-${config.skin}`;
    
    if (config.toasterMode) {
      document.body.classList.add('toaster-mode');
    }
  }

  /**
   * Connect to Socket.io
   */
  function connectSocket() {
    // Request initial state
    socket.emit('coinbattle:get-state');

    // Match state updates
    socket.on('coinbattle:match-state', (state) => {
      handleMatchState(state);
    });

    // Timer updates
    socket.on('coinbattle:timer-update', (data) => {
      updateTimer(data);
    });

    // Leaderboard updates
    socket.on('coinbattle:leaderboard-update', (data) => {
      updateLeaderboard(data);
    });

    // Match events
    socket.on('coinbattle:match-ended', (data) => {
      showWinnerReveal(data);
    });

    // Multiplier events
    socket.on('coinbattle:multiplier-activated', (data) => {
      showMultiplier(data);
    });

    socket.on('coinbattle:multiplier-ended', () => {
      hideMultiplier();
    });

    // Gift events
    socket.on('coinbattle:gift-received', (data) => {
      showGiftAnimation(data);
    });

    // Badge events
    socket.on('coinbattle:badges-awarded', (data) => {
      showBadgeNotification(data);
    });
  }

  /**
   * Handle match state update
   */
  function handleMatchState(state) {
    currentState = state;

    if (state.active) {
      // Show match UI
      showMatchUI();
      
      // Update team scores if team mode
      if (state.match.mode === 'team' && state.teamScores) {
        updateTeamScores(state.teamScores);
      } else {
        hideTeamScores();
      }

      // Update leaderboard
      if (state.leaderboard) {
        updateLeaderboard({
          leaderboard: state.leaderboard,
          teamScores: state.teamScores,
          mode: state.match.mode
        });
      }

      // Update multiplier
      if (state.multiplier && state.multiplier.active) {
        showMultiplier(state.multiplier);
      } else {
        hideMultiplier();
      }
    } else {
      // Hide match UI
      hideMatchUI();
    }
  }

  /**
   * Show match UI
   */
  function showMatchUI() {
    document.getElementById('timer-container').style.display = 'block';
    document.getElementById('leaderboard-container').style.display = 'block';
  }

  /**
   * Hide match UI
   */
  function hideMatchUI() {
    document.getElementById('timer-container').style.display = 'none';
    document.getElementById('leaderboard-container').style.display = 'none';
    document.getElementById('team-scores-container').style.display = 'none';
    document.getElementById('multiplier-container').style.display = 'none';
  }

  /**
   * Update timer display
   */
  function updateTimer(data) {
    const minutes = Math.floor(data.remaining / 60);
    const seconds = data.remaining % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    const timerDisplay = document.getElementById('timer-display');
    timerDisplay.textContent = timeStr;

    // Update class for color coding
    timerDisplay.className = 'timer-display';
    if (data.remaining < 30) {
      timerDisplay.classList.add('danger');
    } else if (data.remaining < 60) {
      timerDisplay.classList.add('warning');
    }

    // Update circular progress
    const circle = document.getElementById('timer-circle-progress');
    const circumference = 2 * Math.PI * 45; // radius is 45
    const progress = data.remaining / data.total;
    const offset = circumference * (1 - progress);
    
    circle.style.strokeDashoffset = offset;
    circle.className = 'timer-circle-progress';
    if (data.remaining < 30) {
      circle.classList.add('danger');
    } else if (data.remaining < 60) {
      circle.classList.add('warning');
    }
  }

  /**
   * Update team scores
   */
  function updateTeamScores(teamScores) {
    const container = document.getElementById('team-scores-container');
    container.style.display = 'flex';

    const redCoins = document.getElementById('team-red-coins');
    const blueCoins = document.getElementById('team-blue-coins');
    const redScore = document.querySelector('.team-score.team-red');
    const blueScore = document.querySelector('.team-score.team-blue');

    // Animate coin changes
    animateValue(redCoins, parseInt(redCoins.textContent) || 0, teamScores.red, 500);
    animateValue(blueCoins, parseInt(blueCoins.textContent) || 0, teamScores.blue, 500);

    // Highlight leading team
    redScore.classList.toggle('leading', teamScores.red > teamScores.blue);
    blueScore.classList.toggle('leading', teamScores.blue > teamScores.red);
  }

  /**
   * Hide team scores
   */
  function hideTeamScores() {
    document.getElementById('team-scores-container').style.display = 'none';
  }

  /**
   * Update leaderboard
   */
  function updateLeaderboard(data) {
    const container = document.getElementById('leaderboard-content');
    const leaderboard = data.leaderboard || [];
    const teamScores = data.teamScores;
    const mode = data.mode;

    // Store previous positions for animation
    const previousPositions = new Map();
    currentState.previousLeaderboard.forEach((player, index) => {
      previousPositions.set(player.user_id, index);
    });

    // Render leaderboard
    container.innerHTML = '';

    leaderboard.forEach((player, index) => {
      const entry = createLeaderboardEntry(player, index, previousPositions, mode);
      container.appendChild(entry);
    });

    // Store current leaderboard for next update
    currentState.previousLeaderboard = leaderboard;
  }

  /**
   * Create leaderboard entry element
   */
  function createLeaderboardEntry(player, index, previousPositions, mode) {
    const entry = document.createElement('div');
    entry.className = 'leaderboard-entry';
    entry.classList.add(`rank-${index + 1}`);

    // Check if position changed
    const prevPosition = previousPositions.get(player.user_id);
    if (prevPosition !== undefined) {
      if (prevPosition > index) {
        entry.classList.add('moving-up');
      } else if (prevPosition < index) {
        entry.classList.add('moving-down');
      }
    }

    // Rank
    const rank = document.createElement('div');
    rank.className = 'entry-rank';
    rank.textContent = `#${index + 1}`;
    entry.appendChild(rank);

    // Avatar
    if (config.showAvatars && player.profile_picture_url) {
      const avatar = document.createElement('img');
      avatar.className = 'entry-avatar';
      avatar.src = getCachedAvatar(player.profile_picture_url);
      avatar.alt = player.nickname;
      avatar.onerror = () => {
        avatar.src = '';
        avatar.style.display = 'none';
      };
      entry.appendChild(avatar);
    } else if (config.showAvatars) {
      const avatarPlaceholder = document.createElement('div');
      avatarPlaceholder.className = 'entry-avatar';
      entry.appendChild(avatarPlaceholder);
    }

    // Player info
    const info = document.createElement('div');
    info.className = 'entry-info';

    const name = document.createElement('div');
    name.className = 'entry-name';
    name.textContent = player.nickname || player.unique_id;
    info.appendChild(name);

    // Badges
    if (config.showBadges && player.badges) {
      const badgesContainer = document.createElement('div');
      badgesContainer.className = 'entry-badges';
      
      let badges = [];
      try {
        badges = typeof player.badges === 'string' ? JSON.parse(player.badges) : player.badges;
      } catch (e) {
        badges = [];
      }

      badges.slice(0, 3).forEach(badgeId => {
        const badge = document.createElement('span');
        badge.className = 'entry-badge';
        badge.textContent = getBadgeIcon(badgeId);
        badgesContainer.appendChild(badge);
      });

      info.appendChild(badgesContainer);
    }

    entry.appendChild(info);

    // Team badge (if team mode)
    if (mode === 'team' && player.team) {
      const teamBadge = document.createElement('div');
      teamBadge.className = `entry-team ${player.team}`;
      teamBadge.textContent = player.team.toUpperCase();
      entry.appendChild(teamBadge);
    }

    // Coins
    const coins = document.createElement('div');
    coins.className = 'entry-coins';
    coins.textContent = (player.coins || 0).toLocaleString();
    entry.appendChild(coins);

    return entry;
  }

  /**
   * Get cached avatar or load new one
   */
  function getCachedAvatar(url) {
    if (avatarCache.has(url)) {
      return avatarCache.get(url);
    }
    avatarCache.set(url, url);
    return url;
  }

  /**
   * Get badge icon
   */
  function getBadgeIcon(badgeId) {
    const icons = {
      'top_donator': '👑',
      'legend': '⭐',
      'supporter': '💎',
      'team_player': '🤝',
      'coin_master': '🪙',
      'generous': '🎁',
      'champion': '🏆',
      'veteran': '🎖️'
    };
    return icons[badgeId] || '🏅';
  }

  /**
   * Show multiplier indicator
   */
  function showMultiplier(data) {
    const container = document.getElementById('multiplier-container');
    const value = document.getElementById('multiplier-value');
    const time = document.getElementById('multiplier-time');

    value.textContent = `${data.multiplier || data.value}x`;
    container.style.display = 'block';

    // Clear existing interval
    if (multiplierInterval) {
      clearInterval(multiplierInterval);
    }

    // Update countdown
    if (data.endTime) {
      multiplierInterval = setInterval(() => {
        const remaining = Math.max(0, Math.floor((data.endTime - Date.now()) / 1000));
        time.textContent = `${remaining}s`;
        
        if (remaining === 0) {
          clearInterval(multiplierInterval);
        }
      }, 1000);
    } else if (data.duration) {
      let remaining = data.duration;
      multiplierInterval = setInterval(() => {
        remaining--;
        time.textContent = `${remaining}s`;
        
        if (remaining === 0) {
          clearInterval(multiplierInterval);
          hideMultiplier();
        }
      }, 1000);
    }
  }

  /**
   * Hide multiplier indicator
   */
  function hideMultiplier() {
    const container = document.getElementById('multiplier-container');
    container.style.display = 'none';
    
    if (multiplierInterval) {
      clearInterval(multiplierInterval);
      multiplierInterval = null;
    }
  }

  /**
   * Show gift animation
   */
  function showGiftAnimation(data) {
    if (config.toasterMode) return; // Skip animations in toaster mode

    const container = document.getElementById('gift-animations');
    const particle = document.createElement('div');
    particle.className = 'gift-particle';
    particle.textContent = '🎁';

    // Random position
    particle.style.left = `${Math.random() * 80 + 10}%`;
    particle.style.bottom = '0';

    container.appendChild(particle);

    // Remove after animation
    setTimeout(() => {
      particle.remove();
    }, 3000);
  }

  /**
   * Show badge notification
   */
  function showBadgeNotification(data) {
    if (config.toasterMode) return; // Skip animations in toaster mode

    const container = document.getElementById('badge-notification');
    const icon = document.getElementById('badge-icon');
    const title = document.getElementById('badge-title');
    const name = document.getElementById('badge-name');

    if (data.badges && data.badges.length > 0) {
      const badge = data.badges[0];
      icon.textContent = badge.icon || '🏆';
      title.textContent = 'Achievement Unlocked!';
      name.textContent = badge.name;

      container.style.display = 'block';

      setTimeout(() => {
        container.style.display = 'none';
      }, 5000);
    }
  }

  /**
   * Show winner reveal
   */
  function showWinnerReveal(data) {
    const container = document.getElementById('winner-reveal');
    const winnerName = document.getElementById('winner-name');
    const winnerCoins = document.getElementById('winner-coins');

    let winner = null;
    if (data.winner && data.winner.winner_team) {
      // Team winner
      winnerName.textContent = `${data.winner.winner_team.toUpperCase()} TEAM WINS!`;
      winnerCoins.textContent = data.winner.winner_team === 'red' 
        ? data.teamScores.red.toLocaleString()
        : data.teamScores.blue.toLocaleString();
    } else if (data.leaderboard && data.leaderboard.length > 0) {
      // Solo winner
      winner = data.leaderboard[0];
      winnerName.textContent = winner.nickname || winner.unique_id;
      winnerCoins.textContent = winner.coins.toLocaleString();
    }

    // Show winner reveal
    container.style.display = 'flex';

    // Create confetti
    if (!config.toasterMode) {
      createConfetti();
    }

    // Hide after 10 seconds
    setTimeout(() => {
      container.style.display = 'none';
    }, 10000);
  }

  /**
   * Create confetti animation
   */
  function createConfetti() {
    const container = document.getElementById('confetti');
    const colors = ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#f7b731'];

    for (let i = 0; i < 100; i++) {
      setTimeout(() => {
        const confetti = document.createElement('div');
        confetti.className = 'confetti-piece';
        confetti.style.left = `${Math.random() * 100}%`;
        confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = `${Math.random() * 0.5}s`;
        
        container.appendChild(confetti);

        setTimeout(() => {
          confetti.remove();
        }, 3000);
      }, i * 30);
    }
  }

  /**
   * Animate value change
   */
  function animateValue(element, start, end, duration) {
    const range = end - start;
    const increment = range / (duration / 16);
    let current = start;

    const timer = setInterval(() => {
      current += increment;
      if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
        current = end;
        clearInterval(timer);
      }
      element.textContent = Math.floor(current).toLocaleString();
    }, 16);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  function startHeartbeat() {
    setInterval(() => {
      if (!currentState.active) {
        socket.emit('coinbattle:get-state');
      }
    }, 30000); // Every 30 seconds
  }

  // Initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
