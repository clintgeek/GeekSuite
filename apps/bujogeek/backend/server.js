import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './src/lib/logger.js';
import createApp from './src/app.js';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
dotenv.config({ path: path.resolve(__dirname, envFile) });

const PORT = process.env.PORT || 5001;

const app = createApp();

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
