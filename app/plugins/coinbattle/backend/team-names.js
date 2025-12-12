/**
 * Team Names Module
 * Allows users to set custom team names instead of "Red Team" / "Blue Team"
 */

class TeamNamesManager {
  constructor(database, logger = console) {
    this.db = database;
    this.logger = logger;
    
    // Default team names
    this.teamNames = {
      red: 'Team Rot',
      blue: 'Team Blau'
    };
    
    this.logger.info('🏷️ Team Names Manager initialized');
  }

  /**
   * Initialize database table
   */
  initializeTable() {
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS coinbattle_team_names (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id INTEGER,
        team TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(match_id, team)
      )
    `).run();
    
    // Load current team names
    this.loadTeamNames();
  }

  /**
   * Load team names from database
   */
  loadTeamNames() {
    try {
      const redName = this.db.prepare(`
        SELECT name FROM coinbattle_team_names 
        WHERE match_id IS NULL AND team = 'red'
        ORDER BY created_at DESC LIMIT 1
      `).get();
      
      const blueName = this.db.prepare(`
        SELECT name FROM coinbattle_team_names 
        WHERE match_id IS NULL AND team = 'blue'
        ORDER BY created_at DESC LIMIT 1
      `).get();
      
      if (redName) this.teamNames.red = redName.name;
      if (blueName) this.teamNames.blue = blueName.name;
      
    } catch (error) {
      this.logger.error(`Failed to load team names: ${error.message}`);
    }
  }

  /**
   * Set team name
   */
  setTeamName(team, name, matchId = null) {
    if (!['red', 'blue'].includes(team)) {
      return { success: false, error: 'Invalid team (must be "red" or "blue")' };
    }
    
    if (!name || name.trim().length === 0) {
      return { success: false, error: 'Team name cannot be empty' };
    }
    
    if (name.length > 50) {
      return { success: false, error: 'Team name too long (max 50 characters)' };
    }
    
    try {
      this.db.prepare(`
        INSERT INTO coinbattle_team_names (match_id, team, name)
        VALUES (?, ?, ?)
        ON CONFLICT(match_id, team) DO UPDATE SET name = excluded.name
      `).run(matchId, team, name.trim());
      
      // Update in-memory cache for global names
      if (!matchId) {
        this.teamNames[team] = name.trim();
      }
      
      this.logger.info(`Team name set: ${team} = "${name}"`);
      return { success: true };
      
    } catch (error) {
      this.logger.error(`Failed to set team name: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get team name
   */
  getTeamName(team, matchId = null) {
    if (!['red', 'blue'].includes(team)) {
      return null;
    }
    
    try {
      // Try to get match-specific name first
      if (matchId) {
        const result = this.db.prepare(`
          SELECT name FROM coinbattle_team_names 
          WHERE match_id = ? AND team = ?
        `).get(matchId, team);
        
        if (result) return result.name;
      }
      
      // Fall back to global name
      return this.teamNames[team];
      
    } catch (error) {
      this.logger.error(`Failed to get team name: ${error.message}`);
      return this.teamNames[team];
    }
  }

  /**
   * Get both team names
   */
  getTeamNames(matchId = null) {
    return {
      red: this.getTeamName('red', matchId),
      blue: this.getTeamName('blue', matchId)
    };
  }

  /**
   * Reset team names to defaults
   */
  resetTeamNames(matchId = null) {
    try {
      if (matchId) {
        this.db.prepare(`
          DELETE FROM coinbattle_team_names WHERE match_id = ?
        `).run(matchId);
      } else {
        this.db.prepare(`
          DELETE FROM coinbattle_team_names WHERE match_id IS NULL
        `).run();
        
        this.teamNames = {
          red: 'Team Rot',
          blue: 'Team Blau'
        };
      }
      
      this.logger.info('Team names reset to defaults');
      return { success: true };
      
    } catch (error) {
      this.logger.error(`Failed to reset team names: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get team name history
   */
  getTeamNameHistory(limit = 10) {
    try {
      return this.db.prepare(`
        SELECT * FROM coinbattle_team_names 
        WHERE match_id IS NULL
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit);
    } catch (error) {
      this.logger.error(`Failed to get team name history: ${error.message}`);
      return [];
    }
  }
}

module.exports = TeamNamesManager;
