/**
 * BookGeek API boot: env, Mongo, listen, graceful shutdown. The app itself
 * is built by createApp() in ./app.js (split out 2026-09-25, Phase B).
 */
import dotenv from "dotenv";
import mongoose from "mongoose";

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
  }

  const server = app.listen(API_PORT, "0.0.0.0", () => {
    logger.info(`BookGeek API listening on port ${API_PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) {
      logger.info(`${signal} received during shutdown — forcing exit`);
      process.exit(1);
    }
    shuttingDown = true;
    logger.info(`${signal} received — shutting down`);

    const forceTimer = setTimeout(() => {
      logger.error("Shutdown timed out after 15s — forcing exit");
      process.exit(0);
    }, 15_000);
    forceTimer.unref();

    server.close(async () => {
      try {
        await mongoose.disconnect();
      } catch (err) {
        logger.error({ err }, "Error disconnecting mongoose");
      }
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  logger.error({ err }, "Failed to start bookgeek-api");
  process.exit(1);
});
