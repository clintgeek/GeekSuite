const app = require('./app');
const config = require('./config/config');
const logger = require('./utils/logger');
const connectDB = require('./config/mongo');

const port = config.port;

// Connect to MongoDB
connectDB();

const server = app.listen(port, () => {
  logger.info(`Server running in ${config.nodeEnv} mode on port ${port}`);
  console.log(`Backend listening on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, closing server gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
