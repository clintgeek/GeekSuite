import express from 'express';
import mongoose from 'mongoose';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Protect all routes
router.use(authenticateToken);

// Note Schema
const noteSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tags: [{ type: String }],
  type: { type: String, enum: ['text', 'markdown', 'code', 'mindmap', 'handwritten'], default: 'text' },
  isLocked: { type: Boolean, default: false },
  isEncrypted: { type: Boolean, default: false },
  lockHash: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Note = mongoose.model('Note', noteSchema);

// Get all notes for a user
router.get('/', async (req, res) => {
  try {
    const { tag, prefix } = req.query;
    const filter = { userId: req.user.id };

    if (tag) {
      filter.tags = { $in: [tag] };
    }

    if (prefix) {
      filter.tags = { $regex: `^${prefix}` };
    }

    const notes = await Note.find(filter).sort({ updatedAt: -1 });
    res.json(notes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get a single note
router.get('/:id', async (req, res) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, userId: req.user.id });
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    if (note.isLocked) {
      return res.status(200).json({
        _id: note._id,
        title: note.title,
        userId: note.userId,
        tags: note.tags,
        isLocked: note.isLocked,
        isEncrypted: note.isEncrypted,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        message: 'Note is locked. Content not available without unlock.'
      });
    }

    res.json(note);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a new note
router.post('/', async (req, res) => {
  try {
    const {
      title,
      content,
      tags,
      type,
      isLocked,
      isEncrypted,
      lockPassword,
    } = req.body;

    if (!content) {
      return res.status(400).json({ message: 'Note content cannot be empty' });
    }

    // Validate tags if provided
    if (tags && !Array.isArray(tags)) {
      return res.status(400).json({ message: 'Tags must be an array' });
    }

    // Validate type if provided
    const validTypes = ['text', 'markdown', 'code', 'mindmap', 'handwritten'];
    if (type && !validTypes.includes(type)) {
      return res.status(400).json({ message: 'Invalid note type' });
    }

    const note = new Note({
      userId: req.user.id,
      title: title || 'Untitled Note',
      content,
      type: type || 'text',
      tags: tags || [],
      isLocked: isLocked || false,
      isEncrypted: isEncrypted || false,
      lockHash: lockPassword, // Note: In a real implementation, this should be hashed
    });

    const savedNote = await note.save();
    res.status(201).json(savedNote);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update a note
router.put('/:id', async (req, res) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, userId: req.user.id });
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    if (note.isLocked) {
      return res.status(403).json({ message: 'Cannot update a locked note' });
    }

    if (note.isEncrypted) {
      return res.status(403).json({ message: 'Cannot update an encrypted note' });
    }

    const { title, content, tags, type } = req.body;

    if (title !== undefined) note.title = title;
    if (content !== undefined) note.content = content;
    if (tags !== undefined) note.tags = tags;
    if (type !== undefined) {
      const validTypes = ['text', 'markdown', 'code', 'mindmap', 'handwritten'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ message: 'Invalid note type' });
      }
      note.type = type;
    }

    note.updatedAt = new Date();
    const updatedNote = await note.save();
    res.json(updatedNote);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete a note
router.delete('/:id', async (req, res) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, userId: req.user.id });
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    if (note.isLocked) {
      return res.status(403).json({ message: 'Cannot delete a locked note' });
    }

    if (note.isEncrypted) {
      return res.status(403).json({ message: 'Cannot delete an encrypted note' });
    }

    await Note.deleteOne({ _id: req.params.id, userId: req.user.id });
    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get tag hierarchy
router.get('/tags', async (req, res) => {
  try {
    const notes = await Note.find({ userId: req.user.id }, 'tags');
    const hierarchy = {};

    // Build tag hierarchy from all notes
    notes.forEach(note => {
      note.tags.forEach(tag => {
        const parts = tag.split('/');
        let current = hierarchy;

        parts.forEach((part, index) => {
          if (!current[part]) {
            current[part] = index === parts.length - 1 ? { count: 0 } : {};
          }
          if (index === parts.length - 1) {
            current[part].count = (current[part].count || 0) + 1;
          }
          current = current[part];
        });
      });
    });

    res.json(hierarchy);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;