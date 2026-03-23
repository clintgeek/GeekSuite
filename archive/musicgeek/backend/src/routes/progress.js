const express = require('express');
const router = express.Router();
const progressController = require('../controllers/progressController');
const { authenticate } = require('../middleware/auth');
const { validateParams } = require('../middleware/validation');
const { userIdParamSchema } = require('../validators/userValidators');
const { lessonIdParamSchema } = require('../validators/lessonValidators');
const Joi = require('joi');

// All routes require authentication
router.use(authenticate);

// Mark lesson as complete
router.post(
  '/complete',
  (req, res, next) => {
    const schema = Joi.object({
      lessonId: Joi.string().required(), // Allow both UUID and slug
    });
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: error.details[0].message });
    }
    req.body = value;
    next();
  },
  progressController.markLessonComplete
);

// Get user's overall progress
router.get('/user/:userId', validateParams(userIdParamSchema), progressController.getUserProgress);
router.get('/user', progressController.getUserProgress); // Get current user's progress

// Get progress for specific lesson
router.get(
  '/lesson/:lessonId',
  validateParams(lessonIdParamSchema),
  progressController.getLessonProgress
);

// Reset user's progress
router.delete('/', progressController.resetUserProgress);

// Save exercise progress (e.g., one-minute change score)
router.post(
  '/exercise',
  (req, res, next) => {
    const schema = Joi.object({
      lesson_id: Joi.string().required(),
      exercise_type: Joi.string().required(),
      metric_name: Joi.string().required(),
      metric_value: Joi.number().required(),
      notes: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: error.details[0].message });
    }
    req.body = value;
    next();
  },
  progressController.saveExerciseProgress
);

// Get exercise history for a specific exercise type
router.get('/exercise/:exercise_type', progressController.getExerciseHistory);

module.exports = router;
