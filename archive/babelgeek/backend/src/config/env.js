import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load root .env first (contains shared JWT_SECRET and BASEGEEK_URL)
dotenv.config({ path: resolve(__dirname, "../../../../.env") });
// Then load backend-specific .env (can override if needed)
dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 4000,
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET || "change-me",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || "change-me",
  baseGeekUrl: process.env.BASEGEEK_URL || "https://basegeek.clintgeek.com",
  mongoUri: process.env.MONGODB_URI || "mongodb://localhost:27017/babelGeek"
};
