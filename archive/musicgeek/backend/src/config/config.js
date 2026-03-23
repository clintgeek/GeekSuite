const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

module.exports = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  baseGeekUrl: process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com',
  jwt: {
    // Must match baseGeek's JWT_SECRET for SSO to work
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  },
  xp: {
    lessonComplete: 50,
    practiceSession: 10,
    achievementUnlock: 100,
    dailyStreak: 25,
  },
};
