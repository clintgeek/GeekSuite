/**
 * compose.js — "turn this pile of scraps into a document".
 *
 * The counterpart to `tidy.js`, and deliberately its opposite. Tidy is a
 * FORMATTER: it must not merge, reorder or drop, and a result materially
 * shorter than its input is thrown away. Compose is a SYNTHESISER: merging
 * duplicates, reordering into a logical shape and dropping conversational
 * cruft is the entire job, and a good result IS much shorter than its input.
 *
 * Two features rather than two modes of one, on purpose. A single button that
 * sometimes preserves your words and sometimes rewrites them is how a note
 * gets destroyed — which is roughly what the original Tidy was.
 *
 * ## The safety model inverts
 *
 * Tidy's guarantee is "you will not lose content", enforced by a length
 * floor. That guarantee is impossible here, so the guarantee is different and
 * stronger:
 *
 *   **This never returns something intended to overwrite the source.** It
 *   produces a NEW document. The caller creates a new note and leaves the
 *   scrap pile alone. A compose that ate the raw fragments would be
 *   unrecoverable, because the fragments are the only place that material
 *   exists — they were pasted in from a chat, an email, somewhere else.
 *
 * ## Size, and why this is map-reduce
 *
 * The use case starts where a single call stops. A dump of chat messages plus
 * a model's answer plus email fragments is routinely 30-50k characters, and
 * `tidy.js` refuses anything over 12k. So:
 *
 *   1. SEGMENT the dump into fragments on blank lines, `---` rules and fenced
 *      code blocks, which is where pasted material actually joins.
 *   2. BATCH the fragments into chunks that fit one call.
 *   3. MAP each chunk to its substance — facts, decisions, questions, tasks —
 *      as plain bullets. Output is far smaller than input here, which is what
 *      makes the budget work.
 *   4. REDUCE the extracts into one structured document.
 *
 * A pile small enough for one call skips straight to a single compose, which
 * is both cheaper and better: the model sees the whole thing at once.
 *
 * ## Partial failure is reported, never silent
 *
 * If a MAP chunk fails, its material is missing from the result — and the
 * result still looks like a complete document, which is exactly the failure
 * shape `describeAndLogService` had (dishes vanishing into a 200 OK). So
 * `stats.chunksFailed` comes back with the answer and the caller is expected
 * to say so. `logged + skipped === requested` in spirit.
 *
 * ## Which model, and what happens when it is the wrong one (2026-09-22)
 *
 * Synthesising one document out of a pile of unrelated scraps is about the
 * hardest thing this codebase asks of a model, and for the first day of this
 * feature's life it was asked of whichever row the app's rotation happened to
 * offer. On live material that was `groq/allam-2-7b` — a 7B model the need
 * resolver's own header already records as having answered an English prompt
 * in Arabic. It returned a "document" that repeated
 *
 *     N. Confirm the issue: [Issue 1000](https://github.com/notegeek/...)
 *
 * thirty-eight times, with an invented URL, until it hit the token ceiling
 * mid-link — and compose shipped it, because the only check was "is the
 * string non-empty". The same input on the row `prose:deep` resolves to
 * produced a correct 1.7k document with a table and two honest open questions.
 *
 * So there are two changes, and the second is the one that lasts:
 *
 *   1. `need: 'prose:deep'` — ask for a model that can do this. Nobody
 *      watches a compose spinner expecting it inside a second; quality wins.
 *   2. `looksDegenerate()` — refuse a looping result no matter which model
 *      produced it. Routing degrades when good rows are cooling, every model
 *      loops on a bad day, and "the model let us down" must never again reach
 *      the user wearing the shape of a finished document. This is the same
 *      lesson as tidy.js's length floor, in the only form available here:
 *      compose cannot check that content survived, but it can check that the
 *      answer is not the same sentence forty times.
 */

import { runAIFeature } from '../../services/aiFeatureRunner.js';

export const COMPOSE_MAP_PROMPT = `You are extracting the substance from a pile of raw, pasted material — chat messages, notes, email fragments, model answers, half-finished thoughts.

Return a plain Markdown bullet list of everything that carries meaning:
- facts, figures, names, dates, URLs, identifiers, code fragments — verbatim
- decisions made, and who made them if stated
- open questions and unknowns
- tasks, commitments and next steps
- opinions or arguments, attributed if the source is clear

Rules:
1. KEEP THE SPECIFICS. Numbers, names, URLs and code must survive exactly. Never round, paraphrase or approximate them.
2. DROP THE NOISE. Greetings, sign-offs, "Sure, here's what I think", quoted reply chains, timestamps, UI chrome, repeated boilerplate.
3. MERGE DUPLICATES. The same point made three times is one bullet.
4. DO NOT WRITE PROSE. No headings, no introduction, no conclusion. Bullets only.
5. If a chunk contains nothing of substance, return an empty response.`;

export const COMPOSE_REDUCE_PROMPT = `You are assembling one coherent Markdown document from extracted points gathered out of a pile of scraps.

Produce a document someone can actually read and act on:
- a short \`#\` title naming what this is about
- a one or two sentence lead saying what the material covers
- \`##\` sections grouping related points, ordered so the document reads logically
- lists, tables and fenced code blocks where the material suits them
- a final \`## Open questions\` section if anything is unresolved
- a final \`## Next steps\` section as \`- [ ]\` checkboxes if there are actions

Rules:
1. KEEP THE SPECIFICS. Every number, name, date, URL and code fragment must survive exactly.
2. GROUP AND ORDER. Merge related points, put them in an order that makes sense, drop what is redundant. This is the job.
3. DO NOT INVENT. Add no facts, conclusions or recommendations that are not in the material. If something is ambiguous, put it under Open questions rather than resolving it.
4. NO COMMENTARY. Output only the document. No outer \`\`\`markdown wrapper, no "Here is your document".`;

export const COMPOSE_SINGLE_PROMPT = `${COMPOSE_REDUCE_PROMPT}

The input is the raw material itself rather than extracted points, so apply the same judgement: keep every specific, drop greetings and quoted reply chains and boilerplate, merge duplicates, and group what remains into a document.`;

/** Roughly how many characters one token is worth, for English prose. */
const CHARS_PER_TOKEN = 4;

/** Daily cap. One compose costs several calls, so this is per CALL. */
export const COMPOSE_DAILY_CAP = 120;

/**
 * What compose needs from a model, as a capability rather than a model id.
 *
 * `prose` because the output is a document a person reads, not JSON. `deep`
 * because nobody expects a pile of scraps to become a document inside a
 * second, and the weight axis is the only way to say "spend the time" — on
 * `deep` the resolver stops ranking on speed and lets measured quality
 * decide, which is exactly the trade this feature wants.
 */
export const COMPOSE_NEED = 'prose:deep';

/** A single map or reduce call's timeout. */
export const COMPOSE_TIMEOUT_MS = 25000;

/** Input characters per MAP chunk. Output is bullets, so far smaller. */
export const COMPOSE_CHUNK_CHARS = 12000;

/** Most chunks one compose will process, so a paste cannot fan out forever. */
export const COMPOSE_MAX_CHUNKS = 8;

/** Absolute input ceiling — past this the paste is refused, not truncated. */
export const MAX_COMPOSE_CHARS = COMPOSE_CHUNK_CHARS * COMPOSE_MAX_CHUNKS;

/** A pile at or under this goes to one call, which sees everything at once. */
export const SINGLE_CALL_CHARS = 10000;

const mapTokensFor = (chunk) =>
  Math.min(Math.max(Math.ceil(chunk.length / CHARS_PER_TOKEN / 2), 600), 2000);

/**
 * Split raw pasted material into fragments.
 *
 * Blank lines, horizontal rules and fenced code blocks are where pasted
 * material actually joins — a chat message ends, an email quote begins, a
 * model's answer is separated by a rule. Fences are kept WHOLE, because
 * splitting a code block mid-way produces two fragments neither of which
 * parses.
 *
 * @param {string} content
 * @returns {string[]} fragments, in order, with empties dropped
 */
export function segmentFragments(content) {
  if (!content || !content.trim()) return [];

  const fragments = [];
  const lines = content.split(/\r?\n/);
  let buffer = [];
  let inFence = false;

  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) fragments.push(text);
    buffer = [];
  };

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      // A fence boundary. Opening one starts a block that must stay intact;
      // closing one ends it and the block becomes its own fragment.
      buffer.push(line);
      if (inFence) {
        inFence = false;
        flush();
      } else {
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      buffer.push(line);
      continue;
    }
    if (line.trim() === '' || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return fragments;
}

/**
 * Pack fragments into chunks that fit one call.
 *
 * Greedy, and never splits a fragment across chunks — a fragment is a unit of
 * pasted material and halving it loses the context that makes it readable. A
 * single fragment larger than the chunk size gets a chunk of its own and is
 * passed whole; the model's own context is larger than this budget, so that
 * is safe.
 */
export function batchFragments(fragments, chunkChars = COMPOSE_CHUNK_CHARS) {
  const chunks = [];
  let current = [];
  let size = 0;

  for (const fragment of fragments) {
    const cost = fragment.length + 2;
    if (current.length && size + cost > chunkChars) {
      chunks.push(current.join('\n\n'));
      current = [];
      size = 0;
    }
    current.push(fragment);
    size += cost;
  }
  if (current.length) chunks.push(current.join('\n\n'));
  return chunks;
}

/**
 * A line, reduced to what makes it the same line as another.
 *
 * List markers and their numbers are stripped, because the live failure
 * numbered its repeats (`1.` … `38.`) and a naive comparison would have
 * called all thirty-eight distinct. Case and whitespace go for the same
 * reason.
 */
const normaliseLine = (line) => line
  .toLowerCase()
  .replace(/^[\s>]*(?:[-*+]|\d+[.)])\s+/, '')
  .replace(/\s+/g, ' ')
  .trim();

/** A line too short or too structural to mean anything when repeated. */
const isStructural = (line) => line.length < 12 || /^[|\-=_*#\s]+$/.test(line);

/** How many times one line may repeat before the answer is a loop, not a document. */
export const MAX_LINE_REPEATS = 4;

/** Below this share of distinct lines, the document is mostly echo. */
export const MIN_DISTINCT_LINE_RATIO = 0.55;

/**
 * Is this a document, or a model talking in circles?
 *
 * Deliberately blunt, and deliberately biased towards letting real documents
 * through. Real notes DO repeat short lines — table rules, `- [ ]` prefixes,
 * blank-ish separators — so anything short or structural is not counted at
 * all. What is counted is a substantial line of prose appearing five or more
 * times, or a document whose lines are mostly duplicates of each other.
 * Chef's live failure hit both by a wide margin; a 1.7k hand-checked
 * document from the same input hit neither.
 *
 * @returns {null | {reason: string, detail: object}} null when it looks fine
 */
export function looksDegenerate(markdown) {
  const lines = (markdown || '')
    .split(/\r?\n/)
    .map(normaliseLine)
    .filter((l) => l && !isStructural(l));

  // Too little to judge. A three-line answer that repeats itself is a bad
  // answer, but it is not the failure this guard exists to catch, and
  // refusing it would refuse legitimately terse documents.
  if (lines.length < 8) return null;

  const counts = new Map();
  for (const line of lines) counts.set(line, (counts.get(line) || 0) + 1);

  let worst = null;
  for (const [line, n] of counts) {
    if (n > MAX_LINE_REPEATS && (!worst || n > worst.count)) worst = { line, count: n };
  }
  if (worst) {
    return { reason: 'degenerate_output', detail: { repeatedLines: worst.count, lines: lines.length } };
  }

  const ratio = counts.size / lines.length;
  if (ratio < MIN_DISTINCT_LINE_RATIO) {
    return {
      reason: 'degenerate_output',
      detail: { distinctRatio: Number(ratio.toFixed(2)), lines: lines.length },
    };
  }

  return null;
}

const stripOuterFence = (text) => {
  const trimmed = (text || '').trim();
  if (trimmed.startsWith('```markdown') && trimmed.endsWith('```')) {
    return trimmed.replace(/^```markdown\r?\n?/, '').replace(/\r?\n?```$/, '');
  }
  if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
    return trimmed.replace(/^```\r?\n?/, '').replace(/\r?\n?```$/, '');
  }
  return text;
};

/**
 * Build a document from a pile of scraps.
 *
 * @param {object} opts
 * @param {string} opts.content raw pasted material
 * @param {string} [opts.userId]
 * @param {object} [opts.ai] injectable aiService, for tests
 * @returns {Promise<{markdown: string, stats: object, provenance: object}>}
 *   `markdown` is a NEW document — never something to write over the source.
 */
export async function composeNote({ content, userId, ai = undefined }) {
  const raw = typeof content === 'string' ? content : '';

  /**
   * The one exit both paths take.
   *
   * Everything that decides whether an answer is fit to show a person lives
   * here, so the single-call path and the map-reduce path cannot drift into
   * having different standards — which is exactly how the 38-times-repeated
   * document reached a user: the check that existed ("non-empty") was applied
   * consistently and was simply not enough.
   */
  const finish = (markdown, stats, prov) => {
    const degenerate = markdown.trim() ? looksDegenerate(markdown) : null;
    if (degenerate) {
      // Thrown away, not shown with a warning. A document that says the same
      // sentence forty times has no salvageable part, and offering it as
      // something to "Save as a new note" wastes the one thing the user came
      // here with — their attention.
      return {
        markdown: '',
        stats: { ...stats, degenerate: true },
        provenance: { ...prov, source: 'fallback', reason: degenerate.reason, ...degenerate.detail },
      };
    }
    return {
      markdown,
      stats: {
        ...stats,
        // The model was still talking when it ran out of room. The document
        // is real but it stops mid-thought, and the user is the only one who
        // can decide whether that is good enough.
        truncated: prov?.finishReason === 'length',
      },
      provenance: prov,
    };
  };

  const baseStats = {
    inputChars: raw.length,
    fragments: 0,
    chunks: 0,
    chunksFailed: 0,
    strategy: 'none',
  };

  if (!raw.trim()) {
    return {
      markdown: '',
      stats: baseStats,
      provenance: { source: 'fallback', reason: 'empty_content', model: null, provider: null, cached: false, callsToday: 0, cap: COMPOSE_DAILY_CAP },
    };
  }

  // Refused, not truncated — the same rule tidy.js learned the hard way.
  if (raw.length > MAX_COMPOSE_CHARS) {
    return {
      markdown: '',
      stats: { ...baseStats, strategy: 'refused' },
      provenance: {
        source: 'fallback',
        reason: 'content_too_long',
        contentChars: raw.length,
        maxChars: MAX_COMPOSE_CHARS,
        model: null, provider: null, cached: false, callsToday: 0, cap: COMPOSE_DAILY_CAP,
      },
    };
  }

  const fragments = segmentFragments(raw);
  baseStats.fragments = fragments.length;

  const runOnce = (system, user, maxTokens) => runAIFeature({
    app: 'notegeek',
    feature: 'compose_note',
    userId,
    system,
    user,
    // Both halves of the map-reduce ask for the same thing. The MAP step
    // looks like the easy one, but it is where the specifics are either kept
    // or quietly rounded off, and a weak row there poisons a reduce that
    // never sees the original material again.
    need: COMPOSE_NEED,
    maxCallsPerDay: COMPOSE_DAILY_CAP,
    timeoutMs: COMPOSE_TIMEOUT_MS,
    maxTokens,
    fallback: () => '',
    ...(ai ? { ai } : {}),
  });

  // Small enough to see whole: one call, no extraction step. Better output
  // and cheaper than map-reduce on material that never needed splitting.
  if (raw.length <= SINGLE_CALL_CHARS) {
    const result = await runOnce(COMPOSE_SINGLE_PROMPT, raw, 3000);
    const markdown = stripOuterFence(typeof result.data === 'string' ? result.data : '');
    const stats = { ...baseStats, chunks: 1, chunksFailed: markdown.trim() ? 0 : 1, strategy: 'single' };
    return finish(markdown, stats, result.provenance);
  }

  const chunks = batchFragments(fragments).slice(0, COMPOSE_MAX_CHUNKS);
  baseStats.chunks = chunks.length;

  // MAP, in parallel. Each chunk's failure is recorded rather than thrown:
  // losing one batch should cost that batch's material and say so, not the
  // whole compose.
  const extracts = await Promise.all(chunks.map(async (chunk) => {
    try {
      const r = await runOnce(COMPOSE_MAP_PROMPT, chunk, mapTokensFor(chunk));
      const text = typeof r.data === 'string' ? r.data.trim() : '';
      return text || null;
    } catch {
      return null;
    }
  }));

  const kept = extracts.filter(Boolean);
  const chunksFailed = extracts.length - kept.length;

  if (kept.length === 0) {
    return {
      markdown: '',
      stats: { ...baseStats, chunksFailed, strategy: 'map_reduce' },
      provenance: { source: 'fallback', reason: 'all_chunks_failed', model: null, provider: null, cached: false, callsToday: 0, cap: COMPOSE_DAILY_CAP },
    };
  }

  // REDUCE.
  const reduced = await runOnce(COMPOSE_REDUCE_PROMPT, kept.join('\n\n'), 3500);
  const markdown = stripOuterFence(typeof reduced.data === 'string' ? reduced.data : '');

  return finish(
    markdown,
    { ...baseStats, chunksFailed, strategy: 'map_reduce' },
    markdown.trim()
      ? reduced.provenance
      : { ...reduced.provenance, source: 'fallback', reason: 'reduce_failed' }
  );
}
