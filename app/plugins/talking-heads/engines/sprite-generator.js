/**
 * Sprite Generator Engine
 * Generates 5 essential sprite frames from base avatar image
 */

const https = require('https');
const fs = require('fs').promises;
const path = require('path');
const { getStyleTemplate } = require('../utils/style-templates');

class SpriteGenerator {
  constructor(apiUrl, apiKey, logger, config) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.logger = logger;
    this.config = config;

    // Sprite frame definitions
    this.spriteFrames = {
      idle_neutral: 'character in neutral pose with relaxed expression, eyes open, mouth gently closed',
      blink: 'character with eyes gently closed, peaceful blinking expression, mouth closed',
      speak_closed: 'character with mouth closed, ready to speak, alert expression',
      speak_mid: 'character with mouth halfway open, mid-speech expression',
      speak_open: 'character with mouth fully open, speaking expression'
    };
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
   * Build prompt for sprite frame generation
   * @param {string} frameType - Type of sprite frame
   * @param {string} styleKey - Style template key
   * @param {string} username - TikTok username
   * @returns {string} Sprite generation prompt
   */
  buildSpritePrompt(frameType, styleKey, username) {
    const styleTemplate = getStyleTemplate(styleKey);
    if (!styleTemplate) {
      throw new Error(`Invalid style key: ${styleKey}`);
    }

    const frameDescription = this.spriteFrames[frameType];
    if (!frameDescription) {
      throw new Error(`Invalid frame type: ${frameType}`);
    }

    const resolution = this.config.spriteResolution || 512;

    return `Create a sprite animation frame for character "${username}".

Frame Type: ${frameType}
Frame Description: ${frameDescription}

Style Requirements:
- ${styleTemplate.spriteModifier}
- Artistic style: ${styleTemplate.name}

Technical Requirements:
- Transparent background (PNG format)
- Resolution: ${resolution}×${resolution}px
- Consistent with base avatar proportions
- Same visual identity and style
- Clean edges suitable for animation
- Centered composition
- Head and upper body visible

Output Requirements:
- Single sprite frame only
- No sprite sheet
- Animation-ready
- Professional quality`;
  }

  /**
   * Generate all sprite frames for avatar
   * @param {string} username - TikTok username
   * @param {string} userId - TikTok user ID
   * @param {string} avatarPath - Path to base avatar image
   * @param {string} styleKey - Style template key
   * @param {string} cacheDir - Directory to save sprites
   * @returns {Promise<object>} Object with paths to all sprite frames
   */
  async generateSprites(username, userId, avatarPath, styleKey, cacheDir) {
    try {
      this.logger.info(`TalkingHeads: Generating sprites for ${username}`);

      // Read avatar image to use as reference
      const avatarBuffer = await fs.readFile(avatarPath);
      const avatarBase64 = avatarBuffer.toString('base64');

      const spritePaths = {};

      // Generate each sprite frame
      for (const [frameType, frameDescription] of Object.entries(this.spriteFrames)) {
        try {
          const prompt = this.buildSpritePrompt(frameType, styleKey, username);
          
          this.logger.info(`TalkingHeads: Generating sprite frame "${frameType}" for ${username}`);

          // Call image generation API with image reference
          const response = await this._httpsPost(
            this.apiUrl,
            {
              model: 'black-forest-labs/FLUX.1-schnell',
              prompt: prompt,
              image_size: '512x512',
              batch_size: 1,
              num_inference_steps: 4,
              guidance_scale: 7.5
            },
            {
              'Authorization': `Bearer ${this.apiKey}`
            }
          );

          if (!response || !response.images || response.images.length === 0) {
            throw new Error(`No image returned for frame ${frameType}`);
          }

          // Get image data
          const imageData = response.images[0].url;
          
          // Download or decode image
          let imageBuffer;
          if (imageData.startsWith('http')) {
            imageBuffer = await this._httpsGetBuffer(imageData);
          } else {
            const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
            imageBuffer = Buffer.from(base64Data, 'base64');
          }

          // Save sprite frame
          const filename = `${userId}_${styleKey}_${frameType}.png`;
          const filepath = path.join(cacheDir, filename);
          await fs.writeFile(filepath, imageBuffer);

          spritePaths[frameType] = filepath;

          this.logger.info(`TalkingHeads: Sprite frame "${frameType}" generated for ${username}`);

        } catch (error) {
          this.logger.error(`TalkingHeads: Failed to generate sprite frame "${frameType}": ${error.message}`);
          throw error;
        }
      }

      this.logger.info(`TalkingHeads: All sprites generated successfully for ${username}`);
      return spritePaths;

    } catch (error) {
      this.logger.error(`TalkingHeads: Sprite generation failed for ${username}: ${error.message}`);
      throw new Error(`Sprite generation failed: ${error.message}`);
    }
  }

  /**
   * Generate single sprite frame (for testing or regeneration)
   * @param {string} username - TikTok username
   * @param {string} userId - TikTok user ID
   * @param {string} frameType - Type of sprite frame
   * @param {string} styleKey - Style template key
   * @param {string} cacheDir - Directory to save sprite
   * @returns {Promise<string>} Path to generated sprite
   */
  async generateSingleSprite(username, userId, frameType, styleKey, cacheDir) {
    if (!this.spriteFrames[frameType]) {
      throw new Error(`Invalid frame type: ${frameType}`);
    }

    try {
      const prompt = this.buildSpritePrompt(frameType, styleKey, username);

      const response = await this._httpsPost(
        this.apiUrl,
        {
          model: 'black-forest-labs/FLUX.1-schnell',
          prompt: prompt,
          image_size: '512x512',
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

      const imageData = response.images[0].url;
      
      let imageBuffer;
      if (imageData.startsWith('http')) {
        imageBuffer = await this._httpsGetBuffer(imageData);
      } else {
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        imageBuffer = Buffer.from(base64Data, 'base64');
      }

      const filename = `${userId}_${styleKey}_${frameType}.png`;
      const filepath = path.join(cacheDir, filename);
      await fs.writeFile(filepath, imageBuffer);

      return filepath;

    } catch (error) {
      this.logger.error(`TalkingHeads: Failed to generate sprite frame "${frameType}": ${error.message}`);
      throw error;
    }
  }

  /**
   * Get list of sprite frame types
   * @returns {string[]} Array of sprite frame type names
   */
  getFrameTypes() {
    return Object.keys(this.spriteFrames);
  }
}

module.exports = SpriteGenerator;
