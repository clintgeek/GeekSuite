import { Router } from "express";
import { healthcheck } from "../controllers/statusController.js";
import authRoutes from "./auth.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { meHandler } from "@geeksuite/user/server";

// Night 2 — 2026-09-06 (Q22): the REST CRUD layer (birds, groups,
// group-memberships, health-records, egg-production, pairings, locations,
// hatch-events, meat-runs) is gone. Nothing in this repo has called it since
// the frontend moved onto basegeek's GraphQL gateway — see
// apps/flockgeek/CONTEXT.md "Night 2" section for the proof and the decision.
// This router is now exactly what the frontend and the SSO contract need:
// health, session check, and the two auth proxies.

const router = Router();

// Health check (no auth required)
router.get("/health", healthcheck);

// Canonical session check for cookie-based auth
router.get("/me", requireAuth, meHandler());

// Auth routes (no ownerId required — refresh/logout proxy to basegeek)
router.use("/auth", authRoutes);

export default router;
