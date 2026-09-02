const mongoose = require('mongoose');
const connectDB = require('./config/database');
const redisClient = require('./config/redis');
const logger = require('./config/logger');
const app = require('./app');

const PORT = process.env.PORT || 3001;

// Boot sequence
async function start() {
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

module.exports = app;
