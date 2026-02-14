const express = require('express');
const router = express.Router();
const practiceController = require('../controllers/practiceController');
const { authenticate } = require('../middleware/auth');
const { validate, validateParams, validateQuery } = require('../middleware/validation');
const {
  createPracticeSessionSchema,
  getPracticeQuerySchema,
  sessionIdSchema,
} = require('../validators/practiceValidators');
const { userIdSchema } = require('../validators/userValidators');

// All routes require authentication
router.use(authenticate);

// Create practice session
router.post('/', validate(createPracticeSessionSchema), practiceController.createSession);

// Get user's practice sessions
router.get('/user/:userId', validateParams(userIdSchema), validateQuery(getPracticeQuerySchema), practiceController.getUserSessions);
router.get('/user', validateQuery(getPracticeQuerySchema), practiceController.getUserSessions);

// Get/delete specific session
router.get('/:id', validateParams(sessionIdSchema), practiceController.getSession);
router.delete('/:id', validateParams(sessionIdSchema), practiceController.deleteSession);

module.exports = router;
