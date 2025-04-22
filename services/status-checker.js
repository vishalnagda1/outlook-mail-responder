/**
 * Service status checker
 */
const axios = require('axios');

/**
 * Check if Ollama API is accessible
 * @returns {Promise<boolean>} True if Ollama is accessible
 */
async function isOllamaAvailable() {
  try {
    const url = process.env.OLLAMA_API_URL.replace('/generate', '/tags');
    const response = await axios.get(url, { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    console.warn('Ollama service unavailable:', error.message);
    return false;
  }
}

/**
 * Check if Microsoft Graph API is accessible with the token
 * @param {string} accessToken - Microsoft Graph access token
 * @returns {Promise<boolean>} True if Graph API is accessible
 */
async function isGraphApiAvailable(accessToken) {
  try {
    const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      timeout: 5000
    });
    return response.status === 200;
  } catch (error) {
    console.warn('Microsoft Graph API unavailable:', error.message);
    return false;
  }
}

module.exports = {
  isOllamaAvailable,
  isGraphApiAvailable
};