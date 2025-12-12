const axios = require('axios');

/**
 * LLM Service for SiliconFlow Chat Completions API
 * Supports multiple models: DeepSeek, Qwen, Meta-Llama
 */
class LLMService {
  constructor(apiKey, logger, debugCallback = null) {
    this.apiKey = apiKey;
    this.logger = logger;
    this.debugCallback = debugCallback;
    this.baseURL = 'https://api.siliconflow.cn/v1';
    this.models = {
      deepseek: 'deepseek-ai/DeepSeek-V3',
      qwen: 'Qwen/Qwen2.5-7B-Instruct',
      llama: 'meta-llama/Meta-Llama-3.1-8B-Instruct'
    };
  }
  
  /**
   * Log debug information
   */
  _debugLog(level, message, data) {
    if (this.debugCallback) {
      this.debugCallback(level, message, data);
    }
  }

  /**
   * Generate chat completion using SiliconFlow API
   * @param {string} prompt - The prompt to send to the LLM
   * @param {string} model - Model to use (deepseek, qwen, llama)
   * @param {number} maxTokens - Maximum tokens in response
   * @param {number} temperature - Temperature for randomness (0.0-1.0)
   * @returns {Promise<string>} - Generated text
   */
  async generateCompletion(prompt, model = 'deepseek', maxTokens = 1000, temperature = 0.7) {
    try {
      const modelName = this.models[model] || this.models.deepseek;
      
      // Log detailed request info for debugging
      this.logger.info(`🔄 LLM Request: Model=${modelName}, Tokens=${maxTokens}, Temp=${temperature}`);
      this._debugLog('info', `🔄 LLM API Request`, {
        model: modelName,
        maxTokens,
        temperature,
        promptLength: prompt.length
      });
      
      this.logger.debug(`🔑 API Key configured: ${this.apiKey ? 'Yes (length=' + this.apiKey.length + ')' : 'No'}`);
      this._debugLog('debug', `🔑 API Key Status`, { 
        configured: !!this.apiKey,
        length: this.apiKey ? this.apiKey.length : 0,
        prefix: this.apiKey ? this.apiKey.substring(0, 6) + '...' : 'N/A'
      });
      
      this.logger.debug(`📝 Prompt length: ${prompt.length} characters`);
      
      const requestBody = {
        model: modelName,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature: temperature,
        stream: false
      };
      
      const requestHeaders = {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      };
      
      this.logger.debug(`📤 Request URL: ${this.baseURL}/chat/completions`);
      this._debugLog('debug', `📤 API Request Details`, {
        url: `${this.baseURL}/chat/completions`,
        method: 'POST',
        bodyKeys: Object.keys(requestBody)
      });
      
      this.logger.debug(`📤 Request body: ${JSON.stringify({ model: modelName, max_tokens: maxTokens, temperature })}`);
      
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        requestBody,
        {
          headers: requestHeaders,
          timeout: 30000 // 30 second timeout
        }
      );

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const content = response.data.choices[0].message.content;
        this.logger.info(`✅ LLM Response: Generated ${content.length} characters using ${modelName}`);
        this._debugLog('info', `✅ LLM API Success`, {
          model: modelName,
          generatedLength: content.length,
          usage: response.data.usage
        });
        this.logger.debug(`📊 Usage: ${JSON.stringify(response.data.usage || 'N/A')}`);
        return content;
      }

      throw new Error('Invalid response from LLM API');
    } catch (error) {
      this.logger.error(`❌ LLM Service Error: ${error.message}`);
      this._debugLog('error', `❌ LLM API Error: ${error.message}`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText
      });
      
      if (error.response) {
        this.logger.error(`📛 HTTP Status: ${error.response.status} ${error.response.statusText}`);
        this.logger.error(`📛 Response Headers: ${JSON.stringify(error.response.headers)}`);
        this.logger.error(`📛 Response Data: ${JSON.stringify(error.response.data)}`);
        
        this._debugLog('error', `📛 HTTP Error Response`, {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          headers: error.response.headers
        });
        
        if (error.response.status === 401) {
          this.logger.error('🔐 Authentication failed! Check:');
          this.logger.error('   1. API key is correct and active');
          this.logger.error('   2. API key is saved in Settings → TTS API Keys → Fish Speech 1.5');
          this.logger.error('   3. No extra spaces in API key');
          this.logger.error('   4. API key format starts with "sk-"');
          
          this._debugLog('error', '🔐 401 Unauthorized - Authentication Failed', {
            apiKeyLength: this.apiKey ? this.apiKey.length : 0,
            apiKeyPrefix: this.apiKey ? this.apiKey.substring(0, 6) : 'N/A',
            hasWhitespace: this.apiKey ? (this.apiKey !== this.apiKey.trim()) : false,
            troubleshoot: [
              'Check API key is correct and active on SiliconFlow dashboard',
              'Verify API key in Settings → TTS API Keys → Fish Speech 1.5',
              'Ensure no extra spaces before/after API key',
              'Confirm API key starts with "sk-"',
              'Check API key quota/credits on SiliconFlow'
            ]
          });
        } else if (error.response.status === 429) {
          this.logger.error('⏱️ Rate limit exceeded. Wait before trying again.');
          this._debugLog('warn', '⏱️ 429 Rate Limit Exceeded', {
            retryAfter: error.response.headers['retry-after'],
            message: 'Too many requests. Wait before trying again.'
          });
        } else if (error.response.status === 500) {
          this.logger.error('🔥 Server error on SiliconFlow side. Try again later.');
          this._debugLog('error', '🔥 500 Server Error', {
            message: 'SiliconFlow server error. Try again later.'
          });
        }
      } else if (error.request) {
        this.logger.error('📡 No response from server. Check internet connection.');
        this._debugLog('error', '📡 No Response from Server', {
          message: 'No response received. Check internet connection.'
        });
      } else {
        this.logger.error(`⚙️ Request setup error: ${error.message}`);
        this._debugLog('error', `⚙️ Request Setup Error`, {
          message: error.message
        });
      }
      
      throw error;
    }
  }

  /**
   * Generate chat completion with conversation history
   * @param {Array} messages - Array of message objects with role and content
   * @param {string} model - Model to use
   * @param {number} maxTokens - Maximum tokens
   * @param {number} temperature - Temperature
   * @returns {Promise<string>} - Generated text
   */
  async generateWithHistory(messages, model = 'deepseek', maxTokens = 1000, temperature = 0.7) {
    try {
      const modelName = this.models[model] || this.models.deepseek;
      
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: modelName,
          messages: messages,
          max_tokens: maxTokens,
          temperature: temperature,
          stream: false
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        return response.data.choices[0].message.content;
      }

      throw new Error('Invalid response from LLM API');
    } catch (error) {
      this.logger.error(`LLM Service Error (with history): ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if API key is valid
   * @returns {Promise<boolean>}
   */
  async validateAPIKey() {
    try {
      await this.generateCompletion('Hello', 'qwen', 10, 0.5);
      return true;
    } catch (error) {
      this.logger.error(`API Key validation failed: ${error.message}`);
      return false;
    }
  }
}

module.exports = LLMService;
