import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./config/env.js";
import apiRouter from "./routes/api.js";
import { logger } from "./utils/logger.js";
import { setupGeekSuiteSubgraph } from "@geeksuite/apollo-server-utils";
import { typeDefs, resolvers } from "./graphql/index.js";

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.join(__dirname, "..", "public");

app.use("/api", apiRouter);

app.use(express.static(publicPath));

app.get("*", (req, res, next) => {
  if (req.path.startsWith('/graphql')) {
    return next();
  }
  res.sendFile(path.join(publicPath, "index.html"));
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, next) => {
  logger.error(err);
  res.status(500).json({ message: "Unexpected server error" });
});

// Setup GraphQL Subgraph
setupGeekSuiteSubgraph(app, {
  typeDefs,
  resolvers,
  path: '/graphql'
}).then(() => {
  app.listen(env.port, () => {
    logger.info(`FlockGeek API listening on port ${env.port}`);
    logger.info(`FlockGeek GraphQL Subgraph ready at /graphql`);
  });
});
