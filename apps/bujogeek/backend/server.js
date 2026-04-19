import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'node:crypto';
import pinoHttp from 'pino-http';
import logger from './src/lib/logger.js';

// Import routes
import templateRoutes from './src/routes/templateRoutes.js';
import journalRoutes from './src/routes/journalRoutes.js';
import taskRoutes from './src/routes/taskRoutes.js';
import authRoutes from './src/routes/authRoutes.js';
import { authenticate } from './src/middleware/authMiddleware.js';
import { meHandler } from '@geeksuite/user/server';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
dotenv.config({ path: path.resolve(__dirname, envFile) });

const app = express();
const PORT = process.env.PORT || 5001;

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
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Routes
app.use('/api/auth', authRoutes);

app.get('/api/me', authenticate, meHandler());

app.use('/api/templates', templateRoutes);
app.use('/api/journal', journalRoutes);
app.use('/api/tasks', taskRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// SPA fallback - serve index.html for all non-API routes (must be LAST)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/graphql')) {
    return next();
  }
  res.sendFile(path.join(publicPath, 'index.html'));
});

// MongoDB Connection
const connectDB = async () => {
  logger.info({ uri: process.env.DB_URI?.replace(/:\/\/(.*)@/, '://******:******@') }, 'Connecting to MongoDB');

  await mongoose.connect(process.env.DB_URI);

  logger.info({ db: mongoose.connection.db.databaseName }, 'MongoDB connected');
};

// Graceful shutdown
let shuttingDown = false;
let server;

const shutdown = (signal) => {
  if (shuttingDown) {
    logger.info(`${ signal } received during shutdown — forcing exit`);
    process.exit(1);
  }
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

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

// Start server — connect DB first, then listen
async function start() {
  try {
    await connectDB();
  } catch (err) {
    logger.error({ err }, 'Failed to connect to MongoDB');
    process.exit(1);
  }

  server = app.listen(PORT, '0.0.0.0', () => {
    logger.info('API server running on port ' + PORT);
  });
}

start();
