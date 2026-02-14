// packages/api/src/services/aiTaskDetector.js
/**
 * Task Detection Service
 *
 * Detects task type from user prompts using keyword matching.
 * Phase 2A: Simple keyword-based detection
 * Phase 2B+: ML-based classification with confidence scores
 */

class TaskDetector {
  constructor() {
    this.keywords = {
      code: [
        'code', 'function', 'debug', 'implement', 'refactor', 'bug',
        'syntax', 'error', 'compile', 'programming', 'algorithm',
        'class', 'method', 'variable', 'loop', 'condition'
      ],
      reasoning: [
        'analyze', 'reason', 'explain why', 'compare', 'evaluate',
        'logic', 'argument', 'proof', 'deduce', 'infer',
        'therefore', 'because', 'conclusion', 'premise'
      ],
      creative: [
        'write', 'story', 'poem', 'creative', 'imagine',
        'invent', 'design', 'brainstorm', 'generate idea',
        'fiction', 'narrative', 'character', 'plot'
      ],
      lookup: [
        'what is', 'define', 'lookup', 'find', 'search',
        'who is', 'when did', 'where is', 'list', 'show me',
        'information about', 'tell me about', 'fact'
      ],
      contextual: [
        'continue', 'remember', 'based on previous', 'earlier',
        'you said', 'we discussed', 'go back to', 'from before',
        'in our conversation', 'as mentioned'
      ],
      analysis: [
        'analyze', 'examine', 'review', 'assess', 'study',
        'investigate', 'research', 'critique', 'interpret',
        'summarize', 'synthesize'
      ]
    };
  }

  /**
   * Detect task type from prompt
   * @param {string} prompt - User prompt
   * @returns {string} - Task type (code, reasoning, creative, lookup, contextual, analysis, general)
   */
  detectTask(prompt) {
    if (!prompt || typeof prompt !== 'string') {
      return 'general';
    }

    const lower = prompt.toLowerCase();
    const scores = {};

    // Count keyword matches for each task type
    for (const [task, keywords] of Object.entries(this.keywords)) {
      scores[task] = keywords.filter(kw => lower.includes(kw)).length;
    }

    // Find task with highest score
    const maxScore = Math.max(...Object.values(scores));

    if (maxScore === 0) {
      return 'general';
    }

    // Return task type with highest score
    const detectedTask = Object.entries(scores)
      .find(([_, score]) => score === maxScore)?.[0] || 'general';

    return detectedTask;
  }

  /**
   * Get confidence score for detected task
   * Phase 2B: Implement ML-based confidence scoring
   * @param {string} prompt - User prompt
   * @param {string} detectedTask - Detected task type
   * @returns {number} - Confidence score (0-1)
   */
  getConfidence(prompt, detectedTask) {
    // Stub for Phase 2B
    // For now, return 1.0 for keyword matches, 0.5 for general
    return detectedTask === 'general' ? 0.5 : 1.0;
  }

  /**
   * Get all task scores for debugging
   * @param {string} prompt - User prompt
   * @returns {object} - Object with task scores
   */
  getAllScores(prompt) {
    if (!prompt || typeof prompt !== 'string') {
      return { general: 1 };
    }

    const lower = prompt.toLowerCase();
    const scores = {};

    for (const [task, keywords] of Object.entries(this.keywords)) {
      scores[task] = keywords.filter(kw => lower.includes(kw)).length;
    }

    return scores;
  }
}

export default TaskDetector;
