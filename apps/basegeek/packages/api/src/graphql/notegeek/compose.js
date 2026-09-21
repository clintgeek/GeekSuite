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
    return {
      markdown,
      stats: { ...baseStats, chunks: 1, chunksFailed: markdown.trim() ? 0 : 1, strategy: 'single' },
      provenance: result.provenance,
    };
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

  return {
    markdown,
    stats: { ...baseStats, chunksFailed, strategy: 'map_reduce' },
    provenance: markdown.trim()
      ? reduced.provenance
      : { ...reduced.provenance, source: 'fallback', reason: 'reduce_failed' },
  };
}
