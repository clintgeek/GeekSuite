import dotenv from 'dotenv';

dotenv.config();

import mongoose from 'mongoose';
import { installShutdownHooks } from '@geeksuite/logger';
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

  installShutdownHooks(logger, server, {
    onClose: async () => {
      try {
        await mongoose.disconnect();
      } catch (err) {
        logger.error({ err }, 'Error disconnecting mongoose');
      }
    },
  });
}

start();
