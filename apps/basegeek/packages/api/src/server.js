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
import { createHttpLogger } from '@geeksuite/logger';
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
import ambientRoutes from './routes/ambient.js';
import { connectAIGeekDB, getAIGeekConnection } from './config/database.js';
import { userGeekConn } from './models/user.js';
import { listAppConnections } from './graphql/shared/appConnections.js';
import { resolveAllowedOrigins } from './lib/corsOrigins.js';
import { summarizeDependencies, createCachedProbe } from './lib/healthCheck.js';
import { initRefreshTokenStore, closeRefreshTokenStore, isRefreshTokenStoreConnected } from './services/refreshTokenStore.js';
import { seedMissingApps } from './services/appRegistrySeed.js';
import { startOAuthRefreshJob, stopOAuthRefreshJob } from './services/oauthRefreshJobService.js';
import { startAICatalogJob, stopAICatalogJob } from './services/aiCatalogJob.js';
import reminderService from './graphql/bujogeek/services/reminderService.js';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';
import { typeDefs, resolvers } from './graphql/index.js';
import { csrfGuard, optionalUser } from '@geeksuite/user/server';
import { csrfTokenGuard, ensureCsrfCookie } from './middleware/csrfToken.js';
import { localSessionValidator } from './middleware/auth.js';


const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy - required for rate limiting behind nginx
app.set('trust proxy', 1);

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/datageek?authSource=admin';
try {
  await mongoose.connect(MONGODB_URI)
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

// CSRF, second factor: the double-submit token.
//
// The origin guard above cannot close sibling-subdomain CSRF against *this*
// process, because basegeek's allow-list has to contain every app origin —
// every frontend in the suite calls this GraphQL API — and the SSO cookies are
// issued on `domain=.clintgeek.com`. So a cookie-authenticated mutation must
// also echo the `geek_csrf` cookie back in `X-CSRF-Token`, which a cross-site
// page cannot attach. API-key and bearer clients carry no cookie and are
// exempt by construction; see middleware/csrfToken.js.
//
// Mounted here for the same reason the origin guard is: in front of every
// route, `/graphql` included. Reads cookies straight off the header, so it
// does not care that `cookieParser()` is mounted further down.
//
// Ships in report-only mode (CSRF_TOKEN defaults to `report`) — it logs what
// it would have blocked and blocks nothing, so deploying it cannot break an
// app whose client does not send the header yet. Flip to CSRF_TOKEN=enforce
// after a day of clean logs.
app.use(csrfTokenGuard({ logger, appName: 'basegeek' }));

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
    'Access-Control-Allow-Credentials',
    // The double-submit CSRF token. Without this on the allow-list the
    // preflight for any cross-origin mutation fails and every app but
    // basegeek's own UI breaks the moment it starts sending the header.
    'X-CSRF-Token'
  ],
  exposedHeaders: ['Content-Range'],
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));
// Body parsing.
//
// The AI surfaces get their own, much tighter cap, mounted FIRST so it wins
// (express.json is a no-op once req.body is set). Both routers apply their
// credential gate *inside* the router, so until this existed an entirely
// unauthenticated POST to https://basegeek.clintgeek.com/openai/v1/... had its
// full 50 MB body buffered and JSON-parsed into heap before anything looked at
// `Authorization` — and then run through tiktoken and an md5 of the whole
// conversation on the event loop. 8 MB is still far past any provider's
// context window; AI_BODY_LIMIT is the escape hatch if a real caller needs
// more.
const aiBodyParser = express.json({ limit: process.env.AI_BODY_LIMIT || '8mb' });
app.use('/openai/v1', aiBodyParser);
app.use('/api/ai', aiBodyParser);

// Everything else — /graphql carries notegeek's 5 000 000-char mindmap
// snapshots, which is what the large limit is actually for.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Back-fill `geek_csrf` for any session that has SSO cookies but no token yet
// — a session created before this shipped heals on its very next request
// rather than on its next login. Never overwrites an existing token; rotation
// belongs to routes/auth.js, in lockstep with the refresh token.
app.use(ensureCsrfCookie());

// Attach request ID and structured logger to every request
const httpLogger = createHttpLogger(logger);
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
// `/api/connections` was mounted here until 2026-09-06 (Q69). The router
// exposed the OAuth connect flow (authorize / callback / disconnect / list)
// plus a `POST /internal/token` gated on `INTERNAL_JWT_SECRET` — a variable
// set in no env file and no compose file, so that endpoint answered 500 to
// every request it ever received. Nothing in the suite called any of the five:
// the dashgeek ambient screen it was built for never shipped a client, and
// `grep -r 'api/connections'` across the monorepo found only this line.
//
// `services/oauthConnectionService.js` and `models/OAuthConnection.js` STAY —
// `services/ambientService.js` and `services/oauthRefreshJobService.js` both
// import them, so the tokens keep refreshing and `/api/ambient` keeps reading
// them. What is gone is the only way to *establish* a connection over HTTP: if
// the ambient screen is revived, this router comes back from git history
// (`git log --diff-filter=D -- apps/basegeek/packages/api/src/routes/oauthConnections.js`)
// minus the internal-token endpoint.
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
  //
  // The client is closed in a `finally`: before, a `serverStatus` that threw
  // skipped `close()` and leaked a connection pool on every failing probe of a
  // route anyone can call unauthenticated.
  let mongoProbeClient = null;
  try {
    const { MongoClient } = await import('mongodb');
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/datageek?authSource=admin';
    const start = Date.now();
    mongoProbeClient = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 2000 });
    const serverStatus = await mongoProbeClient.db().admin().command({ serverStatus: 1 });
    results.mongo = { online: true, latency: Date.now() - start, version: serverStatus.version };
  } catch (err) {
    results.mongo = { online: false, latency: null };
  } finally {
    if (mongoProbeClient) await mongoProbeClient.close().catch(() => {});
  }

  // Redis
  //
  // `.on('error')` is not optional: node-redis is an EventEmitter, and an
  // 'error' event with no listener is *thrown* by Node. Without it, a Redis
  // that is down turned this public, unauthenticated endpoint into an uncaught
  // exception — i.e. anyone could restart the API by calling it while Redis
  // was unreachable. `quit()` likewise moves into a `finally` so a failing
  // INFO cannot leak the socket.
  let redisProbeClient = null;
  try {
    const { createClient } = await import('redis');
    const redisUrl = process.env.REDIS_URL || 'redis://192.168.1.17:6380';
    redisProbeClient = createClient({
      url: redisUrl,
      socket: { connectTimeout: 3000, reconnectStrategy: false },
    });
    redisProbeClient.on('error', (err) => logger.debug({ err }, '[health/infra] redis probe error'));
    const start = Date.now();
    await redisProbeClient.connect();
    const info = await redisProbeClient.info('server');
    const versionMatch = info.match(/redis_version:(.+)/);
    results.redis = { online: true, latency: Date.now() - start, version: versionMatch?.[1]?.trim() || null };
  } catch (err) {
    results.redis = { online: false, latency: null };
  } finally {
    if (redisProbeClient?.isOpen) await redisProbeClient.quit().catch(() => {});
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

// Mount GraphQL BEFORE the SPA catch-all.
//
// `optionalUser()` validates the session, but basegeek validates its own
// sessions *in process*: the default validator calls `BASEGEEK_URL/api/users/me`
// over HTTP, and inside basegeek that URL is basegeek. Every gateway request
// then spent an inbound request slot asking itself who the caller was — a
// feedback loop under load, and since `validateToken` grew an 8 s timeout, one
// that ended in the whole suite logging out rather than a slow page
// (BURN_REVIEW_2 §3). `localSessionValidator` verifies the JWT with this
// process's own secret and loads the user from Mongo; no socket is opened.
app.use('/graphql', optionalUser({ validateSession: localSessionValidator }));
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

// The AI catalog steward (hourly tick; discovery at 24 h, re-probe at 6 h; see
// services/aiCatalogJob.js). This is what replaced the monthly
// `docker exec … discover-free-models.js --sync` ritual in RUNBOOK §12. Its
// first tick waits 60 s so aiService has loaded the provider keys out of Mongo.
// `AI_CATALOG_JOB=off` disables it — that is also the Phase 1 rollback. Stop is
// wired into the shutdown path below, beside the OAuth job.
try {
  startAICatalogJob();
} catch (err) {
  logger.error({ err }, '[CatalogJob] failed to start');
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
//
// Paths with a file extension (e.g. a stale hashed /assets/*.css requested by
// an old service worker after a deploy) must 404 — answering them with
// index.html poisons browser/SW caches and renders the app unstyled.
// DOCS/CONTEXT.md landmine; bujogeek/notegeek/bookgeek/fitnessgeek carry the
// same guard.
app.get('*', (req, res) => {
  if (path.extname(req.path)) {
    return res.status(404).type('text/plain').send('Not found');
  }
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
//
// `req.log` only exists downstream of the pino-http middleware above, and the
// CSRF guards and cors() are mounted *before* it — so an error raised by any
// of those (cors() rejects a disallowed Origin with `callback(new Error(...))`)
// used to make this handler itself throw, and the rejection was reported by
// express's default finalhandler instead of here. Fall back to the module
// logger so every error is logged exactly once, from one place.
app.use((err, req, res, next) => {
  (req.log || logger).error({ err }, '500 handler');
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

  // The Phase 2A provider-health job used to start here. It went with the
  // second routing stack (2026-09-07): a 60 s interval that mutated a LOCAL
  // COPY of the cooldown map, so it logged "✓ Cleared cooldown" forever
  // without clearing anything, and it was still health-checking `llm7` and
  // `onemin`, both deleted in September. Free-tier health now lives on the
  // request path, in `AIFreeTier.health`.

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
      stopAICatalogJob()
    } catch (err) {
      logger.error({ err }, 'Error stopping AI catalog job')
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