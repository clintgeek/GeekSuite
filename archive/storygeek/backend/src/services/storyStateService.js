class StoryStateService {
  constructor() {
    this.factCategories = ['character', 'location', 'event', 'detail'];
  }

  // Add a new fact to the story state
  addFact(story, category, fact, source = 'narrative') {
    if (!story.storyState) {
      story.storyState = {
        establishedFacts: [],
        activeCharacters: [],
        currentLocation: { name: '', description: '', atmosphere: '' }
      };
    }

    // Check if this fact already exists to avoid duplicates
    const existingFact = story.storyState.establishedFacts.find(
      f => f.category === category && f.fact.toLowerCase() === fact.toLowerCase()
    );

    if (!existingFact) {
      story.storyState.establishedFacts.push({
        category,
        fact,
        source,
        timestamp: new Date()
      });
    }
  }

  // Add or update character information
  updateCharacter(story, name, relationship = '', status = 'alive', details = '') {
    if (!story.storyState) {
      story.storyState = {
        establishedFacts: [],
        activeCharacters: [],
        currentLocation: { name: '', description: '', atmosphere: '' }
      };
    }

    const existingChar = story.storyState.activeCharacters.find(c => c.name.toLowerCase() === name.toLowerCase());

    if (existingChar) {
      // Update existing character
      existingChar.relationship = relationship || existingChar.relationship;
      existingChar.status = status || existingChar.status;
      existingChar.details = details || existingChar.details;
    } else {
      // Add new character
      story.storyState.activeCharacters.push({
        name,
        relationship,
        status,
        details
      });
    }
  }

  // Update current location
  updateLocation(story, name, description = '', atmosphere = '') {
    if (!story.storyState) {
      story.storyState = {
        establishedFacts: [],
        activeCharacters: [],
        currentLocation: { name: '', description: '', atmosphere: '' }
      };
    }

    story.storyState.currentLocation = {
      name: name || story.storyState.currentLocation.name,
      description: description || story.storyState.currentLocation.description,
      atmosphere: atmosphere || story.storyState.currentLocation.atmosphere
    };
  }

  // Get all established facts for a category
  getFactsByCategory(story, category) {
    if (!story.storyState?.establishedFacts) return [];
    return story.storyState.establishedFacts.filter(f => f.category === category);
  }

  // Get all character information
  getCharacters(story) {
    if (!story.storyState?.activeCharacters) return [];
    return story.storyState.activeCharacters;
  }

  // Get current location
  getCurrentLocation(story) {
    if (!story.storyState?.currentLocation) return { name: '', description: '', atmosphere: '' };
    return story.storyState.currentLocation;
  }

  // Check if a fact contradicts established facts
  checkContradiction(story, category, fact) {
    if (!story.storyState?.establishedFacts) return false;

    const existingFacts = story.storyState.establishedFacts.filter(f => f.category === category);

    // Simple contradiction check - could be enhanced with NLP
    const factLower = fact.toLowerCase();
    return existingFacts.some(existing => {
      const existingLower = existing.fact.toLowerCase();
      return factLower.includes(existingLower) || existingLower.includes(factLower);
    });
  }

  // Get story state summary for AI context
  getStoryStateSummary(story) {
    if (!story.storyState) return '';

    const facts = story.storyState.establishedFacts.map(f => `${f.category}: ${f.fact}`).join('\n');
    const characters = story.storyState.activeCharacters.map(c =>
      `${c.name} (${c.relationship}, ${c.status}): ${c.details}`
    ).join('\n');
    const location = story.storyState.currentLocation;

    return `ESTABLISHED FACTS:
${facts}

CHARACTERS:
${characters}

CURRENT LOCATION: ${location.name}
${location.description}
${location.atmosphere}`;
  }
}

module.exports = new StoryStateService();