import Story from '../models/Story.js';
import aiService from '../services/aiService.js';
import contextService from '../services/contextService.js';
import diceService from '../services/diceService.js';
import tagService from '../services/tagService.js';
import characterService from '../services/characterService.js';

const getAuthenticatedUserId = (req) => {
  if (!req.user || !req.user._id) return null;
  return req.user._id.toString();
};

const isStoryOwner = (story, userId) => {
  if (!story || !userId) return false;
  return story.userId?.toString() === userId;
};

const requireAuth = (req, res) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'User authentication required' });
    return null;
  }
  return userId;
};

class StoryController {
  async startStory(req, res) {
    try {
      const { prompt, title, genre, description } = req.body;
      const authenticatedUserId = requireAuth(req, res);
      if (!authenticatedUserId) return;

      if (!prompt) return res.status(400).json({ error: 'Story prompt is required' });

      const questionsPrompt = `
        Based on this story prompt: "${prompt}"
        Genre: ${genre || 'Fantasy'}
        Title: ${title || 'Untitled Story'}
        Ask 2-3 specific clarifying questions that will help create a more detailed and engaging opening scene.
        Focus on:
        - Character details (if not specified)
        - Setting specifics (time period, location details)
        - Tone and atmosphere
        - Initial conflict or situation
        Format your response as a simple list of questions, one per line.
        Keep questions concise and specific.
      `;

      const authHeader = req.headers['authorization'];
      const userToken = authHeader && authHeader.split(' ')[1];

      const questionsResponse = await aiService.generateStoryResponse(
        { title: title || 'Untitled', genre: genre || 'Fantasy' },
        questionsPrompt, null, userToken,
        { provider: req.body.provider, model: req.body.model }
      );

      const story = new Story({
        userId: authenticatedUserId,
        title: title || 'Untitled Story',
        genre: genre || 'Fantasy',
        description: description || '',
        worldState: { setting: 'To be determined', currentSituation: 'Story setup in progress', mood: 'neutral', weather: 'clear', timeOfDay: 'morning' },
        aiContext: { lastPrompt: prompt, worldRules: '', storyTone: 'adventure', magicSystem: '', technologyLevel: 'medieval' },
        status: 'setup',
        stats: { totalInteractions: 0, totalDiceRolls: 0, lastActive: new Date() },
        events: [{ type: 'narrative', description: `Story Setup: ${prompt}\n\nClarifying Questions:\n${questionsResponse.content}`, characters: [], locations: [], diceResults: [], playerChoices: [], timestamp: new Date() }]
      });

      await story.save();
      res.json({ storyId: story._id, aiResponse: questionsResponse.content, setupQuestions: questionsResponse.content, status: 'setup', needsClarification: true });
    } catch (error) {
      console.error('Error starting story:', error);
      res.status(500).json({ error: 'Failed to start story' });
    }
  }

  async continueStory(req, res) {
    try {
      const { storyId } = req.params;
      const { userInput } = req.body;
      const story = await Story.findById(storyId);
      if (!story) return res.status(404).json({ error: 'Story not found' });

      // Handle special commands
      if (userInput.startsWith('/')) {
        const command = userInput.toLowerCase().trim();

        if (command.startsWith('/checkpoint')) {
          const checkpoint = {
            id: Date.now().toString(), timestamp: new Date(),
            events: [...story.events], worldState: { ...story.worldState },
            characters: [...story.characters], locations: [...story.locations],
            description: userInput.replace('/checkpoint', '').trim() || 'Checkpoint'
          };
          if (!story.checkpoints) story.checkpoints = [];
          story.checkpoints.push(checkpoint);
          await story.save();
          return res.json({ type: 'checkpoint_created', checkpoint, message: `Checkpoint "${checkpoint.description}" created.` });
        }

        if (command.startsWith('/back')) {
          const checkpointId = userInput.replace('/back', '').trim();
          if (!story.checkpoints || story.checkpoints.length === 0) return res.json({ type: 'error', message: 'No checkpoints available. Use /checkpoint to create one.' });
          let targetCheckpoint;
          if (checkpointId) {
            targetCheckpoint = story.checkpoints.find(cp => cp.id === checkpointId || cp.description.toLowerCase().includes(checkpointId.toLowerCase()));
          } else {
            targetCheckpoint = story.checkpoints[story.checkpoints.length - 1];
          }
          if (!targetCheckpoint) return res.json({ type: 'error', message: 'Checkpoint not found. Available checkpoints: ' + story.checkpoints.map(cp => `${cp.description} (${cp.id})`).join(', ') });
          story.events = [...targetCheckpoint.events];
          story.worldState = { ...targetCheckpoint.worldState };
          story.characters = [...targetCheckpoint.characters];
          story.locations = [...targetCheckpoint.locations];
          story.stats.lastActive = new Date();
          await story.save();
          return res.json({ type: 'checkpoint_restored', checkpoint: targetCheckpoint, message: `Restored to checkpoint "${targetCheckpoint.description}".` });
        }

        if (command.startsWith('/list-checkpoints')) {
          if (!story.checkpoints || story.checkpoints.length === 0) return res.json({ type: 'error', message: 'No checkpoints available. Use /checkpoint to create one.' });
          return res.json({ type: 'checkpoint_list', checkpoints: story.checkpoints.map(cp => ({ id: cp.id, description: cp.description, timestamp: cp.timestamp, eventCount: cp.events.length })) });
        }

        if (command.startsWith('/char')) {
          const characterName = command.replace('/char', '').trim();
          if (!characterName) {
            const characters = await characterService.getCharacterContext(story._id);
            return res.json({ type: 'character_list', characters });
          }
          const character = await characterService.getCharacterInfo(story._id, characterName);
          if (!character) return res.json({ type: 'error', message: `Character "${characterName}" not found.` });
          return res.json({ type: 'character_info', character });
        }

        if (command.startsWith('/info')) {
          const searchTerm = command.replace('/info', '').trim();
          if (!searchTerm) return res.json({ type: 'error', message: 'Please specify what to search for: /info [location/item name]' });
          const location = story.locations.find(loc => loc.name.toLowerCase().includes(searchTerm.toLowerCase()));
          if (location) return res.json({ type: 'location_info', location });
          return res.json({ type: 'error', message: `No information found for "${searchTerm}".` });
        }

        if (command.startsWith('/timeout')) return res.json({ type: 'timeout', message: 'Time-out called. This is a meta-discussion that won\'t affect the story. What would you like to discuss?' });

        if (command.startsWith('/end')) {
          story.status = 'completed';
          story.stats.lastActive = new Date();
          await story.save();
          return res.json({ type: 'story_ended', message: 'Story has been marked as completed.' });
        }

        if (command === '/reset-scene') {
          story.worldState.currentSituation = 'The situation has shifted. You find yourself in a new moment, the previous tension having dissipated.';
          const authHeader = req.headers['authorization'];
          const userToken = authHeader && authHeader.split(' ')[1];
          const aiResponse = await aiService.generateStoryResponse(story, 'Continue the story from this new situation', null, userToken, { provider: req.body.provider, model: req.body.model });
          story.events.push({ type: 'narrative', description: aiResponse.content, timestamp: new Date(), diceResults: [] });
          story.stats.totalInteractions++;
          story.stats.lastActive = new Date();
          await story.save();
          return res.json({ type: 'scene_reset', message: 'Scene has been reset. The situation has changed.', aiResponse: aiResponse.content, story });
        }

        return res.json({ type: 'error', message: 'Unknown command. Available commands: /char, /info, /timeout, /end' });
      }

      // Handle setup phase
      if (story.status === 'setup') {
        try {
          const isFirstResponse = story.events.length === 1;
          if (isFirstResponse) {
            const openingPrompt = `
              Based on the original prompt and the user's answers to the clarifying questions,
              create an engaging opening scene for the story.
              Original Prompt: ${story.aiContext.lastPrompt}
              User's Answers: ${userInput}
              Write a compelling opening paragraph that:
              1. Establishes the setting and atmosphere
              2. Introduces the main character or situation
              3. Creates intrigue and hooks the reader
              4. Sets up the initial conflict or situation
              5. Uses descriptive language appropriate for the genre
              Make it feel like the beginning of an exciting adventure. Be descriptive and immersive.
              End with a natural stopping point that invites the player to continue the story.
            `;
            const authHeader = req.headers['authorization'];
            const userToken = authHeader && authHeader.split(' ')[1];
            const aiResponse = await aiService.generateStoryResponse(story, openingPrompt, null, userToken, { provider: req.body.provider, model: req.body.model });
            story.status = 'active';
            story.worldState.currentSituation = 'Story has begun';
            story.events.push({ type: 'narrative', description: aiResponse.content, timestamp: new Date(), characters: [], locations: [], diceResults: [], playerChoices: [] });
            story.stats.totalInteractions++;
            story.stats.lastActive = new Date();
            await story.save();
            return res.json({ aiResponse: aiResponse.content, status: 'active', storyStarted: true });
          } else {
            return res.json({ type: 'error', message: 'Setup phase error. Please try creating a new story.' });
          }
        } catch (error) {
          console.error('Error in setup phase:', error);
          return res.status(500).json({ error: 'Failed to process setup' });
        }
      }

      // Regular story continuation
      let diceResult = null;
      story.events.push({ type: 'dialogue', description: `Player chose: ${userInput}`, timestamp: new Date(), diceResults: [] });
      const context = await contextService.buildContext(story, userInput, diceResult);

      const authHeader = req.headers['authorization'];
      const userToken = authHeader && authHeader.split(' ')[1];
      const aiResponse = await aiService.generateStoryResponse(story, userInput, diceResult, userToken, { provider: req.body.provider, model: req.body.model });

      const tags = tagService.extractTags(aiResponse.content, storyId, 'narrative');
      await tagService.saveTags(storyId, tags);
      const characters = characterService.extractCharacters(aiResponse.content, storyId);
      await characterService.saveCharacters(storyId, characters);

      if (aiResponse.diceResult) {
        story.diceResults.push(aiResponse.diceResult);
        story.stats.totalDiceRolls++;
      }

      story.events.push({ type: 'narrative', description: aiResponse.content, timestamp: new Date(), diceResults: aiResponse.diceResult ? [aiResponse.diceResult] : [], diceMeta: aiResponse.diceMeta || null });
      story.stats.totalInteractions++;
      story.stats.lastActive = new Date();
      story.worldState.currentSituation = 'Story continues...';
      await story.save();

      res.json({
        aiResponse: aiResponse.content,
        diceResult: aiResponse.diceResult || null,
        diceMeta: aiResponse.diceMeta || null,
        currentChapter: story.worldState.currentChapter
      });
    } catch (error) {
      console.error('Error continuing story:', error);
      res.status(500).json({ error: 'Failed to continue story' });
    }
  }

  needsDiceRoll = (userInput) => {
    const diceKeywords = ['attack', 'fight', 'combat', 'battle', 'hit', 'strike', 'persuade', 'convince', 'negotiate', 'bargain', 'bribe', 'stealth', 'sneak', 'hide', 'conceal', 'investigate', 'search', 'examine', 'inspect', 'survive', 'navigate', 'find', 'locate', 'repair', 'fix', 'craft', 'build', 'climb', 'jump', 'run', 'escape', 'lockpick', 'hack', 'disable', 'heal', 'treat', 'cure', 'cast', 'spell', 'magic', 'shoot', 'aim', 'fire'];
    const input = userInput.toLowerCase();
    return diceKeywords.some(keyword => input.includes(keyword));
  }

  determineSituation = (userInput) => {
    const input = userInput.toLowerCase();
    if (input.includes('attack') || input.includes('fight') || input.includes('combat')) return 'combat';
    if (input.includes('persuade') || input.includes('convince') || input.includes('negotiate')) return 'social';
    if (input.includes('stealth') || input.includes('sneak') || input.includes('hide')) return 'stealth';
    if (input.includes('investigate') || input.includes('search') || input.includes('examine')) return 'investigation';
    if (input.includes('repair') || input.includes('fix') || input.includes('craft')) return 'technical';
    if (input.includes('heal') || input.includes('treat') || input.includes('cure')) return 'medical';
    if (input.includes('cast') || input.includes('spell') || input.includes('magic')) return 'magical';
    return 'general';
  }

  extractCurrentSituation(aiResponse) {
    const firstSentence = aiResponse.split('.')[0];
    return firstSentence.length > 100 ? firstSentence.substring(0, 100) + '...' : firstSentence;
  }

  async testEndpoint(req, res) {
    try {
      const testStory = await Story.findById('6892311348766ff4a2c3c6c1');
      const context = await contextService.buildContext(testStory, 'test');
      const authHeader = req.headers['authorization'];
      const userToken = authHeader && authHeader.split(' ')[1];
      const aiResponse = await aiService.generateStoryResponse(testStory, 'test', null, userToken);
      res.json({ status: 'All tests passed', storyFound: !!testStory, contextLength: context.length, aiResponseLength: aiResponse.content.length });
    } catch (error) {
      console.error('Test endpoint error:', error);
      res.status(500).json({ error: 'Test failed', message: error.message, stack: error.stack });
    }
  }

  async getUserStories(req, res) {
    try {
      const authenticatedUserId = requireAuth(req, res);
      if (!authenticatedUserId) return;
      const requestedUserId = req.params.userId;
      if (requestedUserId && requestedUserId !== authenticatedUserId) return res.status(403).json({ error: 'Cannot access other users\' stories' });
      const stories = await Story.find({ userId: authenticatedUserId }).select('title genre status stats worldState createdAt updatedAt').sort({ updatedAt: -1 });
      res.json(stories);
    } catch (error) {
      console.error('Error getting user stories:', error);
      res.status(500).json({ error: 'Failed to get stories' });
    }
  }

  async getStory(req, res) {
    try {
      const authenticatedUserId = requireAuth(req, res);
      if (!authenticatedUserId) return;
      const story = await Story.findById(req.params.storyId);
      if (!story) return res.status(404).json({ error: 'Story not found' });
      if (!isStoryOwner(story, authenticatedUserId)) return res.status(403).json({ error: 'Not authorized to view this story' });
      res.json(story);
    } catch (error) {
      console.error('Error getting story:', error);
      res.status(500).json({ error: 'Failed to get story' });
    }
  }

  async updateStoryStatus(req, res) {
    try {
      const authenticatedUserId = requireAuth(req, res);
      if (!authenticatedUserId) return;
      const story = await Story.findById(req.params.storyId);
      if (!story) return res.status(404).json({ error: 'Story not found' });
      if (!isStoryOwner(story, authenticatedUserId)) return res.status(403).json({ error: 'Not authorized to update this story' });
      story.status = req.body.status;
      await story.save();
      res.json({ message: 'Story status updated', status: req.body.status });
    } catch (error) {
      console.error('Error updating story status:', error);
      res.status(500).json({ error: 'Failed to update story status' });
    }
  }

  async deleteStory(req, res) {
    try {
      const authenticatedUserId = requireAuth(req, res);
      if (!authenticatedUserId) return;
      const story = await Story.findById(req.params.storyId);
      if (!story) return res.status(404).json({ error: 'Story not found' });
      if (!isStoryOwner(story, authenticatedUserId)) return res.status(403).json({ error: 'Not authorized to delete this story' });
      await Story.findByIdAndDelete(req.params.storyId);
      res.json({ message: 'Story deleted successfully' });
    } catch (error) {
      console.error('Error deleting story:', error);
      res.status(500).json({ error: 'Failed to delete story' });
    }
  }

  async getStorySummary(req, res) {
    try {
      const story = await Story.findById(req.params.storyId);
      if (!story) return res.status(404).json({ error: 'Story not found' });
      const allSummaries = story.storySummaries.map(s => s.summary).join('\n\n');
      const allKeywords = { characters: [], locations: [], items: [], concepts: [], events: [] };
      const allImportantDetails = [];
      for (const summary of story.storySummaries) {
        for (const [category, keywords] of Object.entries(summary.keywords)) {
          allKeywords[category] = [...new Set([...allKeywords[category], ...keywords])];
        }
        allImportantDetails.push(...summary.importantDetails);
      }
      const relevanceOrder = { high: 3, medium: 2, low: 1 };
      allImportantDetails.sort((a, b) => relevanceOrder[b.relevance] - relevanceOrder[a.relevance]);
      res.json({
        title: story.title, genre: story.genre,
        currentSituation: story.worldState.currentSituation,
        totalInteractions: story.stats.totalInteractions,
        summary: allSummaries || 'No summaries available yet.',
        keywords: allKeywords, importantDetails: allImportantDetails,
        lastUpdated: story.updatedAt
      });
    } catch (error) {
      console.error('Error getting story summary:', error);
      res.status(500).json({ error: 'Failed to get story summary' });
    }
  }
}

export default new StoryController();
