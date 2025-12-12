/**
 * Avatar Generator Engine
 * Generates AI-based 2D avatars using image generation API
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { getStyleTemplate } = require('../utils/style-templates');

class AvatarGenerator {
  constructor(apiUrl, apiKey, logger, config) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.logger = logger;
    this.config = config;
  }

  /**
   * Generate full prompt for avatar creation
   * @param {string} username - TikTok username
   * @param {string} profileImageUrl - URL to profile image
   * @param {string} styleKey - Style template key
   * @returns {string} Complete prompt for AI generation
   */
  buildAvatarPrompt(username, profileImageUrl, styleKey) {
    const styleTemplate = getStyleTemplate(styleKey);
    if (!styleTemplate) {
      throw new Error(`Invalid style key: ${styleKey}`);
    }

    const resolution = this.config.avatarResolution || 1500;

    return `Generate a unique 2D avatar based on the following user and style data.

User Data:
- Username: ${username}
- Profile image reference: Character should be inspired by the aesthetic of the user

Style Template:
- Artistic Style: ${styleTemplate.avatarPrompt}

Design Requirements:
- Maintain visual consistency with the selected ${styleTemplate.name} style
- Clear, expressive facial features suitable for animation
- Transparent background (PNG format)
- High resolution (minimum ${resolution}×${resolution}px)
- Full character portrait showing head and upper body
- Centered composition with face clearly visible

Output Requirements:
- Single character only
- Professional quality
- Animation-ready design
- Consistent lighting and colors`;
  }

  /**
   * Generate avatar image via API
   * @param {string} username - TikTok username
   * @param {string} userId - TikTok user ID
   * @param {string} profileImageUrl - URL to profile image
   * @param {string} styleKey - Style template key
   * @param {string} cacheDir - Directory to save generated image
   * @returns {Promise<string>} Path to generated avatar image
   */
  async generateAvatar(username, userId, profileImageUrl, styleKey, cacheDir) {
    try {
      const prompt = this.buildAvatarPrompt(username, profileImageUrl, styleKey);
      
      this.logger.info(`TalkingHeads: Generating avatar for ${username} with style ${styleKey}`);

      // Call image generation API
      const response = await axios.post(
        this.apiUrl,
        {
          model: 'black-forest-labs/FLUX.1-schnell',
          prompt: prompt,
          image_size: '1024x1024',
          batch_size: 1,
          num_inference_steps: 4,
          guidance_scale: 7.5,
          prompt_enhancement: true
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000 // 60 second timeout
        }
      );

      if (!response.data || !response.data.images || response.data.images.length === 0) {
        throw new Error('No image returned from API');
      }

      // Get base64 image data
      const imageData = response.data.images[0].url;
      
      // Download image if URL, or decode if base64
      let imageBuffer;
      if (imageData.startsWith('http')) {
        // Download from URL
        const imgResponse = await axios.get(imageData, { responseType: 'arraybuffer' });
        imageBuffer = Buffer.from(imgResponse.data);
      } else {
        // Decode base64
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        imageBuffer = Buffer.from(base64Data, 'base64');
      }

      // Save to cache directory
      const filename = `${userId}_${styleKey}_avatar.png`;
      const filepath = path.join(cacheDir, filename);
      await fs.writeFile(filepath, imageBuffer);

      this.logger.info(`TalkingHeads: Avatar generated and saved for ${username}`);
      return filepath;

    } catch (error) {
      this.logger.error(`TalkingHeads: Failed to generate avatar for ${username}`, error);
      
      if (error.response) {
        this.logger.error('TalkingHeads: API Error Response', {
          status: error.response.status,
          data: error.response.data
        });
      }
      
      throw new Error(`Avatar generation failed: ${error.message}`);
    }
  }

  /**
   * Validate API configuration
   * @returns {boolean} True if API is configured correctly
   */
  isConfigured() {
    return !!(this.apiUrl && this.apiKey);
  }

  /**
   * Test API connection
   * @returns {Promise<boolean>} True if API is accessible
   */
  async testConnection() {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      // Simple test with minimal prompt
      const response = await axios.post(
        this.apiUrl,
        {
          model: 'black-forest-labs/FLUX.1-schnell',
          prompt: 'A simple test image of a cartoon character face',
          image_size: '512x512',
          batch_size: 1,
          num_inference_steps: 4
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return response.status === 200;
    } catch (error) {
      this.logger.error('TalkingHeads: API connection test failed', error);
      return false;
    }
  }
}

module.exports = AvatarGenerator;
