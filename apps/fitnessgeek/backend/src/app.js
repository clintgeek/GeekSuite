// Express app definition for fitnessgeek's backend.
//
// Split out of server.js so the app can be imported (e.g. by supertest) and
// exercised via request/response without connecting to MongoDB/Redis or
// binding a port. server.js owns the boot sequence (DB connect, Redis
// connect, app.listen, graceful shutdown) and requires this module for the
// actual app. Behavior here is unchanged from the original server.js.

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import axios from 'axios';
import dotenv from 'dotenv';
import { createHttpLogger } from '@geeksuite/logger';
import path from 'path';
import { fileURLToPath } from 'node:url';
import logger from './config/logger.js';
import { breakerStats } from './lib/breakers.js';
import { authenticateToken } from './middleware/auth.js';
import { csrfGuard, meHandler } from '@geeksuite/user/server';

// Route modules. Under ESM these are static imports; the CommonJS original
// inlined `require()` calls in the app.use() list below.
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import foodRoutes from './routes/foodRoutes.js';
import logRoutes from './routes/logRoutes.js';
import summaryRoutes from './routes/summaryRoutes.js';
import goalRoutes from './routes/goalRoutes.js';
import mealRoutes from './routes/mealRoutes.js';
import weightRoutes from './routes/weightRoutes.js';
import bloodPressureRoutes from './routes/bloodPressureRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import streakRoutes from './routes/streakRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import aiCoachRoutes from './routes/aiCoachRoutes.js';
import fitnessRoutes from './routes/fitnessRoutes.js';
import medicationRoutes from './routes/medicationRoutes.js';
import insightsRoutes from './routes/insightsRoutes.js';
import foodReportRoutes from './routes/foodReportRoutes.js';
import influxRoutes from './routes/influxRoutes.js';

// ESM has no __dirname; derive it from import.meta.url (used for the built
// frontend's public/ path below).
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables
dotenv.config();

const app = express();

function forwardSetCookieHeaders(res, upstreamHeaders) {
  const setCookie = upstreamHeaders && upstreamHeaders['set-cookie'];
  if (!setCookie) return;
  res.setHeader('Set-Cookie', setCookie);
}

// Middleware
// Production fallback: only real clintgeek.com origins. Never falls back to
// dev/LAN addresses when NODE_ENV === 'production' (see devOnlyCorsOrigins below).
const productionCorsOrigins = [
  'https://fitnessgeek.clintgeek.com',
];
// Dev/LAN origins — only appended to the fallback outside production.
const devOnlyCorsOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4080',
  'http://192.168.1.17:4080'
];
const isProduction = process.env.NODE_ENV === 'production';
const fallbackCorsOrigins = isProduction
  ? productionCorsOrigins
  : [...productionCorsOrigins, ...devOnlyCorsOrigins];
const usingEnvCorsOrigins = Boolean(process.env.CORS_ORIGINS);
const allowedOrigins = usingEnvCorsOrigins
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : fallbackCorsOrigins;

const corsLogPayload = {
  origins: allowedOrigins,
  source: usingEnvCorsOrigins ? 'env' : 'fallback',
};
if (!usingEnvCorsOrigins && isProduction) {
  logger.warn(corsLogPayload, 'CORS_ORIGINS not set; production is running on the hardcoded fallback origin list');
} else {
  logger.info(corsLogPayload, 'CORS allowed origins configured');
}

// CSRF: origin-check every cookie-authenticated mutation against the same
// `allowedOrigins` list the cors() config below uses — one list, no second
// copy.
//
// Mounted *before* cors() on purpose. This cors() config answers a
// disallowed Origin with `callback(new Error(...))`, which express turns into
// a generic 500 — so a CSRF attempt would otherwise look like an application
// bug, and would stop being blocked at all the moment someone "tidied" that
// callback into the equally idiomatic `callback(null, false)` (which lets the
// request through without the CORS header). Running first makes the rejection
// a deliberate, tested 403 that does not depend on how cors() reports a
// mismatch.
//
// This also covers `app.all('/graphql')` below, fitnessgeek's reverse proxy
// into basegeek's unified GraphQL API: a GraphQL mutation is a POST, and it
// is by far the most valuable thing on this backend for a third-party page to
// try to reach. See DOCS/SSO_OVERVIEW.md#csrf.
app.use(csrfGuard({ allowedOrigins, logger, appName: 'fitnessgeek' }));

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
    // @geeksuite/auth's request interceptor adds this to every non-GET call
    // this app's axios instance makes; without it on the allow-list a
    // cross-origin preflight for a REST mutation fails outright.
    'X-CSRF-Token'
  ]
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Attach request ID and structured logger to every request
const httpLogger = createHttpLogger(logger);
app.use((req, res, next) => {
  httpLogger(req, res);
  res.setHeader('X-Request-Id', req.id);
  next();
});

// Health check endpoint
const healthHandler = (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
};
app.get('/health', healthHandler);
// basegeek's Home page health proxy defaults every app's healthEndpoint to
// `/api/health` (every other app answers there); this app historically only
// answered at `/health`. Same handler, registered before the SPA catch-all
// and with no auth in front of it. `/health` stays — no docker/compose
// healthcheck references either path today (checked Dockerfile and
// docker-compose*.yml — no HEALTHCHECK is defined for this service at all),
// but removing a previously-public path isn't this change's job.
app.get('/api/health', healthHandler);

// Circuit breaker stats for the external food/fitness APIs (USDA,
// OpenFoodFacts, CalorieNinjas, Garmin — DOCS/TODO_ORDER.md #23). Read-only,
// no auth — matches /api/health above.
app.get('/api/health/breakers', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    breakers: breakerStats(),
  });
});

// Session identity endpoint
app.get('/api/me', authenticateToken, meHandler());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/foods', foodRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/summary', summaryRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/meals', mealRoutes);
app.use('/api/weight', weightRoutes);
app.use('/api/blood-pressure', bloodPressureRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/streaks', streakRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/ai-coach', aiCoachRoutes);
app.use('/api/fitness', fitnessRoutes);
app.use('/api/meds', medicationRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/food-reports', foodReportRoutes);
app.use('/api/influx', influxRoutes);

// GraphQL reverse-proxy → BaseGeek unified API
const BASEGEEK_URL = (process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com').replace(/\/$/, '');
app.all('/graphql', async (req, res) => {
  try {
    // Forward the double-submit CSRF header as received. Production routes
    // /graphql straight to basegeek through nginx, so this proxy is the dev
    // path only — but dropping the header here means a dev session 403s the
    // moment CSRF_TOKEN flips to enforce, for no reason. Same rule as the
    // auth proxies: forward what the browser sent, never synthesize a token
    // from the replayed cookie. (BURN_REVIEW P2 (n).)
    const headers = { 'content-type': 'application/json' };
    if (req.headers.authorization) headers.authorization = req.headers.authorization;
    if (req.headers.cookie) headers.cookie = req.headers.cookie;
    if (req.headers['x-csrf-token']) headers['x-csrf-token'] = req.headers['x-csrf-token'];

    const response = await axios({
      method: req.method,
      url: `${ BASEGEEK_URL }/graphql`,
      data: req.body,
      headers,
      timeout: 30000,
    });

    forwardSetCookieHeaders(res, response.headers);
    res.status(response.status).json(response.data);
  } catch (err) {
    const status = err.response?.status || 502;
    const data = err.response?.data || { errors: [{ message: 'GraphQL proxy: unable to reach BaseGeek' }] };
    res.status(status).json(data);
  }
});

// Serve built frontend files
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

// SPA Catch-all handler
app.get("*", (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/graphql')) {
    return next();
  }
  // A missing hashed asset must 404, never fall back to index.html: a
  // service worker that caches an HTML body under a .js/.css/.woff2 URL
  // poisons every load until the cache is cleared (DOCS/CONTEXT.md landmine;
  // bujogeek/notegeek/bookgeek carry the same guard).
  if (path.extname(req.path)) {
    return res.status(404).type('text/plain').send('Not found');
  }
  res.sendFile(path.join(publicPath, "index.html"));
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${ req.originalUrl } not found`,
      code: 'ROUTE_NOT_FOUND'
    },
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware.
//
// `req.log` is attached by createHttpLogger a few middlewares down, so it is
// NOT present for anything thrown ahead of it — `express.json()`'s SyntaxError
// on a malformed body (a 400 any client can produce) and cors()'s
// disallowed-origin Error both land here with `req.log` undefined. Calling
// `req.log.error` then threw inside the error handler itself, which express
// answers with its own HTML 500: no log line, and the JSON error shape every
// client expects replaced by markup.
app.use((error, req, res, next) => {
  (req.log || logger).error({ err: error }, 'Unhandled error');
  res.status(error.statusCode || 500).json({
    success: false,
    error: {
      message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : error.message,
      ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
    },
    timestamp: new Date().toISOString()
  });
});

export default app;
