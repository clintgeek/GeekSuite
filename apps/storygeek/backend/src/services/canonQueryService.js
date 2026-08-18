/**
 * canonQueryService — answers "what do we know?" from the RECORD, not the
 * imagination.
 *
 * A canon query ("What do we know about Jim's truck?", "remind me", "/recall
 * Marta") is a question to the ENGINE, not an action in the fiction. Routing
 * it through the creative GM produces a confident brochure assembled from
 * canon plus fresh invention — and one turn later the invention has laundered
 * itself into "something we've always known". Observed in play; this service
 * is the fix.
 *
 * Behavior:
 *  - Deterministic retrieval from canonical state (facts with source + turn,
 *    entity records, threads). The payload IS the answer; prose is decoration.
 *  - Provenance-attributed: each fact says who established it (player /
 *    narrator / setup) and when (turn) — canon is a timeline, not a set.
 *  - Zero-turn: no turn increment, no event, no dice. Asking what you know
 *    doesn't advance the world.
 *  - The optional aux-model summary is generated under a strict
 *    report-only-these-facts contract, with a deterministic fallback.
 */
import aiService from './aiService.js';

const norm = (s) => (s || '').trim().toLowerCase();
const STOP_WORDS = new Set([
  'what', 'who', 'when', 'where', 'which', 'about', 'know', 'knows', 'known',
  'do', 'does', 'did', 'we', 'i', 'you', 'the', 'a', 'an', 'all', 'have',
  'has', 'had', 'been', 'establish', 'established', 'learned', 'learn',
  'actually', 'really', 'far', 'this', 'that', 'again', 'me', 'my', 'our',
  'so', 'tell', 'remind', 'recap', 'story', 'is', 'are', 'was', 'were'
]);

const SOURCE_LABEL = {
  player: 'you established',
  narrator: 'the narrator introduced',
  setup: 'from the story\'s opening',
  extraction: 'recorded',
  narrative: 'recorded'
};

class CanonQueryService {
  /**
   * Is this input a question to the engine about established canon, rather
   * than an action in the fiction? Conservative: "I ask the guard what he
   * knows" is an ACTION (starts with the player acting) and must reach the GM.
   */
  isCanonQuery(input) {
    const text = norm(input);
    if (!text) return false;
    if (/^\/(recall|canon)\b/.test(text)) return true;
    // Player acting in-fiction ("I ask the guard what he knows…") — never
    // intercept an action; only direct questions to the engine.
    if (/^i\s/.test(text)) return false;
    return (
      // "(what|which of those|…) did/do we actually know/learn/establish" —
      // any wh-lead, not just "what" (a "Which of those did we actually
      // know…" follow-up slipped through to the GM in live play).
      /\b(do|did|does|have|had) (we|i) (actually |really )?(know|known|learn|learned|establish|established|discover|discovered)\b/.test(text) ||
      /\bwhat('s| is| was| has| had)? (actually |really )?(been )?(established|known|in the record|canon)\b/.test(text) ||
      // "what does Marta know" — a question about the record of a character's
      // knowledge (the knowledge model), not an action.
      /\bwhat (does|do|did) [\w' -]{2,30} (know|knows|known)\b/.test(text) ||
      /\bbefore (i|we) asked\b/.test(text) ||
      /\bremind me\b/.test(text) ||
      /^recap\b/.test(text)
    );
  }

  /**
   * Build the canon answer for a query. Returns a structured payload the UI
   * renders as a CANON card; the summary prose never carries facts the
   * payload doesn't.
   */
  async answerCanonQuery(story, input, userToken = null) {
    const stripped = String(input).replace(/^\/(recall|canon)\s*/i, '');
    const { entities, keywords } = this.extractSubjects(story, stripped);
    const facts = this.retrieveFacts(story, entities, keywords);
    const entityCards = this.buildEntityCards(story, entities);
    const threads = this.retrieveThreads(story, entities, keywords);

    const payload = {
      type: 'canon_answer',
      subjects: entities.map(e => e.name),
      facts: facts.map(f => ({
        text: f.fact,
        source: f.source || 'recorded',
        sourceLabel: SOURCE_LABEL[f.source] || 'recorded',
        turn: f.turn ?? null,
        visibility: f.visibility || 'public',
        category: f.category || 'detail'
      })),
      entities: entityCards,
      threads: threads.map(t => ({
        name: t.name, type: t.type, status: t.status,
        description: t.description, openedTurn: t.openedTurn
      })),
      note: 'Anything not listed here has not been established in canon.'
    };

    payload.summary = await this.summarize(payload, stripped, userToken);
    return payload;
  }

  /** Match known entity names in the query; collect residual keywords. */
  extractSubjects(story, input) {
    const text = norm(input);
    const entities = [];

    for (const c of story.characters || []) {
      if (c.name && text.includes(norm(c.name))) entities.push({ kind: 'character', name: c.name });
    }
    for (const l of story.locations || []) {
      if (l.name && text.includes(norm(l.name))) entities.push({ kind: 'location', name: l.name });
    }

    const keywords = text
      .replace(/[^a-z0-9\s']/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
      // words already covered by a matched entity name add noise, drop them
      .filter(w => !entities.some(e => norm(e.name).includes(w)));

    return { entities, keywords };
  }

  /**
   * Live facts relevant to the query, oldest first (canon is a timeline).
   * With no recognizable subject, this is a recap: the most recent slice.
   */
  retrieveFacts(story, entities, keywords, cap = 25) {
    const live = (story.storyState?.establishedFacts || []).filter(f => !f.isRetired);
    const entityNames = entities.map(e => norm(e.name));

    if (entityNames.length === 0 && keywords.length === 0) {
      return live.slice(-cap); // recap mode
    }

    const matches = live.filter(f => {
      const subjects = (f.subjects || []).map(norm);
      const text = norm(f.fact);
      if (subjects.some(s => entityNames.includes(s))) return true;
      if (entityNames.some(n => text.includes(n))) return true;
      if (keywords.some(k => text.includes(k) || subjects.some(s => s.includes(k)))) return true;
      return false;
    });

    // Subject expansion (one hop): a follow-up like "which of those did we
    // know before I asked about the interior?" only keyword-matches the
    // interior facts — but answering it needs the WHOLE timeline for that
    // subject. Pull every live fact sharing a subject with a matched fact.
    const matchedSubjects = new Set(matches.flatMap(f => (f.subjects || []).map(norm)).filter(Boolean));
    const expanded = matchedSubjects.size > 0
      ? live.filter(f => matches.includes(f) || (f.subjects || []).some(s => matchedSubjects.has(norm(s))))
      : matches;

    return expanded
      .sort((a, b) => (a.turn || 0) - (b.turn || 0))
      .slice(0, cap);
  }

  /** Canonical entity records for matched subjects. */
  buildEntityCards(story, entities) {
    const cards = [];
    const player = (story.characters || []).find(c => c.isPlayer);
    // The player may only see facts they could know about: public canon or
    // secrets they personally hold. An NPC's KNOWS list shown to the player
    // is filtered through that lens — the canon card must not leak secrets.
    const playerFactIds = new Set((player?.knowledge || []).map(k => k.factId));
    const factById = new Map((story.storyState?.establishedFacts || [])
      .filter(f => !f.isRetired).map(f => [f.id, f]));

    for (const e of entities) {
      if (e.kind === 'character') {
        const c = (story.characters || []).find(x => norm(x.name) === norm(e.name));
        if (c) {
          const knows = (c.knowledge || [])
            .map(k => ({ fact: factById.get(k.factId), via: k.learnedVia, turn: k.turn }))
            .filter(x => x.fact)
            .filter(x => x.fact.visibility !== 'secret' || playerFactIds.has(x.fact.id))
            .map(x => ({ text: x.fact.text || x.fact.fact, via: x.via, turn: x.turn }));
          cards.push({
            kind: 'character', name: c.name, status: c.status,
            description: c.description, locationName: c.locationName || null,
            isPlayer: !!c.isPlayer,
            knows
          });
        }
      } else {
        const l = (story.locations || []).find(x => norm(x.name) === norm(e.name));
        if (l) {
          cards.push({
            kind: 'location', name: l.name, state: l.state,
            description: l.description, stateNotes: l.stateNotes || null
          });
        }
      }
    }
    return cards;
  }

  retrieveThreads(story, entities, keywords) {
    const entityNames = entities.map(e => norm(e.name));
    return (story.storyThreads || []).filter(t => {
      const names = (t.characterNames || []).map(norm);
      const text = norm(`${t.name} ${t.description}`);
      if (entityNames.length === 0 && keywords.length === 0) return t.status === 'active';
      if (names.some(n => entityNames.includes(n))) return true;
      if (entityNames.some(n => text.includes(n))) return true;
      if (keywords.some(k => text.includes(k))) return true;
      return false;
    }).slice(0, 8);
  }

  /**
   * Short prose over the payload — REPORT-ONLY contract, aux model at
   * near-zero temperature, deterministic fallback if the call fails.
   */
  async summarize(payload, question, userToken) {
    if (payload.facts.length === 0 && payload.entities.length === 0) {
      return 'Nothing about that has been established in canon yet. If you act on it in the story, it will become part of the record.';
    }

    const factLines = payload.facts
      .map(f => `- [T${f.turn ?? '?'}, ${f.sourceLabel}] ${f.text}`)
      .join('\n');

    const prompt = `You are the ARCHIVIST of a role-playing game engine. The player asked a question about what is established in the game's canonical record. Below is EVERYTHING the record holds that is relevant. Write a short answer (under 130 words, second person, plain tone — you are the record keeper, not the storyteller).

HARD RULES:
- Report ONLY what is listed. Do not add, embellish, or infer a single detail.
- Attribute provenance naturally: things "you established" vs things "the narrator introduced" (with the turn if useful). This distinction is the point.
- If the question asks about something not covered by the list, say plainly that it has not been established.
- Do not advance the story, describe the scene, or ask "what do you do".

PLAYER'S QUESTION: ${question}

CANONICAL RECORD:
${factLines || '(no matching facts)'}
${payload.entities.map(e => e.kind === 'character'
    ? `- ENTITY: ${e.name} — ${e.status}${e.locationName ? `, at ${e.locationName}` : ''}: ${e.description}${e.knows?.length ? `\n  ${e.name.toUpperCase()} KNOWS (as recorded): ${e.knows.map(k => `${k.text} [${k.via}${k.turn != null ? `, T${k.turn}` : ''}]`).join('; ')}` : ''}`
    : `- ENTITY: ${e.name} — ${e.state}: ${e.description}${e.stateNotes ? ` (${e.stateNotes})` : ''}`
  ).join('\n')}
${payload.threads.map(t => `- THREAD [${t.status}]: ${t.name} — ${t.description}`).join('\n')}

ANSWER:`;

    try {
      const answer = await aiService.callAuxAI(prompt, { maxTokens: 400, temperature: 0.1 }, userToken);
      return String(answer).trim();
    } catch (e) {
      // Deterministic fallback — the payload alone is a complete answer.
      const bySource = { player: [], narrator: [], setup: [], other: [] };
      for (const f of payload.facts) {
        (bySource[f.source] || bySource.other).push(f.text);
      }
      const parts = [];
      if (bySource.player.length) parts.push(`You established: ${bySource.player.join('; ')}.`);
      if (bySource.narrator.length) parts.push(`The narrator introduced: ${bySource.narrator.join('; ')}.`);
      if (bySource.setup.length) parts.push(`From the opening: ${bySource.setup.join('; ')}.`);
      if (bySource.other.length) parts.push(`Also recorded: ${bySource.other.join('; ')}.`);
      parts.push('Anything not listed has not been established.');
      return parts.join(' ');
    }
  }
}

export default new CanonQueryService();
