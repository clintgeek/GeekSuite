import cookieParser from "cookie-parser";
import cors from "cors";
import crypto from "crypto";
import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import path from "path";
import pinoHttp from "pino-http";
import { fileURLToPath } from "url";
import { env } from "./config/env.js";
import apiRouter from "./routes/api.js";
import { logger } from "./utils/logger.js";

const app = express();

app.disable("x-powered-by");

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

const allowedOrigins = env.corsOrigin.split(",").map(s => s.trim());
logger.info(`CORS enabled for origins: ${ JSON.stringify(allowedOrigins) }`);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.headers["x-request-id"] || crypto.randomUUID(),
});
app.use((req, res, next) => {
  httpLogger(req, res);
  res.setHeader("X-Request-Id", req.id);
  next();
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.join(__dirname, "..", "public");

app.use("/api", apiRouter);

app.use(express.static(publicPath));

app.get("*", (req, res, next) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, next) => {
  (req.log || logger).error({ err }, "Unhandled error");
  res.status(err.statusCode || 500).json({
    success: false,
    error: {
      message: env.nodeEnv === "production" ? "Internal Server Error" : err.message,
    },
    timestamp: new Date().toISOString(),
  });
});

// Boot sequence
async function start() {
  try {
    await mongoose.connect(env.mongodbUri);
    logger.info(`MongoDB connected`);
  } catch (err) {
    logger.error({ err }, "MongoDB connection failed — aborting boot");
    process.exit(1);
  }

  const server = app.listen(env.port, "0.0.0.0", () => {
    logger.info(`FlockGeek API listening on port ${ env.port }`);
    logger.info(`Environment: ${ env.nodeEnv }`);
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) {
      logger.info(`${ signal } received during shutdown — forcing exit`);
      process.exit(1);
    }
    shuttingDown = true;
    logger.info(`${ signal } received — shutting down`);

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

start();
