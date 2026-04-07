import Character from '../models/Character.js';

class CharacterService {
  constructor() {
    this.characterPatterns = [
      /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g,
      /(?:the|a|an)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
      /(?:said|asked|replied|whispered|shouted)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g
    ];
  }

  extractCharacters(text, storyId) {
    const characters = [];
    const seenNames = new Set();

    this.characterPatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      matches.forEach(match => {
        let name = match.replace(/^(the|a|an)\s+/i, '').trim();
        if (name.length < 2 || this.isCommonWord(name)) return;
        if (seenNames.has(name.toLowerCase())) return;
        seenNames.add(name.toLowerCase());
        const context = this.extractContext(text, name);
        characters.push({
          name,
          description: this.generateDescription(context),
          personality: this.extractPersonality(context),
          background: this.extractBackground(context),
          currentState: this.extractCurrentState(context),
          isActive: true,
          storyId
        });
      });
    });

    return characters;
  }

  extractContext(text, characterName) {
    const sentences = text.split(/[.!?]+/);
    return sentences.filter(s => s.toLowerCase().includes(characterName.toLowerCase())).join('. ');
  }

  generateDescription(context) {
    const descriptions = context.match(/(?:was|is|looked|appeared|seemed)\s+([^.!?]+)/gi) || [];
    if (descriptions.length > 0) return descriptions[0].replace(/^(was|is|looked|appeared|seemed)\s+/i, '').trim();
    return 'A character mentioned in the story';
  }

  extractPersonality(context) {
    const keywords = ['brave', 'cowardly', 'wise', 'foolish', 'kind', 'cruel', 'honest', 'deceitful', 'calm', 'angry', 'friendly', 'hostile'];
    return keywords.filter(t => context.toLowerCase().includes(t)).join(', ');
  }

  extractBackground(context) {
    const phrases = context.match(/(?:from|born|raised|worked|lived)\s+([^.!?]+)/gi) || [];
    return phrases.length > 0 ? phrases[0].trim() : '';
  }

  extractCurrentState(context) {
    const phrases = context.match(/(?:currently|now|presently)\s+([^.!?]+)/gi) || [];
    return phrases.length > 0 ? phrases[0].trim() : '';
  }

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

  async saveCharacters(storyId, characters) {
    try {
      for (const characterData of characters) {
        const existingCharacter = await Character.findOne({
          storyId,
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

  async getCharacterContext(storyId) {
    try {
      const characters = await Character.find({ storyId, isActive: true });
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

  async getCharacterInfo(storyId, characterName) {
    try {
      return await Character.findOne({
        storyId,
        name: { $regex: new RegExp(characterName, 'i') }
      });
    } catch (error) {
      console.error('Error getting character info:', error);
      return null;
    }
  }

  formatCharacterContext(characters) {
    if (!characters || characters.length === 0) return 'CHARACTERS: None known yet';
    return `CHARACTERS:\n${characters.map(char =>
      `- ${char.name}: ${char.description}${char.personality ? ` (${char.personality})` : ''}${char.currentState ? ` - ${char.currentState}` : ''}`
    ).join('\n')}`;
  }
}

export default new CharacterService();
