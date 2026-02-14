import { Router } from "express";
import { healthcheck } from "../controllers/statusController.js";
import { me } from "../controllers/authController.js";
import authRoutes from "./auth.js";
import audioRoutes from "./audio.js";
import lessonsRoutes from "./lessons.js";
import statsRoutes from "./stats.js";
import progressRoutes from "./progress.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/health", healthcheck);
router.get("/me", requireAuth, me);
router.use("/auth", authRoutes);
router.use("/audio", audioRoutes);
router.use("/lessons", lessonsRoutes);
router.use("/stats", statsRoutes);
router.use("/progress", progressRoutes);

export default router;
