import express from 'express';
import {
  createEntry,
  getEntries,
  getEntry,
  updateEntry,
  deleteEntry,
  createFromTemplate
} from '../controllers/journalController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

// Journal entry CRUD routes
router.post('/', createEntry);
router.get('/', getEntries);
router.get('/:id', getEntry);
router.put('/:id', updateEntry);
router.delete('/:id', deleteEntry);

// Template application route
router.post('/from-template', createFromTemplate);

export default router;