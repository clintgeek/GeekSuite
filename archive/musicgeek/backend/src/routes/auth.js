const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { createUserSchema, loginSchema } = require('../validators/userValidators');

// Public routes
router.post('/register', validate(createUserSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/validate-sso', authController.validateSSO);
router.post('/refresh', authController.refresh);

// Protected routes
router.get('/me', authenticate, authController.getMe);
router.post('/logout', authenticate, authController.logout);

module.exports = router;
