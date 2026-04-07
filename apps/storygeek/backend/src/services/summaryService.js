import aiService from './aiService.js';

class SummaryService {
  constructor() {
    this.summaryInterval = 5;
    this.maxSummaries = 10;
  }

  shouldGenerateSummary(story) {
    return story.events.length % this.summaryInterval === 0;
  }

  async generateSummary(story) {
    try {
      const lastSummary = story.storySummaries.length > 0
        ? story.storySummaries[story.storySummaries.length - 1]
        : null;
      const startIndex = lastSummary ? lastSummary.eventCount : 0;
      const recentEvents = story.events.slice(startIndex);
      if (recentEvents.length === 0) return null;

      const summaryPrompt = `STORY SUMMARY REQUEST

Story: ${story.title} (${story.genre})
Current Situation: ${story.worldState.currentSituation}

Recent Events to Summarize:
${recentEvents.map((event, index) => `${index + 1}. ${event.type}: ${event.description}`).join('\n')}

Please create a concise summary (2-3 paragraphs) of these recent events and extract important keywords.

RESPONSE FORMAT:
SUMMARY:
[2-3 paragraph summary of recent events]

KEYWORDS:
Characters: [list of character names mentioned]
Locations: [list of location names mentioned]
Items: [list of important items mentioned]
Concepts: [list of important concepts/themes]
Events: [list of key events that occurred]

IMPORTANT DETAILS:
- [Character/Location/Item/Concept/Event]: [Brief description] (relevance: high/medium/low)

Keep the summary focused on what's most relevant for future story development.`;

      const aiResponse = await aiService.generateSummaryResponse(summaryPrompt);
      const parsed = this.parseSummaryResponse(aiResponse.content);
      return {
        summary: parsed.summary,
        keywords: parsed.keywords,
        importantDetails: parsed.importantDetails,
        timestamp: new Date(),
        eventCount: story.events.length
      };
    } catch (error) {
      console.error('Error generating summary:', error);
      return null;
    }
  }

  parseSummaryResponse(aiResponse) {
    const lines = aiResponse.split('\n');
    let summary = '';
    let keywords = { characters: [], locations: [], items: [], concepts: [], events: [] };
    let importantDetails = [];
    let currentSection = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('SUMMARY:')) { currentSection = 'summary'; continue; }
      else if (trimmed.startsWith('KEYWORDS:')) { currentSection = 'keywords'; continue; }
      else if (trimmed.startsWith('IMPORTANT DETAILS:')) { currentSection = 'details'; continue; }

      if (currentSection === 'summary' && trimmed) {
        summary += trimmed + ' ';
      } else if (currentSection === 'keywords' && trimmed) {
        if (trimmed.startsWith('Characters:')) keywords.characters = this.extractKeywords(trimmed);
        else if (trimmed.startsWith('Locations:')) keywords.locations = this.extractKeywords(trimmed);
        else if (trimmed.startsWith('Items:')) keywords.items = this.extractKeywords(trimmed);
        else if (trimmed.startsWith('Concepts:')) keywords.concepts = this.extractKeywords(trimmed);
        else if (trimmed.startsWith('Events:')) keywords.events = this.extractKeywords(trimmed);
      } else if (currentSection === 'details' && trimmed.startsWith('-')) {
        const detail = this.parseImportantDetail(trimmed);
        if (detail) importantDetails.push(detail);
      }
    }
    return { summary: summary.trim(), keywords, importantDetails };
  }

  extractKeywords(line) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return [];
    return line.substring(colonIndex + 1).trim().split(',').map(k => k.trim()).filter(k => k.length > 0);
  }

  parseImportantDetail(line) {
    const match = line.match(/^- \[([^\]]+)\]: ([^-]+) - ([^(]+) \(relevance: ([^)]+)\)/);
    if (match) {
      return { type: match[1].toLowerCase(), name: match[2].trim(), description: match[3].trim(), relevance: match[4].toLowerCase() };
    }
    return null;
  }

  async getRelevantContext(story, currentSituation) {
    const relevantSummaries = [];
    const relevantDetails = [];

    for (const summary of story.storySummaries) {
      const situationKeywords = this.extractKeywordsFromText(currentSituation);
      for (const keyword of situationKeywords) {
        if (summary.keywords.characters.includes(keyword) ||
            summary.keywords.locations.includes(keyword) ||
            summary.keywords.items.includes(keyword) ||
            summary.keywords.concepts.includes(keyword)) {
          relevantSummaries.push(summary);
          break;
        }
      }
      for (const detail of summary.importantDetails) {
        if (detail.relevance === 'high' ||
            situationKeywords.some(k => detail.name.toLowerCase().includes(k.toLowerCase()))) {
          relevantDetails.push(detail);
        }
      }
    }

    return {
      relevantSummaries: relevantSummaries.slice(-3),
      relevantDetails: relevantDetails.slice(-5)
    };
  }

  extractKeywordsFromText(text) {
    return text.toLowerCase().split(/\s+/).filter(word => word.length > 3);
  }

  cleanupOldSummaries(story) {
    if (story.storySummaries.length > this.maxSummaries) {
      story.storySummaries = story.storySummaries.slice(-this.maxSummaries);
    }
  }
}

export default new SummaryService();
