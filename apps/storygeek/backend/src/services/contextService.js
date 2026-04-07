import Story from '../models/Story.js';
import summaryService from './summaryService.js';
import storyStateService from './storyStateService.js';
import characterService from './characterService.js';
import tagService from './tagService.js';

class ContextService {
  constructor() {
    this.summaryInterval = 8;
    this.maxContextLength = 4000;
  }

  async buildContext(story, userInput, diceResult = null) {
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

    const relevantContext = await summaryService.getRelevantContext(story, userInput);

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
      characters: (story.characters || []).slice(-5),
      locations: (story.locations || []).slice(-3),
      recentEvents: (story.events || []).slice(-10),
      diceHistory: (story.diceResults || []).slice(-5),
      relevantSummaries: relevantContext.relevantSummaries,
      relevantDetails: relevantContext.relevantDetails,
      storyState: storyStateService.getStoryStateSummary(story),
      characterContext: await characterService.getCharacterContext(story._id),
      relevantTags: await tagService.getRelevantContext(story._id, userInput),
      aiContext: story.aiContext || {},
      userInput,
      diceResult
    };

    return this.formatContext(context);
  }

  getStoryBasics(story) {
    return {
      title: story.title, genre: story.genre,
      currentChapter: story.worldState.currentChapter,
      setting: story.worldState.setting, mood: story.worldState.mood,
      weather: story.worldState.weather, timeOfDay: story.worldState.timeOfDay,
      tone: story.aiContext.storyTone, magicSystem: story.aiContext.magicSystem,
      technologyLevel: story.aiContext.technologyLevel
    };
  }

  async getActiveCharacters(story) {
    const activeChars = story.characters.filter(char => char.isActive);
    return activeChars.slice(0, 5).map(char => ({
      name: char.name, description: char.description, personality: char.personality,
      currentState: char.currentState, isPlayer: char.isPlayer || false
    }));
  }

  async getRecentEvents(story) {
    return story.events.slice(-8).map(event => ({
      type: event.type, description: event.description, timestamp: event.timestamp,
      characters: event.characters?.map(char => char.name) || [],
      diceResults: event.diceResults || []
    }));
  }

  getRecentDiceResults(story) {
    return story.diceResults.slice(-5).map(dice => ({
      diceType: dice.diceType, result: dice.result, interpretation: dice.interpretation, context: dice.context
    }));
  }

  async getSpecificContext(story, userInput) {
    const input = userInput.toLowerCase();
    const characterMentions = story.characters.filter(char => input.includes(char.name.toLowerCase()));
    const locationMentions = story.locations.filter(loc => input.includes(loc.name.toLowerCase()));
    const itemMentions = story.characters.flatMap(char =>
      char.inventory?.filter(item => input.includes(item.name.toLowerCase())) || []
    );
    const specificContext = {};
    if (characterMentions.length > 0) {
      specificContext.characters = characterMentions.map(char => ({
        name: char.name, description: char.description, personality: char.personality,
        background: char.background, currentState: char.currentState,
        relationships: char.relationships, inventory: char.inventory, skills: char.skills
      }));
    }
    if (locationMentions.length > 0) {
      specificContext.locations = locationMentions.map(loc => ({
        name: loc.name, description: loc.description, type: loc.type,
        atmosphere: loc.atmosphere, inhabitants: loc.inhabitants, items: loc.items, history: loc.history
      }));
    }
    if (itemMentions.length > 0) specificContext.items = itemMentions;
    return Object.keys(specificContext).length > 0 ? specificContext : null;
  }

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

  shouldGenerateSummary(story) {
    return story.stats.totalInteractions > 0 && story.stats.totalInteractions % this.summaryInterval === 0;
  }

  async queryStoryDetails(storyId, query) {
    const story = await Story.findById(storyId);
    if (!story) return null;
    const queryLower = query.toLowerCase();
    return {
      characters: story.characters.filter(char => char.name.toLowerCase().includes(queryLower) || char.description.toLowerCase().includes(queryLower)),
      locations: story.locations.filter(loc => loc.name.toLowerCase().includes(queryLower) || loc.description.toLowerCase().includes(queryLower)),
      events: story.events.filter(event => event.description.toLowerCase().includes(queryLower))
    };
  }

  async getCharacterInfo(storyId, characterName) {
    const story = await Story.findById(storyId);
    if (!story) return null;
    const character = story.characters.find(char => char.name.toLowerCase() === characterName.toLowerCase());
    if (!character) return null;
    return {
      name: character.name, description: character.description, personality: character.personality,
      appearance: character.appearance, background: character.background, currentState: character.currentState,
      relationships: character.relationships, inventory: character.inventory, skills: character.skills, isActive: character.isActive
    };
  }

  estimateTokenCount(context) { return Math.ceil(context.length / 4); }

  optimizeContext(context, maxTokens = this.maxContextLength) {
    if (this.estimateTokenCount(context) <= maxTokens) return context;
    const lines = context.split('\n');
    return lines.filter(line =>
      line.includes('USER INPUT:') || line.includes('CURRENT SITUATION:') ||
      line.includes('ACTIVE CHARACTERS:') || line.includes('RECENT EVENTS:')
    ).join('\n');
  }

  async getStorySummary(storyId) {
    try {
      const story = await Story.findById(storyId);
      if (!story) throw new Error('Story not found');
      const allSummaries = story.storySummaries.map(s => s.summary).join('\n\n');
      return {
        title: story.title, genre: story.genre,
        currentSituation: story.worldState.currentSituation,
        totalInteractions: story.stats.totalInteractions,
        summary: allSummaries || 'No summaries available yet.',
        keywords: this.extractAllKeywords(story.storySummaries),
        importantDetails: this.extractAllImportantDetails(story.storySummaries)
      };
    } catch (error) {
      console.error('Error getting story summary:', error);
      throw error;
    }
  }

  extractAllKeywords(summaries) {
    const allKeywords = { characters: [], locations: [], items: [], concepts: [], events: [] };
    for (const summary of summaries) {
      for (const [category, keywords] of Object.entries(summary.keywords)) {
        allKeywords[category] = [...new Set([...allKeywords[category], ...keywords])];
      }
    }
    return allKeywords;
  }

  extractAllImportantDetails(summaries) {
    const allDetails = [];
    for (const summary of summaries) allDetails.push(...summary.importantDetails);
    const relevanceOrder = { high: 3, medium: 2, low: 1 };
    return allDetails.sort((a, b) => relevanceOrder[b.relevance] - relevanceOrder[a.relevance]);
  }
}

export default new ContextService();
