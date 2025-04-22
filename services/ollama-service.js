/**
 * Service for interacting with the Ollama API
 */
const axios = require('axios');
const fallbackGenerator = require('./fallback-generator');

/**
 * Generate text using Ollama API
 * @param {string} systemPrompt - The system prompt context
 * @param {string} userPrompt - The user prompt or query
 * @param {Object} fallbackData - Data to use for fallback generation
 * @returns {Promise<string>} The generated text
 */
async function generateText(systemPrompt, userPrompt, fallbackData = null) {
  try {
    const url = `${process.env.OLLAMA_API_URL}/api/generate`;
    const model = process.env.OLLAMA_MODEL || 'llama3.1:8b';
    
    // Set timeout to 10 seconds
    const axiosConfig = {
      timeout: 10000
    };
    
    const prompt = `<s>\n${systemPrompt}\n</s>\n\n${userPrompt}`;
    
    const response = await axios.post(url, {
      model: model,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40
      }
    }, axiosConfig);
    
    return response.data.response;
  } catch (error) {
    console.error('Error calling Ollama API:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    
    // Use fallback generator if fallbackData is provided
    if (fallbackData) {
      console.log('Using fallback response generator');
      return fallbackGenerator.generateBasicResponse(
        {
          subject: fallbackData.subject,
          sender: fallbackData.senderName,
          content: fallbackData.emailContent
        },
        fallbackData.availability
      );
    }
    
    throw new Error('Failed to generate text with Ollama');
  }
}

module.exports = {
  generateText
};