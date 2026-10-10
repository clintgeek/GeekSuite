/**
 * `npm run seed` — the same idempotent seed server.js runs on every boot
 * (src/seed/seed.js: insert-if-absent by slug; existing places and sources,
 * their poll state and admin edits are never touched).
 *
 * Inside the running container (WORKDIR is the backend; MONGODB_URI comes
 * from the container's env):
 *
 *   docker exec -it newsgeek node scripts/seed.js
 *
 * Prints counts only — never the connection string.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

const { runSeed } = await import('../src/seed/seed.js');
const { default: Place } = await import('../src/models/Place.js');
const { default: Source } = await import('../src/models/Source.js');

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

try {
  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all([Place.init(), Source.init()]);
  const out = await runSeed({ Place, Source });
  console.log(`places: ${out.placesInserted} inserted of ${out.placesTotal}; sources: ${out.sourcesInserted} inserted of ${out.sourcesTotal}`);
} catch (err) {
  console.error(`seed failed: ${err?.name || 'Error'}${err?.code ? ` (${err.code})` : ''}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
