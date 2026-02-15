const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const dotenv = require('dotenv');
const connectDB = require('./config/database');
const redisClient = require('./config/redis');
const logger = require('./config/logger');
const { authenticateToken } = require('./middleware/auth');

// Load environment variables
dotenv.config();

const BASEGEEK_URL = (process.env.BASEGEEK_URL || process.env.BASE_GEEK_URL || 'https://basegeek.clintgeek.com').replace(/\/$/, '');

// Connect to MongoDB
connectDB();

// Connect to Redis (non-blocking - app continues if Redis fails)
redisClient.connect().catch(err => {
  logger.warn('Redis connection failed - caching disabled', { error: err.message });
});

const app = express();
const PORT = process.env.PORT || 3001;

function forwardSetCookieHeaders(res, upstreamHeaders) {
  const setCookie = upstreamHeaders && upstreamHeaders['set-cookie'];
  if (!setCookie) return;
  res.setHeader('Set-Cookie', setCookie);
}

// Middleware
const defaultCorsOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4080',
  'https://fitnessgeek.clintgeek.com',
  'http://192.168.1.17:4080'
];
const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: corsOrigins.length > 0 ? corsOrigins : defaultCorsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'
  ]
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging middleware
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// Session identity endpoint
app.get(
  '/api/me',
  (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  },
  authenticateToken,
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const upstream = await axios.get(`${BASEGEEK_URL}/api/users/me`, {
        headers: { Authorization: authHeader }
      });

      forwardSetCookieHeaders(res, upstream.headers);

      return res.status(upstream.status).json({ user: upstream.data?.user || upstream.data });
    } catch (error) {
      if (!error.response) {
        return res.status(502).json({ error: `Unable to reach baseGeek user service at ${BASEGEEK_URL}` });
      }
      return res.status(error.response.status || 500).json(error.response.data);
    }
  }
);

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/user', require('./routes/userRoutes'));
app.use('/api/foods', require('./routes/foodRoutes'));
app.use('/api/logs', require('./routes/logRoutes'));
app.use('/api/summary', require('./routes/summaryRoutes'));
app.use('/api/goals', require('./routes/goalRoutes'));
app.use('/api/meals', require('./routes/mealRoutes'));
app.use('/api/weight', require('./routes/weightRoutes'));
app.use('/api/blood-pressure', require('./routes/bloodPressureRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/streaks', require('./routes/streakRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));
app.use('/api/ai-coach', require('./routes/aiCoachRoutes'));
app.use('/api/fitness', require('./routes/fitnessRoutes'));
app.use('/api/meds', require('./routes/medicationRoutes'));
app.use('/api/insights', require('./routes/insightsRoutes'));
app.use('/api/food-reports', require('./routes/foodReportRoutes'));
app.use('/api/influx', require('./routes/influxRoutes'));

// Serve built frontend files
const path = require('path');
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

// SPA Catch-all handler
app.get("*", (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(publicPath, "index.html"));
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.originalUrl} not found`,
      code: 'ROUTE_NOT_FOUND'
    },
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(error.statusCode || 500).json({
    success: false,
    error: {
      message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : error.message,
      ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
    },
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await redisClient.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await redisClient.disconnect();
  process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 FitnessGeek API server running on port ${PORT}`);
  console.log(`📊 Health check available at http://localhost:${PORT}/health`);
  console.log(`🔗 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🤖 AI features enabled`);
  console.log(`💾 Redis caching: ${redisClient.isReady() ? 'enabled' : 'disabled'}`);
});

module.exports = app;