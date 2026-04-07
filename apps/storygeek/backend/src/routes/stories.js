import express from 'express';
import storyController from '../controllers/storyController.js';
import aiService from '../services/aiService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Test AI endpoint (must come before :storyId route)
router.get('/test-ai', async (req, res) => {
  try {
    const testResponse = await aiService.generateStoryResponse(
      { title: 'Test', genre: 'Fantasy' },
      'Hello, this is a test message.'
    );
    res.json({ status: 'AI Test Successful', response: testResponse.content });
  } catch (error) {
    res.status(500).json({ status: 'AI Test Failed', error: error.message });
  }
});

// Test story continuation debugging
router.get('/test-debug', storyController.testEndpoint);

// Protected routes - require authentication
router.use(authenticateToken);

router.post('/start', storyController.startStory);
router.post('/:storyId/continue', storyController.continueStory);
router.get('/user/:userId', storyController.getUserStories);
router.get('/:storyId/summary', storyController.getStorySummary);
router.get('/:storyId', storyController.getStory);
router.patch('/:storyId/status', storyController.updateStoryStatus);
router.delete('/:storyId', storyController.deleteStory);

export default router;
