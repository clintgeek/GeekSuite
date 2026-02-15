import Note from '../models/Note.js';

const MAX_SEARCH_QUERY_LENGTH = 500;

// @desc    Search notes for the logged-in user based on query
// @route   GET /api/search?q=query
// @access  Private
export const searchNotes = async (req, res) => {
  const userId = req.user._id;
  const searchQuery = req.query.q;

  if (!searchQuery || searchQuery.trim().length === 0) {
    return res.status(400).json({ message: 'Search query cannot be empty' });
  }

  if (searchQuery.length > MAX_SEARCH_QUERY_LENGTH) {
    return res.status(400).json({ message: `Search query too long (max ${MAX_SEARCH_QUERY_LENGTH} characters)` });
  }

  try {
    // Perform text search using the text index on Note model
    // Filter results by userId
    // Project score to potentially sort by relevance
    const notes = await Note.find(
      {
        userId: userId,
        $text: { $search: searchQuery.trim() },
      },
      {
        score: { $meta: 'textScore' },
        title: 1,
        type: 1,
        tags: 1,
        isLocked: 1,
        isEncrypted: 1,
        createdAt: 1,
        updatedAt: 1,
        content: 1,
      }
    ).sort({ score: { $meta: 'textScore' } }).lean();

    // Return metadata + snippet only (consistent with getNotes)
    const results = notes.map(note => {
      let snippet = '';
      if (note.content && !note.isLocked && note.type !== 'handwritten' && note.type !== 'mindmap') {
        const plain = note.content.replace(/<[^>]+>/g, '');
        snippet = plain.slice(0, 200);
      }

      return {
        _id: note._id,
        title: note.title,
        type: note.type,
        tags: note.tags,
        isLocked: note.isLocked,
        isEncrypted: note.isEncrypted,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        score: note.score,
        snippet,
        ...(note.isLocked && { message: 'Note is locked. Content not available.' }),
      };
    });

    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({ message: 'Server error searching notes' });
  }
};