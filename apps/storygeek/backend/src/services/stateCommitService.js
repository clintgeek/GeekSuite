/**
 * stateCommitService — applies VALIDATED proposals to the story document.
 * The only code path that mutates canonical narrative state from AI output.
 * Everything here is deterministic; the validation already happened.
 */
import { randomUUID } from 'crypto';
import canonValidationService from './canonValidationService.js';

const norm = (s) => (s || '').trim().toLowerCase();

class StateCommitService {
  /**
   * Validate + commit a proposal in one step.
   * Returns a commit report used for logging and for the GM's next-turn
   * context (conflicts become CANON ALERTS).
   * Does NOT save the story — caller controls persistence/transaction scope.
   */
  applyProposal(story, proposal, { presentCharacterNames = [], turn = 0, sourceOverride = null } = {}) {
    if (!proposal) return { applied: 0, rejected: [], conflicts: [] };

    const { accepted, rejected, conflicts } = canonValidationService.validateProposal(
      story, proposal, { presentCharacterNames, turn }
    );

    let applied = 0;
    if (!story.storyState) {
      story.storyState = { establishedFacts: [], activeCharacters: [], currentLocation: {} };
    }
    if (!story.storyState.establishedFacts) story.storyState.establishedFacts = [];

    // Facts first — knowledge grants may reference facts created this turn.
    // Provenance: `source` records WHO established each fact ('player' — the
    // player asserted it; 'narrator' — the GM introduced it; 'setup' — story
    // creation). Together with `turn` this makes canon a timeline, not a set:
    // "what did we know, from whom, as of turn N" is answerable historically.
    const newFactIdsByText = new Map();
    for (const fact of accepted.newFacts) {
      const id = `fact_${randomUUID().slice(0, 8)}`;
      story.storyState.establishedFacts.push({
        id,
        category: ['character', 'location', 'event', 'detail'].includes(fact.category) ? fact.category : 'detail',
        fact: String(fact.fact).slice(0, 400),
        subjects: (fact.subjects || []).map(s => String(s).slice(0, 80)),
        visibility: fact.visibility === 'secret' ? 'secret' : 'public',
        source: sourceOverride || (fact.origin === 'player' ? 'player' : 'narrator'),
        turn,
        isRetired: false,
        timestamp: new Date()
      });
      newFactIdsByText.set(norm(fact.fact), id);
      applied++;
    }

    for (const { factId, reason } of accepted.retiredFactIds) {
      const fact = story.storyState.establishedFacts.find(f => f.id === factId);
      if (fact) {
        fact.isRetired = true;
        fact.retiredReason = String(reason).slice(0, 300);
        applied++;
      }
    }

    // New characters before character updates/knowledge (same-turn chains).
    for (const c of accepted.newCharacters) {
      story.characters.push({
        name: String(c.name).slice(0, 100),
        description: String(c.description || 'A character in the story').slice(0, 500),
        personality: String(c.personality || '').slice(0, 300),
        motivation: String(c.motivation || '').slice(0, 300),
        locationName: String(c.locationName || '').slice(0, 100),
        status: 'alive',
        isPlayer: false,
        knowledge: [],
        firstAppearedTurn: turn,
        lastSeenTurn: turn,
        isActive: true
      });
      applied++;
    }

    for (const u of accepted.characterUpdates) {
      const char = canonValidationService.findCharacter(story, u.name);
      if (!char) continue;
      if (u.status) char.status = u.status;
      if (u.locationName) char.locationName = String(u.locationName).slice(0, 100);
      if (u.currentState) char.currentState = String(u.currentState).slice(0, 300);
      if (u.motivation) char.motivation = String(u.motivation).slice(0, 300);
      char.lastSeenTurn = turn;
      applied++;
    }

    for (const l of accepted.newLocations) {
      story.locations.push({
        name: String(l.name).slice(0, 100),
        description: String(l.description || 'A place in the story').slice(0, 500),
        type: ['city', 'forest', 'dungeon', 'castle', 'village', 'wilderness', 'shop', 'tavern', 'temple', 'other'].includes(l.type) ? l.type : 'other',
        state: 'intact',
        isDiscovered: true,
        lastVisitedTurn: turn
      });
      applied++;
    }

    for (const u of accepted.locationUpdates) {
      const loc = canonValidationService.findLocation(story, u.name);
      if (!loc) continue;
      if (u.state) loc.state = u.state;
      if (u.stateNotes) loc.stateNotes = String(u.stateNotes).slice(0, 300);
      applied++;
    }

    if (!story.storyThreads) story.storyThreads = [];
    for (const t of accepted.newThreads) {
      story.storyThreads.push({
        name: String(t.name).slice(0, 120),
        description: String(t.description).slice(0, 500),
        type: ['quest', 'promise', 'debt', 'secret', 'hunt', 'consequence', 'other'].includes(t.type) ? t.type : 'other',
        status: 'active',
        characterNames: (t.characterNames || []).map(n => String(n).slice(0, 100)),
        openedTurn: turn,
        updatedTurn: turn
      });
      applied++;
    }

    for (const u of accepted.threadUpdates) {
      const thread = story.storyThreads.find(t => norm(t.name) === norm(u.name));
      if (!thread) continue;
      if (u.status && ['active', 'resolved', 'abandoned'].includes(u.status)) thread.status = u.status;
      if (u.resolution) thread.resolution = String(u.resolution).slice(0, 400);
      if (u.progressNote) {
        thread.description = `${thread.description}\n[turn ${turn}] ${String(u.progressNote).slice(0, 200)}`.slice(0, 900);
      }
      thread.updatedTurn = turn;
      applied++;
    }

    for (const g of accepted.knowledgeGrants) {
      const char = canonValidationService.findCharacter(story, g.characterName);
      if (!char) continue;
      // Resolve factId: existing id, or a fact created this turn by text.
      let factId = g.factId;
      if (!factId && g.factText) factId = newFactIdsByText.get(norm(g.factText));
      if (!factId) continue;
      if (!char.knowledge) char.knowledge = [];
      char.knowledge.push({
        factId,
        learnedVia: g.learnedVia,
        learnedFrom: String(g.learnedFrom || '').slice(0, 100),
        turn
      });
      applied++;
    }

    for (const r of accepted.relationshipUpdates) {
      const char = canonValidationService.findCharacter(story, r.name);
      if (!char) continue;
      if (!char.relationships) char.relationships = [];
      const existing = char.relationships.find(rel => norm(rel.characterName) === norm(r.otherName));
      if (existing) {
        if (r.relationshipType) existing.relationshipType = r.relationshipType;
        if (r.description) existing.description = String(r.description).slice(0, 300);
      } else {
        char.relationships.push({
          characterName: String(r.otherName).slice(0, 100),
          relationshipType: r.relationshipType || 'neutral',
          description: String(r.description || '').slice(0, 300)
        });
      }
      applied++;
    }

    // Player character identity (setup / first-reveal only — never re-bind).
    if (proposal.playerCharacter && !(story.characters || []).some(c => c.isPlayer)) {
      const pc = proposal.playerCharacter;
      const existing = canonValidationService.findCharacter(story, pc.name);
      if (existing) {
        existing.isPlayer = true;
        if (pc.description && (!existing.description || existing.description === 'A character in the story')) {
          existing.description = String(pc.description).slice(0, 500);
        }
      } else {
        story.characters.push({
          name: String(pc.name).slice(0, 100),
          description: String(pc.description || 'The player character').slice(0, 500),
          status: 'alive',
          isPlayer: true,
          knowledge: [],
          firstAppearedTurn: turn,
          lastSeenTurn: turn,
          isActive: true
        });
      }
      applied++;
    }

    if (accepted.sceneUpdate) {
      const s = accepted.sceneUpdate;
      if (s.locationName) {
        story.worldState.currentLocationName = String(s.locationName).slice(0, 100);
        const loc = canonValidationService.findLocation(story, s.locationName);
        if (loc) loc.lastVisitedTurn = turn;
        // Keep the player character's location in sync with the scene.
        const player = (story.characters || []).find(c => c.isPlayer);
        if (player) player.locationName = story.worldState.currentLocationName;
      }
      if (s.situation) story.worldState.currentSituation = String(s.situation).slice(0, 400);
      if (s.mood && ['dark', 'hopeful', 'tense', 'peaceful', 'mysterious', 'chaotic', 'neutral'].includes(s.mood)) {
        story.worldState.mood = s.mood;
      }
      if (s.timeOfDay && ['dawn', 'morning', 'afternoon', 'evening', 'night', 'midnight'].includes(s.timeOfDay)) {
        story.worldState.timeOfDay = s.timeOfDay;
      }
      if (s.weather && ['stormy', 'clear', 'foggy', 'windy', 'calm', 'rainy'].includes(s.weather)) {
        story.worldState.weather = s.weather;
      }
      // Advance the story clock. Buckets, not model-invented numbers.
      const TIME_ADVANCE_HOURS = { none: 0, hours: 3, halfday: 12, day: 24, days: 72 };
      if (s.timeAdvance && TIME_ADVANCE_HOURS[s.timeAdvance] != null) {
        story.worldState.hoursElapsed = (story.worldState.hoursElapsed || 0) + TIME_ADVANCE_HOURS[s.timeAdvance];
      }
      // Backfill the world setting once — the setup flow historically left it
      // "To be determined", starving the GM of its premise anchor.
      if (s.setting && (!story.worldState.setting || story.worldState.setting === 'To be determined')) {
        story.worldState.setting = String(s.setting).slice(0, 500);
      }
      applied++;
    }

    return { applied, rejected, conflicts };
  }
}

export default new StateCommitService();
