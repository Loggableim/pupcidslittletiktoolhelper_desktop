const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Image Generation Service for SiliconFlow API
 * Supports: Tongyi-MAI/Z-Image-Turbo and black-forest-labs/FLUX.1-schnell
 */
class ImageService {
  constructor(apiKey, logger, cacheDir) {
    this.apiKey = apiKey;
    this.logger = logger;
    this.cacheDir = cacheDir;
    this.baseURL = 'https://api.siliconflow.com/v1';  // Fixed: Use .com instead of .cn
    
    this.models = {
      'z-image-turbo': 'Tongyi-MAI/Z-Image-Turbo',
      'flux-schnell': 'black-forest-labs/FLUX.1-schnell'
    };

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Generate image from text prompt
   * @param {string} prompt - Image description
   * @param {string} model - Model to use (z-image-turbo or flux-schnell)
   * @param {string} style - Additional style prompt
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {Promise<string>} - Path to cached image file
   */
  async generateImage(prompt, model = 'flux-schnell', style = '', width = 1024, height = 1024) {
    try {
      const modelName = this.models[model] || this.models['flux-schnell'];
      const fullPrompt = style ? `${prompt}, ${style}` : prompt;
      
      this.logger.info(`Generating image with ${modelName}: ${fullPrompt.substring(0, 100)}...`);

      const response = await axios.post(
        `${this.baseURL}/image/generations`,
        {
          model: modelName,
          prompt: fullPrompt,
          image_size: `${width}x${height}`,
          num_inference_steps: model === 'z-image-turbo' ? 4 : 20,
          guidance_scale: 7.5,
          seed: Math.floor(Math.random() * 1000000)
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000 // 60 second timeout for image generation
        }
      );

      if (response.data && response.data.images && response.data.images.length > 0) {
        const imageData = response.data.images[0];
        return await this._cacheImage(imageData, prompt);
      }

      throw new Error('Invalid response from Image API');
    } catch (error) {
      this.logger.error(`Image Service Error: ${error.message}`);
      if (error.response) {
        this.logger.error(`API Response: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Cache image data to local file
   * @param {Object} imageData - Image data from API (URL or base64)
   * @param {string} prompt - Original prompt (for filename)
   * @returns {Promise<string>} - Path to cached file
   */
  async _cacheImage(imageData, prompt) {
    try {
      const timestamp = Date.now();
      const safePrompt = prompt.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${timestamp}_${safePrompt}.png`;
      const filepath = path.join(this.cacheDir, filename);

      if (imageData.url) {
        // Download from URL
        const response = await axios.get(imageData.url, {
          responseType: 'arraybuffer',
          timeout: 30000
        });
        fs.writeFileSync(filepath, response.data);
      } else if (imageData.b64_json) {
        // Decode base64
        const buffer = Buffer.from(imageData.b64_json, 'base64');
        fs.writeFileSync(filepath, buffer);
      } else {
        throw new Error('Image data does not contain URL or base64');
      }

      this.logger.info(`Image cached to: ${filepath}`);
      return filepath;
    } catch (error) {
      this.logger.error(`Failed to cache image: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get cached image path if it exists
   * @param {string} filename - Image filename
   * @returns {string|null} - Full path or null
   */
  getCachedImage(filename) {
    const filepath = path.join(this.cacheDir, filename);
    return fs.existsSync(filepath) ? filepath : null;
  }

  /**
   * Clean old cached images (older than N days)
   * @param {number} daysOld - Days threshold
   */
  cleanOldCache(daysOld = 7) {
    try {
      const files = fs.readdirSync(this.cacheDir);
      const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
      let cleaned = 0;

      for (const file of files) {
        const filepath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filepath);
        
        if (stats.mtimeMs < cutoffTime) {
          fs.unlinkSync(filepath);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.logger.info(`Cleaned ${cleaned} old cached images`);
      }
    } catch (error) {
      this.logger.error(`Failed to clean cache: ${error.message}`);
    }
  }

  /**
   * Get style prompt based on story theme
   * @param {string} theme - Story theme
   * @returns {string} - Style description
   */
  getStyleForTheme(theme) {
    const styles = {
      fantasy: 'epic fantasy art, detailed, dramatic lighting, magical atmosphere, high quality digital art',
      cyberpunk: 'cyberpunk style, neon lights, futuristic cityscape, sci-fi, high tech, detailed digital art',
      horror: 'dark horror atmosphere, eerie lighting, suspenseful mood, detailed horror art style',
      scifi: 'science fiction art, space, futuristic technology, detailed sci-fi illustration',
      mystery: 'mysterious atmosphere, noir style, dramatic shadows, detective aesthetic',
      adventure: 'adventure illustration, dynamic scene, action-packed, vibrant colors, detailed art',
      romance: 'romantic atmosphere, soft lighting, beautiful scenery, emotional illustration',
      comedy: 'whimsical art style, bright colors, fun atmosphere, cartoonish but detailed'
    };

    return styles[theme.toLowerCase()] || styles.fantasy;
  }
}

module.exports = ImageService;
