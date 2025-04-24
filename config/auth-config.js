const { ConfidentialClientApplication } = require('@azure/msal-node');
const path = require('path');
const fs = require('fs');

// Ensure the cache directory exists
const cacheDir = path.join(__dirname, '..', 'cache');
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir);
}

// Define cache plugin
const cachePath = path.join(cacheDir, 'msal-cache.json');

// Persistence cache plugin
const persistencePlugin = {
  async beforeCacheAccess(cacheContext) {
    try {
      if (fs.existsSync(cachePath)) {
        const cacheData = fs.readFileSync(cachePath, 'utf-8');
        cacheContext.tokenCache.deserialize(cacheData);
      }
    } catch (error) {
      console.log('Error reading cache:', error);
    }
  },
  async afterCacheAccess(cacheContext) {
    if (cacheContext.cacheHasChanged) {
      try {
        fs.writeFileSync(cachePath, cacheContext.tokenCache.serialize(), 'utf-8');
      } catch (error) {
        console.log('Error writing cache:', error);
      }
    }
  }
};

// MSAL configuration for multi-tenant (personal + work accounts)
const msalConfig = {
  auth: {
    clientId: process.env.CLIENT_ID,
    // Use common authority instead of tenant-specific
    // authority: 'https://login.microsoftonline.com/common',
    authority: `https://login.microsoftonline.com/${process.env.TENANT_ID}`,
    clientSecret: process.env.CLIENT_SECRET
  },
  cache: {
    cachePlugin: persistencePlugin
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
  'mail.readwrite',
  'offline_access' // Important for refresh tokens
];

module.exports = {
  msalClient,
  scopes
};