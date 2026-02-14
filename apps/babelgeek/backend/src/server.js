import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";
import { env } from "./config/env.js";
import apiRouter from "./routes/api.js";
import { logger } from "./utils/logger.js";
import { sendSuccess, sendError } from "./utils/responses.js";

const app = express();

app.disable("x-powered-by");

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

app.get("/", (req, res) => {
  return sendSuccess(res, { message: "BabelGeek API is ready", version: "0.1.0" });
});

app.use("/api", apiRouter);

app.use((req, res) => {
  return sendError(res, { message: "Route not found" }, 404);
});

app.use((err, req, res, next) => {
  logger.error(err);
  return sendError(res, { message: "Unexpected server error" }, 500);
});

// Connect to MongoDB and start server
const startServer = async () => {
  try {
    await mongoose.connect(env.mongoUri);
    logger.info(`Connected to MongoDB: ${env.mongoUri}`);

    app.listen(env.port, () => {
      logger.info(`BabelGeek API listening on port ${env.port}`);
    });
  } catch (error) {
    logger.error("Failed to connect to MongoDB:", error);
    process.exit(1);
  }
};

startServer();
