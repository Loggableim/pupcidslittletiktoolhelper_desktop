/**
 * Voting System
 * Handles chat-based voting with !a, !b, !c commands
 */
class VotingSystem {
  constructor(logger, io) {
    this.logger = logger;
    this.io = io;
    this.reset();
  }

  /**
   * Reset voting state
   */
  reset() {
    this.active = false;
    this.choices = [];
    this.votes = new Map(); // userId -> choiceIndex
    this.voteCounts = [];
    this.startTime = null;
    this.endTime = null;
    this.timerHandle = null;
    this.settings = {
      votingDuration: 60, // seconds
      minVotes: 5,
      useMinSwing: false,
      swingThreshold: 10 // votes
    };
  }

  /**
   * Start a new voting session
   * @param {Array} choices - Array of choice strings
   * @param {Object} settings - Optional voting settings
   */
  start(choices, settings = {}) {
    if (this.active) {
      this.logger.warn('Voting already active, stopping previous vote');
      this.stop();
    }

    this.choices = choices;
    this.votes.clear();
    this.voteCounts = new Array(choices.length).fill(0);
    this.settings = { ...this.settings, ...settings };
    this.active = true;
    this.startTime = Date.now();
    this.endTime = this.startTime + (this.settings.votingDuration * 1000);

    this.logger.info(`Voting started: ${choices.length} choices, ${this.settings.votingDuration}s duration`);

    // Emit voting started event
    this.io.emit('story:voting-started', {
      choices: this.choices,
      duration: this.settings.votingDuration,
      endsAt: this.endTime
    });

    // Auto-end timer
    this.timerHandle = setTimeout(() => {
      this.end();
    }, this.settings.votingDuration * 1000);

    return {
      choices: this.choices,
      endsAt: this.endTime
    };
  }

  /**
   * Process a vote from chat
   * @param {string} userId - Unique user ID
   * @param {string} username - Display name
   * @param {string} voteCommand - Vote command (!a, !b, !c, etc.)
   * @returns {boolean} - Was vote accepted
   */
  processVote(userId, username, voteCommand) {
    if (!this.active) {
      return false;
    }

    // Parse vote command
    const match = voteCommand.match(/^!([a-z])$/i);
    if (!match) {
      return false;
    }

    const letter = match[1].toLowerCase();
    const choiceIndex = letter.charCodeAt(0) - 'a'.charCodeAt(0);

    // Validate choice index
    if (choiceIndex < 0 || choiceIndex >= this.choices.length) {
      this.logger.debug(`Invalid vote from ${username}: !${letter} (out of range)`);
      return false;
    }

    // Check if user already voted
    const previousVote = this.votes.get(userId);
    if (previousVote !== undefined) {
      // Remove previous vote
      this.voteCounts[previousVote]--;
    }

    // Record new vote
    this.votes.set(userId, choiceIndex);
    this.voteCounts[choiceIndex]++;

    this.logger.debug(`Vote recorded: ${username} -> !${letter} (Choice ${choiceIndex})`);

    // Emit vote update
    this.io.emit('story:vote-update', {
      voteCounts: this.voteCounts,
      totalVotes: this.votes.size,
      choices: this.choices
    });

    // Check for early end conditions
    this._checkEarlyEnd();

    return true;
  }

  /**
   * Check if voting should end early
   */
  _checkEarlyEnd() {
    if (!this.settings.useMinSwing) {
      return;
    }

    // Check if any option has overwhelming lead
    const maxVotes = Math.max(...this.voteCounts);
    const secondMax = this.voteCounts
      .filter(v => v !== maxVotes)
      .reduce((max, v) => Math.max(max, v), 0);

    const swing = maxVotes - secondMax;

    if (swing >= this.settings.swingThreshold && this.votes.size >= this.settings.minVotes) {
      this.logger.info(`Early voting end: Swing threshold reached (${swing} votes)`);
      this.end();
    }
  }

  /**
   * End voting and determine winner
   * @returns {Object} - Results
   */
  end() {
    if (!this.active) {
      this.logger.warn('Voting end called but no active vote');
      return null;
    }

    this.active = false;
    
    if (this.timerHandle) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }

    // Determine winner
    const maxVotes = Math.max(...this.voteCounts);
    const winnerIndex = this.voteCounts.indexOf(maxVotes);
    
    const results = {
      winnerIndex: winnerIndex,
      winnerText: this.choices[winnerIndex],
      voteCounts: [...this.voteCounts],
      totalVotes: this.votes.size,
      choices: [...this.choices],
      duration: (Date.now() - this.startTime) / 1000
    };

    this.logger.info(`Voting ended: Winner is choice ${winnerIndex} with ${maxVotes} votes`);

    // Emit results
    this.io.emit('story:voting-ended', results);

    return results;
  }

  /**
   * Force stop voting without results
   */
  stop() {
    if (this.timerHandle) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
    
    this.active = false;
    this.io.emit('story:voting-stopped', {});
    this.logger.info('Voting stopped');
  }

  /**
   * Get current voting status
   * @returns {Object} - Current status
   */
  getStatus() {
    return {
      active: this.active,
      choices: this.choices,
      voteCounts: this.voteCounts,
      totalVotes: this.votes.size,
      timeRemaining: this.active ? Math.max(0, this.endTime - Date.now()) / 1000 : 0,
      settings: this.settings
    };
  }

  /**
   * Get top voters (users with most participation)
   * @param {number} limit - Number of top voters to return
   * @returns {Array} - Top voters
   */
  getTopVoters(limit = 10) {
    // This would need to track across sessions
    // For now, return current session voters
    const voters = Array.from(this.votes.entries()).map(([userId, choice]) => ({
      userId,
      choice,
      participated: true
    }));

    return voters.slice(0, limit);
  }

  /**
   * Update voting settings
   * @param {Object} settings - New settings
   */
  updateSettings(settings) {
    this.settings = { ...this.settings, ...settings };
    this.logger.info('Voting settings updated:', settings);
  }

  /**
   * Is voting currently active
   * @returns {boolean}
   */
  isActive() {
    return this.active;
  }

  /**
   * Get available vote commands for current voting
   * @returns {Array} - Array of command strings
   */
  getVoteCommands() {
    if (!this.active) return [];
    
    return this.choices.map((_, index) => {
      const letter = String.fromCharCode('a'.charCodeAt(0) + index);
      return `!${letter}`;
    });
  }
}

module.exports = VotingSystem;
