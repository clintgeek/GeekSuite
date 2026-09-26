import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHttpLogger } from '@geeksuite/logger';
import { csrfGuard, meHandler } from '@geeksuite/user/server';
import logger from './lib/logger.js';
import { filesRoot as resolveFilesRoot } from './lib/fileStorage.js';
import { createMemberGate } from './middleware/authMiddleware.js';
import createAuthRouter from './routes/authRoutes.js';
import createFileRoutes from './routes/fileRoutes.js';
import ThingModel from './models/Thing.js';
import ThingFileModel from './models/ThingFile.js';

// This file lives in backend/src, so the frontend build output ends up one
// level up, at backend/public (see apps/thinggeek/Dockerfile).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Build the ThingGeek Express app.
 *
 * Importable (and exercisable with supertest / tools/boot-smoke.mjs) without
 * connecting to Mongo or binding a port — server.js does both. Everything is
 * injectable for tests; the defaults are production's.
 *
 * @param {object} [options]
 * @param {object} [options.Thing]            mongoose model (or a fake)
 * @param {object} [options.ThingFile]        mongoose model (or a fake)
 * @param {string} [options.filesPath]        default env FILES_PATH, else /data/files
 * @param {string} [options.publicPath]       default backend/public
 * @param {Function} [options.validateSession] attachUser's session check override
 * @param {() => Date} [options.now]
 */
export function createApp(options = {}) {
  const {
    Thing = ThingModel,
    ThingFile = ThingFileModel,
    filesPath,
    publicPath = path.join(__dirname, '..', 'public'),
    validateSession,
    now,
  } = options;
  const filesRoot = resolveFilesRoot(filesPath);
  const memberGate = createMemberGate({ validateSession });

  const app = express();
  app.disable('x-powered-by');

  // Required for Express behind Nginx reverse proxy (correct req.secure, req.ip, etc.)
  app.set('trust proxy', 1);

  const hardcodedOrigins = [
    'https://thinggeek.clintgeek.com',
    'http://localhost:1820',
    'http://localhost:1821',
    'http://localhost:5173',
  ];
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : hardcodedOrigins;

  // cookie-parser must run before csrfGuard, which reads req.cookies.
  app.use(cookieParser());

  // CSRF: origin-check every cookie-authenticated mutation (the upload is
  // one) against the same allow-list cors() uses. Mounted before cors() on
  // purpose — DOCS/SSO_OVERVIEW.md#csrf. CSRF_GUARD=off|report|enforce.
  app.use(csrfGuard({ allowedOrigins, logger, appName: 'thinggeek' }));

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

  // Default 100 kB JSON limit. Uploads are multipart and read by multer,
  // after auth, the member gate and the thing check (routes/fileRoutes.js).
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

  // Health — no auth, no member gate, so container/nginx checks work.
  app.get('/api/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    });
  });

  app.use('/api/auth', createAuthRouter({ memberGate }));
  app.get('/api/me', ...memberGate, meHandler());
  app.use('/api', createFileRoutes({ memberGate, Thing, ThingFile, filesRoot, now }));

  // Unknown /api paths answer JSON, not the SPA.
  app.use('/api', (req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Route not found' }));

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
