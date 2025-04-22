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

module.exports = {
  msalClient,
  scopes
};