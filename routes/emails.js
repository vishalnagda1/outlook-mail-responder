const express = require('express');
const router = express.Router();
const auth = require('./auth');
const moment = require('moment-timezone');
const ollamaService = require('../services/ollama-service');
const calendarProcessor = require('../services/calendar-processor');
const timeConverter = require('../utils/time-converter');

// Route to display unread emails
router.get('/', auth.isAuthenticated, async (req, res) => {
  try {
    const client = auth.getGraphClient(req.session.accessToken);
    
    // Get unread emails from inbox
    const unreadEmails = await client
      .api('/me/mailFolders/inbox/messages')
      .filter('isRead eq false')
      .top(50)
      .select('id,subject,bodyPreview,receivedDateTime,from,importance,hasAttachments')
      .orderby('receivedDateTime DESC')
      .get();
    
    // Store user timezone in session if not already set
    if (!req.session.timezone) {
      try {
        // Get user's timezone from Microsoft Graph
        const userSettings = await client
          .api('/me/mailboxSettings')
          .get();
        
        req.session.timezone = userSettings.timeZone || 'UTC';
      } catch (error) {
        console.warn('Could not fetch user timezone, defaulting to UTC:', error);
        req.session.timezone = 'UTC';
      }
    }
    
    res.render('emails', { 
      emails: unreadEmails.value,
      user: {
        name: req.session.userName,
        email: req.session.userEmail,
        timezone: req.session.timezone
      }
    });
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).send('Error fetching emails');
  }
});

// Route to get a specific email's details
router.get('/:id', auth.isAuthenticated, async (req, res) => {
  try {
    const client = auth.getGraphClient(req.session.accessToken);
    const emailId = req.params.id;
    
    // Get full email content
    const email = await client
      .api(`/me/messages/${emailId}`)
      .select('id,subject,body,receivedDateTime,from,toRecipients,ccRecipients,importance,hasAttachments')
      .get();
    
    // Check calendar availability for the next 7 days
    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);
    
    const calendarView = await client
      .api(`/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${nextWeek.toISOString()}`)
      .select('subject,start,end,location')
      .orderby('start/dateTime')
      .get();
    
    // Ensure we have user's timezone
    if (!req.session.timezone) {
      try {
        // Get user's timezone from Microsoft Graph
        const userSettings = await client
          .api('/me/mailboxSettings')
          .get();
        
        req.session.timezone = userSettings.timeZone || 'UTC';
      } catch (error) {
        console.warn('Could not fetch user timezone, defaulting to UTC:', error);
        req.session.timezone = 'UTC';
      }
    }
    
    const timezone = req.session.timezone;
    
    // Format calendar events for display in user's timezone
    const formattedEvents = calendarView.value.map(event => ({
      subject: event.subject,
      start: timeConverter.convertToLocalTime(event.start.dateTime, timezone),
      end: timeConverter.convertToLocalTime(event.end.dateTime, timezone),
      location: event.location.displayName,
      // Keep original UTC times for processing
      startUtc: event.start.dateTime,
      endUtc: event.end.dateTime
    }));
    
    res.render('email-detail', { 
      email,
      events: formattedEvents,
      user: {
        name: req.session.userName,
        email: req.session.userEmail,
        timezone: timezone
      }
    });
  } catch (error) {
    console.error('Error fetching email details:', error);
    res.status(500).send('Error fetching email details');
  }
});

// Route to generate draft response
router.post('/:id/draft', auth.isAuthenticated, async (req, res) => {
  try {
    const client = auth.getGraphClient(req.session.accessToken);
    const emailId = req.params.id;
    
    // Get original email
    const email = await client
      .api(`/me/messages/${emailId}`)
      .select('id,subject,body,receivedDateTime,from,toRecipients')
      .get();
    
    // Check calendar availability for the next 7 days
    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);
    
    const calendarView = await client
      .api(`/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${nextWeek.toISOString()}`)
      .select('subject,start,end')
      .orderby('start/dateTime')
      .get();
    
    // Ensure we have user's timezone
    if (!req.session.timezone) {
      try {
        // Try to get user's timezone from Microsoft Graph
        const userSettings = await client
          .api('/me/mailboxSettings')
          .get();
        
        req.session.timezone = userSettings.timeZone || 'UTC';
        console.log('Retrieved user timezone from Graph API:', req.session.timezone);
      } catch (error) {
        console.warn('Could not fetch user timezone from Graph API:', error.message);
        
        // Fallback 1: Try to detect timezone from request headers or client browser
        if (req.query.timezone) {
          // If passed as a query parameter (useful for testing)
          req.session.timezone = req.query.timezone;
          console.log('Using timezone from query param:', req.session.timezone);
        } else {
          // Fallback 2: Use a reasonable default based on user behavior or region
          // For simplicity, we're using a fixed timezone - you could implement more sophisticated detection
          const defaultTimezone = process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';
          req.session.timezone = defaultTimezone;
          console.log('Using default timezone:', req.session.timezone);
        }
      }
    }
    
    const timezone = req.session.timezone;
    
    // Extract text from email content
    const emailContent = email.body.content.replace(/<[^>]*>/g, ' '); // Basic HTML stripping
    const senderName = email.from.emailAddress.name;
    
    // Process calendar data with the calendar processor using user's timezone
    const calendarData = calendarProcessor.processCalendarForResponse(
      calendarView.value.map(event => ({
        subject: event.subject,
        start: event.start.dateTime, // Using UTC time from API
        end: event.end.dateTime     // Using UTC time from API
      })),
      emailContent,
      timezone
    );
    
    // Prepare availability information in a structured way
    let availabilityText = '';
    
    if (calendarData.hasAvailability) {
      availabilityText = `Based on my calendar (${timezone} timezone), I have the following availability for a ${calendarData.requestedDuration}-minute meeting:\n\n`;
      
      Object.values(calendarData.availability).forEach(dayAvailability => {
        if (dayAvailability.hasAvailability) {
          availabilityText += `- ${dayAvailability.dayOfWeek}, ${dayAvailability.date}:\n`;
          dayAvailability.slots.slice(0, 5).forEach(slot => {
            availabilityText += `  * ${slot.startFormatted} - ${slot.endFormatted}\n`;
          });
        } else {
          availabilityText += `- ${dayAvailability.dayOfWeek}, ${dayAvailability.date}: No available slots during requested hours\n`;
        }
      });
    } else {
      availabilityText = `I've checked my calendar (${timezone} timezone) and unfortunately, I don't have any availability during the requested times. Here is my upcoming schedule for reference:\n\n`;
      
      // Group events by date
      const eventsByDate = {};
      calendarView.value.forEach(event => {
        const date = moment(event.start.dateTime).tz(timezone).format('YYYY-MM-DD');
        if (!eventsByDate[date]) {
          eventsByDate[date] = [];
        }
        eventsByDate[date].push({
          subject: event.subject,
          start: moment(event.start.dateTime).tz(timezone).format('h:mm A'),
          end: moment(event.end.dateTime).tz(timezone).format('h:mm A')
        });
      });
      
      // List events for the requested dates or the next 3 days
      const datesToShow = calendarData.requestedDates.length > 0 
        ? calendarData.requestedDates.map(d => d.date) 
        : Object.keys(eventsByDate).slice(0, 3);
      
      datesToShow.forEach(date => {
        const formattedDate = moment.tz(date, timezone).format('dddd, MMMM D, YYYY');
        availabilityText += `- ${formattedDate}:\n`;
        
        if (eventsByDate[date] && eventsByDate[date].length > 0) {
          eventsByDate[date].forEach(event => {
            availabilityText += `  * ${event.start} - ${event.end}: ${event.subject}\n`;
          });
        } else {
          availabilityText += "  * No scheduled events\n";
        }
      });
      
      // Suggest alternative dates
      const today = moment().tz(timezone);
      let daysAdded = 0;
      let currentDay = today.clone();
      
      availabilityText += "\nHere are some alternative time slots I could offer:\n\n";
      
      while (daysAdded < 3) {
        currentDay.add(1, 'day');
        const dayOfWeek = currentDay.day();
        
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not weekend
          const dateStr = currentDay.format('dddd, MMMM D');
          const dateKey = currentDay.format('YYYY-MM-DD');
          availabilityText += `- ${dateStr}:\n`;
          
          const dayEvents = eventsByDate[dateKey] || [];
          const busyTimes = dayEvents.map(event => ({
            start: moment.tz(`${dateKey} ${event.start}`, 'YYYY-MM-DD h:mm A', timezone),
            end: moment.tz(`${dateKey} ${event.end}`, 'YYYY-MM-DD h:mm A', timezone)
          }));
          
          // Find gaps in the schedule
          const workStart = moment.tz(`${dateKey} 9:00 AM`, 'YYYY-MM-DD h:mm A', timezone);
          const workEnd = moment.tz(`${dateKey} 5:00 PM`, 'YYYY-MM-DD h:mm A', timezone);
          const slots = [];
          
          let currentSlot = workStart.clone();
          
          while (currentSlot.clone().add(30, 'minutes').isSameOrBefore(workEnd)) {
            const slotEnd = currentSlot.clone().add(30, 'minutes');
            const isOverlapping = busyTimes.some(busy => 
              (currentSlot.isSameOrAfter(busy.start) && currentSlot.isBefore(busy.end)) ||
              (slotEnd.isAfter(busy.start) && slotEnd.isSameOrBefore(busy.end)) ||
              (currentSlot.isBefore(busy.start) && slotEnd.isAfter(busy.end))
            );
            
            if (!isOverlapping) {
              slots.push(`  * ${currentSlot.format('h:mm A')} - ${slotEnd.format('h:mm A')}\n`);
              if (slots.length >= 3) break; // Limit to 3 suggestions per day
            }
            
            currentSlot.add(30, 'minutes');
          }
          
          if (slots.length > 0) {
            slots.forEach(slot => {
              availabilityText += slot;
            });
          } else {
            availabilityText += "  * Fully booked for this day\n";
          }
          
          daysAdded++;
        }
      }
    }
    
    // Get AI to draft response using Ollama
    const systemPrompt = `You are an email assistant that drafts professional responses. You are especially good at scheduling meetings based on calendar availability.

Guidelines:
1. Be concise but polite and professional
2. If the email is asking about availability for a meeting, recommend specific time slots that are available 
3. Format time slots clearly (e.g., "2:30 PM - 3:00 PM on Wednesday, April 24")
4. If no slots are available at the requested times, suggest alternative times or dates
5. Address the sender by name
6. End with a professional sign-off
7. The times provided are in the user's local timezone (${timezone}), so refer to them as-is without timezone conversion`;
    
    const userPrompt = `Original email from ${senderName}:
Subject: ${email.subject}

${emailContent}

Calendar Availability Information (all times in ${timezone} timezone):
${availabilityText}

Draft a professional response to this email. Focus on accurately suggesting the available time slots if the email is about scheduling a meeting. Be specific about the days and times available. Include a reference to the timezone (${timezone}) to avoid confusion.`;
    
    // Prepare fallback data
    const fallbackData = {
      subject: email.subject,
      senderName: senderName,
      emailContent: emailContent,
      availability: calendarView.value.map(event => ({
        start: event.start.dateTime,
        end: event.end.dateTime,
        subject: event.subject
      })),
      timezone: timezone
    };
    
    const draftResponse = await ollamaService.generateText(systemPrompt, userPrompt, fallbackData);
    
    // Create a draft email in Outlook
    const draft = {
      subject: `RE: ${email.subject}`,
      importance: email.importance,
      body: {
        contentType: "HTML",
        content: draftResponse.replace(/\n/g, '<br>')
      },
      toRecipients: [email.from]
    };
    
    // Save the draft
    await client
      .api('/me/messages')
      .post(draft);
    
    res.json({ 
      success: true, 
      draft: draftResponse,
      message: 'Draft response created in Outlook'
    });
  } catch (error) {
    console.error('Error creating draft response:', error);
    res.status(500).json({ success: false, error: 'Error creating draft response' });
  }
});

// Route to mark an email as read
router.post('/:id/markRead', auth.isAuthenticated, async (req, res) => {
  try {
    const client = auth.getGraphClient(req.session.accessToken);
    const emailId = req.params.id;
    
    await client
      .api(`/me/messages/${emailId}`)
      .update({ isRead: true });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking email as read:', error);
    res.status(500).json({ success: false, error: 'Error marking email as read' });
  }
});

module.exports = router;