import mongoose from 'mongoose';
import logger from '../../lib/logger.js';

// Each GeekSuite app stores data in its own MongoDB database on the same server.
// The default mongoose.connect() in server.js goes to 'datageek'.
// Per-app connections are created here using mongoose.createConnection() so that
// models can read/write from the correct database.

const MONGO_BASE = process.env.MONGO_BASE_URI || 'mongodb://localhost:27017';
const AUTH_SOURCE = 'authSource=admin';

const connections = {};

/**
 * Get (or create) a mongoose connection for a specific database.
 * Connections are cached and reused.
 *
 * @param {string} dbName - Database name, e.g. 'bujogeek', 'notegeek'
 * @returns {mongoose.Connection}
 */
export function getAppConnection(appName) {
  if (connections[appName]) return connections[appName];

  const dbMap = {
    notegeek: 'noteGeek',
    usergeek: 'userGeek',
  };
  const actualDbName = dbMap[appName] || appName;

  const uri = `${ MONGO_BASE }/${ actualDbName }?${ AUTH_SOURCE }`;
  const conn = mongoose.createConnection(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  conn.on('error', (err) => logger.error({ err }, `[${ actualDbName }] MongoDB connection error`));
  conn.on('connected', () => logger.info(`[${ actualDbName }] MongoDB connected`));

  connections[appName] = conn;
  return conn;
}
