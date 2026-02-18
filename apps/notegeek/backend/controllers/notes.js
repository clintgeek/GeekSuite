import Note from '../models/Note.js';
import bcrypt from 'bcryptjs';

// --- Helper Functions (Consider moving to a service/util file later) ---

// Basic check for valid ObjectId format
const isValidObjectId = (id) => {
  return id && /^[0-9a-fA-F]{24}$/.test(id);
};

// Escape special regex characters to prevent ReDoS attacks
const escapeRegex = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// --- Controller Functions ---

// @desc    Create a new note
// @route   POST /api/notes
// @access  Private (requires auth)
export const createNote = async (req, res) => {
  const {
    title,
    content,
    tags,
    type,
    isLocked,
    isEncrypted,
    lockPassword,
  } = req.body;

  const userId = req.user._id;

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
    return res.status(400).json({ message: 'Invalid note type. Must be one of: text, markdown, code, mindmap, handwritten' });
  }

  // Handle lock password if note is to be locked
  let lockHash = undefined;
  if (isLocked) {
    if (!lockPassword || lockPassword.length < 4) {
      return res.status(400).json({ message: 'A password of at least 4 characters is required to lock the note' });
    }
    try {
      const salt = await bcrypt.genSalt(10);
      lockHash = await bcrypt.hash(lockPassword, salt);
    } catch (error) {
      console.error('Error hashing lock password:', error);
      return res.status(500).json({ message: 'Server error handling lock password' });
    }
  }

  try {
    const note = await Note.create({
      userId,
      title: title || 'Untitled Note',
      content,
      type: type || 'text', // Default to text if not provided
      tags: tags || [],
      isLocked: isLocked || false,
      isEncrypted: isEncrypted || false,
      lockHash,
    });

    res.status(201).json(note);
  } catch (error) {
    console.error('Error creating note:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation Error', errors: error.errors });
    }
    res.status(500).json({ message: 'Server error creating note' });
  }
};

// @desc    Get all notes for the logged-in user
// @route   GET /api/notes
// @access  Private
export const getNotes = async (req, res) => {
  const userId = req.user._id;
  const { tag, prefix, page = 1, limit = 50 } = req.query;

  const filter = { userId };

  // Filter by exact tag match
  if (tag) {
    filter.tags = { $in: [tag] };
  }

  // Filter by tag prefix (for hierarchical tags)
  if (prefix) {
    filter.tags = { $regex: `^${ escapeRegex(prefix) }` };
  }

  // Pagination
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  try {
    // Return metadata + content snippet for list view preview
    const notes = await Note.find(filter)
      .select('title type tags isLocked isEncrypted createdAt updatedAt content')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Add content snippet for preview (first 200 chars, stripped of HTML)
    const notesWithSnippet = notes.map(note => {
      let snippet = '';
      if (note.content && !note.isLocked && note.type !== 'handwritten' && note.type !== 'mindmap') {
        // Strip HTML tags and get first 200 chars
        const plain = note.content.replace(/<[^>]+>/g, '');
        snippet = plain.slice(0, 200);
      }
      const { content, ...rest } = note;
      return { ...rest, snippet };
    });

    const total = await Note.countDocuments(filter);

    res.status(200).json({
      notes: notesWithSnippet,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ message: 'Server error fetching notes' });
  }
};

// @desc    Get a single note by ID
// @route   GET /api/notes/:id
// @access  Private
export const getNoteById = async (req, res) => {
  const userId = req.user._id;
  const noteId = req.params.id;

  if (!isValidObjectId(noteId)) {
    return res.status(400).json({ message: 'Invalid Note ID format' });
  }

  try {
    const note = await Note.findOne({ _id: noteId, userId });

    if (!note) {
      return res.status(404).json({ message: 'Note not found or does not belong to user' });
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

    res.status(200).json(note);
  } catch (error) {
    console.error('Error fetching note by ID:', error);
    res.status(500).json({ message: 'Server error fetching note' });
  }
};

// @desc    Update a note
// @route   PUT /api/notes/:id
// @access  Private
export const updateNote = async (req, res) => {
  const userId = req.user._id;
  const noteId = req.params.id;
  const { title, content, tags, type } = req.body;

  if (!isValidObjectId(noteId)) {
    return res.status(400).json({ message: 'Invalid Note ID format' });
  }

  // Validate type if provided
  const validTypes = ['text', 'markdown', 'code', 'mindmap', 'handwritten'];
  if (type && !validTypes.includes(type)) {
    return res.status(400).json({ message: 'Invalid note type. Must be one of: text, markdown, code, mindmap, handwritten' });
  }

  try {
    const note = await Note.findOne({ _id: noteId, userId });

    if (!note) {
      return res.status(404).json({ message: 'Note not found or does not belong to user' });
    }

    if (note.isLocked) {
      return res.status(403).json({ message: 'Cannot update a locked note. Please unlock first.' });
    }

    if (note.isEncrypted) {
      return res.status(403).json({ message: 'Cannot update an encrypted note yet.' });
    }

    if (title !== undefined) note.title = title;
    if (content !== undefined) note.content = content;
    if (tags !== undefined) note.tags = tags;
    if (type !== undefined) note.type = type;

    const updatedNote = await note.save();
    res.status(200).json(updatedNote);
  } catch (error) {
    console.error('Error updating note:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation Error', errors: error.errors });
    }
    res.status(500).json({ message: 'Server error updating note' });
  }
};

// @desc    Delete a note
// @route   DELETE /api/notes/:id
// @access  Private
export const deleteNote = async (req, res) => {
  const userId = req.user._id;
  const noteId = req.params.id;

  if (!isValidObjectId(noteId)) {
    return res.status(400).json({ message: 'Invalid Note ID format' });
  }

  try {
    const note = await Note.findOne({ _id: noteId, userId });

    if (!note) {
      return res.status(404).json({ message: 'Note not found or does not belong to user' });
    }

    if (note.isLocked) {
      return res.status(403).json({ message: 'Cannot delete a locked note. Please unlock first.' });
    }

    if (note.isEncrypted) {
      return res.status(403).json({ message: 'Cannot delete an encrypted note yet.' });
    }

    await Note.deleteOne({ _id: noteId, userId });
    res.status(200).json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ message: 'Server error deleting note' });
  }
};

// @desc    Get tag hierarchy for the logged-in user
// @route   GET /api/notes/tags
// @access  Private
export const getTagHierarchy = async (req, res) => {
  const userId = req.user._id;

  try {
    const notes = await Note.find({ userId }, 'tags');
    const hierarchy = {};

    // Build tag hierarchy from all notes
    notes.forEach(note => {
      note.tags.forEach(tag => {
        const parts = tag.split('/');
        let current = hierarchy;
        parts.forEach((part, index) => {
          if (!current[part]) {
            current[part] = {
              count: 1,
              children: index === parts.length - 1 ? null : {}
            };
          } else {
            current[part].count++;
          }
          current = current[part].children;
        });
      });
    });

    res.status(200).json(hierarchy);
  } catch (error) {
    console.error('Error fetching tag hierarchy:', error);
    res.status(500).json({ message: 'Server error fetching tag hierarchy' });
  }
};

// --- Other controller functions (deleteNote) will be added below ---