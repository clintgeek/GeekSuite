import express from 'express';
import { getTags } from '../controllers/tags.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply protect middleware
router.use(protect);

// Define routes
router.get('/', getTags); // Get all unique tags for the user

export default router;