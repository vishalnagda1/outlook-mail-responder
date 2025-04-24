const express = require('express');
const router = express.Router();
const { msalClient, scopes } = require('../config/auth-config');
const { Client } = require('@microsoft/microsoft-graph-client');

// Login route
router.get('/login', (req, res) => {
  // Create auth URL for Microsoft login
  const authCodeUrlParameters = {
    scopes: scopes,
    redirectUri: process.env.REDIRECT_URI,
    // Add prompt behavior to force new login
    // prompt: 'select_account'
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
      req.session.refreshToken = response.refreshToken;
      req.session.tokenExpires = new Date(Date.now() + response.expiresIn * 1000);
      req.session.userName = response.account.name;
      req.session.userEmail = response.account.username || response.account.idTokenClaims.preferred_username;
      req.session.userId = response.uniqueId || response.account.homeAccountId;
      req.session.tenantId = response.tenantId;
      // Store account for token refresh
      req.session.accountId = response.account.homeAccountId;

      // Redirect to home page
      res.redirect('/');
    })
    .catch((error) => {
      console.log('Token acquisition error:', error);
      res.status(500).send('Error acquiring token: ' + error.message);
    });
});

// Logout route
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Helper middleware for checking if user is authenticated and refreshing token if needed
const isAuthenticated = async (req, res, next) => {
  if (!req.session.isAuthenticated) {
    return res.redirect('/auth/login');
  }
  
  // Check if token is expired or will expire soon (within 5 minutes)
  const now = new Date();
  const tokenExpiry = new Date(req.session.tokenExpires);
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
  
  if (tokenExpiry < fiveMinutesFromNow) {
    try {
      // Try to silently refresh the token
      console.log('Token expiring soon, attempting refresh');
      
      // Get account from cache if possible
      let account;
      
      try {
        const accounts = await msalClient.getTokenCache().getAllAccounts();
        account = accounts.find(acc => acc.homeAccountId === req.session.accountId);
      } catch (error) {
        console.log('Error getting account from cache:', error);
      }
      
      if (!account) {
        console.log('Account not found in cache, redirecting to login');
        return res.redirect('/auth/login');
      }
      
      const silentRequest = {
        account: account,
        scopes: scopes,
      };
      
      const response = await msalClient.acquireTokenSilent(silentRequest);
      
      // Update session with new token info
      req.session.accessToken = response.accessToken;
      req.session.tokenExpires = new Date(Date.now() + response.expiresIn * 1000);
      console.log('Token refreshed successfully');
    } catch (error) {
      console.log('Error refreshing token:', error);
      // If silent refresh fails, redirect to login
      return res.redirect('/auth/login');
    }
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

// Export both the router and the helper functions
module.exports = {
  router,
  isAuthenticated,
  getGraphClient
};