import cookieParser from 'cookie-parser';
import compression from 'compression';
import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import path from 'path';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { attachUser, meHandler } from '@geeksuite/user/server';
import { logger } from './utils/logger.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import authRoutes from './routes/auth.js';
import storyRoutes from './routes/stories.js';
import exportRoutes from './routes/export.js';
import characterRoutes from './routes/characters.js';

const app = express();
const PORT = process.env.PORT || 9977;

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());

// CORS configuration
const defaultCorsOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'https://storygeek.clintgeek.com',
];
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : defaultCorsOrigins;
logger.info({ origins: allowedOrigins }, 'CORS enabled');

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
    logger.warn({ origin }, 'CORS blocked origin');
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Structured request logging + request IDs
const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
});
app.use((req, res, next) => {
  httpLogger(req, res);
  res.setHeader('X-Request-Id', req.id);
  next();
});

// Auth proxy routes (me, refresh, logout → baseGeek)
app.use('/api/auth', authRoutes);

// /api/me endpoint via @geeksuite/user/server
app.get('/api/me', attachUser({ basegeekUrl: process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com' }), meHandler());

// API Routes
app.use('/api/stories', storyRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/characters', characterRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString(), service: 'StoryGeek Backend' });
});

// Serve static frontend from /public
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// SPA catch-all — serve index.html for non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/graphql')) {
    return res.status(404).json({ error: 'Route not found' });
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  (req.log || logger).error({ err }, 'Unhandled error');
  res.status(err.statusCode || 500).json({
    success: false,
    error: {
      message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
    },
    timestamp: new Date().toISOString(),
  });
});

// Boot sequence
async function start() {
  try {
    await mongoose.connect(process.env.DB_URI);
    logger.info('MongoDB connected');
  } catch (err) {
    logger.error({ err }, 'MongoDB connection failed — aborting boot');
    process.exit(1);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`StoryGeek backend listening on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) {
      logger.info(`${signal} received during shutdown — forcing exit`);
      process.exit(1);
    }
    shuttingDown = true;
    logger.info(`${signal} received — shutting down`);

    const forceTimer = setTimeout(() => {
      logger.error('Shutdown timed out after 15s — forcing exit');
      process.exit(0);
    }, 15_000);
    forceTimer.unref();

    server.close(async () => {
      try {
        await mongoose.disconnect();
      } catch (err) {
        logger.error({ err }, 'Error disconnecting mongoose');
      }
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
