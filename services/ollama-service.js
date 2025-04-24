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
    
    // Set timeout to 15 seconds
    const axiosConfig = {
      timeout: 15000
    };
    
    // For better results with Ollama, provide a well-structured prompt
    let formattedPrompt = '';
    
    // Add system instruction
    formattedPrompt += `<s>\n${systemPrompt}\n</s>\n\n`;
    
    // Add user prompt with formatting for better understanding
    formattedPrompt += userPrompt;
    
    // Add a clear instruction at the end to improve output quality
    formattedPrompt += "\n\nIf the mail required my availability then check my calendar availability and suggest suitable time slots accordingly otherwise ignore it and carefully draft a concise, professional email response. Do not include anything else apart from the email body, no subject required just email body with proper greetings and signature. Don't forget to add name as 'TechNow' in the signature.\n\n";
    
    // Make the API request
    const response = await axios.post(url, {
      model: model,
      prompt: formattedPrompt,
      stream: false,
      options: {
        temperature: 0.6,  // Lower temperature for more predictable responses
        top_p: 0.9,
        top_k: 40,
        num_predict: 1024  // Ensure we get a complete response
      }
    }, axiosConfig);
    
    // Process the response to ensure it's properly formatted
    let generatedText = response.data.response.trim();
    
    // Sanitize the response to remove common issues in LLM outputs
    generatedText = sanitizeResponse(generatedText);
    
    return generatedText;
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

/**
 * Sanitize and improve the LLM-generated response
 * @param {string} text - The generated text to sanitize
 * @returns {string} Cleaned and improved text
 */
function sanitizeResponse(text) {
  // Remove any potential signature blocks that don't belong
  text = text.replace(/^--+\s*\n.*$/gm, '');
  
  // Remove markdown formatting if present (some models add it)
  text = text.replace(/^```email\s*/g, '').replace(/```\s*$/g, '');
  
  // Clean up any duplicated greeting lines
  const lines = text.split('\n');
  let seenGreeting = false;
  const cleanedLines = lines.filter(line => {
    const isGreeting = /^(dear|hello|hi|greetings|good (morning|afternoon|evening))/i.test(line);
    if (isGreeting && seenGreeting) {
      return false; // Skip duplicate greetings
    }
    if (isGreeting) {
      seenGreeting = true;
    }
    return true;
  });
  
  return cleanedLines.join('\n');
}

module.exports = {
  generateText
};