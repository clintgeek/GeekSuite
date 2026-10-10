import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHttpLogger } from '@geeksuite/logger';
import { csrfGuard, meHandler } from '@geeksuite/user/server';
import logger from './lib/logger.js';
import { createSessionGate } from './middleware/authMiddleware.js';
import createAuthRouter from './routes/authRoutes.js';

// This file lives in backend/src, so the frontend build output ends up one
// level up, at backend/public (see apps/newsgeek/Dockerfile).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Build the NewsGeek Express app.
 *
 * The backend owns jobs (ingest, purge); reads and source management go
 * through basegeek's gateway (graphql/newsgeek). This app serves the built
 * frontend, the SSO proxy, and /api/health with the worker's status.
 * Importable without connecting to Mongo or binding a port — server.js does both.
 *
 * @param {object} [options]
 * @param {string} [options.publicPath]        default backend/public
 * @param {Function} [options.validateSession] attachUser's session check override
 * @param {() => object} [options.workerStatus] the ingest worker's status()
 * @param {() => number} [options.dbState]     mongoose readyState override (tests)
 */
export function createApp(options = {}) {
  const {
    publicPath = path.join(__dirname, '..', 'public'),
    validateSession,
    workerStatus = () => null,
    dbState = () => mongoose.connection.readyState,
  } = options;
  const sessionGate = createSessionGate({ validateSession });

  const app = express();
  app.disable('x-powered-by');

  // Required for Express behind Nginx reverse proxy (correct req.secure, req.ip, etc.)
  app.set('trust proxy', 1);

  const hardcodedOrigins = [
    'https://newsgeek.clintgeek.com',
    'http://localhost:1830',
    'http://localhost:1831',
    'http://localhost:5173',
  ];
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : hardcodedOrigins;

  // cookie-parser must run before csrfGuard, which reads req.cookies.
  app.use(cookieParser());

  // CSRF: origin-check every cookie-authenticated mutation against the same
  // allow-list cors() uses. Mounted before cors() on purpose —
  // DOCS/SSO_OVERVIEW.md#csrf. CSRF_GUARD=off|report|enforce.
  app.use(csrfGuard({ allowedOrigins, logger, appName: 'newsgeek' }));

  app.use(cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        return callback(new Error('The CORS policy for this site does not allow access from the specified Origin.'), false);
      }
      return callback(null, true);
    },
    credentials: true,
  }));

  app.use(express.json());

  // Request ID + structured logger. Paths only — never bodies.
  const httpLogger = createHttpLogger(logger);
  app.use((req, res, next) => {
    httpLogger(req, res);
    res.setHeader('X-Request-Id', req.id);
    next();
  });

  // Serve the frontend build.
  app.use(express.static(publicPath, {
    setHeaders(res, filePath) {
      // Vite content-hashes everything under assets/ — cache forever.
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));

  // Health — no auth, so container/nginx checks work. Includes the ingest
  // worker's last tick (as of that tick: active sources, feeds due).
  app.get('/api/health', (req, res) => {
    const w = workerStatus();
    res.status(200).json({
      status: 'healthy',
      database: dbState() === 1 ? 'connected' : 'disconnected',
      worker: w
        ? {
          enabled: w.enabled,
          running: w.running,
          lastTickAt: w.lastTickAt,
          lastTickMs: w.lastTickMs,
          lastTickError: w.lastTickError,
          activeSources: w.activeSources,
          feedsDue: w.feedsDue,
          lastTickPolled: w.lastTickPolled,
          lastTickFailed: w.lastTickFailed,
        }
        : null,
    });
  });

  app.use('/api/auth', createAuthRouter({ sessionGate }));
  app.get('/api/me', ...sessionGate, meHandler());

  // Unknown /api paths answer JSON, not the SPA.
  app.use('/api', (req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Route not found' }));

  // SPA fallback — serve index.html for non-API navigations (must be LAST).
  // Paths with a file extension (e.g. a stale hashed /assets/*.css requested
  // by an old service worker after a deploy) and anything under /assets/
  // must 404 — answering them with index.html poisons browser/SW caches and
  // renders the app unstyled (the suite's SPA-fallback landmine).
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/graphql')) {
      return next();
    }
    if (path.extname(req.path) || req.path.startsWith('/assets/')) {
      return res.status(404).type('text/plain').send('Not found');
    }
    return res.sendFile(path.join(publicPath, 'index.html'), (err) => {
      if (err && !res.headersSent) res.status(404).type('text/plain').send('Not found');
    });
  });

  // Last resort: never leak a stack or a message from an internal error.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    (req.log || logger).error({ err: { name: err?.name, code: err?.code } }, 'request failed');
    if (res.headersSent) return undefined;
    return res.status(500).json({ code: 'INTERNAL', message: 'Something went wrong' });
  });

  return app;
}

export default createApp;
