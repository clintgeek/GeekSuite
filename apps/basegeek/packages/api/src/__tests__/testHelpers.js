/**
 * testHelpers.js — shared helpers for auth integration tests.
 *
 * IMPORTANT: This module must be imported AFTER jest.unstable_mockModule('redis', ...)
 * has been called in the test file, otherwise refreshTokenStore.js will try to
 * connect to a real Redis instance.
 *
 * Typical usage in a test file:
 *
 *   import { makeFakeRedisClient } from './fakeRedis.js';
 *
 *   const fakeClient = makeFakeRedisClient();
 *   jest.unstable_mockModule('redis', () => ({
 *     createClient: () => fakeClient,
 *   }));
 *
 *   // Dynamic imports AFTER mock registration:
 *   const { buildTestApp, createTestUser } = await import('./testHelpers.js');
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import pinoHttp from 'pino-http';
import logger from '../lib/logger.js';
import mongoose from 'mongoose';
import { User } from '../models/user.js';
import authRoutes from '../routes/auth.js';
import { initRefreshTokenStore } from '../services/refreshTokenStore.js';

/**
 * Build a minimal Express app with:
 *   - cookie-parser
 *   - pino-http (attaches req.log which auth.js route handlers use)
 *   - auth routes at /api/auth
 *
 * No Mongo connect here — the test file's globalSetup/beforeAll handles that.
 */
export function buildTestApp() {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  // pino-http attaches req.log; auth.js route handlers call req.log.info etc.
  const httpLogger = pinoHttp({
    logger,
    genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
    // Suppress request/response log lines in test output
    autoLogging: false,
  });
  app.use((req, res, next) => {
    httpLogger(req, res);
    next();
  });

  app.use('/api/auth', authRoutes);

  return app;
}

/**
 * Create a real User document, running the bcrypt pre-save hook.
 * @param {{ email?: string, username?: string, password: string }} opts
 * @returns {Promise<import('mongoose').Document>}
 */
export async function createTestUser({ email, username, password }) {
  const user = new User({
    email: email ?? `test-${Date.now()}@example.com`,
    username: username ?? `testuser-${Date.now()}`,
    passwordHash: password, // pre-save hook hashes this
  });
  await user.save();
  return user;
}

/**
 * Connect Mongoose's default connection (and the userGeek named connection)
 * to the in-memory Mongo URI set by globalSetup.
 *
 * Call once in beforeAll().
 */
export async function connectTestDB() {
  const uri = process.env.USERGEEK_MONGODB_URI;
  if (!uri) throw new Error('USERGEEK_MONGODB_URI not set — did globalSetup run?');

  // Connect the default mongoose connection (used by some models)
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }

  // The User model is bound to userGeekConn (a named connection created when
  // user.js is first imported). That connection's URI comes from
  // USERGEEK_MONGODB_URI which globalSetup already set before any module loads,
  // so it should be pointing at in-memory Mongo already.
  // We still need to wait for it to be ready:
  const { userGeekConn } = await import('../models/user.js');
  if (userGeekConn.readyState === 0) {
    await userGeekConn.asPromise();
  }
}

/**
 * Disconnect all Mongoose connections after tests.
 */
export async function disconnectTestDB() {
  const { userGeekConn } = await import('../models/user.js');
  await userGeekConn.close();
  await mongoose.disconnect();
}

/**
 * Initialise the refresh-token store.
 * The redis module must already be mocked before calling this.
 */
export async function initTestRedis() {
  await initRefreshTokenStore();
}
