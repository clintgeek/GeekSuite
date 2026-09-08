import aiService from './aiService.js';
import Story from '../models/Story.js';

// Bookify is one sequential aiGeek `aux` call per `chunkSize` events (up to
// ~45s each per the going-over note in DOCS/CONTEXT.md), held synchronously on
// the request.
// Two guardrails, not one, because a size cap alone doesn't bound wall-clock
// time (a slow provider can blow the budget on a small story) and a time
// budget alone would still let a request run the whole way into a huge story
// before giving up: MAX_BOOKIFY_EVENTS rejects an oversized story up front
// (413-shaped), BOOKIFY_TIME_BUDGET_MS aborts a run that is taking too long
// regardless of size (504-shaped). Night 2 2026-09-06, Q62.
export const MAX_BOOKIFY_EVENTS = 60;
export const BOOKIFY_TIME_BUDGET_MS = 60000;

export class BookifyTooLargeError extends Error {
  constructor(count, max) {
    super(`Story has ${count} events; bookify supports at most ${max} in one run. Trim the story before exporting.`);
    this.name = 'BookifyTooLargeError';
    this.code = 'BOOKIFY_TOO_LARGE';
  }
}

/**
 * No model could serve a scene pass. Distinct from the two guardrails: those
 * are the export being *refused*, this is the export being *unable to run*,
 * and it carries aiGeek's own words so the route can say which.
 */
export class BookifyUnavailableError extends Error {
  constructor(reason, message) {
    super(message || 'The narrator is not available to polish this story right now.');
    this.name = 'BookifyUnavailableError';
    this.code = 'BOOKIFY_UNAVAILABLE';
    this.reason = reason || 'unavailable';
  }
}

export class BookifyTimeoutError extends Error {
  constructor(budgetMs) {
    super(`Bookify exceeded its ${Math.round(budgetMs / 1000)}s time budget before finishing.`);
    this.name = 'BookifyTimeoutError';
    this.code = 'BOOKIFY_TIMEOUT';
  }
}

class BookService {
  preClean(text, title) {
    const lines = String(text).split('\n');
    const titleLc = (title || '').trim().toLowerCase();
    const cleaned = [];
    const patterns = [
      /^\s*Digital\s+Overlords\s*$/i,
      /^\s*Do you\s*[:?].*$/i,
      /^\s*You have the following options\s*[:?].*$/i,
      /^\s*[ABCD]\)\s+.*$/,
      /^\s*ROLL\s*:\s*d20.*$/i,
      /^\s*\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?\s*$/i,
      /^\s*Player chose\b.*$/i,
      /^\s*Choose your response\.?\s*$/i,
      /^\s*Choose your next move\.?\s*$/i
    ];
    for (let line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { cleaned.push(''); continue; }
      if (titleLc && trimmed.toLowerCase() === titleLc) continue;
      if (patterns.some(rx => rx.test(trimmed))) continue;
      cleaned.push(line);
    }
    const deduped = [];
    for (const line of cleaned) {
      if (deduped.length === 0 || deduped[deduped.length - 1].trim() !== line.trim()) deduped.push(line);
    }
    return deduped.join('\n');
  }

  toNeutralThirdPerson(text) {
    let t = ' ' + String(text) + ' ';
    const repl = [
      [/\byou're\b/gi, 'they\'re'], [/\byou've\b/gi, 'they\'ve'],
      [/\byou'll\b/gi, 'they\'ll'], [/\byou'd\b/gi, 'they\'d'],
      [/\byou are\b/gi, 'they are'], [/\byou were\b/gi, 'they were'],
      [/\byour\b/gi, 'their'], [/\byours\b/gi, 'theirs'],
      [/\byourself\b/gi, 'themselves'], [/\byourselves\b/gi, 'themselves'],
      [/\byou\b/gi, 'they']
    ];
    for (const [rx, sub] of repl) t = t.replace(rx, sub);
    return t.trim();
  }

  finalScrub(text) {
    return String(text)
      .replace(/^\s*ROLL\s*:\s*d20.*$/gim, '')
      .replace(/^\s*Digital\s+Overlords\s*$/gim, '')
      .replace(/^\s*\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?\s*$/gim, '')
      .replace(/^\s*[ABCD]\)\s+.*$/gim, '')
      .replace(/^\s*Do you\s*[:?].*$/gim, '')
      .replace(/^\s*You have the following options\s*[:?].*$/gim, '')
      .trim();
  }

  async bookify(storyId, userToken) {
    const story = await Story.findById(storyId);
    if (!story) throw new Error('Story not found');

    const events = story.events || [];
    if (events.length > MAX_BOOKIFY_EVENTS) {
      throw new BookifyTooLargeError(events.length, MAX_BOOKIFY_EVENTS);
    }

    const startedAt = Date.now();
    const checkBudget = () => {
      if (Date.now() - startedAt > BOOKIFY_TIME_BUDGET_MS) {
        throw new BookifyTimeoutError(BOOKIFY_TIME_BUDGET_MS);
      }
    };

    const chunkSize = 6;
    const scenes = [];
    for (let i = 0; i < events.length; i += chunkSize) scenes.push(events.slice(i, i + chunkSize));

    const factsForScene = () => {
      return `Facts to preserve:\n- Title: ${story.title}\n- Genre: ${story.genre}\n- Do NOT change outcomes.\n- Only polish prose, add transitions, unify tense/POV.\n- No new characters, items, or locations.\n`;
    };

    const rewrittenScenes = [];
    for (const scene of scenes) {
      checkBudget();
      const rawScene = scene.map(e => e.description).join('\n\n');
      const cleanedScene = this.preClean(rawScene, story.title);
      const sceneText = this.toNeutralThirdPerson(cleanedScene);

      const prompt = `Act as a copy editor. Perform a LIGHT polish of the text to make it read like a novel chapter, but DO NOT change the story.\n${factsForScene()}\nEDITING RULES (STRICT):\n- Preserve sequence and meaning exactly; keep events and outcomes identical.\n- Keep character names, genders, and roles exactly as in source; do not invent or swap identity.\n- Preserve who is acting/speaking; do not reassign actions or dialogue.\n- Remove meta/game narration (e.g., "Player chose B", command prompts, tooltips).\n- Smooth conversational/imperative phrasing into narrative prose with minimal paraphrase.\n- Enforce one viewpoint for the scene; if the source mixes POV, pick the dominant POV and keep it consistent.\n- Keep the tense consistent with the dominant tense in the source (prefer past).\n- Pronoun policy: Never use singular "they/them/their" for a known individual; prefer gendered pronouns (he/him/his or she/her/hers) and proper names. Use neutral plural only for groups or unknown persons.\n- Name/pronoun cadence: avoid starting more than 2 consecutive sentences with a pronoun; use the protagonist's proper name at paragraph starts and after long pronoun runs; vary with short noun phrases (e.g., "the programmer", "the hacker") where clear.\n- No new plot details, abilities, locations, technology, or inner thoughts not present in source.\n- Keep length similar (±10%); do not expand with new content.\n\nSOURCE:\n---\n${sceneText}\n---\n\nReturn only the minimally edited prose.`;

      // `auto` — no pin. The scene passes used to run on whatever model the
      // GM env vars named; the polish quality of a copy-edit pass does not
      // need narrative continuity with the story's GM, and aiGeek's routing
      // row is a better judge of what is alive than this file was.
      const scenePass = await aiService.callAuxAI(prompt, {
        maxTokens: 1400, temperature: 0.65, conversationId: storyId,
        quotaKey: aiService.quotaKeyFor(story)
      }, userToken);

      // One unusable scene means an incomplete book, so this is the one aux
      // path that does not shrug: the export cannot be silently short.
      if (!scenePass.ok) {
        throw new BookifyUnavailableError(scenePass.reason, scenePass.message);
      }

      rewrittenScenes.push(this.finalScrub(scenePass.content));
    }

    let stitched = rewrittenScenes.join('\n\n');

    try {
      // Budget already spent on the scene passes — skip the optional polish
      // rather than erroring; the caller already has a valid stitched draft.
      checkBudget();
      const fixPrompt = `You are an editor fixing consistency in a chapter draft.\nTasks (STRICT, NO STORY CHANGES):\n1) Keep the same sequence of sentences/events; do not add, remove, or reorder events.\n2) Enforce a single consistent POV and tense; do not change who the scene follows.\n3) Ensure each character's name and pronouns stay exactly as used in the source (no gender/pronoun drift).\n4) Pronoun policy: Do NOT use singular "they/them/their" for a known individual; prefer gendered pronouns (he/him/his or she/her/hers) and proper names. Neutral plural only for groups or unknown persons.\n5) Pronoun cadence: avoid runs of pronouns; prefer using the protagonist's proper name at paragraph starts and after two pronoun-start sentences; optionally vary with clear noun phrases (no ambiguity).\n6) Remove any residual meta-game language (choices, commands, tooltips).\n7) Do not invent new lines, thoughts, or descriptions.\nReturn only the corrected chapter text.\n\nSOURCE DRAFT:\n---\n${stitched}\n---`;
      // The consistency pass used to ask `aiDirectorService` for a
      // recommendation first — a whole extra round trip per export, in which
      // the director re-fetched every vendor's model list, to arrive at a pin.
      // It is `auto` now. The pass is optional either way: the caller already
      // holds a valid stitched draft.
      const fix = await aiService.callAuxAI(fixPrompt, {
        maxTokens: 1800, temperature: 0.4, conversationId: storyId,
        quotaKey: aiService.quotaKeyFor(story)
      }, userToken);
      if (fix.ok && typeof fix.content === 'string' && fix.content.length > 0) {
        stitched = this.finalScrub(fix.content);
      }
    } catch (_) { /* keep original stitched if fix fails */ }

    return { title: story.title, genre: story.genre, content: stitched };
  }
}

export default new BookService();
