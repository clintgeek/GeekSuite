import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHttpLogger } from '@geeksuite/logger';
import logger from './lib/logger.js';

import authRoutes from './routes/authRoutes.js';
import metadataRoutes from './routes/metadataRoutes.js';
import coverRoutes from './routes/coverRoutes.js';
import importRoutes from './routes/importRoutes.js';
import { authenticate } from './middleware/authMiddleware.js';
import { csrfGuard, meHandler } from '@geeksuite/user/server';

// This file lives in backend/src, so the frontend build output ends up one
// level up, at backend/public (see apps/gamegeek/Dockerfile).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Build the GameGeek Express app.
 *
 * Pulled out of server.js so it can be imported (and exercised with
 * supertest / tools/boot-smoke.mjs) without connecting to Mongo or binding a
 * port — see server.js for the process entrypoint that does both.
 */
export function createApp() {
  const app = express();

  // Required for Express behind Nginx reverse proxy (correct req.secure, req.ip, etc.)
  app.set('trust proxy', 1);

  const hardcodedOrigins = [
    'https://gamegeek.clintgeek.com',
    'http://localhost:1811',
    'http://localhost:1810',
    'http://localhost:5173',
  ];
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : hardcodedOrigins;

  // cookie-parser must run before csrfGuard, which reads req.cookies.
  app.use(cookieParser());

  // CSRF: origin-check every cookie-authenticated mutation against the same
  // `allowedOrigins` the cors() config below uses — one list, no second
  // copy. Mounted before cors() on purpose — see
  // apps/bujogeek/backend/src/app.js's comment (DOCS/SSO_OVERVIEW.md#csrf)
  // for why a disallowed origin must be a deliberate 403 here, not whatever
  // shape cors() would otherwise give it.
  app.use(csrfGuard({ allowedOrigins, logger, appName: 'gamegeek' }));

  app.use(cors({
    origin: function (origin, callback) {
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
  const httpLogger = createHttpLogger(logger);
  app.use((req, res, next) => {
    httpLogger(req, res);
    res.setHeader('X-Request-Id', req.id);
    next();
  });

  // Serve static files from the frontend build
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
  app.use('/api/metadata', metadataRoutes);
  app.use('/api/games', coverRoutes);
  app.use('/api/import', importRoutes);

  // Health check endpoint — no auth, so Watchtower/nginx healthchecks and
  // uptime monitors don't need a session.
  app.get('/api/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    });
  });

  // SPA fallback — serve index.html for non-API navigations (must be LAST).
  // Paths with a file extension (e.g. a stale hashed /assets/*.css requested
  // by an old service worker after a deploy) must 404 — answering them with
  // index.html poisons browser/SW caches and renders the app unstyled.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/graphql')) {
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
