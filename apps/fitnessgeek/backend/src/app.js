// Express app definition for fitnessgeek's backend.
//
// Split out of server.js so the app can be imported (e.g. by supertest) and
// exercised via request/response without connecting to MongoDB/Redis or
// binding a port. server.js owns the boot sequence (DB connect, Redis
// connect, app.listen, graceful shutdown) and requires this module for the
// actual app. Behavior here is unchanged from the original server.js.

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const dotenv = require('dotenv');
const crypto = require('crypto');
const pinoHttp = require('pino-http');
const path = require('path');
const logger = require('./config/logger');
const { authenticateToken } = require('./middleware/auth');
const { csrfGuard, meHandler } = require('@geeksuite/user/server');

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
    'Origin'
  ]
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Attach request ID and structured logger to every request
const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
});
app.use((req, res, next) => {
  httpLogger(req, res);
  res.setHeader('X-Request-Id', req.id);
  next();
});

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
app.get('/api/me', authenticateToken, meHandler());

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

// GraphQL reverse-proxy → BaseGeek unified API
const BASEGEEK_URL = (process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com').replace(/\/$/, '');
app.all('/graphql', async (req, res) => {
  try {
    const headers = { 'content-type': 'application/json' };
    if (req.headers.authorization) headers.authorization = req.headers.authorization;
    if (req.headers.cookie) headers.cookie = req.headers.cookie;

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

// Error handling middleware
app.use((error, req, res, next) => {
  req.log.error({ err: error }, 'Unhandled error');
  res.status(error.statusCode || 500).json({
    success: false,
    error: {
      message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : error.message,
      ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = app;
