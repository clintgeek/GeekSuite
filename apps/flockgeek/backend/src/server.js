import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";
import { env } from "./config/env.js";
import apiRouter from "./routes/api.js";
import { logger } from "./utils/logger.js";

const app = express();

app.disable("x-powered-by");

app.use(helmet());

const allowedOrigins = env.corsOrigin.split(",").map(s => s.trim());
logger.info(`CORS enabled for origins: ${JSON.stringify(allowedOrigins)}`);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

// MongoDB Connection
mongoose
  .connect(env.mongodbUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    logger.info(`MongoDB connected to ${env.mongodbUri.split("@")[0]}...`);
  })
  .catch((err) => {
    logger.error("MongoDB connection error:", err);
    process.exit(1);
  });

app.get("/", (req, res) => {
  res.json({ message: "FlockGeek API is ready", version: "0.1.0" });
});

app.use("/api", apiRouter);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, next) => {
  logger.error(err);
  res.status(500).json({ message: "Unexpected server error" });
});

app.listen(env.port, () => {
  logger.info(`FlockGeek API listening on port ${env.port}`);
});
