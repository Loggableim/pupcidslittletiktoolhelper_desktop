const axios = require('axios');

/**
 * TikTok RapidAPI TTS Engine
 * Uses the RapidAPI TTS TikTok service (https://rapidapi.com/dalamates/api/tts-tiktok)
 * Provides TikTok-style voices without requiring SessionID management
 */
class TikTokRapidAPIEngine {
    constructor(apiKey, logger, config = {}) {
        this.apiKey = apiKey;
        this.logger = logger;
        
        // RapidAPI configuration
        this.apiHost = 'tts-tiktok.p.rapidapi.com';
        this.apiUrl = 'https://tts-tiktok.p.rapidapi.com/tts';
        
        // Performance mode optimization
        const performanceMode = config.performanceMode || 'balanced';
        
        // Adjust timeout and retries based on performance mode
        if (performanceMode === 'fast') {
            this.timeout = 5000;  // 5s timeout
            this.maxRetries = 1;  // Only 1 retry
        } else if (performanceMode === 'quality') {
            this.timeout = 20000; // 20s timeout
            this.maxRetries = 3;  // 3 retries
        } else {
            this.timeout = 10000; // 10s timeout
            this.maxRetries = 2;  // 2 retries
        }
        
        this.performanceMode = performanceMode;
        this.logger.info(`TikTok RapidAPI TTS: Performance mode set to '${performanceMode}' (timeout: ${this.timeout}ms, retries: ${this.maxRetries})`);
        
        // Maximum text length supported by the API
        this.maxTextLength = 300;
    }

    /**
     * Get all available TikTok RapidAPI TTS voices
     */
    static getVoices() {
        return {
            // English (US) voices
            'en_us_001': { name: 'English US Female 1', lang: 'en', gender: 'female', style: 'standard' },
            'en_us_002': { name: 'English US Female 2', lang: 'en', gender: 'female', style: 'standard' },
            'en_us_006': { name: 'English US Male 1', lang: 'en', gender: 'male', style: 'standard' },
            'en_us_007': { name: 'English US Male 2', lang: 'en', gender: 'male', style: 'standard' },
            'en_us_009': { name: 'English US Male 3', lang: 'en', gender: 'male', style: 'standard' },
            'en_us_010': { name: 'English US Male 4', lang: 'en', gender: 'male', style: 'standard' },
            
            // Character voices (English)
            'en_us_ghostface': { name: 'Ghostface', lang: 'en', gender: 'male', style: 'character' },
            'en_us_chewbacca': { name: 'Chewbacca', lang: 'en', gender: 'male', style: 'character' },
            'en_us_c3po': { name: 'C3PO', lang: 'en', gender: 'male', style: 'character' },
            'en_us_stitch': { name: 'Stitch', lang: 'en', gender: 'male', style: 'character' },
            'en_us_stormtrooper': { name: 'Stormtrooper', lang: 'en', gender: 'male', style: 'character' },
            'en_us_rocket': { name: 'Rocket', lang: 'en', gender: 'male', style: 'character' },
            
            // English (UK)
            'en_uk_001': { name: 'English UK Male 1', lang: 'en', gender: 'male', style: 'standard' },
            'en_uk_003': { name: 'English UK Male 2', lang: 'en', gender: 'male', style: 'standard' },
            
            // English (AU)
            'en_au_001': { name: 'English AU Female', lang: 'en', gender: 'female', style: 'standard' },
            'en_au_002': { name: 'English AU Male', lang: 'en', gender: 'male', style: 'standard' },
            
            // German
            'de_001': { name: 'Deutsch Female', lang: 'de', gender: 'female', style: 'standard' },
            'de_002': { name: 'Deutsch Male', lang: 'de', gender: 'male', style: 'standard' },
            
            // Spanish
            'es_002': { name: 'Español Male', lang: 'es', gender: 'male', style: 'standard' },
            'es_mx_002': { name: 'Español MX Male', lang: 'es', gender: 'male', style: 'standard' },
            
            // French
            'fr_001': { name: 'Français Male 1', lang: 'fr', gender: 'male', style: 'standard' },
            'fr_002': { name: 'Français Male 2', lang: 'fr', gender: 'male', style: 'standard' },
            
            // Portuguese
            'br_001': { name: 'Português BR Female 1', lang: 'pt', gender: 'female', style: 'standard' },
            'br_003': { name: 'Português BR Female 2', lang: 'pt', gender: 'female', style: 'standard' },
            'br_004': { name: 'Português BR Female 3', lang: 'pt', gender: 'female', style: 'standard' },
            'br_005': { name: 'Português BR Male', lang: 'pt', gender: 'male', style: 'standard' },
            
            // Indonesian
            'id_001': { name: 'Indonesia Female', lang: 'id', gender: 'female', style: 'standard' },
            
            // Japanese
            'jp_001': { name: '日本語 Female 1', lang: 'ja', gender: 'female', style: 'standard' },
            'jp_003': { name: '日本語 Female 2', lang: 'ja', gender: 'female', style: 'standard' },
            'jp_005': { name: '日本語 Female 3', lang: 'ja', gender: 'female', style: 'standard' },
            'jp_006': { name: '日本語 Male', lang: 'ja', gender: 'male', style: 'standard' },
            
            // Korean
            'kr_002': { name: '한국어 Male 1', lang: 'ko', gender: 'male', style: 'standard' },
            'kr_003': { name: '한국어 Female', lang: 'ko', gender: 'female', style: 'standard' },
            'kr_004': { name: '한국어 Male 2', lang: 'ko', gender: 'male', style: 'standard' },
            
            // Other languages
            'nl_001': { name: 'Nederlands Male', lang: 'nl', gender: 'male', style: 'standard' },
            'pl_001': { name: 'Polski Female', lang: 'pl', gender: 'female', style: 'standard' },
            'ru_female': { name: 'Русский Female', lang: 'ru', gender: 'female', style: 'standard' },
            'tr_female': { name: 'Türkçe Female', lang: 'tr', gender: 'female', style: 'standard' },
            'vi_female': { name: 'Tiếng Việt Female', lang: 'vi', gender: 'female', style: 'standard' },
            'th_female': { name: 'ภาษาไทย Female', lang: 'th', gender: 'female', style: 'standard' },
            'ar_male': { name: 'العربية Male', lang: 'ar', gender: 'male', style: 'standard' },
            'zh_CN_female': { name: '中文 Female', lang: 'zh', gender: 'female', style: 'standard' },
            'zh_CN_male': { name: '中文 Male', lang: 'zh', gender: 'male', style: 'standard' }
        };
    }

    /**
     * Get default voice for a language
     */
    static getDefaultVoiceForLanguage(langCode) {
        const languageDefaults = {
            'de': 'de_002',
            'en': 'en_us_001',
            'es': 'es_002',
            'fr': 'fr_002',
            'pt': 'br_003',
            'ja': 'jp_001',
            'ko': 'kr_003',
            'zh': 'zh_CN_female',
            'ru': 'ru_female',
            'ar': 'ar_male',
            'tr': 'tr_female',
            'vi': 'vi_female',
            'th': 'th_female',
            'nl': 'nl_001',
            'pl': 'pl_001',
            'id': 'id_001'
        };

        return languageDefaults[langCode] || 'en_us_001';
    }

    /**
     * Generate TTS audio from text
     * @param {string} text - Text to synthesize
     * @param {string} voiceId - TikTok voice ID (e.g., 'en_us_001')
     * @returns {Promise<string>} Base64-encoded MP3 audio
     */
    async synthesize(text, voiceId) {
        if (!this.apiKey) {
            throw new Error('TikTok RapidAPI key not configured');
        }

        // Validate text length
        if (text.length > this.maxTextLength) {
            this.logger.warn(`Text length (${text.length}) exceeds maximum (${this.maxTextLength}), truncating`);
            text = text.substring(0, this.maxTextLength);
        }

        let lastError;

        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                this.logger.debug(`TikTok RapidAPI TTS attempt ${attempt + 1}/${this.maxRetries}: "${text.substring(0, 30)}..." (voice: ${voiceId})`);

                const response = await axios.post(
                    this.apiUrl,
                    {
                        text: text,
                        voice_code: voiceId,
                        output_format: 'base64'
                    },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'X-RapidAPI-Key': this.apiKey,
                            'X-RapidAPI-Host': this.apiHost
                        },
                        timeout: this.timeout
                    }
                );

                // Check for successful response with audio data (support multiple response formats)
                const audioData = response.data?.audio_base64 || response.data?.data?.audio_base64;
                if (audioData) {
                    this.logger.info(`TikTok RapidAPI TTS success: ${text.substring(0, 30)}... (voice: ${voiceId}, attempt: ${attempt + 1})`);
                    return audioData;
                }

                throw new Error('Invalid response format from TikTok RapidAPI - no audio data found');

            } catch (error) {
                lastError = error;
                const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
                this.logger.warn(`TikTok RapidAPI TTS attempt ${attempt + 1} failed: ${errorMsg}`);

                // Check for authentication/quota errors (don't retry)
                const status = error.response?.status;
                if (status === 429) {
                    this.logger.error('TikTok RapidAPI: Rate limit exceeded. Please check your RapidAPI subscription.');
                    throw new Error(`TikTok RapidAPI 429: Rate limit exceeded`);
                }
                
                if (status === 403 || status === 401) {
                    this.logger.error('TikTok RapidAPI: Authentication error. Please check your API key in TTS Admin Panel.');
                    throw new Error(`TikTok RapidAPI ${status}: Invalid API key or unauthorized`);
                }

                // Exponential backoff for other errors
                if (attempt < this.maxRetries - 1) {
                    await this._delay(Math.pow(2, attempt) * 1000);
                }
            }
        }

        throw new Error(`TikTok RapidAPI TTS failed after ${this.maxRetries} attempts. Last error: ${lastError?.message || 'Unknown'}`);
    }

    /**
     * Helper: Delay promise
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Test if engine is available
     */
    async test() {
        try {
            await this.synthesize('Test', 'en_us_001');
            return true;
        } catch (error) {
            this.logger.error(`TikTok RapidAPI TTS test failed: ${error.message}`);
            return false;
        }
    }
}

module.exports = TikTokRapidAPIEngine;
