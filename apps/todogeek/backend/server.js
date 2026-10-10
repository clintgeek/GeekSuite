import http from 'http';
import mongoose from 'mongoose';
import { installShutdownHooks } from '@geeksuite/logger';
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

// Created up front (not by app.listen in start()) so the shutdown hooks always
// have a server to close. A signal can arrive before listen() — the container
// is stopped while connectDB is still waiting on Mongo, say — and close() on a
// server that is not listening still calls back, so onClose runs and the
// process exits 0.
const server = http.createServer(app);

// Graceful shutdown
installShutdownHooks(logger, server, {
  onClose: async () => {
    try {
      await mongoose.disconnect();
    } catch (err) {
      logger.error({ err }, 'Error disconnecting mongoose');
    }
  },
});

// Start server — connect DB first, then listen
async function start() {
  try {
    await connectDB();
  } catch (err) {
    logger.error({ err }, 'Failed to connect to MongoDB');
    process.exit(1);
  }

  server.listen(PORT, '0.0.0.0', () => {
    logger.info('API server running on port ' + PORT);
  });
}

start();
