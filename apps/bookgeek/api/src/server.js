/**
 * BookGeek API boot: env, Mongo, listen, graceful shutdown. The app itself
 * is built by createApp() in ./app.js (split out 2026-09-25, Phase B).
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { installShutdownHooks } from "@geeksuite/logger";

// Before app.js is imported, so every module sees the loaded env.
dotenv.config();

const { logger } = await import("./utils/logger.js");
const { createApp } = await import("./app.js");
const { apiPort, mongoUri } = await import("./config.js");

async function start() {
  const MONGODB_URI = mongoUri();
  const API_PORT = apiPort();
  const app = createApp();

  if (!MONGODB_URI) {
    logger.warn("BASEGEEK_MONGODB_URI is not set; starting API without MongoDB connection.");
  } else {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    logger.info("MongoDB connected");

    // Derived tags (DOCS/TAGS.md §4): libraryTags/unsortedTags from each
    // book's raw tags, so a vocabulary change reaches stored books on the
    // next deploy. Idempotent, before listen; a failure is logged, never fatal.
    try {
      const { migrateTags } = await import("./migrations/tags.js");
      const { Book } = await import("./models/book.js");
      await migrateTags({ Book, logger });
    } catch (err) {
      logger.error({ err: err?.message }, "tag migration failed");
    }

    // Recently deleted: purge books deleted over 30 days ago (services/bookTrash.js).
    // Lazy elsewhere (every delete, opening the list); also at boot, which every
    // deploy is. Never fatal, never blocks listen.
    import("./services/bookTrash.js")
      .then(({ purgeExpiredBooks }) => purgeExpiredBooks())
      .catch((err) => logger.warn({ err: err?.message }, "boot purge of deleted books failed"));

    // The comics folder (Tankarr's library, read-only at COMICS_PATH): one scan
    // shortly after boot, then every COMICS_SCAN_MINUTES. Off, and silent after
    // one log line, when COMICS_PATH is unset or missing. Never fatal.
    Promise.all([import("./services/comicsFolder.js"), import("./models/book.js")])
      .then(([{ startComicsScanSchedule }, { Book }]) => startComicsScanSchedule({ models: { Book }, logger }))
      .catch((err) => logger.warn({ err: err?.message }, "comics scan schedule failed to start"));
  }

  const server = app.listen(API_PORT, "0.0.0.0", () => {
    logger.info(`BookGeek API listening on port ${API_PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
  });

  installShutdownHooks(logger, server, {
    onClose: async () => {
      try {
        await mongoose.disconnect();
      } catch (err) {
        logger.error({ err }, "Error disconnecting mongoose");
      }
    },
  });
}

start().catch((err) => {
  logger.error({ err }, "Failed to start bookgeek-api");
  process.exit(1);
});
