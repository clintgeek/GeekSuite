const StoryTag = require('../models/StoryTag');

class TagService {
  // Extract tags from text using simple NLP
  extractTags(text, storyId, source = 'narrative') {
    const tags = [];

    // Extract character names (capitalized words that appear multiple times)
    const characterMatches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    characterMatches.forEach(name => {
      if (name.length > 2 && !this.isCommonWord(name)) {
        tags.push({
          tag: 'character',
          value: name,
          category: 'character',
          source: source,
          context: `Mentioned in: ${text.substring(0, 100)}...`,
          relevance: 'high'
        });
      }
    });

    // Extract locations (words after "in", "at", "to", "from")
    const locationPatterns = [
      /(?:in|at|to|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
      /(?:the|a)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g
    ];

    locationPatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      matches.forEach(match => {
        const location = match.replace(/(?:in|at|to|from|the|a)\s+/i, '').trim();
        if (location.length > 2 && !this.isCommonWord(location)) {
          tags.push({
            tag: 'location',
            value: location,
            category: 'location',
            source: source,
            context: `Mentioned in: ${text.substring(0, 100)}...`,
            relevance: 'medium'
          });
        }
      });
    });

    // Extract items (words after "the", "a", "an" that could be objects)
    const itemPatterns = [
      /(?:the|a|an)\s+([a-z]+(?:\s+[a-z]+)*)/g,
      /(?:found|saw|picked up|grabbed)\s+([a-z]+(?:\s+[a-z]+)*)/g
    ];

    itemPatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      matches.forEach(match => {
        const item = match.replace(/(?:the|a|an|found|saw|picked up|grabbed)\s+/i, '').trim();
        if (item.length > 2 && this.isItemWord(item)) {
          tags.push({
            tag: 'item',
            value: item,
            category: 'item',
            source: source,
            context: `Mentioned in: ${text.substring(0, 100)}...`,
            relevance: 'medium'
          });
        }
      });
    });

    // Extract events (action words)
    const eventWords = ['explosion', 'fight', 'meeting', 'journey', 'discovery', 'attack', 'escape', 'arrival', 'departure'];
    eventWords.forEach(event => {
      if (text.toLowerCase().includes(event)) {
        tags.push({
          tag: 'event',
          value: event,
          category: 'event',
          source: source,
          context: `Mentioned in: ${text.substring(0, 100)}...`,
          relevance: 'high'
        });
      }
    });

    // Extract concepts (abstract ideas)
    const conceptWords = ['survival', 'hope', 'fear', 'trust', 'betrayal', 'loyalty', 'power', 'freedom', 'justice'];
    conceptWords.forEach(concept => {
      if (text.toLowerCase().includes(concept)) {
        tags.push({
          tag: 'concept',
          value: concept,
          category: 'concept',
          source: source,
          context: `Mentioned in: ${text.substring(0, 100)}...`,
          relevance: 'medium'
        });
      }
    });

    return tags;
  }

  // Check if a word is a common word (not a proper noun)
  isCommonWord(word) {
    const commonWords = [
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must', 'shall'
    ];
    return commonWords.includes(word.toLowerCase());
  }

  // Check if a word could be an item
  isItemWord(word) {
    const itemWords = [
      'weapon', 'gun', 'knife', 'sword', 'shield', 'armor', 'food', 'water', 'medicine',
      'tool', 'key', 'map', 'book', 'note', 'letter', 'money', 'gold', 'silver',
      'backpack', 'bag', 'container', 'box', 'chest', 'door', 'window', 'wall'
    ];
    return itemWords.some(item => word.toLowerCase().includes(item));
  }

  // Save tags to database
  async saveTags(storyId, tags) {
    try {
      for (const tagData of tags) {
        const existingTag = await StoryTag.findOne({
          storyId: storyId,
          tag: tagData.tag,
          value: tagData.value,
          category: tagData.category
        });

        if (existingTag) {
          // Update existing tag
          existingTag.mentionCount++;
          existingTag.lastMentioned = new Date();
          if (tagData.relevance === 'high') {
            existingTag.relevance = 'high';
          }
          await existingTag.save();
        } else {
          // Create new tag
          const newTag = new StoryTag({
            storyId: storyId,
            ...tagData
          });
          await newTag.save();
        }
      }
    } catch (error) {
      console.error('Error saving tags:', error);
    }
  }

  // Query tags for context
  async queryTags(storyId, query, category = null, limit = 10) {
    try {
      let searchQuery = { storyId: storyId };

      if (category) {
        searchQuery.category = category;
      }

      if (query) {
        searchQuery.$or = [
          { value: { $regex: query, $options: 'i' } },
          { searchText: { $regex: query, $options: 'i' } },
          { keywords: { $in: [new RegExp(query, 'i')] } }
        ];
      }

      const tags = await StoryTag.find(searchQuery)
        .sort({ relevance: -1, mentionCount: -1, lastMentioned: -1 })
        .limit(limit);

      return tags;
    } catch (error) {
      console.error('Error querying tags:', error);
      return [];
    }
  }

  // Get relevant context for AI
  async getRelevantContext(storyId, currentSituation, limit = 15) {
    try {
      // Extract keywords from current situation
      const keywords = this.extractKeywords(currentSituation);

      // Query tags that might be relevant
      const relevantTags = [];

      for (const keyword of keywords) {
        const tags = await this.queryTags(storyId, keyword, null, 5);
        relevantTags.push(...tags);
      }

      // Remove duplicates and sort by relevance
      const uniqueTags = this.removeDuplicateTags(relevantTags);
      const sortedTags = uniqueTags.sort((a, b) => {
        if (a.relevance === b.relevance) {
          return b.mentionCount - a.mentionCount;
        }
        return a.relevance === 'high' ? -1 : 1;
      });

      return sortedTags.slice(0, limit);
    } catch (error) {
      console.error('Error getting relevant context:', error);
      return [];
    }
  }

  // Extract keywords from text
  extractKeywords(text) {
    const words = text.toLowerCase().split(/\s+/);
    return words.filter(word =>
      word.length > 3 &&
      !this.isCommonWord(word) &&
      !word.match(/^[0-9]+$/)
    );
  }

  // Remove duplicate tags
  removeDuplicateTags(tags) {
    const seen = new Set();
    return tags.filter(tag => {
      const key = `${tag.category}:${tag.value}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  // Format tags for AI context
  formatTagsForContext(tags) {
    if (!tags || tags.length === 0) {
      return '';
    }

    const grouped = tags.reduce((acc, tag) => {
      if (!acc[tag.category]) {
        acc[tag.category] = [];
      }
      acc[tag.category].push(tag);
      return acc;
    }, {});

    const sections = [];
    for (const [category, categoryTags] of Object.entries(grouped)) {
      const tagList = categoryTags.map(tag => `${tag.value} (${tag.relevance})`).join(', ');
      sections.push(`${category.toUpperCase()}: ${tagList}`);
    }

    return `RELEVANT CONTEXT:\n${sections.join('\n')}`;
  }
}

module.exports = new TagService();