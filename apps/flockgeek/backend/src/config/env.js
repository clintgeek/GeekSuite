import dotenv from "dotenv";

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 4094,
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET || "change-me",
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/flockgeek",
  basegeekUrl: process.env.BASEGEEK_URL || "https://basegeek.clintgeek.com",
  appName: process.env.APP_NAME || "flockgeek",
  seedOwnerId: process.env.SEED_OWNER_ID || "demo-owner"
};
