require('isomorphic-fetch');
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const path = require('path');
const auth = require('./routes/auth');
const emailRoutes = require('./routes/emails');
const statusRoutes = require('./routes/status');

const app = express();

// Configure session middleware with file store
app.use(session({
  store: new FileStore({
    path: './sessions',
    ttl: 86400, // 1 day in seconds
    retries: 0,
    secret: process.env.SESSION_SECRET
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // set to true in production with HTTPS
    maxAge: 86400000 // 1 day in milliseconds
  }
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Routes
app.use('/auth', auth.router);
app.use('/emails', emailRoutes);
app.use('/status', statusRoutes);

// Home route
app.get('/', (req, res) => {
  res.render('index', { 
    isAuthenticated: req.session.isAuthenticated || false,
    userName: req.session.userName || null
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});