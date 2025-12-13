const StoryMemory = require('../utils/story-memory');

/**
 * Story Generation Engine
 * Orchestrates LLM calls, coherence checking, and chapter generation
 */
class StoryEngine {
  constructor(llmService, logger, options = {}) {
    this.llmService = llmService;
    this.logger = logger;
    this.memory = new StoryMemory(logger);
    this.language = options.language || 'German'; // Default language
    this.platform = options.platform || 'tiktok'; // Target platform (affects chapter length)
    
    // Story themes with specific prompt styles
    this.themes = {
      fantasy: {
        name: 'Fantasy Adventure',
        style: 'epic fantasy with magic, mythical creatures, and heroic quests',
        tone: 'adventurous and dramatic',
        furry: false
      },
      cyberpunk: {
        name: 'Cyberpunk Thriller',
        style: 'futuristic cyberpunk with technology, corporations, and cyber-enhanced characters',
        tone: 'dark and intense',
        furry: false
      },
      horror: {
        name: 'Horror Mystery',
        style: 'suspenseful horror with supernatural elements and mounting dread',
        tone: 'eerie and suspenseful',
        furry: false
      },
      scifi: {
        name: 'Science Fiction',
        style: 'hard science fiction with space exploration, aliens, and advanced technology',
        tone: 'wonder and discovery',
        furry: false
      },
      mystery: {
        name: 'Detective Mystery',
        style: 'detective mystery with clues, suspects, and plot twists',
        tone: 'suspenseful and clever',
        furry: false
      },
      adventure: {
        name: 'Action Adventure',
        style: 'thrilling adventure with danger, exploration, and exciting challenges',
        tone: 'fast-paced and exciting',
        furry: false
      },
      furry_fantasy: {
        name: 'Furry Fantasy Quest',
        style: 'fantasy adventure with anthropomorphic animal characters in a magical world',
        tone: 'adventurous and heartwarming',
        furry: true
      },
      furry_scifi: {
        name: 'Furry Space Opera',
        style: 'space adventure featuring anthropomorphic characters exploring the galaxy',
        tone: 'exciting and wonder-filled',
        furry: true
      },
      romance: {
        name: 'Romantic Drama',
        style: 'emotional romance with relationship challenges and heartfelt moments',
        tone: 'emotional and passionate',
        furry: false
      },
      superhero: {
        name: 'Superhero Origin',
        style: 'superhero story with powers, villains, and saving the world',
        tone: 'action-packed and heroic',
        furry: false
      },
      postapocalyptic: {
        name: 'Post-Apocalyptic Survival',
        style: 'survival story in a post-apocalyptic wasteland with dangers and hope',
        tone: 'gritty and tense',
        furry: false
      },
      comedy: {
        name: 'Comedy Adventure',
        style: 'humorous adventure with funny situations, quirky characters, and lighthearted fun',
        tone: 'comedic and upbeat',
        furry: false
      }
    };
  }

  /**
   * Update story engine configuration
   * @param {Object} options - Configuration options
   */
  updateConfig(options = {}) {
    if (options.language) {
      this.language = options.language;
    }
    if (options.platform) {
      this.platform = options.platform;
    }
  }

  /**
   * Get random theme selection for user choice
   * @param {number} count - Number of themes to return (default: 5)
   * @returns {Array<Object>} - Array of theme objects with id, name, and description
   */
  getRandomThemes(count = 5) {
    const allThemes = Object.keys(this.themes);
    const furryThemes = allThemes.filter(id => this.themes[id].furry);
    const nonFurryThemes = allThemes.filter(id => !this.themes[id].furry);
    
    // Select 2 random furry themes
    const selectedFurry = [];
    const shuffledFurry = [...furryThemes].sort(() => Math.random() - 0.5);
    selectedFurry.push(...shuffledFurry.slice(0, Math.min(2, furryThemes.length)));
    
    // Select remaining themes from non-furry
    const remaining = count - selectedFurry.length;
    const shuffledNonFurry = [...nonFurryThemes].sort(() => Math.random() - 0.5);
    const selectedNonFurry = shuffledNonFurry.slice(0, remaining);
    
    // Combine and shuffle
    const selected = [...selectedFurry, ...selectedNonFurry].sort(() => Math.random() - 0.5);
    
    return selected.map(id => ({
      id,
      name: this.themes[id].name,
      description: this.themes[id].style,
      furry: this.themes[id].furry
    }));
  }

  /**
   * Initialize a new story
   * @param {string} theme - Story theme
   * @param {string} outline - Optional story outline
   * @param {string} model - LLM model to use
   * @returns {Promise<Object>} - Initial chapter
   */
  async initializeStory(theme, outline = null, model = 'deepseek') {
    const themeData = this.themes[theme] || this.themes.fantasy;
    
    // Generate outline if not provided
    if (!outline) {
      outline = await this._generateOutline(themeData, model);
    }

    this.memory.initialize(theme, outline, {
      genre: themeData.name,
      tone: themeData.tone,
      model: model
    });

    // Generate first chapter
    const firstChapter = await this.generateChapter(0, null, model);
    
    this.logger.info(`Story initialized: ${theme} - ${firstChapter.title}`);
    return firstChapter;
  }

  /**
   * Generate story outline
   * @param {Object} themeData - Theme configuration
   * @param {string} model - LLM model
   * @returns {Promise<string>} - Story outline
   */
  async _generateOutline(themeData, model) {
    const prompt = `Create a brief story outline for an interactive ${themeData.style} story.
The story should have potential for multiple branching paths and engaging choices.
Tone: ${themeData.tone}

Provide a 3-4 sentence outline that sets up the initial situation, conflict, and stakes.
Do not include specific choices - just the setup.`;

    const outline = await this.llmService.generateCompletion(prompt, model, 300, 0.8);
    return outline.trim();
  }

  /**
   * Generate a new chapter
   * @param {number} chapterNumber - Chapter number
   * @param {string} previousChoice - The choice made to reach this chapter
   * @param {string} model - LLM model to use
   * @param {number} numChoices - Number of choices to generate (3-6)
   * @returns {Promise<Object>} - Chapter data
   */
  async generateChapter(chapterNumber, previousChoice = null, model = 'deepseek', numChoices = 3) {
    const themeData = this.themes[this.memory.memory.theme] || this.themes.fantasy;
    const context = this.memory.getContext();

    const prompt = this._buildChapterPrompt(
      themeData,
      context,
      chapterNumber,
      previousChoice,
      numChoices
    );

    this.logger.info(`Generating chapter ${chapterNumber} with ${model}...`);
    
    let attempts = 0;
    let chapter = null;

    // Try to generate a coherent chapter (up to 3 attempts)
    while (attempts < 3 && !chapter) {
      attempts++;
      
      try {
        const response = await this.llmService.generateCompletion(prompt, model, 1500, 0.7);
        const parsed = this._parseChapterResponse(response, numChoices);
        
        // Coherence check
        if (await this._checkCoherence(parsed, context)) {
          chapter = parsed;
          chapter.chapterNumber = chapterNumber;
          chapter.model = model;
          
          // Update memory
          this.memory.updateFromChapter(chapter.content, {
            tags: chapter.memoryTags
          });
          this.memory.nextChapter();
        } else {
          this.logger.warn(`Chapter ${chapterNumber} failed coherence check, attempt ${attempts}`);
        }
      } catch (error) {
        this.logger.error(`Error generating chapter: ${error.message}`);
        if (attempts >= 3) throw error;
      }
    }

    if (!chapter) {
      throw new Error('Failed to generate coherent chapter after 3 attempts');
    }

    return chapter;
  }

  /**
   * Build chapter generation prompt
   */
  _buildChapterPrompt(themeData, context, chapterNumber, previousChoice, numChoices) {
    // Determine word count based on platform
    const wordCount = this.platform === 'tiktok' ? '30-50' : '200-400';
    
    let prompt = `You are writing chapter ${chapterNumber} of an interactive ${themeData.style} story in ${this.language}.\n\n`;

    if (context) {
      prompt += `STORY CONTEXT:\n${context}\n\n`;
    }

    if (previousChoice) {
      prompt += `PREVIOUS CHOICE: ${previousChoice}\n\n`;
    }

    prompt += `Write the next chapter of the story in ${this.language}. The chapter should:\n`;
    prompt += `1. Be engaging and well-written (${themeData.tone})\n`;
    prompt += `2. Be VERY SHORT: ${wordCount} words (ULTRA-SHORT and PUNCHY for ${this.platform} - low attention span!)\n`;
    prompt += `3. Continue logically from previous events\n`;
    prompt += `4. End with EXACTLY ${numChoices} COMPLETELY DIFFERENT AND UNIQUE choices for readers\n`;
    prompt += `5. Include memory tags for characters, locations, and items\n`;
    prompt += `6. Be written ENTIRELY in ${this.language}\n\n`;
    
    prompt += `CRITICAL FOR TIKTOK: Keep it EXTREMELY brief and impactful. Each sentence must hook the viewer!\n`;
    prompt += `IMPORTANT: Each choice MUST be different from the others. Do NOT repeat or duplicate choices!\n\n`;

    prompt += `Format your response EXACTLY as follows:\n\n`;
    prompt += `TITLE: [Chapter title in ${this.language}]\n\n`;
    prompt += `CONTENT:\n[Chapter text here in ${this.language} - VERY SHORT, MAX ${wordCount} WORDS]\n\n`;
    prompt += `CHOICES:\n`;
    for (let i = 1; i <= numChoices; i++) {
      prompt += `${i}. [Unique choice ${i} in ${this.language} - MUST BE DIFFERENT FROM OTHER CHOICES]\n`;
    }
    prompt += `\nMEMORY_TAGS:\n`;
    prompt += `CHARACTERS: [comma-separated character names]\n`;
    prompt += `LOCATIONS: [comma-separated location names]\n`;
    prompt += `ITEMS: [comma-separated item names]\n`;

    return prompt;
  }

  /**
   * Parse LLM response into structured chapter
   */
  _parseChapterResponse(response, numChoices) {
    const chapter = {
      title: '',
      content: '',
      choices: [],
      memoryTags: {
        characters: [],
        locations: [],
        items: []
      }
    };

    // Extract title
    const titleMatch = response.match(/TITLE:\s*(.+)/i);
    if (titleMatch) {
      chapter.title = titleMatch[1].trim();
    }

    // Extract content
    const contentMatch = response.match(/CONTENT:\s*([\s\S]+?)(?=CHOICES:|$)/i);
    if (contentMatch) {
      chapter.content = contentMatch[1].trim();
    }

    // Extract choices
    const choicesMatch = response.match(/CHOICES:\s*([\s\S]+?)(?=MEMORY_TAGS:|$)/i);
    if (choicesMatch) {
      const choiceLines = choicesMatch[1].trim().split('\n');
      for (const line of choiceLines) {
        const choiceMatch = line.match(/^\d+\.\s*(.+)/);
        if (choiceMatch) {
          chapter.choices.push(choiceMatch[1].trim());
        }
      }
    }

    // Ensure we have the right number of choices
    while (chapter.choices.length < numChoices) {
      chapter.choices.push('Continue the adventure');
    }
    chapter.choices = chapter.choices.slice(0, numChoices);

    // Extract memory tags
    const charactersMatch = response.match(/CHARACTERS:\s*(.+)/i);
    if (charactersMatch) {
      chapter.memoryTags.characters = charactersMatch[1]
        .split(',')
        .map(s => s.trim())
        .filter(s => s);
    }

    const locationsMatch = response.match(/LOCATIONS:\s*(.+)/i);
    if (locationsMatch) {
      chapter.memoryTags.locations = locationsMatch[1]
        .split(',')
        .map(s => s.trim())
        .filter(s => s);
    }

    const itemsMatch = response.match(/ITEMS:\s*(.+)/i);
    if (itemsMatch) {
      chapter.memoryTags.items = itemsMatch[1]
        .split(',')
        .map(s => s.trim())
        .filter(s => s);
    }

    return chapter;
  }

  /**
   * Check chapter coherence with story context
   * @param {Object} chapter - Generated chapter
   * @param {string} context - Story context
   * @returns {Promise<boolean>} - Is coherent
   */
  async _checkCoherence(chapter, context) {
    // Basic validation
    if (!chapter.title || !chapter.content || chapter.choices.length === 0) {
      this.logger.warn('Coherence check failed: Missing required fields');
      return false;
    }

    if (chapter.content.length < 100) {
      this.logger.warn('Coherence check failed: Content too short');
      return false;
    }

    // If this is the first chapter, no context to check against
    if (!context || context.length < 50) {
      return true;
    }

    // Check for contradictions (simplified - could use LLM for deeper check)
    const lowercaseContent = chapter.content.toLowerCase();
    
    // Check if chapter mentions tracked characters/locations
    const memory = this.memory.getFullMemory();
    let mentionsKnownElements = false;
    
    for (const char of memory.characters) {
      if (lowercaseContent.includes(char.name.toLowerCase())) {
        mentionsKnownElements = true;
        break;
      }
    }
    
    // First chapter might not mention anything yet
    if (memory.characters.length > 0 && !mentionsKnownElements) {
      this.logger.debug('Warning: Chapter doesn\'t mention known characters');
    }

    return true;
  }

  /**
   * Get available themes
   * @returns {Object} - Theme configurations
   */
  getThemes() {
    return this.themes;
  }

  /**
   * Get story memory
   * @returns {StoryMemory} - Memory instance
   */
  getMemory() {
    return this.memory;
  }

  /**
   * Reset story
   */
  reset() {
    this.memory.reset();
    this.logger.info('Story engine reset');
  }
}

module.exports = StoryEngine;
