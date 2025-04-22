/**
 * Utility functions for time and calendar slot management
 */
const moment = require('moment');

/**
 * Converts ISO datetime to local time with AM/PM format
 * @param {string} isoString - ISO datetime string
 * @returns {string} Formatted time (e.g., "10:30 AM")
 */
function formatTimeFromISO(isoString) {
  return moment(isoString).format('h:mm A');
}

/**
 * Converts ISO datetime to date in human-readable format
 * @param {string} isoString - ISO datetime string
 * @returns {string} Formatted date (e.g., "April 23, 2024")
 */
function formatDateFromISO(isoString) {
  return moment(isoString).format('MMMM D, YYYY');
}

/**
 * Finds available time slots between startTime and endTime, avoiding booked slots
 * @param {Array} bookedSlots - Array of booked time slots with start and end times
 * @param {string} date - The date to check in YYYY-MM-DD format
 * @param {string} startTime - Start time in HH:mm format (24-hour)
 * @param {string} endTime - End time in HH:mm format (24-hour)
 * @param {number} durationMinutes - Duration of the meeting in minutes
 * @returns {Array} Available time slots with start and end times
 */
function findAvailableSlots(bookedSlots, date, startTime, endTime, durationMinutes = 30) {
  const startDateTime = moment(`${date}T${startTime}`);
  const endDateTime = moment(`${date}T${endTime}`);
  
  // Convert to same date format as booked slots
  const dateToCheck = moment(date).format('YYYY-MM-DD');
  
  // Filter booked slots for the specific date
  const slotsOnDate = bookedSlots.filter(slot => {
    const slotDate = moment(slot.start).format('YYYY-MM-DD');
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
    
    // Check if this slot overlaps with any booked slot
    const isOverlapping = sortedSlots.some(bookedSlot => {
      const bookedStart = moment(bookedSlot.start);
      const bookedEnd = moment(bookedSlot.end);
      
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
 * @returns {Object} Available slots organized by date
 */
function checkAvailabilityForDates(events, datesToCheck, startTime, endTime, durationMinutes = 30) {
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
      durationMinutes
    );
    
    availability[date] = {
      date: moment(date).format('MMMM D, YYYY'),
      dayOfWeek: moment(date).format('dddd'),
      slots: availableSlots,
      hasAvailability: availableSlots.length > 0
    };
  });
  
  return availability;
}

module.exports = {
  formatTimeFromISO,
  formatDateFromISO,
  findAvailableSlots,
  checkAvailabilityForDates
};