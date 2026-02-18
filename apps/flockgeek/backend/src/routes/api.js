import { Router } from "express";
import { healthcheck } from "../controllers/statusController.js";
import authRoutes from "./auth.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { meHandler } from "@geeksuite/user/server";
import birdsRoutes from "./birds.js";
import groupsRoutes from "./groups.js";
import groupMembershipsRoutes from "./groupMemberships.js";
import healthRecordsRoutes from "./healthRecords.js";
import eggProductionRoutes from "./eggProduction.js";
import pairingsRoutes from "./pairings.js";
import locationsRoutes from "./locations.js";
import hatchEventsRoutes from "./hatchEvents.js";
import meatRunsRoutes from "./meatRuns.js";

const router = Router();

// Health check (no auth required)
router.get("/health", healthcheck);

// Canonical session check for cookie-based auth
router.get("/me", requireAuth, meHandler());

// Auth routes (no ownerId required for login/register)
router.use("/auth", authRoutes);

// Protected routes (all require ownerId)
// Birds
router.use("/birds", birdsRoutes);

// Groups
router.use("/groups", groupsRoutes);

// Group Memberships
router.use("/group-memberships", groupMembershipsRoutes);

// Health Records
router.use("/health-records", healthRecordsRoutes);

// Egg Production
router.use("/egg-production", eggProductionRoutes);

// Pairings
router.use("/pairings", pairingsRoutes);

// Locations
router.use("/locations", locationsRoutes);

// Hatch Events
router.use("/hatch-events", hatchEventsRoutes);

// Meat Runs
router.use("/meat-runs", meatRunsRoutes);

export default router;
