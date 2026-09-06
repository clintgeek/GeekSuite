import express from 'express';
import storyController from '../controllers/storyController.js';
import aiService from '../services/aiService.js';
import { authenticateToken } from '../middleware/auth.js';
import { validate } from '../validation/validate.js';
import {
  storyIdParamsSchema,
  startStorySchema,
  continueStorySchema,
  updateStoryStatusSchema,
} from '../validation/schemas/stories.js';

const router = express.Router();

// Everything below requires authentication — including the two diagnostic
// routes. They used to sit ABOVE this line: `/test-ai` fired a real GM call
// to basegeek and `/test-debug` ran a whole context build + AI turn, both for
// any anonymous caller who could reach the host. Free AI spend on tap, and
// `/test-debug` returned a stack trace on failure. They still work; they just
// need a session now.
router.use(authenticateToken);

// Diagnostic: one live GM round trip. Must come before the :storyId route.
router.get('/test-ai', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const userToken = authHeader && authHeader.split(' ')[1];
    const testResponse = await aiService.generateStoryResponse(
      { title: 'Test', genre: 'Fantasy' },
      'Hello, this is a test message.',
      null,
      userToken
    );
    res.json({ status: 'AI Test Successful', response: testResponse.content });
  } catch (error) {
    res.status(500).json({ status: 'AI Test Failed', error: error.message });
  }
});

// Test story continuation debugging
router.get('/test-debug', storyController.testEndpoint);

router.post('/start', validate({ body: startStorySchema }), storyController.startStory);
router.post('/:storyId/continue', validate({ params: storyIdParamsSchema, body: continueStorySchema }), storyController.continueStory);
router.get('/user/:userId', storyController.getUserStories);
router.get('/:storyId/summary', storyController.getStorySummary);
router.get('/:storyId', storyController.getStory);
router.patch('/:storyId/status', validate({ params: storyIdParamsSchema, body: updateStoryStatusSchema }), storyController.updateStoryStatus);
router.delete('/:storyId', validate({ params: storyIdParamsSchema }), storyController.deleteStory);

export default router;
