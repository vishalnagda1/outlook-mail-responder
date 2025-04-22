const express = require('express');
const router = express.Router();
const { ConfidentialClientApplication } = require('@azure/msal-node');

// MSAL configuration
const msalConfig = {
  auth: {
    clientId: process.env.CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.TENANT_ID}`,
    clientSecret: process.env.CLIENT_SECRET
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel, message, containsPii) {
        console.log(message);
      },
      piiLoggingEnabled: false,
      logLevel: "Info"
    }
  }
};

// Create MSAL application object
const msalClient = new ConfidentialClientApplication(msalConfig);

// Microsoft Graph scopes needed for the app
const scopes = [
  'user.read',
  'mail.read',
  'mail.send',
  'calendars.read',
  'mail.readwrite'
];

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
  const client = require('@microsoft/microsoft-graph-client').Client.init({
    authProvider: authProvider
  });
  
  return client;
};

// Export both the router and the helper functions
module.exports = {
  router,
  isAuthenticated,
  getGraphClient
};