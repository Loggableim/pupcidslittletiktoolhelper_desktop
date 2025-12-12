const StoryMemory = require('../utils/story-memory');

/**
 * Story Generation Engine
 * Orchestrates LLM calls, coherence checking, and chapter generation
 */
class StoryEngine {
  constructor(llmService, logger) {
    this.llmService = llmService;
    this.logger = logger;
    this.memory = new StoryMemory(logger);
    
    // Story themes with specific prompt styles
    this.themes = {
      fantasy: {
        name: 'Fantasy Adventure',
        style: 'epic fantasy with magic, mythical creatures, and heroic quests',
        tone: 'adventurous and dramatic'
      },
      cyberpunk: {
        name: 'Cyberpunk Thriller',
        style: 'futuristic cyberpunk with technology, corporations, and cyber-enhanced characters',
        tone: 'dark and intense'
      },
      horror: {
        name: 'Horror Mystery',
        style: 'suspenseful horror with supernatural elements and mounting dread',
        tone: 'eerie and suspenseful'
      },
      scifi: {
        name: 'Science Fiction',
        style: 'hard science fiction with space exploration, aliens, and advanced technology',
        tone: 'wonder and discovery'
      },
      mystery: {
        name: 'Detective Mystery',
        style: 'detective mystery with clues, suspects, and plot twists',
        tone: 'suspenseful and clever'
      },
      adventure: {
        name: 'Action Adventure',
        style: 'thrilling adventure with danger, exploration, and exciting challenges',
        tone: 'fast-paced and exciting'
      }
    };
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
  async generateChapter(chapterNumber, previousChoice = null, model = 'deepseek', numChoices = 4) {
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
    let prompt = `You are writing chapter ${chapterNumber} of an interactive ${themeData.style} story.\n\n`;

    if (context) {
      prompt += `STORY CONTEXT:\n${context}\n\n`;
    }

    if (previousChoice) {
      prompt += `PREVIOUS CHOICE: ${previousChoice}\n\n`;
    }

    prompt += `Write the next chapter of the story. The chapter should:\n`;
    prompt += `1. Be engaging and well-written (${themeData.tone})\n`;
    prompt += `2. Be 200-400 words\n`;
    prompt += `3. Continue logically from previous events\n`;
    prompt += `4. End with ${numChoices} distinct choices for readers\n`;
    prompt += `5. Include memory tags for characters, locations, and items\n\n`;

    prompt += `Format your response EXACTLY as follows:\n\n`;
    prompt += `TITLE: [Chapter title]\n\n`;
    prompt += `CONTENT:\n[Chapter text here]\n\n`;
    prompt += `CHOICES:\n`;
    for (let i = 1; i <= numChoices; i++) {
      prompt += `${i}. [Choice ${i}]\n`;
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
