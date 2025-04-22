const { ConfidentialClientApplication } = require('@azure/msal-node');

// MSAL configuration for multi-tenant (personal + work accounts)
const msalConfig = {
  auth: {
    clientId: process.env.CLIENT_ID,
    // Use common authority instead of tenant-specific
    authority: 'https://login.microsoftonline.com/common',
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
  'mail.readwrite',
  'MailboxSettings.Read' // Added permission for mailbox settings
];

module.exports = {
  msalClient,
  scopes
};