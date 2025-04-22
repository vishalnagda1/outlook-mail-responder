/**
 * Service for interacting with the Ollama API
 */
const axios = require('axios');

/**
 * Generate text using Ollama API
 * @param {string} systemPrompt - The system prompt context
 * @param {string} userPrompt - The user prompt or query
 * @returns {Promise<string>} The generated text
 */
async function generateText(systemPrompt, userPrompt) {
  try {
    const url = process.env.OLLAMA_API_URL;
    const model = process.env.OLLAMA_MODEL || 'mistral';
    
    const prompt = `<system>\n${systemPrompt}\n</system>\n\n${userPrompt}`;
    
    const response = await axios.post(url, {
      model: model,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40
      }
    });
    
    return response.data.response;
  } catch (error) {
    console.error('Error calling Ollama API:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    throw new Error('Failed to generate text with Ollama');
  }
}

module.exports = {
  generateText
};