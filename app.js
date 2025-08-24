const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const session = require('express-session');

dotenv.config();

const sessionRoutes = require('./routes/session');
const groupRoutes = require('./routes/groups');
const messageRoutes = require('./routes/messages');
const viewRoutes = require('./routes/views');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'whatsapp-manager-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'WhatsApp Group Service is running',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/session', sessionRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/messages', messageRoutes);
app.use('/', viewRoutes);

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({
      status: 'error',
      message: `Route ${req.originalUrl} not found`
    });
  } else {
    res.status(404).render('error');
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal server error'
  });
});

module.exports = app;