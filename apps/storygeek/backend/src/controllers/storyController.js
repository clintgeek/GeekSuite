import Story from '../models/Story.js';
import aiService from '../services/aiService.js';
import contextService from '../services/contextService.js';
import stateExtractionService from '../services/stateExtractionService.js';
import stateCommitService from '../services/stateCommitService.js';
import checkpointService from '../services/checkpointService.js';
import canonQueryService from '../services/canonQueryService.js';

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
      const authenticatedUserId = requireAuth(req, res);
      if (!authenticatedUserId) return;
      const story = await Story.findById(storyId);
      if (!story) return res.status(404).json({ error: 'Story not found' });
      if (!isStoryOwner(story, authenticatedUserId)) return res.status(403).json({ error: 'Not authorized to continue this story' });

      // Handle special commands
      if (userInput.startsWith('/')) {
        const command = userInput.toLowerCase().trim();

        if (command.startsWith('/checkpoint')) {
          const checkpoint = checkpointService.makeCheckpoint(
            story, userInput.replace('/checkpoint', '').trim() || 'Checkpoint'
          );
          if (!story.checkpoints) story.checkpoints = [];
          story.checkpoints.push(checkpoint);
          await story.save();
          return res.json({ type: 'checkpoint_created', checkpoint: { id: checkpoint.id, description: checkpoint.description, timestamp: checkpoint.timestamp, turnNumber: checkpoint.turnNumber }, message: `Checkpoint "${checkpoint.description}" created.` });
        }

        if (command.startsWith('/back')) {
          const checkpointId = userInput.replace('/back', '').trim();
          if (!story.checkpoints || story.checkpoints.length === 0) return res.json({ type: 'error', message: 'No checkpoints available. Use /checkpoint to create one.' });
          const targetCheckpoint = checkpointService.findCheckpoint(story, checkpointId);
          if (!targetCheckpoint) return res.json({ type: 'error', message: 'Checkpoint not found. Available checkpoints: ' + story.checkpoints.map(cp => `${cp.description} (${cp.id})`).join(', ') });

          // Deterministic post-restore audit — surface any inconsistency
          // instead of letting it silently poison the campaign.
          const violations = checkpointService.restoreCheckpoint(story, targetCheckpoint);
          if (violations.length > 0) console.warn('Post-restore consistency violations:', violations);
          await story.save();

          return res.json({
            type: 'checkpoint_restored',
            checkpoint: { id: targetCheckpoint.id, description: targetCheckpoint.description, timestamp: targetCheckpoint.timestamp, turnNumber: targetCheckpoint.turnNumber },
            consistencyWarnings: violations,
            message: `Restored to checkpoint "${targetCheckpoint.description}".`
          });
        }

        if (command.startsWith('/list-checkpoints')) {
          if (!story.checkpoints || story.checkpoints.length === 0) return res.json({ type: 'error', message: 'No checkpoints available. Use /checkpoint to create one.' });
          return res.json({ type: 'checkpoint_list', checkpoints: story.checkpoints.map(cp => ({ id: cp.id, description: cp.description, timestamp: cp.timestamp, eventCount: cp.events.length })) });
        }

        if (command.startsWith('/char')) {
          // Canonical characters live on the story document now (the old
          // regex-extracted Character collection is no longer authoritative).
          const characterName = command.replace('/char', '').trim();
          const canonChars = (story.characters || []).filter(c => c.isActive !== false);
          if (!characterName) {
            return res.json({
              type: 'character_list',
              characters: canonChars.map(c => ({
                name: c.name, description: c.description, personality: c.personality,
                status: c.status, locationName: c.locationName, isPlayer: c.isPlayer
              }))
            });
          }
          const character = canonChars.find(c => c.name.toLowerCase().includes(characterName.toLowerCase()));
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

        if (command.startsWith('/recall') || command.startsWith('/canon')) {
          // Canon query: answered from the RECORD, zero-turn — no event, no
          // dice, no turn increment. Asking what you know doesn't advance
          // the world.
          const authHeader2 = req.headers['authorization'];
          const userToken2 = authHeader2 && authHeader2.split(' ')[1];
          const payload = await canonQueryService.answerCanonQuery(story, userInput, userToken2);
          return res.json(payload);
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

        return res.json({ type: 'error', message: 'Unknown command. Available commands: /recall, /char, /info, /checkpoint, /back, /timeout, /end' });
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
            story.worldState.turnNumber = 1;
            story.events.push({ type: 'narrative', description: aiResponse.content, turn: 1, timestamp: new Date(), characters: [], locations: [], diceResults: [], playerChoices: [] });
            story.stats.totalInteractions++;
            story.stats.lastActive = new Date();

            // Seed canon from the opening scene: player character, starting
            // location, initial NPCs and facts all come from this extraction.
            try {
              const { proposal } = await stateExtractionService.extractChanges(
                story, userInput, aiResponse.content,
                { presentCharacterNames: [], liveFactsBlock: '', activeThreadsBlock: '' },
                userToken
              );
              if (proposal) {
                // Opening-scene facts are world seeding, not player/narrator turns.
                stateCommitService.applyProposal(story, proposal, { presentCharacterNames: [], turn: 1, sourceOverride: 'setup' });
              }
            } catch (seedError) {
              console.error('Opening-scene canon seeding failed (story continues):', seedError.message);
            }

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

      // ── Regular story continuation ─────────────────────────────────
      // Pipeline: canon → context package → GM narration (+ engine dice)
      //           → state extraction → validation → commit.
      const authHeader = req.headers['authorization'];
      const userToken = authHeader && authHeader.split(' ')[1];

      // Canon queries ("what do we know about Jim's truck?") are questions to
      // the ENGINE, not actions in the fiction. Route them to deterministic
      // retrieval — never the creative GM, which answers from canon PLUS its
      // own invention and then launders the invention into "known" next turn.
      if (canonQueryService.isCanonQuery(userInput)) {
        const payload = await canonQueryService.answerCanonQuery(story, userInput, userToken);
        return res.json(payload);
      }

      const turn = (story.worldState.turnNumber || 0) + 1;
      story.worldState.turnNumber = turn;
      story.events.push({ type: 'dialogue', description: `Player: ${userInput}`, turn, timestamp: new Date(), diceResults: [] });

      // Canon alerts from the previous turn's conflicts, if any (then cleared).
      const canonAlerts = story.storyState?.canonAlerts || [];

      const { prompt, turnContext } = await contextService.buildTurnContext(story, userInput, {
        canonAlerts, userToken
      });

      const aiResponse = await aiService.generateStoryResponse(
        story, userInput, null, userToken,
        { provider: req.body.provider, model: req.body.model },
        prompt
      );

      if (aiResponse.diceResult) {
        story.diceResults.push(aiResponse.diceResult);
        story.stats.totalDiceRolls++;
      }

      story.events.push({ type: 'narrative', description: aiResponse.content, turn, timestamp: new Date(), diceResults: aiResponse.diceResult ? [aiResponse.diceResult] : [] });
      story.stats.totalInteractions++;
      story.stats.lastActive = new Date();

      // Extract → validate → commit. Failure here never breaks the turn;
      // it just means one turn of state changes goes unrecorded.
      let commitReport = { applied: 0, rejected: [], conflicts: [] };
      let proposal = null;
      let extractionModel = null;
      try {
        ({ proposal, modelUsed: extractionModel } = await stateExtractionService.extractChanges(
          story, userInput, aiResponse.content, turnContext, userToken
        ));
        if (proposal) {
          commitReport = stateCommitService.applyProposal(story, proposal, {
            presentCharacterNames: turnContext.presentCharacterNames,
            turn
          });
          if (commitReport.rejected.length > 0) {
            console.warn(`Turn ${turn}: ${commitReport.rejected.length} state changes rejected:`,
              commitReport.rejected.map(r => `${r.rule}: ${r.reason}`).filter(r => !r.includes('already known')));
          }
        }
      } catch (extractError) {
        console.error('State pipeline failed (turn preserved):', extractError.message);
      }

      // Conflicts feed next turn's CANON ALERTS so the GM course-corrects.
      if (story.storyState) {
        story.storyState.canonAlerts = commitReport.conflicts.slice(0, 5).map(c => ({
          existing: { id: c.existing?.id, fact: c.existing?.fact },
          proposed: { fact: c.proposed?.fact }
        }));
        story.markModified('storyState.canonAlerts');
      }
      await story.save();

      const payload = {
        aiResponse: aiResponse.content,
        diceResult: aiResponse.diceResult || null,
        diceMeta: aiResponse.diceMeta || null,
        turnNumber: turn,
        stateChanges: { applied: commitReport.applied, conflicts: commitReport.conflicts.length }
      };

      // Full per-turn diagnostics for playtests: which model actually served
      // the turn, and proposed vs. accepted vs. rejected state changes — so a
      // drift incident can be attributed to the GM, the extractor, the
      // validator, the context builder, or canon itself.
      if (req.body.debug === true) {
        const proposedCount = proposal
          ? Object.values(proposal).reduce((n, v) => n + (Array.isArray(v) ? v.length : (v ? 1 : 0)), 0)
          : 0;
        payload.debug = {
          turn,
          gmModel: aiResponse.modelUsed || null,
          extractionModel,
          extractionFailed: !proposal,
          proposed: proposedCount,
          accepted: commitReport.applied,
          rejected: commitReport.rejected.map(r => ({ rule: r.rule, reason: String(r.reason || '').slice(0, 140) })),
          conflicts: commitReport.conflicts.map(c => ({
            existing: String(c.existing?.fact || '').slice(0, 100),
            proposed: String(c.proposed?.fact || '').slice(0, 100)
          })),
          canonAlertsShown: canonAlerts.length,
          activeThreads: (story.storyThreads || []).filter(t => t.status === 'active').length,
          liveFacts: (story.storyState?.establishedFacts || []).filter(f => !f.isRetired).length,
          factSources: (story.storyState?.establishedFacts || []).filter(f => !f.isRetired)
            .reduce((acc, f) => { const k = f.source || 'other'; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
          presentNPCs: turnContext.presentCharacterNames,
          contextChars: prompt.length
        };
      }

      res.json(payload);
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
      const { prompt } = await contextService.buildTurnContext(testStory, 'test');
      const authHeader = req.headers['authorization'];
      const userToken = authHeader && authHeader.split(' ')[1];
      const aiResponse = await aiService.generateStoryResponse(testStory, 'test', null, userToken, {}, prompt);
      res.json({ status: 'All tests passed', storyFound: !!testStory, contextLength: prompt.length, aiResponseLength: aiResponse.content.length });
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
      const authenticatedUserId = requireAuth(req, res);
      if (!authenticatedUserId) return;
      const story = await Story.findById(req.params.storyId);
      if (!story) return res.status(404).json({ error: 'Story not found' });
      if (!isStoryOwner(story, authenticatedUserId)) return res.status(403).json({ error: 'Not authorized to view this story' });
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
