#!/usr/bin/env node
/**
 * setUserRole.js — promote or demote a single GeekSuite user.
 *
 * Roles live on the userGeek User document (`role: 'user' | 'admin'`) and are
 * deliberately NOT carried in the JWT: the auth middleware reads the role from
 * the DB on every admin-gated request, so a change made here takes effect on
 * the user's very next request — no logout, no token refresh.
 *
 * Usage
 * -----
 *   node scripts/setUserRole.js <username> admin
 *   node scripts/setUserRole.js <username> user
 *   node scripts/setUserRole.js --help
 *
 * Required env (same value the API uses — read from .env via dotenv):
 *   USERGEEK_MONGODB_URI — e.g. mongodb://user:pass@host:27017/userGeek?authSource=admin
 *
 * Behaviour
 * ---------
 *   - Refuses (exit 1) if the username does not exist. No user is ever created.
 *   - Refuses (exit 1) on a role outside the schema enum.
 *   - Prints only the username and its before/after role — never credentials.
 *   - Idempotent: setting the role a user already has is reported and is a no-op.
 */

import 'dotenv/config';
import mongoose from 'mongoose';

import { User, userGeekConn } from '../src/models/user.js';

export const VALID_ROLES = ['user', 'admin'];

/**
 * Set one user's role.
 *
 * Factored out of the CLI so it can be unit-tested against in-memory Mongo.
 *
 * @param {string} username  exact username of an existing user
 * @param {string} role      'user' | 'admin'
 * @param {{ User?: import('mongoose').Model }} [deps]  injectable model (tests)
 * @returns {Promise<{ username: string, before: string, after: string, changed: boolean }>}
 * @throws {Error} when the role is invalid or the username does not exist
 */
export async function setUserRole(username, role, { User: UserModel = User } = {}) {
  if (!username) {
    throw new Error('username is required');
  }
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`Invalid role "${ role }" — expected one of: ${ VALID_ROLES.join(', ') }`);
  }

  const user = await UserModel.findOne({ username });
  if (!user) {
    throw new Error(`No user found with username "${ username }" — refusing to create one`);
  }

  const before = user.role || 'user';
  if (before === role) {
    return { username, before, after: before, changed: false };
  }

  // updateOne avoids the password-hashing pre-save hook entirely.
  await UserModel.updateOne({ _id: user._id }, { $set: { role } });

  return { username, before, after: role, changed: true };
}

/* ─────────────────────────── CLI entrypoint ─────────────────────────────── */

const isMain = process.argv[1] && import.meta.url === `file://${ process.argv[1] }`;

if (isMain) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
setUserRole.js

  node scripts/setUserRole.js <username> admin    promote to admin
  node scripts/setUserRole.js <username> user     demote to plain user

Roles are read from the DB on every request, so the change is live immediately
(no re-login). Requires USERGEEK_MONGODB_URI, the same value the API uses.
`);
    process.exit(args.length === 0 ? 1 : 0);
  }

  const [username, role] = args;

  try {
    if (userGeekConn.readyState === 0) await userGeekConn.asPromise();

    const result = await setUserRole(username, role);

    console.log(
      result.changed
        ? `${ result.username }: ${ result.before } → ${ result.after }`
        : `${ result.username }: already ${ result.before } — no change`
    );
    process.exitCode = 0;
  } catch (err) {
    console.error(`setUserRole failed: ${ err.message }`);
    process.exitCode = 1;
  } finally {
    await userGeekConn.close().catch(() => {});
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  }
}
