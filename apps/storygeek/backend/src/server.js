import dotenv from 'dotenv';

dotenv.config();

import mongoose from 'mongoose';
import app from './app.js';
import { logger } from './utils/logger.js';

const PORT = process.env.PORT || 9977;

// Boot sequence
async function start() {
  try {
    await mongoose.connect(process.env.DB_URI);
    logger.info('MongoDB connected');
  } catch (err) {
    logger.error({ err }, 'MongoDB connection failed — aborting boot');
    process.exit(1);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`StoryGeek backend listening on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) {
      logger.info(`${signal} received during shutdown — forcing exit`);
      process.exit(1);
    }
    shuttingDown = true;
    logger.info(`${signal} received — shutting down`);

    const forceTimer = setTimeout(() => {
      logger.error('Shutdown timed out after 15s — forcing exit');
      process.exit(0);
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
}

start();
