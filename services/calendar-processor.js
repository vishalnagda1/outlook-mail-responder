/**
 * Service to process calendar data for email responses with timezone support
 */
const moment = require('moment-timezone');
const timeConverter = require('../utils/time-converter');

/**
 * Extracts date information from email content
 * @param {string} emailContent - The content of the email
 * @returns {Object} Extracted date and time information
 */
function extractDateTimeInfo(emailContent) {
  const dateRegex = /(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})/gi;
  const dateRegex2 = /(?:on|for|at|by)?\s+(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)/gi;
  const timeRangeRegex = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi;
  const dateNumericRegex = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4}|\d{2})/g;
  const timeRegex = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi;
  const durationRegex = /(\d+)\s*(?:min(?:ute)?s?|hours?|hrs?)/gi;
  
  // Also look for specific day mentions
  const dayRegex = /(?:this|next)?\s*(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)/gi;
  
  const result = {
    dates: [],
    timeRanges: [],
    duration: 30, // Default duration in minutes
    daysOfWeek: []
  };
  
  // Extract dates
  let dateMatch;
  while ((dateMatch = dateRegex.exec(emailContent)) !== null) {
    const day = dateMatch[1];
    const month = dateMatch[2];
    const year = dateMatch[3];
    result.dates.push(`${day} ${month} ${year}`);
  }
  
  // Extract dates in format like "23rd April"
  while ((dateMatch = dateRegex2.exec(emailContent)) !== null) {
    const day = dateMatch[1];
    const month = dateMatch[2];
    const year = new Date().getFullYear();
    result.dates.push(`${day} ${month} ${year}`);
  }
  
  // Extract dates in numeric format (MM/DD/YYYY or DD/MM/YYYY)
  while ((dateMatch = dateNumericRegex.exec(emailContent)) !== null) {
    const part1 = dateMatch[1];
    const part2 = dateMatch[2];
    let year = dateMatch[3];
    
    // Handle 2-digit years
    if (year.length === 2) {
      year = `20${year}`;
    }
    
    // Check format based on reasonable date ranges
    if (parseInt(part1) <= 12 && parseInt(part2) <= 31) {
      // Likely MM/DD/YYYY
      result.dates.push(`${part2} ${getMonthName(part1)} ${year}`);
    } else {
      // Likely DD/MM/YYYY
      result.dates.push(`${part1} ${getMonthName(part2)} ${year}`);
    }
  }
  
  // Extract days of week
  let dayMatch;
  while ((dayMatch = dayRegex.exec(emailContent)) !== null) {
    result.daysOfWeek.push(dayMatch[1]);
  }
  
  // Extract time ranges
  let timeRangeMatch;
  while ((timeRangeMatch = timeRangeRegex.exec(emailContent)) !== null) {
    const startHour = timeRangeMatch[1];
    const startMinute = timeRangeMatch[2] || '00';
    const startAmPm = timeRangeMatch[3] || 'am';
    
    const endHour = timeRangeMatch[4];
    const endMinute = timeRangeMatch[5] || '00';
    const endAmPm = timeRangeMatch[6] || 'am';
    
    result.timeRanges.push({
      start: `${startHour}:${startMinute} ${startAmPm}`,
      end: `${endHour}:${endMinute} ${endAmPm}`
    });
  }
  
  // If no time ranges found, look for individual times
  if (result.timeRanges.length === 0) {
    const times = [];
    let timeMatch;
    while ((timeMatch = timeRegex.exec(emailContent)) !== null) {
      const hour = timeMatch[1];
      const minute = timeMatch[2] || '00';
      const amPm = timeMatch[3] || 'am';
      times.push(`${hour}:${minute} ${amPm}`);
    }
    
    // If we found at least 2 times, create a time range
    if (times.length >= 2) {
      result.timeRanges.push({
        start: times[0],
        end: times[times.length - 1]
      });
    }
  }
  
  // Extract duration
  let durationMatch;
  while ((durationMatch = durationRegex.exec(emailContent)) !== null) {
    const value = parseInt(durationMatch[1]);
    const unit = durationMatch[0].toLowerCase();
    
    if (unit.includes('hour') || unit.includes('hr')) {
      result.duration = value * 60;
    } else {
      result.duration = value;
    }
  }
  
  return result;
}

/**
 * Gets the month name from a numeric month
 * @param {string|number} month - The month number (1-12)
 * @returns {string} The month name
 */
function getMonthName(month) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[parseInt(month) - 1];
}

/**
 * Converts date string to YYYY-MM-DD format
 * @param {string} dateStr - Date string in various formats
 * @param {string} timezone - User's timezone
 * @returns {string} Date in YYYY-MM-DD format
 */
function standardizeDate(dateStr, timezone = 'UTC') {
  return moment.tz(new Date(dateStr), timezone).format('YYYY-MM-DD');
}

/**
 * Converts time string to 24-hour format
 * @param {string} timeStr - Time string (e.g., "10:30 am")
 * @returns {string} Time in HH:mm format
 */
function standardizeTime(timeStr) {
  return moment(timeStr, ['h:mm a', 'h a']).format('HH:mm');
}

/**
 * Process calendar events and requested schedule to find available slots
 * @param {Array} events - Calendar events 
 * @param {string} emailContent - Email content to extract date/time from
 * @param {string} timezone - User's timezone
 * @returns {Object} Processed availability data for response generation
 */
function processCalendarForResponse(events, emailContent, timezone = 'UTC') {
  // Extract date and time info from email
  const extractedInfo = extractDateTimeInfo(emailContent);
  
  // Convert calendar events to slot format and adjust for timezone
  const calendarEvents = events.map(event => ({
    start: event.start, // Keep in UTC for proper conversion later
    end: event.end,     // Keep in UTC for proper conversion later
    title: event.subject
  }));
  
  // Process extracted dates
  let datesToCheck = [];
  
  if (extractedInfo.dates.length > 0) {
    // Use explicitly mentioned dates
    datesToCheck = extractedInfo.dates.map(date => standardizeDate(date, timezone));
  } else if (extractedInfo.daysOfWeek.length > 0) {
    // Use mentioned days of week
    const today = moment().tz(timezone);
    extractedInfo.daysOfWeek.forEach(day => {
      const targetDay = moment().tz(timezone).day(day);
      if (targetDay.isBefore(today)) {
        targetDay.add(7, 'days');
      }
      datesToCheck.push(targetDay.format('YYYY-MM-DD'));
    });
  } else {
    // Fallback to next 3 business days
    const today = moment().tz(timezone);
    let daysAdded = 0;
    let currentDay = today.clone();
    
    while (daysAdded < 3) {
      currentDay.add(1, 'day');
      const dayOfWeek = currentDay.day();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not weekend
        datesToCheck.push(currentDay.format('YYYY-MM-DD'));
        daysAdded++;
      }
    }
  }
  
  // Process time ranges
  let startTime = '09:00'; // Default: 9 AM
  let endTime = '17:00';   // Default: 5 PM
  
  if (extractedInfo.timeRanges.length > 0) {
    startTime = standardizeTime(extractedInfo.timeRanges[0].start);
    endTime = standardizeTime(extractedInfo.timeRanges[0].end);
  }
  
  // Find available slots
  const availability = timeConverter.checkAvailabilityForDates(
    calendarEvents,
    datesToCheck,
    startTime,
    endTime,
    extractedInfo.duration,
    timezone
  );
  
  return {
    requestedDates: datesToCheck.map(date => ({
      date,
      formatted: moment.tz(date, timezone).format('dddd, MMMM D, YYYY')
    })),
    requestedTimeRange: {
      start: startTime,
      end: endTime,
      formatted: `${moment(startTime, 'HH:mm').format('h:mm A')} to ${moment(endTime, 'HH:mm').format('h:mm A')}`
    },
    requestedDuration: extractedInfo.duration,
    availability: availability,
    hasAvailability: Object.values(availability).some(day => day.hasAvailability),
    timezone: timezone
  };
}

module.exports = {
  extractDateTimeInfo,
  processCalendarForResponse
};