/**
 * Jest globalSetup — runs ONCE before all test suites, in the main Jest
 * process (NOT a worker). Any process.env mutations here are visible to
 * globalTeardown (same process) but NOT to test workers.
 *
 * To share the URI with workers we write it to a temp JSON sidecar that
 * setEnv.js (a setupFiles entry, runs inside each worker) reads synchronously.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import { writeFileSync } from 'fs';

// Run-unique sidecar path: two concurrent jest runs used to share
// /tmp/__jest_mongod_state__.json, overwrite each other's URI, and each
// teardown killed the other's mongod. The main-process pid disambiguates;
// workers find it via env (inherited at spawn) with a ppid fallback in
// setEnv.js.
const STATE_FILE = `/tmp/__jest_mongod_state__.${process.pid}.json`;

export default async function globalSetup() {
  // MongoDB 6.0+ supports OpenSSL 3 (Ubuntu 22.04+).
  // MongoDB 5.0 requires libcrypto.so.1.1 (OpenSSL 1.1) which is not
  // present on Ubuntu 22.04.
  const mongod = new MongoMemoryServer({
    binary: {
      version: '7.0.14',
      // Specify the platform so MMS doesn't try to auto-detect incorrectly
      platform: 'linux',
      arch: 'x64',
    },
  });

  await mongod.start();
  const uri = mongod.getUri();

  // Persist instance reference so globalTeardown can stop it (same process).
  global.__MONGOD__ = mongod;
  global.__MONGOD_STATE_FILE__ = STATE_FILE;

  // Write the URI to a sidecar file so setupFiles workers can read it.
  // Workers inherit env at spawn, so publish the run-unique path there too.
  process.env.JEST_MONGOD_STATE_FILE = STATE_FILE;
  writeFileSync(STATE_FILE, JSON.stringify({ uri }), 'utf8');
}
