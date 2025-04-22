/**
 * Utility functions for time and calendar slot management with timezone support
 */
const moment = require('moment-timezone');

/**
 * Converts ISO datetime to local time with AM/PM format using the provided timezone
 * @param {string} isoString - ISO datetime string
 * @param {string} timezone - User's timezone (e.g., 'America/New_York', 'Asia/Kolkata')
 * @returns {string} Formatted time (e.g., "10:30 AM")
 */
function formatTimeFromISO(isoString, timezone) {
  return moment(isoString).tz(timezone).format('h:mm A');
}

/**
 * Converts ISO datetime to date in human-readable format using the provided timezone
 * @param {string} isoString - ISO datetime string
 * @param {string} timezone - User's timezone
 * @returns {string} Formatted date (e.g., "April 23, 2024")
 */
function formatDateFromISO(isoString, timezone) {
  return moment(isoString).tz(timezone).format('MMMM D, YYYY');
}

/**
 * Finds available time slots between startTime and endTime, avoiding booked slots
 * Handles timezone conversion for accurate slot determination
 * @param {Array} bookedSlots - Array of booked time slots with start and end times
 * @param {string} date - The date to check in YYYY-MM-DD format
 * @param {string} startTime - Start time in HH:mm format (24-hour)
 * @param {string} endTime - End time in HH:mm format (24-hour) 
 * @param {number} durationMinutes - Duration of the meeting in minutes
 * @param {string} timezone - User's timezone
 * @returns {Array} Available time slots with start and end times
 */
function findAvailableSlots(bookedSlots, date, startTime, endTime, durationMinutes = 30, timezone = 'UTC') {
  // Create date objects in the user's timezone
  const startDateTime = moment.tz(`${date}T${startTime}`, timezone);
  const endDateTime = moment.tz(`${date}T${endTime}`, timezone);
  
  // Convert to same date format as booked slots
  const dateToCheck = moment.tz(date, timezone).format('YYYY-MM-DD');
  
  // Filter booked slots for the specific date (convert UTC times to user timezone)
  const slotsOnDate = bookedSlots.filter(slot => {
    const slotStartInTz = moment(slot.start).tz(timezone);
    const slotDate = slotStartInTz.format('YYYY-MM-DD');
    return slotDate === dateToCheck;
  });
  
  // Sort booked slots by start time
  const sortedSlots = [...slotsOnDate].sort((a, b) => 
    moment(a.start).valueOf() - moment(b.start).valueOf()
  );
  
  // Find available time slots
  const availableSlots = [];
  let currentSlot = startDateTime.clone();
  
  while (currentSlot.clone().add(durationMinutes, 'minutes').isSameOrBefore(endDateTime)) {
    const slotEnd = currentSlot.clone().add(durationMinutes, 'minutes');
    
    // Check if this slot overlaps with any booked slot (compare in the same timezone)
    const isOverlapping = sortedSlots.some(bookedSlot => {
      const bookedStart = moment(bookedSlot.start).tz(timezone);
      const bookedEnd = moment(bookedSlot.end).tz(timezone);
      
      return (
        (currentSlot.isSameOrAfter(bookedStart) && currentSlot.isBefore(bookedEnd)) ||
        (slotEnd.isAfter(bookedStart) && slotEnd.isSameOrBefore(bookedEnd)) ||
        (currentSlot.isBefore(bookedStart) && slotEnd.isAfter(bookedEnd))
      );
    });
    
    if (!isOverlapping) {
      availableSlots.push({
        start: currentSlot.format(),
        end: slotEnd.format(),
        startFormatted: currentSlot.format('h:mm A'),
        endFormatted: slotEnd.format('h:mm A')
      });
    }
    
    // Move to next 30-minute slot
    currentSlot.add(30, 'minutes');
  }
  
  return availableSlots;
}

/**
 * Checks if there are available slots on specified dates
 * @param {Array} events - Calendar events array
 * @param {Array} datesToCheck - Array of dates to check in YYYY-MM-DD format
 * @param {string} startTime - Start time in HH:mm format (24-hour)
 * @param {string} endTime - End time in HH:mm format (24-hour)
 * @param {number} durationMinutes - Duration of the meeting in minutes
 * @param {string} timezone - User's timezone
 * @returns {Object} Available slots organized by date
 */
function checkAvailabilityForDates(events, datesToCheck, startTime, endTime, durationMinutes = 30, timezone = 'UTC') {
  const bookedSlots = events.map(event => ({
    start: event.start,
    end: event.end
  }));
  
  const availability = {};
  
  datesToCheck.forEach(date => {
    const availableSlots = findAvailableSlots(
      bookedSlots, 
      date, 
      startTime, 
      endTime, 
      durationMinutes,
      timezone
    );
    
    availability[date] = {
      date: moment.tz(date, timezone).format('MMMM D, YYYY'),
      dayOfWeek: moment.tz(date, timezone).format('dddd'),
      slots: availableSlots,
      hasAvailability: availableSlots.length > 0
    };
  });
  
  return availability;
}

/**
 * Converts a UTC ISO time to user's local timezone
 * @param {string} isoTime - The ISO time string in UTC
 * @param {string} timezone - User's timezone
 * @param {string} format - Output format
 * @returns {string} Time in user's timezone
 */
function convertToLocalTime(isoTime, timezone, format = 'YYYY-MM-DD HH:mm') {
  return moment(isoTime).tz(timezone).format(format);
}

/**
 * Detect user's timezone from browser
 * @returns {string} The detected timezone or 'UTC' as fallback
 */
function detectUserTimezone() {
  if (typeof window !== 'undefined' && window.Intl) {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  return moment.tz.guess() || 'UTC';
}

module.exports = {
  formatTimeFromISO,
  formatDateFromISO,
  findAvailableSlots,
  checkAvailabilityForDates,
  convertToLocalTime,
  detectUserTimezone
};