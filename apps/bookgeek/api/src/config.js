/**
 * Environment the route modules read. Every value is read when it is asked
 * for, not at import time, so `createApp()` can be imported (tests,
 * tools/boot-smoke.mjs) before any env is set, and server.js's dotenv load
 * is always seen. Defaults are the ones server.js carried.
 */
import mongoose from "mongoose";

export function mongoUri() {
  return process.env.BASEGEEK_MONGODB_URI || process.env.MONGODB_URI || "";
}

/** The 503 contract: every DB route answers 503 unless this is true. */
export function dbConnected() {
  return Boolean(mongoUri()) && mongoose.connection.readyState === 1;
}

export function apiPort() {
  return process.env.API_PORT || 1800;
}

export function tempPath() {
  return process.env.TEMP_PATH || "/data/temp";
}

export function calibreEbookMetaBin() {
  return process.env.CALIBRE_EBOOK_META_BIN || "ebook-meta";
}

export function kindlePin() {
  return String(process.env.KINDLE_UI_PIN || "").trim();
}

export function kindleCookieSecret() {
  return process.env.KINDLE_UI_COOKIE_SECRET || process.env.JWT_SECRET || "";
}
