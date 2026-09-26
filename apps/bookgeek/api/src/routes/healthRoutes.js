/** GET /api/health (the container healthcheck) and GET /api/me. */
import express from "express";
import mongoose from "mongoose";
import { meHandler } from "@geeksuite/user/server";
import { authenticateToken } from "../middleware/auth.js";
import { apiPort } from "../config.js";

const router = express.Router();

router.get("/api/health", (req, res) => {
  const dbState = mongoose.connection.readyState;
  res.json({
    status: "ok",
    service: "bookgeek-api",
    apiPort: Number(apiPort()),
    db: {
      state: dbState,
    },
  });
});

router.get("/api/me", authenticateToken, meHandler());

export default router;
