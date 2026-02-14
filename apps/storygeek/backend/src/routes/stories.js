const express = require('express');
const router = express.Router();
const storyController = require('../controllers/storyController');
const aiService = require('../services/aiService');
const { authenticateToken } = require('../middleware/auth');

// Test AI endpoint (must come before :storyId route)
router.get('/test-ai', async (req, res) => {
  try {
    const testResponse = await aiService.generateStoryResponse(
      { title: 'Test', genre: 'Fantasy' },
      'Hello, this is a test message.'
    );
    res.json({
      status: 'AI Test Successful',
      response: testResponse.content,

    });
  } catch (error) {
    res.status(500).json({
      status: 'AI Test Failed',
      error: error.message
    });
  }
});

// Test API key directly
router.get('/test-api-key', async (req, res) => {
  try {
    const axios = require('axios');
    const apiKey = process.env.CLAUDE_API_KEY;

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-haiku-20240307',
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: 'Say "Hello World"'
          }
        ]
      },
      {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        }
      }
    );

    res.json({
      status: 'API Key Test Successful',
      response: response.data.content[0].text
    });
  } catch (error) {
    res.status(500).json({
      status: 'API Key Test Failed',
      error: error.response?.data || error.message
    });
  }
});

// Test Together AI models
router.get('/test-together-models', async (req, res) => {
  try {
    const axios = require('axios');
    const apiKey = process.env.TOGETHER_API_KEY;

    const response = await axios.get(
      'https://api.together.xyz/v1/models',
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Together AI response:', JSON.stringify(response.data, null, 2));

    res.json({
      status: 'Together AI Models Retrieved',
      rawResponse: response.data,
      models: response.data.data ? response.data.data.map(model => ({
        id: model.id,
        name: model.name,
        description: model.description
      })) : response.data
    });
  } catch (error) {
    res.status(500).json({
      status: 'Together AI Models Test Failed',
      error: error.response?.data || error.message
    });
  }
});

// Test story continuation debugging
router.get('/test-debug', storyController.testEndpoint);

// Protected routes - require authentication
router.use(authenticateToken);

// Start a new story
router.post('/start', storyController.startStory);

// Continue an existing story
router.post('/:storyId/continue', storyController.continueStory);

// Get all stories for a user
router.get('/user/:userId', storyController.getUserStories);

// Get story summary
router.get('/:storyId/summary', storyController.getStorySummary);

// Get specific story
router.get('/:storyId', storyController.getStory);

// Update story status
router.patch('/:storyId/status', storyController.updateStoryStatus);

// Delete story
router.delete('/:storyId', storyController.deleteStory);

module.exports = router;