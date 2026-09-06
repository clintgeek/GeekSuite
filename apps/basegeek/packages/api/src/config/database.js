import mongoose from 'mongoose';
import logger from '../lib/logger.js';

const AIGEEK_MONGODB_URI = process.env.AIGEEK_MONGODB_URI || 'mongodb://localhost:27017/aiGeek?authSource=admin';

// Cached singleton — the previous `mongoose.connections.find(c => c.name === 'aiGeek')`
// check was racy: connection.name is undefined until the connection finishes the
// handshake, so every model file imported at startup created its own orphan
// connection, and queries buffered forever against connections nothing was bound to.
let _aiGeekConnection = null;

export const getAIGeekConnection = () => {
  if (_aiGeekConnection) return _aiGeekConnection;
  logger.info('🔗 Creating aiGeek connection');
  _aiGeekConnection = mongoose.createConnection(AIGEEK_MONGODB_URI);

  // A mongoose Connection is an EventEmitter, and an 'error' event with no
  // listener is thrown by Node rather than logged — so a post-boot aiGeek
  // outage (auth failure, socket reset, replica-set election) took the whole
  // API process down with an uncaught exception. Every other connection in
  // this package (models/user.js, graphql/shared/appConnections.js) already
  // carries these two handlers; this one was the odd one out.
  _aiGeekConnection.on('error', (err) => logger.error({ err }, '[aiGeek] MongoDB connection error'));
  _aiGeekConnection.on('connected', () => logger.info('[aiGeek] MongoDB connected'));

  return _aiGeekConnection;
};

export const connectAIGeekDB = async () => {
  const conn = getAIGeekConnection();
  await conn.asPromise();
  logger.info('Connected to aiGeek database');
  return conn;
};
