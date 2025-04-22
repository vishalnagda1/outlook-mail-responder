const express = require('express');
const router = express.Router();
const { msalClient, scopes } = require('../config/auth-config');
const { Client } = require('@microsoft/microsoft-graph-client');
const { TokenCredentialAuthenticationProvider } = require('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials');

// Login route
router.get('/login', (req, res) => {
  // Create auth URL for Microsoft login
  const authCodeUrlParameters = {
    scopes: scopes,
    redirectUri: process.env.REDIRECT_URI
  };

  msalClient.getAuthCodeUrl(authCodeUrlParameters)
    .then((response) => {
      res.redirect(response);
    })
    .catch((error) => {
      console.log(error);
      res.status(500).send('Error getting auth URL');
    });
});

// Auth callback route
router.get('/callback', (req, res) => {
  const tokenRequest = {
    code: req.query.code,
    scopes: scopes,
    redirectUri: process.env.REDIRECT_URI
  };

  msalClient.acquireTokenByCode(tokenRequest)
    .then((response) => {
      // Save token info in session
      req.session.isAuthenticated = true;
      req.session.accessToken = response.accessToken;
      req.session.userName = response.account.name;
      req.session.userEmail = response.account.username;
      req.session.userId = response.uniqueId;

      // Redirect to home page
      res.redirect('/');
    })
    .catch((error) => {
      console.log(error);
      res.status(500).send('Error acquiring token');
    });
});

// Logout route
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Helper middleware for checking if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (!req.session.isAuthenticated) {
    return res.redirect('/auth/login');
  }
  next();
};

// Helper function to create Microsoft Graph client
const getGraphClient = (accessToken) => {
  // Initialize Graph client
  const authProvider = (callback) => {
    callback(null, accessToken);
  };
  
  // Initialize Graph client
  const client = Client.init({
    authProvider: authProvider
  });
  
  return client;
};

module.exports = {
  router,
  isAuthenticated,
  getGraphClient
};