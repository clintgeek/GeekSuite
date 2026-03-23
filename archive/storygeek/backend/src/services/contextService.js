const Story = require('../models/Story');
const summaryService = require('./summaryService');
const storyStateService = require('./storyStateService');
const characterService = require('./characterService');
const tagService = require('./tagService');

class ContextService {
  constructor() {
    this.summaryInterval = 8; // Generate summaries every 8 interactions
    this.maxContextLength = 4000; // Target context length in tokens
  }

  // Build context with intelligent summary-based approach
  async buildContext(story, userInput, diceResult = null) {
    // Check if we need to generate a summary
    if (summaryService.shouldGenerateSummary(story)) {
      console.log('Generating new summary...');
      const summary = await summaryService.generateSummary(story);
      if (summary) {
        story.storySummaries.push(summary);
        summaryService.cleanupOldSummaries(story);
        await story.save();
        console.log('Summary generated and saved');
      }
    }

    // Get relevant context based on current situation
    const relevantContext = await summaryService.getRelevantContext(story, userInput);

    // Build optimized context
    const context = {
      story: {
        title: story.title || 'Untitled',
        genre: story.genre || 'Fantasy',
        setting: story.worldState.setting || 'To be determined',
        currentSituation: story.worldState.currentSituation || 'Story setup in progress',
        mood: story.worldState.mood || 'neutral',
        weather: story.worldState.weather || 'clear',
        timeOfDay: story.worldState.timeOfDay || 'morning'
      },

      // Include more recent characters and locations for better continuity
      characters: (story.characters || []).slice(-5),
      locations: (story.locations || []).slice(-3),

      // Include more recent events for better story continuity
      recentEvents: (story.events || []).slice(-10),
      diceHistory: (story.diceResults || []).slice(-5),

      // Include relevant summaries and details
      relevantSummaries: relevantContext.relevantSummaries,
      relevantDetails: relevantContext.relevantDetails,

      // Include story state for consistency
      storyState: storyStateService.getStoryStateSummary(story),

      // Include character context
      characterContext: await characterService.getCharacterContext(story._id),

      // Include relevant tags for context
      relevantTags: await tagService.getRelevantContext(story._id, userInput),

      aiContext: story.aiContext || {},
      userInput: userInput,
      diceResult: diceResult
    };

    return this.formatContext(context);
  }

  // Get story basics
  getStoryBasics(story) {
    return {
      title: story.title,
      genre: story.genre,
      currentChapter: story.worldState.currentChapter,
      setting: story.worldState.setting,
      mood: story.worldState.mood,
      weather: story.worldState.weather,
      timeOfDay: story.worldState.timeOfDay,
      tone: story.aiContext.storyTone,
      magicSystem: story.aiContext.magicSystem,
      technologyLevel: story.aiContext.technologyLevel
    };
  }

  // Get active characters (3-5 most relevant)
  async getActiveCharacters(story) {
    const activeChars = story.characters.filter(char => char.isActive);

    // Sort by relevance (recently mentioned, important to current situation)
    const relevantChars = activeChars.slice(0, 5);

    return relevantChars.map(char => ({
      name: char.name,
      description: char.description,
      personality: char.personality,
      currentState: char.currentState,
      isPlayer: char.isPlayer || false
    }));
  }

  // Get recent events (last 5-8)
  async getRecentEvents(story) {
    const recentEvents = story.events.slice(-8);

    return recentEvents.map(event => ({
      type: event.type,
      description: event.description,
      timestamp: event.timestamp,
      characters: event.characters?.map(char => char.name) || [],
      diceResults: event.diceResults || []
    }));
  }



  // Get recent dice results
  getRecentDiceResults(story) {
    return story.diceResults.slice(-5).map(dice => ({
      diceType: dice.diceType,
      result: dice.result,
      interpretation: dice.interpretation,
      context: dice.context
    }));
  }

  // Get specific context based on user input
  async getSpecificContext(story, userInput) {
    const input = userInput.toLowerCase();

    // Check for character mentions
    const characterMentions = story.characters.filter(char =>
      input.includes(char.name.toLowerCase())
    );

    // Check for location mentions
    const locationMentions = story.locations.filter(loc =>
      input.includes(loc.name.toLowerCase())
    );

    // Check for item mentions
    const itemMentions = story.characters.flatMap(char =>
      char.inventory?.filter(item => input.includes(item.name.toLowerCase())) || []
    );

    const specificContext = {};

    if (characterMentions.length > 0) {
      specificContext.characters = characterMentions.map(char => ({
        name: char.name,
        description: char.description,
        personality: char.personality,
        background: char.background,
        currentState: char.currentState,
        relationships: char.relationships,
        inventory: char.inventory,
        skills: char.skills
      }));
    }

    if (locationMentions.length > 0) {
      specificContext.locations = locationMentions.map(loc => ({
        name: loc.name,
        description: loc.description,
        type: loc.type,
        atmosphere: loc.atmosphere,
        inhabitants: loc.inhabitants,
        items: loc.items,
        history: loc.history
      }));
    }

    if (itemMentions.length > 0) {
      specificContext.items = itemMentions;
    }

    return Object.keys(specificContext).length > 0 ? specificContext : null;
  }

  // Format context for AI consumption (optimized)
  formatContext(context) {
    let formatted = `STORY: ${context.story.title} (${context.story.genre})
SITUATION: ${context.story.currentSituation}
MOOD: ${context.story.mood}

CHARACTERS: ${context.characters.map(char => char.name).join(', ') || 'None'}

LOCATIONS: ${context.locations.map(loc => loc.name).join(', ') || 'None'}

RECENT: ${context.recentEvents.map(event => `${event.type}: ${event.description.substring(0, 100)}`).join(' | ')}

${context.relevantSummaries.length > 0 ? `RELEVANT SUMMARIES:
${context.relevantSummaries.map(summary => `- ${summary.summary.substring(0, 200)}`).join('\n')}` : ''}

${context.relevantDetails.length > 0 ? `RELEVANT DETAILS:
${context.relevantDetails.map(detail => `- ${detail.type}: ${detail.name} - ${detail.description} (${detail.relevance})`).join('\n')}` : ''}

${context.diceHistory.length > 0 ? `DICE: ${context.diceHistory.map(dice => `${dice.diceType}=${dice.result}`).join(', ')}` : ''}

INPUT: ${context.userInput}
${context.diceResult ? `ROLL: ${context.diceResult.diceType}=${context.diceResult.result}` : ''}

=== GM INSTRUCTIONS ===
Describe the current situation richly (2-3 paragraphs), then present 2-3 choices. End with "What do you do?"

CRITICAL: DO NOT make decisions for the player. ONLY describe what they see/experience and present choices.`;

    return formatted;
  }



  // Check if we need to generate a new summary
  shouldGenerateSummary(story) {
    const totalInteractions = story.stats.totalInteractions;
    return totalInteractions > 0 && totalInteractions % this.summaryInterval === 0;
  }

  // Query MongoDB for specific details
  async queryStoryDetails(storyId, query) {
    const story = await Story.findById(storyId);
    if (!story) return null;

    const queryLower = query.toLowerCase();

    // Search characters
    const characters = story.characters.filter(char =>
      char.name.toLowerCase().includes(queryLower) ||
      char.description.toLowerCase().includes(queryLower)
    );

    // Search locations
    const locations = story.locations.filter(loc =>
      loc.name.toLowerCase().includes(queryLower) ||
      loc.description.toLowerCase().includes(queryLower)
    );

    // Search events
    const events = story.events.filter(event =>
      event.description.toLowerCase().includes(queryLower)
    );

    return {
      characters,
      locations,
      events
    };
  }

  // Get character info for /char command
  async getCharacterInfo(storyId, characterName) {
    const story = await Story.findById(storyId);
    if (!story) return null;

    const character = story.characters.find(char =>
      char.name.toLowerCase() === characterName.toLowerCase()
    );

    if (!character) return null;

    return {
      name: character.name,
      description: character.description,
      personality: character.personality,
      appearance: character.appearance,
      background: character.background,
      currentState: character.currentState,
      relationships: character.relationships,
      inventory: character.inventory,
      skills: character.skills,
      isActive: character.isActive
    };
  }

  // Estimate context token count
  estimateTokenCount(context) {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(context.length / 4);
  }

  // Optimize context if too long
  optimizeContext(context, maxTokens = this.maxContextLength) {
    const currentTokens = this.estimateTokenCount(context);

    if (currentTokens <= maxTokens) {
      return context;
    }

    // Reduce context by prioritizing recent information
    // This is a simplified version - in practice, you'd want more sophisticated logic
    const lines = context.split('\n');
    const priorityLines = lines.filter(line =>
      line.includes('USER INPUT:') ||
      line.includes('CURRENT SITUATION:') ||
      line.includes('ACTIVE CHARACTERS:') ||
      line.includes('RECENT EVENTS:')
    );

    return priorityLines.join('\n');
  }

  // Get story summary for user query
  async getStorySummary(storyId) {
    try {
      const story = await Story.findById(storyId);
      if (!story) {
        throw new Error('Story not found');
      }

      // Combine all summaries into a comprehensive story summary
      const allSummaries = story.storySummaries.map(summary =>
        summary.summary
      ).join('\n\n');

      const currentSituation = story.worldState.currentSituation;
      const totalInteractions = story.stats.totalInteractions;

          return {
      title: story.title,
      genre: story.genre,
      currentSituation,
      totalInteractions,
      summary: allSummaries || 'No summaries available yet.',
      keywords: this.extractAllKeywords(story.storySummaries),
      importantDetails: this.extractAllImportantDetails(story.storySummaries)
    };

    } catch (error) {
      console.error('Error getting story summary:', error);
      throw error;
    }
  }

  // Extract all keywords from summaries
  extractAllKeywords(summaries) {
    const allKeywords = {
      characters: [],
      locations: [],
      items: [],
      concepts: [],
      events: []
    };

    for (const summary of summaries) {
      for (const [category, keywords] of Object.entries(summary.keywords)) {
        allKeywords[category] = [...new Set([...allKeywords[category], ...keywords])];
      }
    }

    return allKeywords;
  }

  // Extract all important details from summaries
  extractAllImportantDetails(summaries) {
    const allDetails = [];

    for (const summary of summaries) {
      allDetails.push(...summary.importantDetails);
    }

    // Sort by relevance (high first)
    return allDetails.sort((a, b) => {
      const relevanceOrder = { high: 3, medium: 2, low: 1 };
      return relevanceOrder[b.relevance] - relevanceOrder[a.relevance];
    });
  }
}

module.exports = new ContextService();