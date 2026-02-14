import express from 'express';
import {
  createNote,
  getNotes,
  getNoteById,
  updateNote,
  deleteNote,
  getTagHierarchy
} from '../controllers/notes.js'; // We'll create these controller functions
import { protect } from '../middleware/authMiddleware.js'; // Import the auth middleware

const router = express.Router();

// Apply the protect middleware to all routes in this file
router.use(protect);

// Get tag hierarchy
router.get('/tags', getTagHierarchy);

// Define routes
router.route('/').post(createNote).get(getNotes); // Create Note, Get All Notes for user
router
  .route('/:id')
  .get(getNoteById) // Get single note
  .put(updateNote) // Update note
  .delete(deleteNote); // Delete note

export default router;