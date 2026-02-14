import { Router } from "express";
import { getDashboardStats, getAchievements, recordActivity } from "../controllers/statsController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

// All stats routes require authentication
router.use(requireAuth);

// Dashboard stats
router.get("/dashboard", getDashboardStats);

// Achievements
router.get("/achievements", getAchievements);

// Record activity (streak, XP)
router.post("/activity", recordActivity);

export default router;
