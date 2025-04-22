const express = require('express');
const router = express.Router();
const { isAuthenticated, getGraphClient } = require('./auth');
const moment = require('moment');
const ollamaService = require('../services/ollama-service');

// Route to display unread emails
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const client = getGraphClient(req.session.accessToken);
    
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
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const client = getGraphClient(req.session.accessToken);
    const emailId = req.params.id;
    
    // Get full email content
    const email = await client
      .api(`/me/messages/${emailId}`)
      .select('id,subject,body,receivedDateTime,from,toRecipients,ccRecipients,importance,hasAttachments')
      .get();
    
    // Check calendar availability for the next few days if needed
    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + 5);
    
    const calendarView = await client
      .api(`/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${endOfWeek.toISOString()}`)
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
router.post('/:id/draft', isAuthenticated, async (req, res) => {
  try {
    const client = getGraphClient(req.session.accessToken);
    const emailId = req.params.id;
    
    // Get original email
    const email = await client
      .api(`/me/messages/${emailId}`)
      .select('id,subject,body,receivedDateTime,from,toRecipients')
      .get();
    
    // Get calendar availability
    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + 5);
    
    const calendarView = await client
      .api(`/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${endOfWeek.toISOString()}`)
      .select('subject,start,end')
      .orderby('start/dateTime')
      .get();
    
    // Format calendar events for AI context
    const availabilityText = calendarView.value.length > 0 
      ? `My upcoming meetings: ${calendarView.value.map(e => 
          `${e.subject} on ${moment(e.start.dateTime).format('MMMM D')} from ${moment(e.start.dateTime).format('h:mm A')} to ${moment(e.end.dateTime).format('h:mm A')}`
        ).join(', ')}.`
      : 'I have no scheduled meetings in the next few days.';
    
    // Prepare data for OpenAI
    const emailContent = email.body.content.replace(/<[^>]*>/g, ' '); // Basic HTML stripping
    const senderName = email.from.emailAddress.name;
    
    // Get AI to draft response using Ollama
    const systemPrompt = `You are an email assistant that drafts professional responses. Consider the calendar availability when mentioned. Be concise but polite.`;
    
    const userPrompt = `Original email from ${senderName}:\nSubject: ${email.subject}\n\n${emailContent}\n\n${availabilityText}\n\nDraft a professional response to this email. If the email mentions scheduling a meeting, suggest available times based on my calendar.`;
    
    const draftResponse = await ollamaService.generateText(systemPrompt, userPrompt);
    
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
router.post('/:id/markRead', isAuthenticated, async (req, res) => {
  try {
    const client = getGraphClient(req.session.accessToken);
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