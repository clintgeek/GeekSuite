import express from "express";
import cors from "cors";
import morgan from "morgan";
import mongoose from "mongoose";

import birdsRouter from "./routes/birds.js";
import groupsRouter from "./routes/groups.js";
import groupMembershipsRouter from "./routes/groupMemberships.js";
import locationsRouter from "./routes/locations.js";
import eggProductionRouter from "./routes/eggProduction.js";
import pairingsRouter from "./routes/pairings.js";
import hatchEventsRouter from "./routes/hatchEvents.js";
import metricsRouter from "./routes/metrics.js";
import eventsRouter from "./routes/events.js";
import healthRecordsRouter from "./routes/healthRecords.js";
import birdTraitsRouter from "./routes/birdTraits.js";
import birdNotesRouter from "./routes/birdNotes.js";
import { requireOwner, authenticateToken } from "./middleware/auth.js";
import authRouter from './routes/auth.js';

const app = express();
const PORT = process.env.PORT || 5001;

app.set("trust proxy", 1);

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017/flockgeek?authSource=admin";
mongoose
  .connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  "http://localhost:5173,http://localhost:5002,http://localhost:5001,https://flockgeek.clintgeek.com"
)
  .split(",")
  .map((s) => s.trim());

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = "CORS: Origin not allowed";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Owner-Id"],
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Auth forwarding routes (login/register/profile) via baseGeek
app.use('/api/auth', authRouter);

app.use("/api/flockgeek/v1/birds", authenticateToken, requireOwner, birdsRouter);
app.use("/api/flockgeek/v1/groups", authenticateToken, requireOwner, groupsRouter);
app.use("/api/flockgeek/v1/group-memberships", authenticateToken, requireOwner, groupMembershipsRouter);
app.use("/api/flockgeek/v1/locations", authenticateToken, requireOwner, locationsRouter);
app.use("/api/flockgeek/v1/egg-production", authenticateToken, requireOwner, eggProductionRouter);
app.use("/api/flockgeek/v1/pairings", authenticateToken, requireOwner, pairingsRouter);
app.use("/api/flockgeek/v1/hatch-events", authenticateToken, requireOwner, hatchEventsRouter);
app.use("/api/flockgeek/v1/metrics", authenticateToken, requireOwner, metricsRouter);
app.use("/api/flockgeek/v1/events", authenticateToken, requireOwner, eventsRouter);
app.use("/api/flockgeek/v1/health-records", authenticateToken, requireOwner, healthRecordsRouter);
app.use("/api/flockgeek/v1/bird-traits", authenticateToken, requireOwner, birdTraitsRouter);
app.use("/api/flockgeek/v1/bird-notes", authenticateToken, requireOwner, birdNotesRouter);

app.use((err, req, res, next) => {
  console.error("Error:", err.stack);
  res.status(500).json({ message: "Internal Server Error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`FlockGeek API listening on ${PORT}`);
});
