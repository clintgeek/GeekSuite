const Character = require('../models/Character');

class CharacterService {
  constructor() {
    this.characterPatterns = [
      // Named characters (capitalized words that appear multiple times)
      /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g,
      // Titles + names
      /(?:the|a|an)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
      // Direct references
      /(?:said|asked|replied|whispered|shouted)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g
    ];
  }

  // Extract characters from text
  extractCharacters(text, storyId) {
    const characters = [];
    const seenNames = new Set();

    this.characterPatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      matches.forEach(match => {
        // Clean up the match
        let name = match.replace(/^(the|a|an)\s+/i, '').trim();

        // Skip if it's too short or common words
        if (name.length < 2 || this.isCommonWord(name)) {
          return;
        }

        // Skip if we've already seen this name
        if (seenNames.has(name.toLowerCase())) {
          return;
        }

        seenNames.add(name.toLowerCase());

        // Extract context around the character mention
        const context = this.extractContext(text, name);

        characters.push({
          name: name,
          description: this.generateDescription(context),
          personality: this.extractPersonality(context),
          background: this.extractBackground(context),
          currentState: this.extractCurrentState(context),
          isActive: true,
          storyId: storyId
        });
      });
    });

    return characters;
  }

  // Extract context around character mention
  extractContext(text, characterName) {
    const sentences = text.split(/[.!?]+/);
    const relevantSentences = sentences.filter(sentence =>
      sentence.toLowerCase().includes(characterName.toLowerCase())
    );
    return relevantSentences.join('. ');
  }

  // Generate description from context
  generateDescription(context) {
    // Look for descriptive phrases
    const descriptions = context.match(/(?:was|is|looked|appeared|seemed)\s+([^.!?]+)/gi) || [];
    if (descriptions.length > 0) {
      return descriptions[0].replace(/^(was|is|looked|appeared|seemed)\s+/i, '').trim();
    }
    return 'A character mentioned in the story';
  }

  // Extract personality traits
  extractPersonality(context) {
    const personalityKeywords = ['brave', 'cowardly', 'wise', 'foolish', 'kind', 'cruel', 'honest', 'deceitful', 'calm', 'angry', 'friendly', 'hostile'];
    const foundTraits = personalityKeywords.filter(trait =>
      context.toLowerCase().includes(trait)
    );
    return foundTraits.length > 0 ? foundTraits.join(', ') : '';
  }

  // Extract background information
  extractBackground(context) {
    const backgroundPhrases = context.match(/(?:from|born|raised|worked|lived)\s+([^.!?]+)/gi) || [];
    if (backgroundPhrases.length > 0) {
      return backgroundPhrases[0].trim();
    }
    return '';
  }

  // Extract current state
  extractCurrentState(context) {
    const statePhrases = context.match(/(?:currently|now|presently)\s+([^.!?]+)/gi) || [];
    if (statePhrases.length > 0) {
      return statePhrases[0].trim();
    }
    return '';
  }

  // Check if word is too common to be a character name
  isCommonWord(word) {
    const commonWords = [
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'you', 'your', 'yours', 'yourself', 'yourselves',
      'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
      'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
      'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
      'this', 'that', 'these', 'those', 'who', 'whom', 'whose', 'which', 'what',
      'where', 'when', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more',
      'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
      'so', 'than', 'too', 'very', 'can', 'will', 'just', 'should', 'now'
    ];
    return commonWords.includes(word.toLowerCase());
  }

  // Save characters to story
  async saveCharacters(storyId, characters) {
    try {
      for (const characterData of characters) {
        // Check if character already exists
        const existingCharacter = await Character.findOne({
          storyId: storyId,
          name: { $regex: new RegExp(`^${characterData.name}$`, 'i') }
        });

        if (!existingCharacter) {
          const character = new Character(characterData);
          await character.save();
          console.log(`Saved new character: ${characterData.name}`);
        }
      }
    } catch (error) {
      console.error('Error saving characters:', error);
    }
  }

  // Get character context for AI
  async getCharacterContext(storyId) {
    try {
      const characters = await Character.find({ storyId: storyId, isActive: true });
      return characters.map(char => ({
        name: char.name,
        description: char.description,
        personality: char.personality,
        background: char.background,
        currentState: char.currentState,
        isActive: char.isActive
      }));
    } catch (error) {
      console.error('Error getting character context:', error);
      return [];
    }
  }

  // Get character info for /char command
  async getCharacterInfo(storyId, characterName) {
    try {
      const character = await Character.findOne({
        storyId: storyId,
        name: { $regex: new RegExp(characterName, 'i') }
      });
      return character;
    } catch (error) {
      console.error('Error getting character info:', error);
      return null;
    }
  }

  // Format character context for AI prompt
  formatCharacterContext(characters) {
    if (!characters || characters.length === 0) {
      return 'CHARACTERS: None known yet';
    }

    return `CHARACTERS:\n${characters.map(char =>
      `- ${char.name}: ${char.description}${char.personality ? ` (${char.personality})` : ''}${char.currentState ? ` - ${char.currentState}` : ''}`
    ).join('\n')}`;
  }
}

module.exports = new CharacterService();