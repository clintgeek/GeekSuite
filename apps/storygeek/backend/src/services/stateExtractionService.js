/**
 * stateExtractionService — turns a turn's narration into structured,
 * PROPOSED state changes. Proposals are validated by canonValidationService
 * and committed by stateCommitService; nothing here touches canon directly.
 *
 * Uses a cheap auxiliary model (not the pinned GM model) since this is a
 * mechanical extraction task, not creative narration.
 */
import aiService from './aiService.js';

const EXTRACTION_INSTRUCTIONS = `You are the STATE SCRIBE for a fantasy RPG engine. You read one turn of game narration and record what OBJECTIVELY CHANGED in the game world. You are not a storyteller — you are a meticulous record keeper.

Respond with ONLY a JSON object (no markdown fences, no commentary) with this exact shape. Omit empty arrays. Use empty object {} if nothing changed:

{
  "newFacts": [{ "fact": "concise objective statement", "category": "character|location|event|detail", "subjects": ["EntityName"], "visibility": "public|secret" }],
  "retiredFacts": [{ "factId": "fact_id_from_context", "reason": "in-story event that superseded it" }],
  "newCharacters": [{ "name": "", "description": "", "personality": "", "motivation": "", "locationName": "" }],
  "characterUpdates": [{ "name": "", "status": "alive|dead|missing|unknown", "isRevival": false, "locationName": "", "currentState": "one-line condition", "motivation": "" }],
  "newLocations": [{ "name": "", "description": "", "type": "city|forest|dungeon|castle|village|wilderness|shop|tavern|temple|other" }],
  "locationUpdates": [{ "name": "", "state": "intact|damaged|destroyed|altered", "isRebuild": false, "stateNotes": "what changed physically" }],
  "newThreads": [{ "name": "short handle", "description": "", "type": "quest|promise|debt|secret|hunt|consequence|other", "characterNames": [""] }],
  "threadUpdates": [{ "name": "existing thread name", "status": "active|resolved|abandoned", "resolution": "", "progressNote": "" }],
  "knowledgeGrants": [{ "characterName": "", "factId": "existing id OR omit", "factText": "text if fact is new this turn", "learnedVia": "witnessed|told|inference", "learnedFrom": "who told them (if told)" }],
  "relationshipUpdates": [{ "name": "", "otherName": "", "relationshipType": "friend|enemy|lover|family|mentor|student|rival|neutral", "description": "" }],
  "sceneUpdate": { "locationName": "where the player now is", "situation": "one-sentence current situation", "mood": "dark|hopeful|tense|peaceful|mysterious|chaotic|neutral", "timeOfDay": "dawn|morning|afternoon|evening|night|midnight", "weather": "stormy|clear|foggy|windy|calm|rainy" },
  "playerCharacter": { "name": "", "description": "" }
}

RULES:
- Record only what ACTUALLY HAPPENED in this turn's narration. Never invent.
- A fact is something durable and checkable ("The north gate of Millhaven was destroyed by the ogre"), not a mood or a vibe.
- knowledgeGrants: every character who learned something this turn, and HOW. A character present in the scene "witnessed"; one who was told gets "told" + learnedFrom. If nobody learned anything, omit.
- If a character died, that is a characterUpdate with status "dead" AND usually a newFact.
- If narration contradicts an established fact from the context, do NOT retire the old fact unless an in-story event genuinely changed it. Prefer recording nothing over papering over a contradiction.
- threadUpdates only for threads listed in the context. New obligations/promises/quests are newThreads.
- sceneUpdate is required whenever the player's location or situation changed; otherwise include just the "situation" field.
- playerCharacter: ONLY when this turn establishes the identity of the player's own character (name/identity revealed) and the context shows no PLAYER CHARACTER yet. Never use it for NPCs.
- Keep every string under 200 characters.`;

class StateExtractionService {
  /**
   * Extract proposed changes for one completed turn.
   * @param {object} story - the story document
   * @param {string} playerInput
   * @param {string} narration - the GM's narration for this turn
   * @param {object} turnContext - { presentCharacterNames, liveFactsBlock, activeThreadsBlock }
   * @param {string|null} userToken
   * @returns {object|null} proposal, or null if extraction failed (never throws)
   */
  async extractChanges(story, playerInput, narration, turnContext, userToken = null) {
    try {
      const prompt = this.buildExtractionPrompt(story, playerInput, narration, turnContext);
      const response = await aiService.callAuxAI(prompt, {
        maxTokens: 1500,
        temperature: 0.1 // extraction wants determinism, not creativity
      }, userToken);
      return this.parseProposal(response);
    } catch (error) {
      // Extraction must never break the player's turn. A missed extraction
      // means one turn of changes goes unrecorded — recoverable. A failed
      // turn is not.
      console.error('State extraction failed (turn continues):', error.message);
      return null;
    }
  }

  buildExtractionPrompt(story, playerInput, narration, turnContext = {}) {
    const {
      presentCharacterNames = [],
      liveFactsBlock = '',
      activeThreadsBlock = ''
    } = turnContext;

    return `${EXTRACTION_INSTRUCTIONS}

=== CURRENT CANON (for reference — ids are stable) ===
CHARACTERS PRESENT IN SCENE: ${presentCharacterNames.join(', ') || 'unknown'}
PLAYER CHARACTER: ${(story.characters || []).find(c => c.isPlayer)?.name || 'the player'}
CURRENT LOCATION: ${story.worldState?.currentLocationName || 'unknown'}

ESTABLISHED FACTS:
${liveFactsBlock || '(none yet)'}

ACTIVE THREADS:
${activeThreadsBlock || '(none yet)'}

KNOWN CHARACTERS: ${(story.characters || []).map(c => `${c.name}${c.status !== 'alive' ? ` (${c.status})` : ''}`).join(', ') || '(none)'}
KNOWN LOCATIONS: ${(story.locations || []).map(l => `${l.name}${l.state !== 'intact' ? ` (${l.state})` : ''}`).join(', ') || '(none)'}

=== THIS TURN ===
PLAYER ACTION:
${playerInput}

GM NARRATION:
${narration}

JSON:`;
  }

  /**
   * Lenient JSON parse — models wrap JSON in fences or add stray text.
   * Returns null rather than throwing on garbage.
   */
  parseProposal(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let text = raw.trim();

    // Strip markdown fences
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

    // Isolate the outermost JSON object
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    text = text.slice(start, end + 1);

    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
      return this.sanitizeProposal(parsed);
    } catch {
      // One repair attempt: trailing commas are the most common failure
      try {
        const repaired = text.replace(/,\s*([}\]])/g, '$1');
        const parsed = JSON.parse(repaired);
        return this.sanitizeProposal(parsed);
      } catch {
        console.warn('State extraction returned unparseable JSON');
        return null;
      }
    }
  }

  /** Coerce shape: arrays where arrays are expected, drop unknown keys. */
  sanitizeProposal(p) {
    const arr = (v) => (Array.isArray(v) ? v : []);
    return {
      newFacts: arr(p.newFacts),
      retiredFacts: arr(p.retiredFacts),
      newCharacters: arr(p.newCharacters),
      characterUpdates: arr(p.characterUpdates),
      newLocations: arr(p.newLocations),
      locationUpdates: arr(p.locationUpdates),
      newThreads: arr(p.newThreads),
      threadUpdates: arr(p.threadUpdates),
      knowledgeGrants: arr(p.knowledgeGrants),
      relationshipUpdates: arr(p.relationshipUpdates),
      sceneUpdate: (p.sceneUpdate && typeof p.sceneUpdate === 'object' && !Array.isArray(p.sceneUpdate))
        ? p.sceneUpdate
        : null,
      playerCharacter: (p.playerCharacter && typeof p.playerCharacter === 'object' && p.playerCharacter.name)
        ? p.playerCharacter
        : null
    };
  }
}

export default new StateExtractionService();
