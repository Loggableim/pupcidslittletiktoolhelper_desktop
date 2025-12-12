const axios = require('axios');

/**
 * LLM Service for SiliconFlow Chat Completions API
 * Supports multiple models: DeepSeek, Qwen, Meta-Llama
 */
class LLMService {
  constructor(apiKey, logger) {
    this.apiKey = apiKey;
    this.logger = logger;
    this.baseURL = 'https://api.siliconflow.cn/v1';
    this.models = {
      deepseek: 'deepseek-ai/DeepSeek-V3',
      qwen: 'Qwen/Qwen2.5-7B-Instruct',
      llama: 'meta-llama/Meta-Llama-3.1-8B-Instruct'
    };
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
      
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
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
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 second timeout
        }
      );

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const content = response.data.choices[0].message.content;
        this.logger.debug(`LLM Service: Generated ${content.length} characters using ${modelName}`);
        return content;
      }

      throw new Error('Invalid response from LLM API');
    } catch (error) {
      this.logger.error(`LLM Service Error: ${error.message}`);
      if (error.response) {
        this.logger.error(`API Response: ${JSON.stringify(error.response.data)}`);
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
