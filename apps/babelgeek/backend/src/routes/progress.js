import { Router } from "express";
import {
  getLanguageProgress,
  getLessonProgress,
  updateLessonProgress,
  getNextLesson
} from "../controllers/progressController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

// All progress routes require authentication
router.use(requireAuth);

// Get progress for a language
router.get("/:language", getLanguageProgress);

// Get next recommended lesson
router.get("/:language/next", getNextLesson);

// Get/update progress for a specific lesson
router.get("/:language/:lessonSlug", getLessonProgress);
router.put("/:language/:lessonSlug", updateLessonProgress);

export default router;
