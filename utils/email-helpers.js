/**
 * Helper functions for email processing
 */

const moment = require('moment');

/**
 * Extracts the plain text from HTML content
 * @param {string} htmlContent - The HTML content from email
 * @returns {string} Plain text version
 */
const extractTextFromHtml = (htmlContent) => {
  // Basic HTML tag removal - for production use a proper HTML parser
  return htmlContent
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

/**
 * Formats a date range for suggesting meetings
 * @param {Date} startDate - The start date
 * @param {Date} endDate - The end date
 * @returns {string} Formatted date range
 */
const formatMeetingTimeSlot = (startDate, endDate) => {
  const startMoment = moment(startDate);
  const endMoment = moment(endDate);
  
  // Same day formatting
  if (startMoment.isSame(endMoment, 'day')) {
    return `${startMoment.format('dddd, MMMM D')} from ${startMoment.format('h:mm A')} to ${endMoment.format('h:mm A')}`;
  }
  
  // Different day formatting
  return `${startMoment.format('dddd, MMMM D, h:mm A')} to ${endMoment.format('dddd, MMMM D, h:mm A')}`;
};

/**
 * Finds available time slots between calendar events
 * @param {Array} events - Calendar events array
 * @param {number} durationMinutes - Duration needed in minutes
 * @param {Date} startFrom - Start searching from this date
 * @param {Date} endAt - End searching at this date
 * @returns {Array} Available time slots
 */
const findAvailableTimeSlots = (events, durationMinutes, startFrom, endAt) => {
  // Sort events by start time
  const sortedEvents = [...events].sort((a, b) => 
    new Date(a.start.dateTime) - new Date(b.start.dateTime)
  );
  
  const availableSlots = [];
  let currentTime = moment(startFrom).startOf('hour').add(1, 'hour');
  const endTime = moment(endAt);
  
  // Only look during business hours (9 AM to 5 PM)
  const businessStartHour = 9;
  const businessEndHour = 17;
  
  while (currentTime.isBefore(endTime)) {
    // Skip if outside business hours
    const currentHour = currentTime.hour();
    if (currentHour < businessStartHour || currentHour >= businessEndHour) {
      currentTime.add(1, 'hour');
      continue;
    }
    
    // Find if this time conflicts with any meeting
    const conflictingEvent = sortedEvents.find(event => {
      const eventStart = moment(event.start.dateTime);
      const eventEnd = moment(event.end.dateTime);
      const proposedEnd = moment(currentTime).add(durationMinutes, 'minutes');
      
      // Check for overlap
      return (
        (currentTime.isSameOrAfter(eventStart) && currentTime.isBefore(eventEnd)) ||
        (proposedEnd.isAfter(eventStart) && proposedEnd.isSameOrBefore(eventEnd)) ||
        (currentTime.isBefore(eventStart) && proposedEnd.isAfter(eventEnd))
      );
    });
    
    if (!conflictingEvent) {
      // Found an available slot
      availableSlots.push({
        start: currentTime.toDate(),
        end: moment(currentTime).add(durationMinutes, 'minutes').toDate()
      });
      
      // Only collect up to 5 available slots
      if (availableSlots.length >= 5) {
        break;
      }
    }
    
    // Move to next 30-minute slot
    currentTime.add(30, 'minutes');
  }
  
  return availableSlots;
};

module.exports = {
  extractTextFromHtml,
  formatMeetingTimeSlot,
  findAvailableTimeSlots
};