import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'node:crypto';
import pinoHttp from 'pino-http';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import { getAllowedOrigins } from './config/corsOrigins.js';
import { logger } from './lib/logger.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import noteRoutes from './routes/notes.js';
import tagRoutes from './routes/tags.js';
import searchRoutes from './routes/search.js';
import { protect } from './middleware/authMiddleware.js';
import { csrfGuard, meHandler } from '@geeksuite/user/server';
import authRoutes from './routes/auth.js';

// Fail-fast env enforcement
if (!process.env.DB_URI && process.env.NODE_ENV !== 'test') {
  // connectDB will throw — no duplicate check needed here
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config();

async function start() {
  // Connect to MongoDB — fail fast on error
  try {
    await connectDB();
  } catch (err) {
    logger.error({ err }, 'MongoDB connection failed — aborting boot');
    process.exit(1);
  }

  const app = express();

  // Trust NGINX proxy
  app.set('trust proxy', 1);

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false, // TODO: re-enable CSP with deliberate policy in a future pass
    crossOriginEmbedderPolicy: false,
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { message: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { message: 'Too many authentication attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/auth/', authLimiter);

  // CORS — origins from env or hardcoded fallback (config/corsOrigins.js is
  // the single source; the CSRF guard below reads the same list).
  const allowedOrigins = getAllowedOrigins();

  // CSRF: origin-check every cookie-authenticated mutation.
  //
  // Mounted *before* cors() on purpose. This cors() config answers a
  // disallowed Origin with `callback(new Error(...))`, which express turns
  // into a generic 500 — so a CSRF attempt would otherwise look like an
  // application bug, and would stop being blocked at all the moment someone
  // "tidied" that callback into the equally idiomatic `callback(null, false)`
  // (which lets the request through without the CORS header). Running first
  // makes the rejection a deliberate, tested 403 that does not depend on how
  // cors() reports a mismatch. See DOCS/SSO_OVERVIEW.md#csrf.
  app.use(csrfGuard({ allowedOrigins, logger, appName: 'notegeek' }));

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
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Access-Control-Allow-Headers',
      'Access-Control-Allow-Origin',
      'Access-Control-Allow-Credentials',
    ],
    exposedHeaders: ['Content-Range', 'X-Request-Id'],
    maxAge: 86400,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  }));

  // Body parsers
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Structured HTTP request logging (replaces morgan)
  const httpLogger = pinoHttp({
    logger,
    genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
  });
  app.use((req, res, next) => {
    httpLogger(req, res);
    res.setHeader('X-Request-Id', req.id);
    next();
  });

  // Mount Routers
  app.use('/api/auth', authRoutes);

  // Canonical auth check (cookie-first)
  app.get('/api/me', protect, meHandler());

  app.use('/api/notes', noteRoutes);
  app.use('/api/tags', tagRoutes);
  app.use('/api/search', searchRoutes);

  // Serve built frontend assets from backend container
  const publicPath = path.join(__dirname, 'public');
  app.use(express.static(publicPath, {
    setHeaders(res, filePath) {
      // Vite content-hashes everything under assets/ — cache forever.
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));

  // SPA fallback for non-API routes
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }
    if (req.path.startsWith('/api/') || req.path.startsWith('/graphql')) {
      return next();
    }
    // Paths with a file extension (e.g. a stale hashed /assets/*.css requested
    // by an old service worker after a deploy) must 404 — answering them with
    // index.html poisons browser/SW caches and renders the app unstyled.
    if (path.extname(req.path)) {
      return res.status(404).type('text/plain').send('Not found');
    }
    return res.sendFile(path.join(publicPath, 'index.html'));
  });

  // Error handling middleware (must be after all routes)
  app.use(notFound);
  app.use(errorHandler);

  const PORT = process.env.PORT || 9988;

  const server = app.listen(PORT, () => {
    logger.info(`NoteGeek server running on port ${ PORT }`);
  });

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) {
      logger.info(`${ signal } received during shutdown — forcing exit`);
      process.exit(1);
    }
    shuttingDown = true;
    logger.info(`${ signal } received — shutting down`);

    const forceTimer = setTimeout(() => {
      logger.error('Shutdown timed out after 15s — forcing exit');
      process.exit(1);
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

start().catch(err => {
  logger.error({ err }, 'Failed to start NoteGeek server');
  process.exit(1);
});
