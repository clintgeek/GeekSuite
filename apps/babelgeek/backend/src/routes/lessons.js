/**
 * Lessons Routes
 */

import { Router } from "express";
import { getLessons, getLesson, getLearningPath } from "../controllers/lessonsController.js";

const router = Router();

// GET /api/lessons/:language - Get all lessons for a language
router.get("/:language", getLessons);

// GET /api/lessons/:language/path - Get learning path (units) for a language
router.get("/:language/path", getLearningPath);

// GET /api/lessons/:language/:slug - Get a single lesson by slug
router.get("/:language/:slug", getLesson);

export default router;
