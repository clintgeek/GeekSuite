import mongoose from 'mongoose';
import connectDB from './config/database.js';
import redisClient from './config/redis.js';
import logger from './config/logger.js';
// Imported before ./app.js only for readability — app.js runs dotenv.config()
// at import time, so process.env is populated by the time start() runs.
import { assertKeyVaultSecret } from './config/keyVault.js';
import app from './app.js';

const PORT = process.env.PORT || 3001;

// Boot sequence
async function start() {
  // Refuse to boot without the key that decrypts the Garmin password.
  // Garmin is a core feature here, so a missing key is a broken app, not a
  // degraded one — see src/config/keyVault.js for the reasoning.
  assertKeyVaultSecret(logger);

  // Connect to MongoDB — fail fast on error
  try {
    await connectDB();
  } catch (err) {
    logger.error({ err }, 'MongoDB connection failed — aborting boot');
    process.exit(1);
  }

  // Connect to Redis (non-blocking — app continues if Redis fails)
  redisClient.connect().catch(err => {
    logger.warn({ err: err.message }, 'Redis connection failed — caching disabled');
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`FitnessGeek API server running on port ${ PORT }`);
    logger.info(`Health check available at http://localhost:${ PORT }/health`);
    logger.info(`Environment: ${ process.env.NODE_ENV || 'development' }`);
    logger.info(`Redis caching: ${ redisClient.isReady() ? 'enabled' : 'disabled' }`);
  });

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) {
      logger.info(`${ signal } received during shutdown — forcing exit`);
      process.exit(1);
    }
    shuttingDown = true;
    logger.info(`${ signal } received — shutting down`);

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
      try {
        if (typeof redisClient.quit === 'function') {
          await redisClient.quit();
        }
      } catch (err) {
        logger.error({ err }, 'Error closing Redis client');
      }
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();

export default app;
