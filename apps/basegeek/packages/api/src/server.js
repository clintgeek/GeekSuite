import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import logger from './lib/logger.js';
import mongoose from 'mongoose';
import mongoRoutes from './routes/mongo.js';
import redisRoutes from './routes/redis.js';
import postgresRoutes from './routes/postgres.js';
import influxRoutes from './routes/influx.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import noteGeekRoutes from './routes/noteGeek.js';
import aiRoutes from './routes/aiRoutes.js';
import openaiProxyRoutes from './routes/openaiProxy.js';
import apiKeyRoutes from './routes/apiKeys.js';
import appsRoutes from './routes/apps.js';
import oauthConnectionsRoutes from './routes/oauthConnections.js';
import ambientRoutes from './routes/ambient.js';
import { connectAIGeekDB, getAIGeekConnection } from './config/database.js';
import { userGeekConn } from './models/user.js';
import { listAppConnections } from './graphql/shared/appConnections.js';
import { resolveAllowedOrigins } from './lib/corsOrigins.js';
import { summarizeDependencies, createCachedProbe } from './lib/healthCheck.js';
import { initRefreshTokenStore, closeRefreshTokenStore, isRefreshTokenStoreConnected } from './services/refreshTokenStore.js';
import { seedMissingApps } from './services/appRegistrySeed.js';
import { startOAuthRefreshJob, stopOAuthRefreshJob } from './services/oauthRefreshJobService.js';
import reminderService from './graphql/bujogeek/services/reminderService.js';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';
import { typeDefs, resolvers } from './graphql/index.js';
import { csrfGuard, optionalUser } from '@geeksuite/user/server';


const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy - required for rate limiting behind nginx
app.set('trust proxy', 1);

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/datageek?authSource=admin';
try {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  logger.info('MongoDB connected')
} catch (err) {
  logger.error({ err }, 'MongoDB connection error')
  process.exit(1)
}

// Auto-seed the app registry with any default app that's missing (never
// updates or deletes an existing row). Runs on every boot so the Home page
// reflects the full suite without a manual `POST /api/apps/seed` call.
// Never fatal — a seeding hiccup shouldn't take the whole API down.
try {
  const { created, skipped } = await seedMissingApps()
  logger.info({ created, skipped }, '[AppRegistrySeed] boot seed complete')
} catch (err) {
  logger.error({ err }, '[AppRegistrySeed] boot seed failed')
}

// Connect to aiGeek database
try {
  await connectAIGeekDB()
  logger.info('aiGeek database connected')
} catch (err) {
  logger.error({ err }, 'aiGeek database connection error')
  process.exit(1)
}

// Connect to Redis (refresh-token store)
try {
  await initRefreshTokenStore()
} catch (err) {
  logger.error({ err }, 'Redis (refresh-token store) connection error')
  process.exit(1)
}

// Middleware
// Origin allow-list lives in lib/corsOrigins.js — cors() and the CSRF guard
// below read the same list so the two can never drift apart.
const { origins: allowedOrigins, source: originSource, isProduction } = resolveAllowedOrigins();

const corsLogPayload = { origins: allowedOrigins, source: originSource };
if (originSource === 'fallback' && isProduction) {
  logger.warn(corsLogPayload, 'CORS_ORIGINS not set; production is running on the hardcoded fallback origin list');
} else {
  logger.info(corsLogPayload, 'CORS allowed origins configured');
}

// CSRF: origin-check every cookie-authenticated mutation.
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
// Mounted before every route, which is what puts it in front of `/graphql`
// further down. That is the whole point: this process owns the suite's
// unified GraphQL API, so a GraphQL mutation over POST is the highest-value
// target in GeekSuite for a hostile page. `/openai/v1` and the health
// endpoints need no exemption — the proxy is called with an API key and no
// cookie, and health checks are GETs. See DOCS/SSO_OVERVIEW.md#csrf.
app.use(csrfGuard({ allowedOrigins, logger, appName: 'basegeek' }));

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps, curl, etc.)
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
    'Access-Control-Allow-Credentials'
  ],
  exposedHeaders: ['Content-Range'],
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));
// Increase body size limit for large AI conversation histories
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
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

// HTTP request logger middleware (only in development)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notes', noteGeekRoutes);
app.use('/api/ai', aiRoutes);
app.use('/openai/v1', openaiProxyRoutes);
app.use('/api/api-keys', apiKeyRoutes);
app.use('/api/apps', appsRoutes);
app.use('/api/connections', oauthConnectionsRoutes);
app.use('/api/ambient', ambientRoutes);
// Infrastructure browsers — admin only. Each router applies `requireAdmin`
// itself (a `router.use` at the top of the file) so the gate travels with the
// router and cannot be lost by a re-mount here.
app.use('/api/mongo', mongoRoutes);
app.use('/api/redis', redisRoutes);
app.use('/api/postgres', postgresRoutes);
app.use('/api/influx', influxRoutes);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uiBuildPath = path.join(__dirname, '../../ui/dist');
app.use(express.static(uiBuildPath));

// Track server start time for uptime
const serverStartTime = Date.now();

// Postgres / Influx have no long-lived client in this process — routes open a
// fresh connection per request. So they can't be checked with a readyState
// lookup the way the Mongo connections can. Both go through a cached probe
// that keeps the health handler synchronous: it reads the last known result
// and refreshes in the background, so a hung Postgres can never hang
// /api/health. Unconfigured deps stay `enabled: false` → readiness `null`
// → not counted as down (a deployment without Postgres isn't degraded).
const postgresProbe = createCachedProbe({
  enabled: !!process.env.POSTGRES_URL,
  ttlMs: 30_000,
  timeoutMs: 2_000,
  probe: async (timeoutMs) => {
    const { default: pg } = await import('pg');
    const client = new pg.Client({
      connectionString: process.env.POSTGRES_URL,
      connectionTimeoutMillis: timeoutMs,
      query_timeout: timeoutMs,
    });
    try {
      await client.connect();
      await client.query('SELECT 1');
      return true;
    } finally {
      await client.end().catch(() => {});
    }
  },
});

const influxProbe = createCachedProbe({
  enabled: !!process.env.INFLUXDB_TOKEN,
  ttlMs: 30_000,
  timeoutMs: 2_000,
  probe: async (timeoutMs) => {
    const { pingInflux } = await import('./config/influx.js');
    return pingInflux(timeoutMs);
  },
});

// Health check — real status, version, uptime, dependency readiness.
//
// Fully synchronous: every dependency is either an already-open pool
// (readyState) or a cached probe. No awaits, so a sick dependency degrades
// the body without delaying the response. For deeper probing (latency,
// versions, fresh connect), hit /api/health/infra instead.
//
// Status semantics:
//   - "ok"        all deps ready → 200
//   - "degraded"  non-critical dep down (redis / aiGeek / app DBs / pg / influx) → 200
//   - "unhealthy" critical dep down (mongo / userGeek — auth can't work) → 503
//
// Only `ready === false` counts as down; `null` means "unknown / not
// configured" and is ignored.
app.get('/api/health', (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);

  const appConnections = listAppConnections();
  const appNames = Object.keys(appConnections);
  const appsDown = appNames.filter((name) => !appConnections[name].ready);

  const dependencies = {
    // Critical: the core datageek DB and the userGeek DB that every login
    // reads. userGeek was previously unchecked, so basegeek reported "ok"
    // while authentication was hard down.
    mongo: { ready: mongoose.connection.readyState === 1, critical: true },
    userGeek: { ready: userGeekConn.readyState === 1, critical: true },
    // Non-critical: degrade, don't fail.
    aiGeek: { ready: getAIGeekConnection().readyState === 1 },
    redis: { ready: isRefreshTokenStoreConnected() },
    appDatabases: {
      ready: appNames.length === 0 ? null : appsDown.length === 0,
      ...(appsDown.length > 0 ? { down: appsDown } : {}),
      connections: appConnections,
    },
    postgres: postgresProbe.read(),
    influx: influxProbe.read(),
  };

  const { status, httpStatus, down } = summarizeDependencies(dependencies);

  res.status(httpStatus).json({
    status,
    version: process.env.npm_package_version || '0.1.0',
    uptime: uptimeSeconds,
    timestamp: new Date().toISOString(),
    app: 'basegeek',
    ...(down.length > 0 ? { downDependencies: down } : {}),
    dependencies,
  });
});

// Public infra health — checks mongo/redis/influx internally (no auth required)
app.get('/api/health/infra', async (req, res) => {
  const results = {};

  // MongoDB
  try {
    const { MongoClient } = await import('mongodb');
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/datageek?authSource=admin';
    const start = Date.now();
    const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 2000 });
    const serverStatus = await client.db().admin().command({ serverStatus: 1 });
    await client.close();
    results.mongo = { online: true, latency: Date.now() - start, version: serverStatus.version };
  } catch (err) {
    results.mongo = { online: false, latency: null };
  }

  // Redis
  try {
    const { createClient } = await import('redis');
    const redisUrl = process.env.REDIS_URL || 'redis://192.168.1.17:6380';
    const client = createClient({ url: redisUrl, socket: { connectTimeout: 3000 } });
    const start = Date.now();
    await client.connect();
    const info = await client.info('server');
    await client.quit();
    const versionMatch = info.match(/redis_version:(.+)/);
    results.redis = { online: true, latency: Date.now() - start, version: versionMatch?.[1]?.trim() || null };
  } catch (err) {
    results.redis = { online: false, latency: null };
  }

  // InfluxDB
  try {
    const { pingInflux } = await import('./config/influx.js');
    const start = Date.now();
    const reachable = await pingInflux();
    results.influx = { online: reachable, latency: reachable ? Date.now() - start : null };
  } catch (err) {
    results.influx = { online: false, latency: null };
  }

  res.json({ checkedAt: new Date().toISOString(), services: results });
});

// App health proxy — check other GeekSuite apps without CORS issues
// Looks up app URL from the Apps registry in MongoDB
app.get('/api/health/app/:appName', async (req, res) => {
  const { appName } = req.params;

  let baseUrl = null;
  let healthPath = '/api/health';

  try {
    const AppModel = (await import('./models/App.js')).default;
    const appDoc = await AppModel.findOne({ name: appName.toLowerCase() });
    if (appDoc) {
      baseUrl = appDoc.url;
      healthPath = appDoc.healthEndpoint || '/api/health';
    }
  } catch {
    // DB lookup failed — fall through
  }

  // Fallback hardcoded map if DB has no entry
  if (!baseUrl) {
    const fallback = {
      basegeek: 'https://basegeek.clintgeek.com',
      notegeek: 'https://notegeek.clintgeek.com',
      bujogeek: 'https://bujogeek.clintgeek.com',
      fitnessgeek: 'https://fitnessgeek.clintgeek.com',
      storygeek: 'https://storygeek.clintgeek.com',
      flockgeek: 'https://flockgeek.clintgeek.com',
      babelgeek: 'https://babelgeek.clintgeek.com',
      bookgeek: 'https://bookgeek.clintgeek.com',
      // startgeek is a static bundle behind `serve`; any HTTP answer counts.
      startgeek: 'https://start.clintgeek.com',
      dashgeek: 'https://dash.clintgeek.com',
    };
    baseUrl = fallback[appName.toLowerCase()];
  }

  if (!baseUrl) {
    return res.status(404).json({ status: 'unknown', error: 'Unknown app' });
  }

  try {
    const axios = (await import('axios')).default;
    const start = Date.now();
    // Try the health endpoint first; accept ANY HTTP response as "online"
    const response = await axios.get(`${ baseUrl }${ healthPath }`, {
      timeout: 5000,
      validateStatus: () => true, // don't throw on 4xx/5xx
    });
    const latency = Date.now() - start;
    const hasHealthData = response.status === 200;
    res.json({
      status: 'online',
      latency,
      httpStatus: response.status,
      data: hasHealthData ? response.data : null,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    // Only network-level failures (timeout, DNS, connection refused) reach here
    res.json({
      status: 'offline',
      latency: null,
      error: err.code || err.message,
      checkedAt: new Date().toISOString(),
    });
  }
});

// ─── Unified GraphQL API ────────────────────────────────────────────────────
// Apollo Server is started during app.listen (see below); mounted here as middleware.
// ─────────────────────────────────────────────────────────────────────────────

// Start Apollo Server and then the HTTP server
const apolloServer = new ApolloServer({ typeDefs, resolvers });
await apolloServer.start();

// Mount GraphQL BEFORE the SPA catch-all
app.use('/graphql', optionalUser());
app.use('/graphql', (req, _res, next) => {
  if (req.method === 'POST' && req.body?.operationName) {
    req.log.info(`[GQL] ${req.body.operationName} | vars: ${JSON.stringify(Object.keys(req.body.variables || {}))}`);
  }
  next();
});
app.use('/graphql', expressMiddleware(apolloServer, {
  context: async ({ req }) => ({
    user: req.user || null,
  }),
}));

// Start the household OAuth refresh daemon (every 5 minutes; see
// services/oauthRefreshJobService.js). Stop is wired into the shutdown path
// below, mirroring closeRefreshTokenStore.
try {
  startOAuthRefreshJob();
  logger.info('[OAuthRefreshJob] wired into server');
} catch (err) {
  logger.error({ err }, '[OAuthRefreshJob] failed to start');
}

// BuJoGeek task reminders. basegeek owns the task data and runs 24/7, so the
// 60-second sweep lives here rather than in the client. start() is a logged
// no-op when VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are unset.
try {
  reminderService.start();
} catch (err) {
  logger.error({ err }, '[BujoReminders] failed to start');
}

// Fallback route for SPA (MUST be after all API and static routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(uiBuildPath, 'index.html'), (err) => {
    if (err) {
      req.log.error({ err }, 'Error serving index.html');
      if (!res.headersSent) {
        res.status(404).send('UI not found. Is it built?');
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  req.log.error({ err }, '500 handler');
  res.status(500).json({
    message: 'Internal Server Error',
    requestId: req.id
  });
});


const server = app.listen(PORT, '0.0.0.0', async () => {
  logger.info(`API server running on port ${ PORT }`);
  logger.info(`🔷 GraphQL available at http://localhost:${ PORT }/graphql`);
  logger.info(`Health check available at http://localhost:${ PORT }/api/health`);
  logger.info(`MongoDB status available at http://localhost:${ PORT }/api/mongo/status`);
  logger.info(`Redis status available at http://localhost:${ PORT }/api/redis/status`);
  logger.info(`Postgres status available at http://localhost:${ PORT }/api/postgres/status`);
  logger.info(`User API available at http://localhost:${ PORT }/api/users/`);
  logger.info(`NoteGeek API available at http://localhost:${ PORT }/api/notes/`);

  // Phase 2A: Start provider health background job
  try {
    // The service exports autoStart/getInstance — `startHealthJob` never
    // existed, so this job has silently failed to start since the monorepo
    // import (the catch below only logged it).
    const { autoStart } = await import('./services/aiHealthJobService.js');
    autoStart();
    logger.info('✅ Phase 2A health monitoring started');
  } catch (error) {
    logger.error({ err: error }, '⚠️ Phase 2A health job failed to start');
  }

  // Phase 3: Initialize conversation service
  try {
    const conversationService = (await import('./services/conversationService.js')).default;
    await conversationService.initialize();
    logger.info('✅ Phase 3: Conversation service initialized');
  } catch (error) {
    logger.error({ err: error }, '⚠️ Phase 3: Conversation service failed to initialize');
  }
});

// Graceful shutdown
let shuttingDown = false
const shutdown = (signal) => {
  if (shuttingDown) {
    logger.info(`${ signal } received during shutdown — forcing exit`)
    process.exit(1)
  }
  shuttingDown = true
  logger.info(`${ signal } received — shutting down`)

  const forceTimer = setTimeout(() => {
    logger.error('Shutdown timed out after 15s — forcing exit')
    process.exit(0)
  }, 15_000)
  forceTimer.unref()

  server.close(async () => {
    try {
      stopOAuthRefreshJob()
    } catch (err) {
      logger.error({ err }, 'Error stopping OAuth refresh job')
    }
    try {
      reminderService.stop()
    } catch (err) {
      logger.error({ err }, 'Error stopping BuJoGeek reminder scheduler')
    }
    try {
      await mongoose.disconnect()
    } catch (err) {
      logger.error({ err }, 'Error disconnecting mongoose')
    }
    try {
      await closeRefreshTokenStore()
    } catch (err) {
      logger.error({ err }, 'Error closing refresh-token store')
    }
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))