/**
 * Lessons Controller
 *
 * Handles fetching lesson content from JSON files
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { sendSuccess, sendError } from "../utils/responses.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTENT_DIR = path.join(__dirname, "../../content/lessons");

/**
 * Get all available lessons for a language
 */
export const getLessons = async (req, res) => {
  try {
    const { language } = req.params;
    const languageDir = path.join(CONTENT_DIR, language);

    if (!fs.existsSync(languageDir)) {
      return sendError(res, { message: `Language '${language}' not found` }, 404);
    }

    const files = fs.readdirSync(languageDir).filter(f => f.endsWith(".json"));
    const lessons = [];

    for (const file of files) {
      const filePath = path.join(languageDir, file);
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));

      // Return summary info only (not full content)
      lessons.push({
        id: content.slug,
        slug: content.slug,
        title: content.meta.title,
        subtitle: content.meta.subtitle,
        level: content.level,
        category: content.meta.category,
        difficulty: content.meta.difficulty,
        estimatedTimeMinutes: content.meta.estimatedTimeMinutes,
        xpReward: content.meta.xpReward,
        orderIndex: content.orderIndex,
        template: content.template,
        tags: content.meta.tags
      });
    }

    // Sort by orderIndex
    lessons.sort((a, b) => a.orderIndex - b.orderIndex);

    return sendSuccess(res, { lessons });
  } catch (err) {
    console.error("Error fetching lessons:", err);
    return sendError(res, { message: "Failed to fetch lessons" }, 500);
  }
};

/**
 * Get a single lesson by slug
 */
export const getLesson = async (req, res) => {
  try {
    const { language, slug } = req.params;
    const languageDir = path.join(CONTENT_DIR, language);

    if (!fs.existsSync(languageDir)) {
      return sendError(res, { message: `Language '${language}' not found` }, 404);
    }

    // Find the lesson file
    const files = fs.readdirSync(languageDir).filter(f => f.endsWith(".json"));

    for (const file of files) {
      const filePath = path.join(languageDir, file);
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));

      if (content.slug === slug) {
        return sendSuccess(res, { lesson: content });
      }
    }

    return sendError(res, { message: `Lesson '${slug}' not found` }, 404);
  } catch (err) {
    console.error("Error fetching lesson:", err);
    return sendError(res, { message: "Failed to fetch lesson" }, 500);
  }
};

/**
 * Get learning path (units with lessons) for a language
 */
export const getLearningPath = async (req, res) => {
  try {
    const { language } = req.params;
    const languageDir = path.join(CONTENT_DIR, language);

    if (!fs.existsSync(languageDir)) {
      return sendError(res, { message: `Language '${language}' not found` }, 404);
    }

    const files = fs.readdirSync(languageDir).filter(f => f.endsWith(".json"));
    const lessonsByCategory = {};

    for (const file of files) {
      const filePath = path.join(languageDir, file);
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const category = content.meta.category || "Other";

      if (!lessonsByCategory[category]) {
        lessonsByCategory[category] = [];
      }

      lessonsByCategory[category].push({
        id: content.slug,
        slug: content.slug,
        title: content.meta.title,
        level: content.level,
        orderIndex: content.orderIndex,
        xpReward: content.meta.xpReward,
        estimatedTimeMinutes: content.meta.estimatedTimeMinutes
      });
    }

    // Convert to units array and sort
    const units = Object.entries(lessonsByCategory).map(([category, lessons], idx) => ({
      id: idx + 1,
      title: category,
      lessons: lessons.sort((a, b) => a.orderIndex - b.orderIndex)
    }));

    return sendSuccess(res, { units });
  } catch (err) {
    console.error("Error fetching learning path:", err);
    return sendError(res, { message: "Failed to fetch learning path" }, 500);
  }
};
