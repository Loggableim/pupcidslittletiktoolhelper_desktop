/**
 * StreamAlchemy LightX Service
 * 
 * Handles image generation via LightX API for fusion items.
 * Supports both Image-to-Image (merging) and Text-to-Image generation.
 * 
 * Features:
 * - Image-to-Image merging with style transfer
 * - Text-to-Image generation as fallback
 * - Request queue for rate limiting
 * - Error handling and retries
 * - Timeout protection
 */

const https = require('https');
const http = require('http');

class LightXService {
    /**
     * @param {Object} logger - Logger instance
     * @param {string|null} apiKey - LightX API key
     */
    constructor(logger, apiKey = null) {
        this.logger = logger;
        this.apiKey = apiKey;
        
        // API Configuration
        this.baseUrl = 'https://api.lightxeditor.com/external/api/v1';
        this.timeout = 60000; // 60 seconds
        
        // Request queue for rate limiting
        this.queue = [];
        this.isProcessing = false;
        this.requestDelay = 1000; // 1 second between requests
        
        // Statistics
        this.stats = {
            totalRequests: 0,
            successfulGenerations: 0,
            failedGenerations: 0,
            imageToImageRequests: 0,
            textToImageRequests: 0
        };
    }

    /**
     * Update API key
     * @param {string} apiKey - New API key
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
        this.logger.info('[LIGHTX SERVICE] API key updated');
    }

    /**
     * Check if API key is configured
     * @returns {boolean} True if API key is set
     */
    hasApiKey() {
        return !!this.apiKey && this.apiKey.trim().length > 0;
    }

    /**
     * Generate fusion image using Image-to-Image API
     * Merges two source images with a style prompt
     * 
     * @param {string} imageUrl1 - First source image URL
     * @param {string} imageUrl2 - Second source image URL (used as style reference)
     * @param {string} prompt - Text prompt for the transformation
     * @param {Object} options - Additional options
     * @returns {Promise<string>} Generated image URL
     */
    async generateImageToImage(imageUrl1, imageUrl2, prompt, options = {}) {
        if (!this.hasApiKey()) {
            throw new Error('LightX API key not configured');
        }

        const {
            strength = 0.7,
            styleStrength = 0.5
        } = options;

        const payload = {
            imageUrl: imageUrl1,
            textPrompt: prompt,
            strength: strength
        };

        // Add style image if provided
        if (imageUrl2) {
            payload.styleImageUrl = imageUrl2;
            payload.styleStrength = styleStrength;
        }

        this.stats.imageToImageRequests++;
        return this.queueRequest('/image2image', payload);
    }

    /**
     * Generate image using Text-to-Image API
     * Creates a new image from a text description
     * 
     * @param {string} prompt - Text prompt for image generation
     * @param {Object} options - Additional options
     * @returns {Promise<string>} Generated image URL
     */
    async generateTextToImage(prompt, options = {}) {
        if (!this.hasApiKey()) {
            throw new Error('LightX API key not configured');
        }

        const payload = {
            textPrompt: prompt
        };

        this.stats.textToImageRequests++;
        return this.queueRequest('/text2image', payload);
    }

    /**
     * Generate fusion image with automatic mode selection
     * Uses Image-to-Image if base images available, otherwise Text-to-Image
     * 
     * @param {Object} itemA - First item with optional imageURL
     * @param {Object} itemB - Second item with optional imageURL
     * @param {string} prompt - Fusion prompt
     * @param {Object} options - Generation options
     * @returns {Promise<string>} Generated image URL
     */
    async generateFusionImage(itemA, itemB, prompt, options = {}) {
        const hasImageA = this.isValidImageUrl(itemA?.imageURL);
        const hasImageB = this.isValidImageUrl(itemB?.imageURL);

        this.logger.info(`[LIGHTX SERVICE] Generating fusion image. Image A: ${hasImageA}, Image B: ${hasImageB}`);

        // If both images available, use image-to-image
        if (hasImageA && hasImageB) {
            this.logger.info('[LIGHTX SERVICE] Using Image-to-Image mode (both images available)');
            return this.generateImageToImage(itemA.imageURL, itemB.imageURL, prompt, options);
        }
        
        // If one image available, use image-to-image with just base image
        if (hasImageA || hasImageB) {
            const baseImage = hasImageA ? itemA.imageURL : itemB.imageURL;
            this.logger.info('[LIGHTX SERVICE] Using Image-to-Image mode (single image as base)');
            return this.generateImageToImage(baseImage, null, prompt, options);
        }

        // No images - use text-to-image
        this.logger.info('[LIGHTX SERVICE] Using Text-to-Image mode (no base images)');
        return this.generateTextToImage(prompt, options);
    }

    /**
     * Check if URL is a valid image URL (not placeholder/data URL)
     * @param {string} url - URL to check
     * @returns {boolean} True if valid HTTP(S) image URL
     */
    isValidImageUrl(url) {
        if (!url || typeof url !== 'string') return false;
        // Exclude data URLs and placeholder images
        if (url.startsWith('data:')) return false;
        if (url.includes('placeholder')) return false;
        // Must be HTTP(S)
        return url.startsWith('http://') || url.startsWith('https://');
    }

    /**
     * Queue a request to the API
     * @param {string} endpoint - API endpoint
     * @param {Object} payload - Request payload
     * @returns {Promise<string>} Response image URL
     */
    async queueRequest(endpoint, payload) {
        return new Promise((resolve, reject) => {
            this.queue.push({ endpoint, payload, resolve, reject });
            this.stats.totalRequests++;
            this.processQueue();
        });
    }

    /**
     * Process the request queue
     */
    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.queue.length > 0) {
            const request = this.queue.shift();
            
            try {
                this.logger.debug(`[LIGHTX SERVICE] Processing request to ${request.endpoint}. Queue length: ${this.queue.length}`);
                
                const result = await this.makeRequest(request.endpoint, request.payload);
                this.stats.successfulGenerations++;
                request.resolve(result);
                
            } catch (error) {
                this.logger.error(`[LIGHTX SERVICE] Request failed: ${error.message}`);
                this.stats.failedGenerations++;
                request.reject(error);
            }

            // Delay between requests for rate limiting
            if (this.queue.length > 0) {
                await this.sleep(this.requestDelay);
            }
        }

        this.isProcessing = false;
    }

    /**
     * Make HTTP request to LightX API
     * @param {string} endpoint - API endpoint
     * @param {Object} payload - Request payload
     * @returns {Promise<string>} Image URL from response
     */
    async makeRequest(endpoint, payload) {
        const url = `${this.baseUrl}${endpoint}`;
        
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const isHttps = urlObj.protocol === 'https:';
            const httpModule = isHttps ? https : http;

            const data = JSON.stringify(payload);
            
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                    'x-api-key': this.apiKey
                },
                timeout: this.timeout
            };

            this.logger.debug(`[LIGHTX SERVICE] Making request to ${url}`);

            const req = httpModule.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const json = JSON.parse(responseData);
                        
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            // Extract image URL from response
                            // LightX API typically returns { output: { imageUrl: "..." } } or similar
                            const imageUrl = json.output?.imageUrl || 
                                            json.output?.url || 
                                            json.imageUrl || 
                                            json.url ||
                                            json.result?.imageUrl ||
                                            json.result?.url;
                            
                            if (imageUrl) {
                                this.logger.info('[LIGHTX SERVICE] Image generated successfully');
                                resolve(imageUrl);
                            } else {
                                // Check if response is async (orderId for polling)
                                if (json.orderId) {
                                    // Poll for result
                                    this.pollForResult(json.orderId)
                                        .then(resolve)
                                        .catch(reject);
                                } else {
                                    reject(new Error('No image URL in response'));
                                }
                            }
                        } else {
                            const errorMsg = json.error || json.message || `HTTP ${res.statusCode}`;
                            reject(new Error(`LightX API error: ${errorMsg}`));
                        }
                    } catch (parseError) {
                        reject(new Error(`Failed to parse response: ${parseError.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Request error: ${error.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(data);
            req.end();
        });
    }

    /**
     * Poll for async result using orderId
     * @param {string} orderId - Order ID from initial request
     * @returns {Promise<string>} Image URL
     */
    async pollForResult(orderId) {
        const maxAttempts = 30;
        const pollInterval = 2000; // 2 seconds

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await this.sleep(pollInterval);
            
            try {
                const result = await this.checkOrderStatus(orderId);
                if (result.status === 'completed' && result.imageUrl) {
                    return result.imageUrl;
                } else if (result.status === 'failed') {
                    throw new Error(result.error || 'Generation failed');
                }
                // Status is 'processing' - continue polling
            } catch (error) {
                this.logger.warn(`[LIGHTX SERVICE] Poll attempt ${attempt + 1} failed: ${error.message}`);
            }
        }

        throw new Error('Timeout waiting for image generation');
    }

    /**
     * Check order status
     * @param {string} orderId - Order ID
     * @returns {Promise<Object>} Order status
     */
    async checkOrderStatus(orderId) {
        const url = `${this.baseUrl}/order-status`;
        
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const isHttps = urlObj.protocol === 'https:';
            const httpModule = isHttps ? https : http;

            const data = JSON.stringify({ orderId });
            
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                    'x-api-key': this.apiKey
                },
                timeout: 10000
            };

            const req = httpModule.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const json = JSON.parse(responseData);
                        resolve({
                            status: json.status || 'unknown',
                            imageUrl: json.output?.imageUrl || json.imageUrl,
                            error: json.error
                        });
                    } catch (parseError) {
                        reject(new Error(`Failed to parse status response: ${parseError.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Status check error: ${error.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Status check timeout'));
            });

            req.write(data);
            req.end();
        });
    }

    /**
     * Sleep helper
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get service statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            ...this.stats,
            queueLength: this.queue.length,
            isProcessing: this.isProcessing,
            hasApiKey: this.hasApiKey()
        };
    }

    /**
     * Clean up resources
     */
    async destroy() {
        this.queue = [];
        this.isProcessing = false;
        this.logger.info('[LIGHTX SERVICE] Service destroyed');
    }
}

module.exports = LightXService;
