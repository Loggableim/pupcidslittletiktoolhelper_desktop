/**
 * Avatar Generator Engine
 * Generates AI-based 2D avatars using image generation API
 */

const https = require('https');
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
   * Make HTTPS POST request
   * @param {string} url - URL to POST to
   * @param {object} data - Data to send
   * @param {object} headers - HTTP headers
   * @returns {Promise<object>} Response data
   */
  async _httpsPost(url, data, headers = {}) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(data);
      const urlObj = new URL(url);
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          ...headers
        },
        timeout: 60000,
        // TLS configuration to fix SSL handshake failures
        minVersion: 'TLSv1.2'
      };

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(error.message || 'HTTP request failed'));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Make HTTPS GET request for binary data
   * @param {string} url - URL to GET
   * @returns {Promise<Buffer>} Response buffer
   */
  async _httpsGetBuffer(url) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        // TLS configuration to fix SSL handshake failures
        minVersion: 'TLSv1.2'
      };
      
      https.get(options, (res) => {
        const chunks = [];

        res.on('data', (chunk) => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
      }).on('error', (error) => {
        reject(new Error(error.message || 'HTTP GET request failed'));
      });
    });
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
      const response = await this._httpsPost(
        this.apiUrl,
        {
          model: 'black-forest-labs/FLUX.1-schnell',
          prompt: prompt,
          image_size: '1024x1024',
          batch_size: 1,
          num_inference_steps: 4,
          guidance_scale: 7.5
        },
        {
          'Authorization': `Bearer ${this.apiKey}`
        }
      );

      if (!response || !response.images || response.images.length === 0) {
        throw new Error('No image returned from API');
      }

      // Get base64 image data
      const imageData = response.images[0].url;
      
      // Download image if URL, or decode if base64
      let imageBuffer;
      if (imageData.startsWith('http')) {
        // Download from URL
        imageBuffer = await this._httpsGetBuffer(imageData);
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
      this.logger.error(`TalkingHeads: Failed to generate avatar for ${username}: ${error.message}`);
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
      const response = await this._httpsPost(
        this.apiUrl,
        {
          model: 'black-forest-labs/FLUX.1-schnell',
          prompt: 'A simple test image of a cartoon character face',
          image_size: '1024x1024',
          batch_size: 1,
          num_inference_steps: 4,
          guidance_scale: 7.5
        },
        {
          'Authorization': `Bearer ${this.apiKey}`
        }
      );

      return !!(response && response.images);
    } catch (error) {
      this.logger.error(`TalkingHeads: API connection test failed: ${error.message}`);
      return false;
    }
  }
}

module.exports = AvatarGenerator;
