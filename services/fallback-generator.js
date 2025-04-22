/**
 * Fallback response generator when Ollama is unavailable
 */
const moment = require('moment');
const calendarProcessor = require('./calendar-processor');

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
  const isSchedulingRequest = content.match(/meet|schedule|appointment|availability|when are you free|can we talk|slot/i) !== null;
  const isThankYou = content.match(/thank you|thanks/i) !== null;
  const isInformation = content.match(/FYI|just so you know|wanted to let you know|information|update/i) !== null;
  const isRequest = content.match(/could you|can you|would you|please|request/i) !== null;
  
  // Process calendar data if this is a scheduling request
  let availabilitySection = '';
  
  if (isSchedulingRequest && availability && availability.length > 0) {
    // Process with calendar processor
    const calendarData = calendarProcessor.processCalendarForResponse(
      availability.map(slot => ({
        subject: slot.subject || 'Busy',
        start: slot.start,
        end: slot.end
      })),
      content
    );
    
    if (calendarData.hasAvailability) {
      availabilitySection = "Based on my calendar, I have the following availability:\n\n";
      
      Object.values(calendarData.availability).forEach(dayData => {
        if (dayData.hasAvailability) {
          availabilitySection += `- ${dayData.dayOfWeek}, ${dayData.date}:\n`;
          dayData.slots.slice(0, 5).forEach(slot => {
            availabilitySection += `  * ${slot.startFormatted} - ${slot.endFormatted}\n`;
          });
        }
      });
    } else {
      availabilitySection = "I've checked my calendar and unfortunately, I don't have any availability during the requested times. Here are some alternative time slots:\n\n";
      
      // Suggest next 3 business days with standard hours
      const today = moment();
      let daysAdded = 0;
      let currentDay = today.clone();
      
      while (daysAdded < 3) {
        currentDay.add(1, 'day');
        const dayOfWeek = currentDay.day();
        
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not weekend
          const dateStr = currentDay.format('dddd, MMMM D');
          availabilitySection += `- ${dateStr}:\n`;
          availabilitySection += `  * 10:00 AM - 11:00 AM\n`;
          availabilitySection += `  * 2:00 PM - 3:00 PM\n`;
          daysAdded++;
        }
      }
    }
  }
  
  // Generate appropriate response based on type
  let response = `Dear ${sender},\n\nThank you for your email`;
  
  if (subject && subject.trim() !== '') {
    response += ` regarding "${subject}"`;
  }
  
  response += '.\n\n';
  
  if (isThankYou) {
    response += "You're welcome! I appreciate your message and am glad I could help.\n\n";
  } else if (isSchedulingRequest) {
    response += "I'd be happy to schedule a meeting with you.\n\n";
    response += availabilitySection + "\n";
    response += "Please let me know which time works best for you, and I'll send a calendar invitation.\n\n";
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