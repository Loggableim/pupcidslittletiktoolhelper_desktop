/**
 * Talking Heads OBS Overlay JavaScript
 * Handles sprite animation synchronized with TTS audio
 */

const socket = io();

// Active avatar instances
const activeAvatars = new Map();

/**
 * Avatar instance class
 */
class AvatarInstance {
  constructor(userId, username, sprites, fadeInDuration) {
    this.userId = userId;
    this.username = username;
    this.sprites = sprites;
    this.fadeInDuration = fadeInDuration;
    
    this.element = null;
    this.currentFrame = 'idle_neutral';
    this.isActive = false;
    
    this.createElements();
  }

  /**
   * Create DOM elements for avatar
   */
  createElements() {
    // Create avatar container
    this.element = document.createElement('div');
    this.element.className = 'avatar';
    this.element.id = `avatar-${this.userId}`;
    
    // Create image element
    this.img = document.createElement('img');
    this.img.src = this.sprites.idle_neutral || '';
    this.img.alt = this.username;
    
    this.element.appendChild(this.img);
    document.getElementById('avatarContainer').appendChild(this.element);
  }

  /**
   * Show avatar with fade-in
   */
  show() {
    this.isActive = true;
    this.element.classList.add('animating-in', 'active');
    
    setTimeout(() => {
      this.element.classList.remove('animating-in');
    }, this.fadeInDuration);
  }

  /**
   * Hide avatar with fade-out
   * @param {number} fadeOutDuration - Fade out duration in ms
   */
  hide(fadeOutDuration) {
    this.isActive = false;
    this.element.classList.add('animating-out', 'fading-out');
    
    setTimeout(() => {
      this.element.remove();
    }, fadeOutDuration);
  }

  /**
   * Update displayed sprite frame
   * @param {string} frame - Frame name (idle_neutral, blink, speak_closed, etc.)
   */
  updateFrame(frame) {
    if (this.sprites[frame] && this.isActive) {
      this.currentFrame = frame;
      this.img.src = this.sprites[frame];
    }
  }

  /**
   * Stop and remove avatar
   */
  stop() {
    this.isActive = false;
    if (this.element && this.element.parentNode) {
      this.element.remove();
    }
  }
}

/**
 * Socket event handlers
 */

// Animation start event
socket.on('talkingheads:animation:start', (data) => {
  const { userId, username, sprites, fadeInDuration } = data;
  
  console.log(`Starting animation for ${username} (${userId})`);
  
  // Check if avatar already exists
  if (activeAvatars.has(userId)) {
    console.warn(`Avatar already active for ${userId}`);
    return;
  }
  
  // Create new avatar instance
  const avatar = new AvatarInstance(userId, username, sprites, fadeInDuration);
  activeAvatars.set(userId, avatar);
  
  // Show avatar
  avatar.show();
});

// Frame update event
socket.on('talkingheads:animation:frame', (data) => {
  const { userId, frame } = data;
  
  const avatar = activeAvatars.get(userId);
  if (avatar) {
    avatar.updateFrame(frame);
  }
});

// Animation end event
socket.on('talkingheads:animation:end', (data) => {
  const { userId, fadeOutDuration } = data;
  
  console.log(`Ending animation for ${userId}`);
  
  const avatar = activeAvatars.get(userId);
  if (avatar) {
    avatar.hide(fadeOutDuration);
    
    // Remove from active avatars after fade out
    setTimeout(() => {
      activeAvatars.delete(userId);
    }, fadeOutDuration);
  }
});

// Animation stop event (immediate)
socket.on('talkingheads:animation:stop', (data) => {
  const { userId } = data;
  
  console.log(`Stopping animation for ${userId}`);
  
  const avatar = activeAvatars.get(userId);
  if (avatar) {
    avatar.stop();
    activeAvatars.delete(userId);
  }
});

/**
 * Connection status
 */
socket.on('connect', () => {
  console.log('Talking Heads overlay connected to server');
});

socket.on('disconnect', () => {
  console.warn('Talking Heads overlay disconnected from server');
  
  // Clear all avatars on disconnect
  for (const avatar of activeAvatars.values()) {
    avatar.stop();
  }
  activeAvatars.clear();
});

/**
 * Error handling
 */
socket.on('error', (error) => {
  console.error('Socket error:', error);
});

// Log when overlay loads
console.log('Talking Heads OBS Overlay loaded and ready');
