const express = require('express');
const router = express.Router();
const lessonController = require('../controllers/lessonController');
const { optionalAuth, authenticate } = require('../middleware/auth');
const { validateParams, validateQuery } = require('../middleware/validation');
const {
  lessonIdSchema,
  lessonIdParamSchema,
  getLessonsQuerySchema,
} = require('../validators/lessonValidators');

// Optional auth - returns completion status if logged in
router.get('/', optionalAuth, validateQuery(getLessonsQuerySchema), lessonController.getAllLessons);
router.get('/:id', optionalAuth, validateParams(lessonIdSchema), lessonController.getLesson);
router.get('/:id/steps', validateParams(lessonIdSchema), lessonController.getLessonSteps);

// Protected routes - require authentication
router.post(
  '/:lessonId/start',
  authenticate,
  validateParams(lessonIdParamSchema),
  lessonController.startLesson
);
router.put(
  '/:lessonId/progress',
  authenticate,
  validateParams(lessonIdParamSchema),
  lessonController.updateProgress
);
router.post(
  '/:lessonId/complete',
  authenticate,
  validateParams(lessonIdParamSchema),
  lessonController.completeLesson
);

module.exports = router;
