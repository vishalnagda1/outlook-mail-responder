/**
 * Fallback response generator when Ollama is unavailable
 */

/**
 * Generate a basic response to an email
 * @param {Object} emailData - Data about the original email
 * @param {string} emailData.subject - The email subject
 * @param {string} emailData.sender - The sender's name
 * @param {string} emailData.content - The email content
 * @param {Array} availability - Calendar availability
 * @returns {string} A templated response
 */
function generateBasicResponse(emailData, availability) {
    const { subject, sender, content } = emailData;
    
    // Identify common email types based on keywords
    const isQuestion = content.match(/\?/) !== null;
    const isSchedulingRequest = content.match(/meet|schedule|appointment|availability|when are you free|can we talk/i) !== null;
    const isThankYou = content.match(/thank you|thanks/i) !== null;
    const isInformation = content.match(/FYI|just so you know|wanted to let you know|information|update/i) !== null;
    const isRequest = content.match(/could you|can you|would you|please|request/i) !== null;
    
    // Generate appropriate response based on type
    let response = `Dear ${sender},\n\nThank you for your email`;
    
    if (subject && subject.trim() !== '') {
      response += ` regarding "${subject}"`;
    }
    
    response += '.\n\n';
    
    if (isThankYou) {
      response += "You're welcome! I appreciate your message and am glad I could help.\n\n";
    } else if (isSchedulingRequest && availability && availability.length > 0) {
      response += "I'd be happy to meet with you. Here are some times when I'm available:\n\n";
      availability.forEach((slot, index) => {
        const start = new Date(slot.start);
        const end = new Date(slot.end);
        response += `- ${start.toLocaleDateString()} from ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} to ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n`;
      });
      response += "\nPlease let me know if any of these times work for you.\n\n";
    } else if (isSchedulingRequest) {
      response += "I'd be happy to meet with you. Could you please suggest a few times that work for you, and I'll check my availability?\n\n";
    } else if (isQuestion) {
      response += "I've received your question and will get back to you with an answer as soon as possible.\n\n";
    } else if (isInformation) {
      response += "Thank you for sharing this information with me. I appreciate you keeping me in the loop.\n\n";
    } else if (isRequest) {
      response += "I've received your request and will work on it. I'll get back to you soon with an update.\n\n";
    } else {
      response += "I've received your message and will review it as soon as possible.\n\n";
    }
    
    response += "Best regards,\n[Your Name]";
    
    return response;
  }
  
  module.exports = {
    generateBasicResponse
  };