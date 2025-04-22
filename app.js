require('isomorphic-fetch');
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const authRoutes = require('./routes/auth');
const emailRoutes = require('./routes/emails');
const statusRoutes = require('./routes/status');

const app = express();

// Configure session middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // set to true in production with HTTPS
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Routes
app.use('/auth', authRoutes);
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