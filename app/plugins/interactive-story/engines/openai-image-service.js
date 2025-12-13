const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * OpenAI Image Generation Service for DALL-E API
 * Supports DALL-E 2 and DALL-E 3
 */
class OpenAIImageService {
  constructor(apiKey, logger, cacheDir) {
    this.apiKey = apiKey;
    this.logger = logger;
    this.cacheDir = cacheDir;
    this.client = new OpenAI({ apiKey });
    
    this.models = {
      'dall-e-2': 'dall-e-2',  // Cost-efficient, faster
      'dall-e-3': 'dall-e-3'   // Higher quality, more expensive
    };

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Generate image from text prompt using DALL-E
   * @param {string} prompt - Image description
   * @param {string} model - Model to use (dall-e-2 or dall-e-3)
   * @param {string} style - Additional style prompt (ignored, for API compatibility)
   * @param {number} width - Image width (1024, 1792, or 512 for DALL-E 2)
   * @param {number} height - Image height (1024, 1792, or 512 for DALL-E 2)
   * @returns {Promise<string>} - Path to cached image file
   */
  async generateImage(prompt, model = 'dall-e-2', style = '', width = 1024, height = 1024) {
    try {
      const modelName = this.models[model] || this.models['dall-e-2'];
      
      // DALL-E 3 only supports 1024x1024, 1792x1024, or 1024x1792
      // DALL-E 2 supports 256x256, 512x512, or 1024x1024
      let size = '1024x1024';
      if (modelName === 'dall-e-3') {
        if (width === 1792 && height === 1024) {
          size = '1792x1024';
        } else if (width === 1024 && height === 1792) {
          size = '1024x1792';
        } else {
          size = '1024x1024';
        }
      } else {
        // DALL-E 2
        if (width === 512 && height === 512) {
          size = '512x512';
        } else if (width === 256 && height === 256) {
          size = '256x256';
        } else {
          size = '1024x1024';
        }
      }
      
      this.logger.info(`Generating image with ${modelName} (${size}): ${prompt.substring(0, 100)}...`);

      const response = await this.client.images.generate({
        model: modelName,
        prompt: prompt,
        n: 1,
        size: size,
        quality: modelName === 'dall-e-3' ? 'standard' : undefined, // quality only for DALL-E 3
        response_format: 'url'
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No images returned from OpenAI DALL-E API');
      }

      const imageUrl = response.data[0].url;
      return await this._cacheImageFromUrl(imageUrl, prompt);
      
    } catch (error) {
      this.logger.error(`OpenAI Image Service Error: ${error.message}`);
      if (error.response) {
        this.logger.error(`API Response: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Download and cache image from URL
   * @param {string} imageUrl - URL of the image
   * @param {string} prompt - Original prompt (for filename)
   * @returns {Promise<string>} - Path to cached file
   */
  async _cacheImageFromUrl(imageUrl, prompt) {
    try {
      const timestamp = Date.now();
      const safePrompt = prompt.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${timestamp}_${safePrompt}.png`;
      const filepath = path.join(this.cacheDir, filename);

      // Download from URL
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000
      });
      
      fs.writeFileSync(filepath, response.data);
      
      this.logger.info(`Image cached: ${filename} (${response.data.length} bytes)`);
      return filename;
    } catch (error) {
      this.logger.error(`Failed to cache image: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean old cached images
   * @param {number} daysOld - Remove files older than this many days
   */
  cleanOldCache(daysOld = 7) {
    try {
      const files = fs.readdirSync(this.cacheDir);
      const now = Date.now();
      const maxAge = daysOld * 24 * 60 * 60 * 1000;
      
      let cleaned = 0;
      files.forEach(file => {
        const filepath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filepath);
        if (now - stats.mtimeMs > maxAge) {
          fs.unlinkSync(filepath);
          cleaned++;
        }
      });
      
      if (cleaned > 0) {
        this.logger.info(`OpenAI Image Service: Cleaned ${cleaned} old cached images`);
      }
    } catch (error) {
      this.logger.error(`Failed to clean cache: ${error.message}`);
    }
  }
}

module.exports = OpenAIImageService;
