class StoryStateService {
  constructor() {
    this.factCategories = ['character', 'location', 'event', 'detail'];
  }

  addFact(story, category, fact, source = 'narrative') {
    if (!story.storyState) {
      story.storyState = {
        establishedFacts: [],
        activeCharacters: [],
        currentLocation: { name: '', description: '', atmosphere: '' }
      };
    }
    const existingFact = story.storyState.establishedFacts.find(
      f => f.category === category && f.fact.toLowerCase() === fact.toLowerCase()
    );
    if (!existingFact) {
      story.storyState.establishedFacts.push({ category, fact, source, timestamp: new Date() });
    }
  }

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
      existingChar.relationship = relationship || existingChar.relationship;
      existingChar.status = status || existingChar.status;
      existingChar.details = details || existingChar.details;
    } else {
      story.storyState.activeCharacters.push({ name, relationship, status, details });
    }
  }

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

  getFactsByCategory(story, category) {
    if (!story.storyState?.establishedFacts) return [];
    return story.storyState.establishedFacts.filter(f => f.category === category);
  }

  getCharacters(story) {
    if (!story.storyState?.activeCharacters) return [];
    return story.storyState.activeCharacters;
  }

  getCurrentLocation(story) {
    if (!story.storyState?.currentLocation) return { name: '', description: '', atmosphere: '' };
    return story.storyState.currentLocation;
  }

  checkContradiction(story, category, fact) {
    if (!story.storyState?.establishedFacts) return false;
    const existingFacts = story.storyState.establishedFacts.filter(f => f.category === category);
    const factLower = fact.toLowerCase();
    return existingFacts.some(existing => {
      const existingLower = existing.fact.toLowerCase();
      return factLower.includes(existingLower) || existingLower.includes(factLower);
    });
  }

  getStoryStateSummary(story) {
    if (!story.storyState) return '';
    const facts = story.storyState.establishedFacts.map(f => `${f.category}: ${f.fact}`).join('\n');
    const characters = story.storyState.activeCharacters.map(c =>
      `${c.name} (${c.relationship}, ${c.status}): ${c.details}`
    ).join('\n');
    const location = story.storyState.currentLocation;
    return `ESTABLISHED FACTS:\n${facts}\n\nCHARACTERS:\n${characters}\n\nCURRENT LOCATION: ${location.name}\n${location.description}\n${location.atmosphere}`;
  }
}

export default new StoryStateService();
