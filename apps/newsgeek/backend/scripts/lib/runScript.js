/**
 * The shared shell of the one-off maintenance scripts: load the env file the
 * way the server does, connect, run, disconnect. Errors print their name and
 * code only — never a message that could carry the connection string.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runScript(name, body) {
  const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
  dotenv.config({ path: path.resolve(__dirname, '..', '..', envFile) });
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set');
    process.exitCode = 1;
    return;
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    await body();
  } catch (err) {
    console.error(`${name} failed: ${err?.name || 'Error'}${err?.code ? ` (${err.code})` : ''}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}
