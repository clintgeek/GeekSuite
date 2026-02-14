import express from 'express';
import {
  register,
  login,
  getProfile,
  updatePreferences
} from '../controllers/userController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.use(authMiddleware);
router.get('/profile', getProfile);
router.put('/preferences', updatePreferences);

export default router;