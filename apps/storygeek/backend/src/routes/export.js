import express from 'express';
import bookService from '../services/bookService.js';
import { createEpub } from '../services/epubService.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireStoryOwner } from '../middleware/storyOwner.js';
import { validate } from '../validation/validate.js';
import { storyIdParamsSchema } from '../validation/schemas/export.js';

const router = express.Router();

router.use(authenticateToken);
// storyId is checked (non-empty, bounded string) before requireStoryOwner
// spends a Mongo round trip loading it. Only the story's owner may
// export/bookify it.
router.use('/stories/:storyId', validate({ params: storyIdParamsSchema }));
router.use('/stories/:storyId', requireStoryOwner);

// bookify() throws a typed, `.code`-carrying error for its two guardrails
// (MAX_BOOKIFY_EVENTS, BOOKIFY_TIME_BUDGET_MS in bookService.js) — map those
// to 413/504 so the client can tell "story too big" / "took too long" apart
// from a generic failure; anything else stays a 500.
//
// BOOKIFY_UNAVAILABLE is the third: no model could serve a scene pass, so the
// export cannot run. 503 with aiGeek's own words, because an export that
// silently came back short would be worse than one that says why it didn't.
const STATUS_BY_CODE = {
  BOOKIFY_TOO_LARGE: 413,
  BOOKIFY_TIMEOUT: 504,
  BOOKIFY_UNAVAILABLE: 503,
};

function sendBookifyError(res, error) {
  const status = STATUS_BY_CODE[error.code] || 500;
  const body = { success: false, error: { message: error.message, code: error.code } };
  // The reason aiGeek gave (cap, unavailable, timeout, paid_budget) — useful
  // to a client deciding whether "try again" is worth offering.
  if (error.reason) body.error.reason = error.reason;
  res.status(status).json(body);
}

// POST /api/export/stories/:storyId/bookify
router.post('/stories/:storyId/bookify', async (req, res) => {
  try {
    const { storyId } = req.params;
    const authHeader = req.headers['authorization'];
    const userToken = authHeader && authHeader.split(' ')[1];
    const result = await bookService.bookify(storyId, userToken);
    res.json({ success: true, data: result });
  } catch (error) {
    sendBookifyError(res, error);
  }
});

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
    sendBookifyError(res, error);
  }
});

export default router;
