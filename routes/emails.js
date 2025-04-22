const express = require('express');
const router = express.Router();
const auth = require('./auth');
const moment = require('moment');
const ollamaService = require('../services/ollama-service');
const calendarProcessor = require('../services/calendar-processor');

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
    
    res.render('emails', { 
      emails: unreadEmails.value,
      user: {
        name: req.session.userName,
        email: req.session.userEmail
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
    
    // Format calendar events for display
    const formattedEvents = calendarView.value.map(event => ({
      subject: event.subject,
      start: moment(event.start.dateTime).format('YYYY-MM-DD HH:mm'),
      end: moment(event.end.dateTime).format('YYYY-MM-DD HH:mm'),
      location: event.location.displayName
    }));
    
    res.render('email-detail', { 
      email,
      events: formattedEvents,
      user: {
        name: req.session.userName,
        email: req.session.userEmail
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
    
    // Get calendar availability for the next 7 days
    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);
    
    const calendarView = await client
      .api(`/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${nextWeek.toISOString()}`)
      .select('subject,start,end')
      .orderby('start/dateTime')
      .get();
    
    // Extract text from email content
    const emailContent = email.body.content.replace(/<[^>]*>/g, ' '); // Basic HTML stripping
    const senderName = email.from.emailAddress.name;
    
    // Process calendar data with new calendar processor
    const calendarData = calendarProcessor.processCalendarForResponse(
      calendarView.value.map(event => ({
        subject: event.subject,
        start: event.start.dateTime,
        end: event.end.dateTime
      })),
      emailContent
    );
    
    // Prepare availability information in a structured way
    let availabilityText = '';
    
    if (calendarData.hasAvailability) {
      availabilityText = "Based on my calendar, I have the following availability:\n\n";
      
      Object.values(calendarData.availability).forEach(dayAvailability => {
        if (dayAvailability.hasAvailability) {
          availabilityText += `- ${dayAvailability.dayOfWeek}, ${dayAvailability.date}:\n`;
          dayAvailability.slots.slice(0, 5).forEach(slot => {
            availabilityText += `  * ${slot.startFormatted} - ${slot.endFormatted}\n`;
          });
        } else {
          availabilityText += `- ${dayAvailability.dayOfWeek}, ${dayAvailability.date}: No available slots\n`;
        }
      });
    } else {
      availabilityText = "I've checked my calendar and unfortunately, I don't have any availability during the requested times. Here is my upcoming schedule for reference:\n\n";
      
      // Group events by date
      const eventsByDate = {};
      calendarView.value.forEach(event => {
        const date = moment(event.start.dateTime).format('YYYY-MM-DD');
        if (!eventsByDate[date]) {
          eventsByDate[date] = [];
        }
        eventsByDate[date].push({
          subject: event.subject,
          start: moment(event.start.dateTime).format('h:mm A'),
          end: moment(event.end.dateTime).format('h:mm A')
        });
      });
      
      // List events for the requested dates or the next 3 days
      const datesToShow = calendarData.requestedDates.length > 0 
        ? calendarData.requestedDates.map(d => d.date) 
        : Object.keys(eventsByDate).slice(0, 3);
      
      datesToShow.forEach(date => {
        const formattedDate = moment(date).format('dddd, MMMM D, YYYY');
        availabilityText += `- ${formattedDate}:\n`;
        
        if (eventsByDate[date] && eventsByDate[date].length > 0) {
          eventsByDate[date].forEach(event => {
            availabilityText += `  * ${event.start} - ${event.end}: ${event.subject}\n`;
          });
        } else {
          availabilityText += "  * No scheduled events\n";
        }
      });
    }
    
    // Get AI to draft response using Ollama
    const systemPrompt = `You are an email assistant that drafts professional responses. You are especially good at scheduling meetings based on calendar availability.

Guidelines:
1. Be concise but polite and professional
2. If the email is asking about availability for a meeting, recommend specific time slots that are available 
3. Format time slots clearly (e.g., "2:30 PM - 3:00 PM on Wednesday, April 24")
4. If no slots are available at the requested times, suggest alternative times or dates
5. Address the sender by name
6. End with a professional sign-off`;
    
    const userPrompt = `Original email from ${senderName}:
Subject: ${email.subject}

${emailContent}

Calendar Availability Information:
${availabilityText}

Draft a professional response to this email. Focus on accurately suggesting the available time slots if the email is about scheduling a meeting. Be specific about the days and times available.`;
    
    // Prepare fallback data
    const fallbackData = {
      subject: email.subject,
      senderName: senderName,
      emailContent: emailContent,
      availability: calendarView.value.map(event => ({
        start: event.start.dateTime,
        end: event.end.dateTime,
        subject: event.subject
      }))
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