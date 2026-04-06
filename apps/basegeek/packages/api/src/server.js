import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
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
import { connectAIGeekDB } from './config/database.js';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';
import { typeDefs, resolvers } from './graphql/index.js';
import { optionalUser } from '@geeksuite/user/server';


const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy - required for rate limiting behind nginx
app.set('trust proxy', 1);

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/datageek?authSource=admin';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Connect to aiGeek database
connectAIGeekDB()
  .then(() => console.log('aiGeek database connected'))
  .catch(err => console.error('aiGeek database connection error:', err));

// Middleware
const allowedOrigins = [
  'http://localhost:5173',    // Vite dev server
  'http://localhost:5174',    // Vite dev server (alternative port)
  'http://localhost:5001',    // Backend dev server
  'http://localhost:5000',    // Backend dev server (alternative port)
  'http://localhost:3000',    // StartGeek & StoryGeek frontend
  'https://basegeek.clintgeek.com',  // Production domain
  'https://geeksuite.clintgeek.com', // GeekSuite public portal
  'https://notegeek.clintgeek.com',  // NoteGeek production
  'https://fitnessgeek.clintgeek.com',  // FitnessGeek production
  'https://bujogeek.clintgeek.com',  // BujoGeek production
  'https://bookgeek.clintgeek.com',  // epub library
  'https://storygeek.clintgeek.com',  // StoryGeek production
  'https://flockgeek.clintgeek.com',  // FlockGeek production
  'https://dash.clintgeek.com',       // DashGeek production
  'https://dashgeek.clintgeek.com',   // DashGeek production (alt)
  'https://babelgeek.clintgeek.com',  // BabelGeek production
  'https://start.clintgeek.com',  // StartGeek production
  'https://clintgeek.com',        // Portfolio (for portal link)
  'http://localhost:1801',    // BookGeek dev server
  'http://192.168.1.17:5173',  // Local network access
  'http://192.168.1.17:5174',   // Local network access (alternative port)
  'http://192.168.1.17:9977'   // StoryGeek local network access
];

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

// HTTP request logger middleware (only in development)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Log all requests
app.use((req, res, next) => {
  console.log(`${ new Date().toISOString() } - ${ req.method } ${ req.url }`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notes', noteGeekRoutes);
app.use('/api/ai', aiRoutes);
app.use('/openai/v1', openaiProxyRoutes);
app.use('/api/api-keys', apiKeyRoutes);
app.use('/api/apps', appsRoutes);
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

// Health check — real status, version, uptime
app.get('/api/health', (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);
  res.json({
    status: 'ok',
    version: process.env.npm_package_version || '0.1.0',
    uptime: uptimeSeconds,
    timestamp: new Date().toISOString(),
    app: 'basegeek',
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
app.use('/graphql', expressMiddleware(apolloServer, {
  context: async ({ req }) => ({
    user: req.user || null,
  }),
}));

// Fallback route for SPA (MUST be after all API and static routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(uiBuildPath, 'index.html'), (err) => {
    if (err) {
      console.error('Error serving index.html:', err);
      if (!res.headersSent) {
        res.status(404).send('UI not found. Is it built?');
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});


app.listen(PORT, '0.0.0.0', async () => {
  console.log(`API server running on port ${ PORT }`);
  console.log(`🔷 GraphQL available at http://localhost:${ PORT }/graphql`);
  console.log(`Health check available at http://localhost:${ PORT }/api/health`);
  console.log(`MongoDB status available at http://localhost:${ PORT }/api/mongo/status`);
  console.log(`Redis status available at http://localhost:${ PORT }/api/redis/status`);
  console.log(`Postgres status available at http://localhost:${ PORT }/api/postgres/status`);
  console.log(`User API available at http://localhost:${ PORT }/api/users/`);
  console.log(`NoteGeek API available at http://localhost:${ PORT }/api/notes/`);

  // Phase 2A: Start provider health background job
  try {
    const { startHealthJob } = await import('./services/aiHealthJobService.js');
    await startHealthJob();
    console.log('✅ Phase 2A health monitoring started');
  } catch (error) {
    console.error('⚠️ Phase 2A health job failed to start:', error.message);
  }

  // Phase 3: Initialize conversation service
  try {
    const conversationService = (await import('./services/conversationService.js')).default;
    await conversationService.initialize();
    console.log('✅ Phase 3: Conversation service initialized');
  } catch (error) {
    console.error('⚠️ Phase 3: Conversation service failed to initialize:', error.message);
  }
});