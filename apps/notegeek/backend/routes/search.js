import express from 'express';
import { searchNotes } from '../controllers/search.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply protect middleware
router.use(protect);

// Define routes
// Search route uses query parameter ?q=...
router.get('/', searchNotes);

export default router;