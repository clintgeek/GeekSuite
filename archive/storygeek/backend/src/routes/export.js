const express = require('express');
const router = express.Router();
const bookService = require('../services/bookService');
const { createEpub } = require('../services/epubService');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// POST /api/export/stories/:storyId/bookify
router.post('/stories/:storyId/bookify', async (req, res) => {
  try {
    const { storyId } = req.params;
    const authHeader = req.headers['authorization'];
    const userToken = authHeader && authHeader.split(' ')[1];

    const result = await bookService.bookify(storyId, userToken);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

module.exports = router;

// POST /api/export/stories/:storyId/epub
router.post('/stories/:storyId/epub', async (req, res) => {
  try {
    const { storyId } = req.params;
    const authHeader = req.headers['authorization'];
    const userToken = authHeader && authHeader.split(' ')[1];
    const result = await bookService.bookify(storyId, userToken);
    const epub = await createEpub({ title: result.title, author: 'StoryGeek', genre: result.genre, content: result.content });
    res.setHeader('Content-Type', 'application/epub+zip');
    const filename = `${result.title.replace(/[^a-z0-9\-_]+/gi, '_') || 'story'}.epub`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(epub);
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});


