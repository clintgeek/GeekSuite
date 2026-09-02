import Story from '../models/Story.js';

/**
 * requireStoryOwner — loads req.params.storyId and rejects callers who do
 * not own it. Mount after authenticateToken on any router whose routes are
 * keyed by :storyId. Attaches the loaded story as req.story.
 *
 *   404 story missing · 403 not the owner · 401 no authenticated user
 */
export async function requireStoryOwner(req, res, next) {
  try {
    const userId = req.user?.id ?? req.user?._id;
    if (!userId) return res.status(401).json({ error: 'User authentication required' });

    const story = await Story.findById(req.params.storyId);
    if (!story) return res.status(404).json({ error: 'Story not found' });
    if (story.userId?.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Not authorized to access this story' });
    }

    req.story = story;
    next();
  } catch (error) {
    console.error('Error verifying story ownership:', error);
    res.status(500).json({ error: 'Failed to verify story ownership' });
  }
}
