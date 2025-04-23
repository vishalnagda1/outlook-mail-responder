const express = require('express');
const router = express.Router();
const auth = require('./auth');
const moment = require('moment-timezone');
const ollamaService = require('../services/ollama-service');

const userTimeZone = process.env.DEFAULT_TIMEZONE || 'Asia/Calcutta';

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
    
    // Check calendar availability for the next few days if needed
    let now = new Date();
    let endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + 7);

    now = moment.tz(now, userTimeZone);
    endOfWeek = moment.tz(endOfWeek, userTimeZone);
    
    const calendarView = await client
      .api(`/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${endOfWeek.toISOString()}`)
      .select('subject,start,end,location')
      .top(10)
      .orderby('start/dateTime')
      .get();
    
    // Format calendar events for display
    const formattedEvents = calendarView.value.map(event => ({
      subject: event.subject,
      start: moment.tz(event.start.dateTime, event.start.timeZone).tz(userTimeZone).format('YYYY-MM-DD HH:mm'),
      end: moment.tz(event.end.dateTime, event.start.timeZone).tz(userTimeZone).format('YYYY-MM-DD HH:mm'),
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
    
    // Get calendar availability
    let now = new Date();
    let endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + 7);

    now = moment.tz(now, userTimeZone);
    endOfWeek = moment.tz(endOfWeek, userTimeZone);
    
    const calendarView = await client
      .api(`/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${endOfWeek.toISOString()}`)
      .select('subject,start,end')
      .top(50)
      .orderby('start/dateTime')
      .get();
    
    // Format calendar events for AI context
    const availabilityText = calendarView.value.length > 0 
      ? `##### My upcoming meetings: ${calendarView.value.map(e => 
          `\n- ${e.subject} on ${moment.tz(e.start.dateTime, e.start.timeZone).tz(userTimeZone).format('MMMM D')} from ${moment.tz(e.start.dateTime, e.start.timeZone).tz(userTimeZone).format('h:mm A')} to ${moment.tz(e.end.dateTime, e.end.timeZone).tz(userTimeZone).format('h:mm A')}`
        ).join(', ')}.`
      : 'I have no scheduled meetings in the next few days.';
    
    // Prepare data for Ollama
    const emailContent = email.body.content.replace(/<[^>]*>/g, ' '); // Basic HTML stripping
    const senderName = email.from.emailAddress.name;
    
    // Get AI to draft response using Ollama
    const systemPrompt = `You are an email assistant that drafts professional responses. Consider the calendar availability when mentioned. Be concise but polite.`;
    
    const userPrompt = `Original email from ${senderName}:\nSubject: ${email.subject}\n\n${emailContent}\n\n${availabilityText}\n\nDraft a professional response to this email.`;// If the email mentions scheduling a meeting, suggest available times based on my calendar.`;
    
    // Prepare fallback data
    const fallbackData = {
      subject: email.subject,
      senderName: senderName,
      emailContent: emailContent,
      availability: calendarView.value.map(event => ({
        start: moment.tz(event.start.dateTime, event.start.timeZone).tz(userTimeZone),
        end: moment.tz(event.end.dateTime, event.end.timeZone).tz(userTimeZone)
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