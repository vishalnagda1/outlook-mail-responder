/**
 * Routes for service status
 */
const express = require('express');
const router = express.Router();
const auth = require('./auth');
const statusChecker = require('../services/status-checker');

// Render status page
router.get('/', auth.isAuthenticated, (req, res) => {
  res.render('status', {
    user: {
      name: req.session.userName,
      email: req.session.userEmail
    }
  });
});

// API endpoint for status data
router.get('/api', auth.isAuthenticated, async (req, res) => {
  try {
    const ollamaStatus = await statusChecker.isOllamaAvailable();
    const graphStatus = await statusChecker.isGraphApiAvailable(req.session.accessToken);
    
    res.json({
      services: {
        ollama: {
          name: 'Ollama API',
          status: ollamaStatus ? 'available' : 'unavailable',
          model: process.env.OLLAMA_MODEL || 'llama3.1:8b'
        },
        graph: {
          name: 'Microsoft Graph API',
          status: graphStatus ? 'available' : 'unavailable'
        }
      },
      user: {
        authenticated: req.session.isAuthenticated || false,
        name: req.session.userName || null
      }
    });
  } catch (error) {
    console.error('Error checking services:', error);
    res.status(500).json({ error: 'Error checking service status' });
  }
});

module.exports = router;