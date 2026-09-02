import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'node:crypto';
import pinoHttp from 'pino-http';
import logger from './lib/logger.js';

// Import routes
import authRoutes from './routes/authRoutes.js';
import { authenticate } from './middleware/authMiddleware.js';
import { meHandler } from '@geeksuite/user/server';

// Get the directory name (this file lives in backend/src, so the frontend
// build output ends up one level up, at backend/public).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Build the BuJoGeek Express app.
 *
 * Pulled out of server.js so it can be imported (and exercised with
 * supertest) without connecting to Mongo or binding a port — see
 * server.js for the process entrypoint that does both.
 */
export function createApp() {
  const app = express();

  // Required for Express behind Nginx reverse proxy (correct req.secure, req.ip, etc.)
  app.set('trust proxy', 1);

  // Middleware
  const hardcodedOrigins = [
    'https://bujogeek.clintgeek.com',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5001',
    'http://localhost:3000',
  ];
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : hardcodedOrigins;

  app.use(cors({
    origin: function (origin, callback) {
      // allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
  }));
  app.use(express.json());

  // Attach request ID and structured logger to every request
  const httpLogger = pinoHttp({
    logger,
    genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
  });
  app.use((req, res, next) => {
    httpLogger(req, res);
    res.setHeader('X-Request-Id', req.id);
    next();
  });

  // Serve static files from frontend build
  const publicPath = path.join(__dirname, '..', 'public');
  app.use(express.static(publicPath, {
    setHeaders(res, filePath) {
      // Vite content-hashes everything under assets/ — cache forever.
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));

  // Routes
  app.use('/api/auth', authRoutes);

  app.get('/api/me', authenticate, meHandler());

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
  });

  // SPA fallback - serve index.html for non-API navigations (must be LAST).
  // Paths with a file extension (e.g. a stale hashed /assets/*.css requested by
  // an old service worker after a deploy) must 404 — answering them with
  // index.html poisons browser/SW caches and renders the app unstyled.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/graphql')) {
      return next();
    }
    if (path.extname(req.path)) {
      return res.status(404).type('text/plain').send('Not found');
    }
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  return app;
}

export default createApp;
