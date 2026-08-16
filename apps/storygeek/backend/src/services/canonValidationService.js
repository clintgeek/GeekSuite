/**
 * canonValidationService — deterministic gatekeeper for canonical game state.
 *
 * The AI proposes state changes (via stateExtractionService); this service
 * decides which ones are legal. The model is never the authority on whether
 * an invariant holds — the engine is.
 *
 * Invariants enforced:
 *  - Dead characters stay dead unless the change is an explicit revival.
 *  - Destroyed locations stay destroyed unless the change is an explicit rebuild.
 *  - Resolved/abandoned threads stay resolved (a follow-up is a NEW thread).
 *  - NPC knowledge only expands through a valid vector: the character was
 *    present (witnessed), was told by someone who knows, inferred from
 *    something they know, or it's part of their initial backstory.
 *  - New facts that contradict live facts are not silently committed; they
 *    surface as conflicts for the GM context instead.
 *
 * All methods are pure with respect to the story document — they return
 * verdicts; committing is the caller's job (stateCommitService).
 */

const norm = (s) => (s || '').trim().toLowerCase();
const clipReason = (s) => (String(s || '').length > 60 ? `${String(s).slice(0, 59)}…` : String(s || ''));

class CanonValidationService {
  /**
   * Validate a full proposed-changes package against a story's canon.
   * @returns {{ accepted: object, rejected: Array<{change: object, rule: string, reason: string}>, conflicts: Array<object> }}
   */
  validateProposal(story, proposal, { presentCharacterNames = [], turn = null } = {}) {
    const rejected = [];
    const conflicts = [];
    const accepted = {
      newFacts: [],
      retiredFactIds: [],
      characterUpdates: [],
      newCharacters: [],
      locationUpdates: [],
      newLocations: [],
      threadUpdates: [],
      newThreads: [],
      knowledgeGrants: [],
      sceneUpdate: null,
      relationshipUpdates: []
    };

    const present = new Set(presentCharacterNames.map(norm));

    // New characters first — same-turn chains (create character + update
    // them + grant them knowledge in one proposal) must validate. A newly
    // introduced character is by definition present in the scene.
    const pendingNew = new Map();
    for (const newChar of proposal.newCharacters || []) {
      if (!newChar.name || norm(newChar.name).length < 2) {
        rejected.push({ change: newChar, rule: 'char-shape', reason: 'New character needs a name' });
        continue;
      }
      if (this.findCharacter(story, newChar.name) || pendingNew.has(norm(newChar.name))) continue;
      pendingNew.set(norm(newChar.name), {
        name: newChar.name, status: 'alive', isPlayer: false, knowledge: [], _pending: true
      });
      accepted.newCharacters.push(newChar);
      present.add(norm(newChar.name));
    }
    const resolveCharacter = (name) =>
      this.findCharacter(story, name) || pendingNew.get(norm(name)) || null;

    // New locations too — create + update in one proposal must validate.
    const pendingNewLocs = new Map();
    for (const newLoc of proposal.newLocations || []) {
      if (!newLoc.name || norm(newLoc.name).length < 2) {
        rejected.push({ change: newLoc, rule: 'loc-shape', reason: 'New location needs a name' });
        continue;
      }
      if (this.findLocation(story, newLoc.name) || pendingNewLocs.has(norm(newLoc.name))) continue;
      pendingNewLocs.set(norm(newLoc.name), { name: newLoc.name, state: 'intact', _pending: true });
      accepted.newLocations.push(newLoc);
    }
    const resolveLocation = (name) =>
      this.findLocation(story, name) || pendingNewLocs.get(norm(name)) || null;

    // --- Facts ---
    for (const fact of proposal.newFacts || []) {
      if (!fact.fact || typeof fact.fact !== 'string') {
        rejected.push({ change: fact, rule: 'fact-shape', reason: 'Fact text missing' });
        continue;
      }
      const contradiction = this.findContradiction(story, fact);
      if (contradiction) {
        conflicts.push({ proposed: fact, existing: contradiction });
        continue; // surfaced, not committed
      }
      if (this.isDuplicateFact(story, fact)) continue; // silently drop dupes
      accepted.newFacts.push(fact);
    }

    for (const retire of proposal.retiredFacts || []) {
      const existing = this.getLiveFacts(story).find(f => f.id === retire.factId);
      if (!existing) {
        rejected.push({ change: retire, rule: 'retire-unknown', reason: `No live fact with id ${retire.factId}` });
        continue;
      }
      if (!retire.reason) {
        rejected.push({ change: retire, rule: 'retire-no-reason', reason: 'Retiring a fact requires an in-story reason' });
        continue;
      }
      accepted.retiredFactIds.push({ factId: retire.factId, reason: retire.reason });
    }

    // --- Characters ---
    for (const update of proposal.characterUpdates || []) {
      const character = resolveCharacter(update.name);
      if (!character) {
        rejected.push({ change: update, rule: 'char-unknown', reason: `Unknown character "${update.name}"` });
        continue;
      }
      const verdict = this.validateCharacterUpdate(character, update);
      if (verdict.ok) accepted.characterUpdates.push(update);
      else rejected.push({ change: update, rule: verdict.rule, reason: verdict.reason });
    }

    // --- Locations ---
    for (const update of proposal.locationUpdates || []) {
      const location = resolveLocation(update.name);
      if (!location) {
        rejected.push({ change: update, rule: 'loc-unknown', reason: `Unknown location "${update.name}"` });
        continue;
      }
      const verdict = this.validateLocationUpdate(location, update);
      if (verdict.ok) accepted.locationUpdates.push(update);
      else rejected.push({ change: update, rule: verdict.rule, reason: verdict.reason });
    }

    // --- Threads ---
    for (const update of proposal.threadUpdates || []) {
      const thread = (story.storyThreads || []).find(t => norm(t.name) === norm(update.name));
      if (!thread) {
        rejected.push({ change: update, rule: 'thread-unknown', reason: `Unknown thread "${update.name}"` });
        continue;
      }
      if (thread.status !== 'active' && update.status && update.status !== thread.status) {
        rejected.push({
          change: update, rule: 'thread-reopen',
          reason: `Thread "${thread.name}" is ${thread.status} and cannot change status; open a new thread for follow-ups`
        });
        continue;
      }
      accepted.threadUpdates.push(update);
    }

    for (const newThread of proposal.newThreads || []) {
      if (!newThread.name || !newThread.description) {
        rejected.push({ change: newThread, rule: 'thread-shape', reason: 'New thread needs name and description' });
        continue;
      }
      const existing = (story.storyThreads || []).find(t => norm(t.name) === norm(newThread.name));
      if (existing) continue; // don't duplicate
      accepted.newThreads.push(newThread);
    }

    // --- Knowledge grants ---
    for (const grant of proposal.knowledgeGrants || []) {
      const verdict = this.validateKnowledgeGrant(story, grant, present, resolveCharacter, turn);
      if (verdict.ok) accepted.knowledgeGrants.push(grant);
      else rejected.push({ change: grant, rule: verdict.rule, reason: verdict.reason });
    }

    // --- Relationships ---
    for (const rel of proposal.relationshipUpdates || []) {
      if (!resolveCharacter(rel.name) || !rel.otherName) {
        rejected.push({ change: rel, rule: 'rel-unknown', reason: `Relationship update needs two known characters` });
        continue;
      }
      accepted.relationshipUpdates.push(rel);
    }

    // --- Scene ---
    if (proposal.sceneUpdate && typeof proposal.sceneUpdate === 'object') {
      accepted.sceneUpdate = proposal.sceneUpdate;
    }

    return { accepted, rejected, conflicts };
  }

  validateCharacterUpdate(character, update) {
    // Death is one-way unless explicitly flagged as revival.
    if (character.status === 'dead') {
      if (update.status && update.status !== 'dead' && !update.isRevival) {
        return {
          ok: false, rule: 'dead-stays-dead',
          reason: `${character.name} is dead; status can only change via an explicit revival event`
        };
      }
      // A dead character can't move or act.
      if (update.locationName && !update.isRevival) {
        return {
          ok: false, rule: 'dead-stays-dead',
          reason: `${character.name} is dead and cannot change location`
        };
      }
    }
    if (update.status && !['alive', 'dead', 'missing', 'unknown'].includes(update.status)) {
      return { ok: false, rule: 'char-status-enum', reason: `Invalid status "${update.status}"` };
    }
    return { ok: true };
  }

  validateLocationUpdate(location, update) {
    // Destruction is one-way unless explicitly flagged as rebuilt.
    if (location.state === 'destroyed' && update.state && update.state !== 'destroyed' && !update.isRebuild) {
      return {
        ok: false, rule: 'destroyed-stays-destroyed',
        reason: `${location.name} is destroyed; state can only change via an explicit rebuild event`
      };
    }
    if (update.state && !['intact', 'damaged', 'destroyed', 'altered'].includes(update.state)) {
      return { ok: false, rule: 'loc-state-enum', reason: `Invalid state "${update.state}"` };
    }
    return { ok: true };
  }

  /**
   * Knowledge only flows through valid vectors. The extractor must say HOW a
   * character learned something; "they just know" is not a vector.
   */
  validateKnowledgeGrant(story, grant, presentSet, resolveCharacter = null, turn = null) {
    const character = resolveCharacter
      ? resolveCharacter(grant.characterName)
      : this.findCharacter(story, grant.characterName);
    if (!character) {
      return { ok: false, rule: 'know-unknown-char', reason: `Unknown character "${grant.characterName}"` };
    }
    const fact = this.getLiveFacts(story).find(f => f.id === grant.factId);
    const isNewFact = !fact && !!grant.factText; // fact being created this same turn
    if (!fact && !isNewFact) {
      return { ok: false, rule: 'know-unknown-fact', reason: `Unknown fact "${grant.factId}"` };
    }
    if (character.status === 'dead') {
      return { ok: false, rule: 'know-dead', reason: `${character.name} is dead and cannot learn things` };
    }

    const via = grant.learnedVia;
    if (!['witnessed', 'told', 'inference', 'initial'].includes(via)) {
      return { ok: false, rule: 'know-no-vector', reason: `Knowledge needs a valid vector (witnessed/told/inference), got "${via}"` };
    }

    if (via === 'witnessed') {
      if (!presentSet.has(norm(grant.characterName))) {
        return {
          ok: false, rule: 'know-not-present',
          reason: `${grant.characterName} was not present in the scene and cannot have witnessed it`
        };
      }
      // Witnessing means being there when the fact came into being. An old
      // fact cannot be newly "witnessed" — observing its aftermath later is
      // 'inference', being told is 'told'. This closes the omniscience hole
      // where any present NPC could "witness" events from 40 turns ago.
      const factIsNewThisTurn = isNewFact || (fact && turn != null && fact.turn === turn);
      if (fact && turn != null && !factIsNewThisTurn) {
        return {
          ok: false, rule: 'know-witness-old-fact',
          reason: `"${clipReason(fact.fact)}" was established on turn ${fact.turn}; ${grant.characterName} cannot newly witness it on turn ${turn} (use 'told' or 'inference')`
        };
      }
    }

    if (via === 'told') {
      if (!grant.learnedFrom) {
        return { ok: false, rule: 'know-told-by-whom', reason: `"told" requires learnedFrom` };
      }
      // The teller must themselves know the fact (or be the player, or be
      // granted it this same turn — handled leniently for same-turn chains).
      const teller = resolveCharacter
        ? resolveCharacter(grant.learnedFrom)
        : this.findCharacter(story, grant.learnedFrom);
      if (teller && !teller.isPlayer && !teller._pending && fact) {
        const tellerKnows = (teller.knowledge || []).some(k => k.factId === grant.factId);
        if (!tellerKnows) {
          return {
            ok: false, rule: 'know-teller-ignorant',
            reason: `${grant.learnedFrom} does not know this fact and cannot have shared it`
          };
        }
      }
    }

    // Already known — drop silently as a no-op (not an error).
    if ((character.knowledge || []).some(k => k.factId === grant.factId)) {
      return { ok: false, rule: 'know-duplicate', reason: 'already known' };
    }

    return { ok: true };
  }

  /** Live (non-retired) facts. */
  getLiveFacts(story) {
    return (story.storyState?.establishedFacts || []).filter(f => !f.isRetired);
  }

  /**
   * Heuristic contradiction check: same subjects + oppositional keyword pairs.
   * Deliberately conservative — false negatives are acceptable (the evaluator
   * harness catches more), false positives would block legitimate play.
   */
  findContradiction(story, newFact) {
    const OPPOSITES = [
      ['destroyed', 'intact'], ['destroyed', 'rebuilt'],
      ['dead', 'alive'], ['open', 'closed'], ['closed', 'open'],
      ['lost', 'found'], ['stolen', 'returned'],
      ['burned', 'standing'], ['ruined', 'restored']
    ];
    const newText = norm(newFact.fact);
    const newSubjects = (newFact.subjects || []).map(norm);

    for (const existing of this.getLiveFacts(story)) {
      const existingSubjects = (existing.subjects || []).map(norm);
      const sharesSubject = newSubjects.length > 0 &&
        existingSubjects.some(s => newSubjects.includes(s));
      if (!sharesSubject) continue;

      const existingText = norm(existing.fact);
      for (const [a, b] of OPPOSITES) {
        if ((existingText.includes(a) && newText.includes(b)) ||
            (existingText.includes(b) && newText.includes(a))) {
          return existing;
        }
      }
    }
    return null;
  }

  isDuplicateFact(story, newFact) {
    const newText = norm(newFact.fact);
    return this.getLiveFacts(story).some(f => norm(f.fact) === newText);
  }

  findCharacter(story, name) {
    if (!name) return null;
    return (story.characters || []).find(c => norm(c.name) === norm(name)) || null;
  }

  findLocation(story, name) {
    if (!name) return null;
    return (story.locations || []).find(l => norm(l.name) === norm(name)) || null;
  }

  /**
   * Post-restore consistency audit used by tests and the /back command.
   * Returns a list of violations found in the story document itself.
   */
  auditStoryConsistency(story) {
    const violations = [];
    const liveFactIds = new Set(this.getLiveFacts(story).map(f => f.id));

    for (const char of story.characters || []) {
      for (const k of char.knowledge || []) {
        if (k.factId && !liveFactIds.has(k.factId)) {
          const retired = (story.storyState?.establishedFacts || []).some(f => f.id === k.factId);
          if (!retired) {
            violations.push({ rule: 'knowledge-dangling', detail: `${char.name} knows unknown fact ${k.factId}` });
          }
        }
      }
      if (char.locationName && !this.findLocation(story, char.locationName)) {
        violations.push({ rule: 'char-location-dangling', detail: `${char.name} is in unknown location "${char.locationName}"` });
      }
    }

    for (const thread of story.storyThreads || []) {
      if (thread.status === 'resolved' && !thread.resolution) {
        violations.push({ rule: 'thread-resolved-no-resolution', detail: `Thread "${thread.name}" resolved without resolution text` });
      }
    }

    const currentLoc = story.worldState?.currentLocationName;
    if (currentLoc && !this.findLocation(story, currentLoc)) {
      violations.push({ rule: 'current-location-dangling', detail: `Current location "${currentLoc}" does not exist` });
    }

    return violations;
  }
}

export default new CanonValidationService();
