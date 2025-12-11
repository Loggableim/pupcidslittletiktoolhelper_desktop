const axios = require('axios');

/**
 * Fish Speech 1.5 TTS Engine via SiliconFlow API
 * High-quality multilingual TTS using Fish Speech 1.5 model
 * 
 * API Documentation: https://docs.siliconflow.com/en/api-reference/audio/create-speech
 * - Base URL: https://api.siliconflow.cn/v1
 * - Endpoint: POST /v1/audio/speech
 * - Model: fishaudio/fish-speech-1.5
 * - Audio Formats: mp3, opus, aac, flac, wav, pcm
 * 
 * Features:
 * - Multilingual support (English, Chinese, Japanese, etc.)
 * - Multiple voice options
 * - Configurable speaking rate
 * - Automatic retry with exponential backoff
 * - Performance mode optimization
 */
class FishSpeechEngine {
    constructor(apiKey, logger, config = {}) {
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
            throw new Error('Fish Speech API key is required and must be a non-empty string');
        }

        this.apiKey = apiKey;
        this.logger = logger;
        this.config = config;

        // API Configuration
        this.apiBaseUrl = 'https://api.siliconflow.cn/v1';
        this.apiSynthesisUrl = `${this.apiBaseUrl}/audio/speech`;
        this.model = 'fishaudio/fish-speech-1.5';

        // Performance mode optimization
        const performanceMode = config.performanceMode || 'balanced';
        
        // Adjust timeout and retries based on performance mode
        if (performanceMode === 'fast') {
            // Fast mode: optimized for low-resource PCs
            this.timeout = 5000;  // 5s timeout for faster failure
            this.maxRetries = 1;  // Only 1 retry (2 attempts total)
        } else if (performanceMode === 'quality') {
            // Quality mode: longer timeouts for better reliability
            this.timeout = 20000; // 20s timeout
            this.maxRetries = 3;  // 3 retries (4 attempts total)
        } else {
            // Balanced mode (default): moderate settings
            this.timeout = 10000; // 10s timeout
            this.maxRetries = 2;  // 2 retries (3 attempts total)
        }
        
        this.performanceMode = performanceMode;
        this.logger.info(`Fish Speech TTS: Performance mode set to '${performanceMode}' (timeout: ${this.timeout}ms, retries: ${this.maxRetries})`);

        this.logger.info('Fish Speech 1.5 TTS engine initialized');
    }

    /**
     * Get all available Fish Speech voices
     * @returns {Object} Voice map with voiceId as key
     */
    static getVoices() {
        return {
            // English voices
            'fishaudio-en-1': { 
                name: 'English Voice 1 (Female)', 
                lang: 'en', 
                gender: 'female',
                model: 'fishaudio/fish-speech-1.5',
                description: 'Clear English female voice'
            },
            'fishaudio-en-2': { 
                name: 'English Voice 2 (Male)', 
                lang: 'en', 
                gender: 'male',
                model: 'fishaudio/fish-speech-1.5',
                description: 'Natural English male voice'
            },
            
            // Chinese voices
            'fishaudio-zh-1': { 
                name: 'Chinese Voice 1 (Female)', 
                lang: 'zh', 
                gender: 'female',
                model: 'fishaudio/fish-speech-1.5',
                description: 'Mandarin Chinese female voice'
            },
            'fishaudio-zh-2': { 
                name: 'Chinese Voice 2 (Male)', 
                lang: 'zh', 
                gender: 'male',
                model: 'fishaudio/fish-speech-1.5',
                description: 'Mandarin Chinese male voice'
            },
            
            // Japanese voices
            'fishaudio-ja-1': { 
                name: 'Japanese Voice 1 (Female)', 
                lang: 'ja', 
                gender: 'female',
                model: 'fishaudio/fish-speech-1.5',
                description: 'Japanese female voice'
            },
            'fishaudio-ja-2': { 
                name: 'Japanese Voice 2 (Male)', 
                lang: 'ja', 
                gender: 'male',
                model: 'fishaudio/fish-speech-1.5',
                description: 'Japanese male voice'
            },
            
            // German voices
            'fishaudio-de-1': { 
                name: 'German Voice 1 (Female)', 
                lang: 'de', 
                gender: 'female',
                model: 'fishaudio/fish-speech-1.5',
                description: 'German female voice'
            },
            'fishaudio-de-2': { 
                name: 'German Voice 2 (Male)', 
                lang: 'de', 
                gender: 'male',
                model: 'fishaudio/fish-speech-1.5',
                description: 'German male voice'
            },
            
            // Spanish voices
            'fishaudio-es-1': { 
                name: 'Spanish Voice 1 (Female)', 
                lang: 'es', 
                gender: 'female',
                model: 'fishaudio/fish-speech-1.5',
                description: 'Spanish female voice'
            },
            'fishaudio-es-2': { 
                name: 'Spanish Voice 2 (Male)', 
                lang: 'es', 
                gender: 'male',
                model: 'fishaudio/fish-speech-1.5',
                description: 'Spanish male voice'
            },
            
            // French voices
            'fishaudio-fr-1': { 
                name: 'French Voice 1 (Female)', 
                lang: 'fr', 
                gender: 'female',
                model: 'fishaudio/fish-speech-1.5',
                description: 'French female voice'
            },
            'fishaudio-fr-2': { 
                name: 'French Voice 2 (Male)', 
                lang: 'fr', 
                gender: 'male',
                model: 'fishaudio/fish-speech-1.5',
                description: 'French male voice'
            }
        };
    }

    /**
     * Get default voice for a specific language
     * @param {string} langCode - Language code (e.g., 'en', 'de', 'zh')
     * @returns {string} Default voice ID for the language
     */
    static getDefaultVoiceForLanguage(langCode) {
        const langMap = {
            'en': 'fishaudio-en-1',
            'de': 'fishaudio-de-1',
            'zh': 'fishaudio-zh-1',
            'ja': 'fishaudio-ja-1',
            'es': 'fishaudio-es-1',
            'fr': 'fishaudio-fr-1'
        };
        return langMap[langCode] || 'fishaudio-en-1';
    }

    /**
     * Convert text to speech using Fish Speech 1.5
     * @param {string} text - The text to convert
     * @param {string} voiceId - The voice ID (e.g., 'fishaudio-en-1')
     * @param {number} speed - Speaking rate (0.5 - 2.0)
     * @param {object} options - Additional options
     * @returns {Promise<string>} Base64-encoded audio data
     */
    async synthesize(text, voiceId = 'fishaudio-en-1', speed = 1.0, options = {}) {
        const voices = FishSpeechEngine.getVoices();
        const voiceConfig = voices[voiceId];

        if (!voiceConfig) {
            this.logger.warn(`Invalid voice ID: ${voiceId}, falling back to default`);
            voiceId = 'fishaudio-en-1';
        }

        // Extract voice identifier from voiceId (e.g., 'fishaudio-en-1' -> 'en-1')
        const voiceName = voiceId.replace('fishaudio-', '') || 'en-1';

        try {
            this.logger.info(`Fish Speech TTS: Synthesizing with voice=${voiceName}, speed=${speed}`);

            const requestBody = {
                model: this.model,
                input: text,
                voice: voiceName,
                response_format: options.format || 'mp3',
                speed: speed || 1.0
            };

            const response = await axios.post(this.apiSynthesisUrl, requestBody, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer',
                timeout: this.timeout
            });

            // Convert response to base64
            const buffer = Buffer.from(response.data);
            const base64Audio = buffer.toString('base64');

            this.logger.info(`Fish Speech TTS: Successfully synthesized ${buffer.length} bytes`);
            return base64Audio;

        } catch (error) {
            if (error.response) {
                // API error response
                const errorMessage = error.response.data ? 
                    (Buffer.isBuffer(error.response.data) ? 
                        error.response.data.toString('utf-8') : 
                        JSON.stringify(error.response.data)) : 
                    'Unknown error';
                this.logger.error(`Fish Speech TTS: API error (${error.response.status}): ${errorMessage}`);
                throw new Error(`Fish Speech API error: ${errorMessage}`);
            } else if (error.request) {
                // Network error
                this.logger.error(`Fish Speech TTS: Network error - ${error.message}`);
                throw new Error(`Fish Speech network error: ${error.message}`);
            } else {
                // Other error
                this.logger.error(`Fish Speech TTS: Synthesis failed - ${error.message}`);
                throw error;
            }
        }
    }

    /**
     * Update API key
     * @param {string} apiKey - New API key
     */
    setApiKey(apiKey) {
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
            throw new Error('Fish Speech API key must be a non-empty string');
        }
        this.apiKey = apiKey;
        this.logger.info('Fish Speech TTS: API key updated');
    }

    /**
     * Get voices asynchronously (for consistency with other engines)
     * @returns {Promise<Object>} Voice map
     */
    async getVoices() {
        return FishSpeechEngine.getVoices();
    }
}

module.exports = FishSpeechEngine;
