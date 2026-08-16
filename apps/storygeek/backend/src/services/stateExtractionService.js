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
  "newFacts": [{ "fact": "concise objective statement", "category": "character|location|event|detail", "subjects": ["EntityName"], "visibility": "public|secret", "origin": "player|narrator" }],
  "retiredFacts": [{ "factId": "fact_id_from_context", "reason": "in-story event that superseded it" }],
  "newCharacters": [{ "name": "", "description": "", "personality": "", "motivation": "", "locationName": "" }],
  "characterUpdates": [{ "name": "", "status": "alive|dead|missing|unknown", "isRevival": false, "locationName": "", "currentState": "one-line condition", "motivation": "" }],
  "newLocations": [{ "name": "", "description": "", "type": "city|forest|dungeon|castle|village|wilderness|shop|tavern|temple|other" }],
  "locationUpdates": [{ "name": "", "state": "intact|damaged|destroyed|altered", "isRebuild": false, "stateNotes": "what changed physically" }],
  "newThreads": [{ "name": "short handle", "description": "", "type": "quest|promise|debt|secret|hunt|consequence|other", "characterNames": [""] }],
  "threadUpdates": [{ "name": "existing thread name", "status": "active|resolved|abandoned", "resolution": "", "progressNote": "" }],
  "knowledgeGrants": [{ "characterName": "", "factId": "existing id OR omit", "factText": "text if fact is new this turn", "learnedVia": "witnessed|told|inference", "learnedFrom": "who told them (if told)" }],
  "relationshipUpdates": [{ "name": "", "otherName": "", "relationshipType": "friend|enemy|lover|family|mentor|student|rival|neutral", "description": "" }],
  "sceneUpdate": { "locationName": "where the player now is", "situation": "one-sentence current situation", "mood": "dark|hopeful|tense|peaceful|mysterious|chaotic|neutral", "timeOfDay": "dawn|morning|afternoon|evening|night|midnight", "weather": "stormy|clear|foggy|windy|calm|rainy", "timeAdvance": "none|hours|halfday|day|days" },
  "playerCharacter": { "name": "", "description": "" }
}

RULES:
- Record only what ACTUALLY HAPPENED in this turn's narration. Never invent.
- A fact is something durable and checkable ("The north gate of Millhaven was destroyed by the ogre"), not a mood or a vibe.
- PROVENANCE: every newFact gets an "origin". "player" = the player's action established or asserted it ("I drive Jim's 4x4 up the trail" → the truck is a 4x4). "narrator" = the GM narration introduced it. When both touch it, the one that FIRST asserted the substance wins.
- EMBELLISHMENT vs FACT: vivid sensory description (colors, smells, textures, lighting, weather flourishes) is NOT a fact — do not record it. Record a descriptive detail ONLY if (a) the player directly asked about or interacted with that specific detail this turn, or (b) it is plot-relevant (a wound, a missing item, a mark that identifies someone). "The headlights cast eerie shadows" is prose, not canon. "The truck is a 4x4" is canon.
- NO RESTATING: if the substance of a fact already appears in ESTABLISHED FACTS, do not record it again — not even reworded or with extra adjectives. Only record what is genuinely NEW this turn.
- knowledgeGrants: every character who learned something this turn, and HOW. A character present in the scene "witnessed"; one who was told gets "told" + learnedFrom. If nobody learned anything, omit.
- If a character died, that is a characterUpdate with status "dead" AND usually a newFact.
- If narration contradicts an established fact from the context, do NOT retire the old fact unless an in-story event genuinely changed it. Prefer recording nothing over papering over a contradiction.
- threadUpdates only for threads listed in the context. New obligations/promises/quests are newThreads.
- sceneUpdate is required whenever the player's location or situation changed; otherwise include just the "situation" field.
- timeAdvance: how much IN-STORY time this turn's events took. Most turns are "none" (minutes). "hours" = travel or a long task; "halfday"/"day"/"days" only when the narration explicitly covers that span (camping overnight, days of travel). Never invent large time jumps.
- sceneUpdate may include "setting": a one-sentence description of the story's world and premise — ONLY when the context shows the setting is missing or "To be determined".
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
   * @returns {{proposal: object|null, modelUsed: string|null}} — proposal is
   *          null if extraction failed (never throws)
   */
  async extractChanges(story, playerInput, narration, turnContext, userToken = null) {
    let modelUsed = null;
    try {
      const { provider, model } = await aiService.resolveAuxModel(userToken);
      modelUsed = `${provider}:${model}`;
      const prompt = this.buildExtractionPrompt(story, playerInput, narration, turnContext);
      const response = await aiService.callBaseGeekAI(prompt, {
        maxTokens: 1500,
        temperature: 0.1, // extraction wants determinism, not creativity
        provider, model
      }, userToken);
      return { proposal: this.parseProposal(response), modelUsed };
    } catch (error) {
      // Extraction must never break the player's turn. A missed extraction
      // means one turn of changes goes unrecorded — recoverable. A failed
      // turn is not.
      console.error('State extraction failed (turn continues):', error.message);
      return { proposal: null, modelUsed };
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
