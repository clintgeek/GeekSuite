const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config/config');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const { authenticate } = require('./middleware/auth');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const lessonRoutes = require('./routes/lessons');
const progressRoutes = require('./routes/progress');
const practiceRoutes = require('./routes/practice');
const achievementRoutes = require('./routes/achievements');
const instrumentRoutes = require('./routes/instruments');

const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: config.cors.origin,
    credentials: true,
  })
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(
    morgan('combined', {
      stream: { write: (message) => logger.info(message.trim()) },
    })
  );
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);

app.get('/api/me', authenticate, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.json({
    success: true,
    data: {
      user: req.user,
    },
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/users', userRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/instruments', instrumentRoutes);

// Serve static frontend files
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

// Legacy route for backward compatibility
app.get('/', (req, res) => {
  res.send('MusicGeek Backend API is running!');
});

app.get('/users', async (req, res) => {
  try {
    const User = require('./models/User');
    const users = await User.find({}, 'name');
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// SPA fallback - must be after all API routes and before 404 handler
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Error handlers (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
