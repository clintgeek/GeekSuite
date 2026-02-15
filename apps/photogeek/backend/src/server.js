const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const connectDB = require('./config/database');
const { protect } = require('./middleware/auth');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
app.set('trust proxy', 1);

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Define the path to the public directory
const publicPath = path.join(__dirname, '..', 'public');

// Serve static files from the public directory
app.use(express.static(publicPath));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Basic health check route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'PhotoGeek API is running',
    timestamp: new Date().toISOString()
  });
});

// Canonical auth check (cookie-first)
app.get('/api/me', protect, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const mergedUser = {
    ...(req.user || {}),
    localId: req.localUser?._id,
    profile: req.localUser?.profile,
    skillLevel: req.localUser?.skillLevel,
    xp: req.localUser?.xp,
    level: req.localUser?.level,
    streak: req.localUser?.streak,
  };

  return res.json({
    success: true,
    data: {
      user: mergedUser,
    },
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/user-projects', require('./routes/userProjects'));
app.use('/api/user', require('./routes/user'));
app.use('/api/upload', require('./routes/upload'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 PhotoGeek API server running on port ${ PORT }`);
  console.log(`📷 Environment: ${ process.env.NODE_ENV || 'development' }`);
});

module.exports = app;
