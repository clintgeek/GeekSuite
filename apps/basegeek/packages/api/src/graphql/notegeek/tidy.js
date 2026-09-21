/**
 * tidy.js — "make this mess into proper, easily readable markdown".
 *
 * Transforms fragmented, brain-dump, or messy notes into clean, well-structured
 * Markdown while strictly preserving facts, meaning, URLs, code, and intent.
 *
 * Routed through aiFeatureRunner with fallback to original content on timeout
 * or quota refusal.
 */

import { runAIFeature } from '../../services/aiFeatureRunner.js';

export const TIDY_SYSTEM_PROMPT = `You are a Markdown formatter. Your job is to improve the STRUCTURE and FORMATTING of the user's notes. You are not an editor and not a summariser.

Rules:
1. PRESERVE THE TEXT. Keep the user's own words. Fix typos and obvious punctuation slips only. Do NOT rephrase, tighten, summarise, condense, merge, reorder or drop anything. Every fact, name, number, URL, code fragment, table row, list item and heading in the input must survive into the output.
2. FORMAT ONLY. Apply standard GitHub-flavored Markdown: headings, lists, tables, checklists (- [ ]), emphasis, and fenced code blocks with a language where obvious. Turn an obvious pipe-table into a real table; turn an obvious list into a list.
3. ALREADY CLEAN IS A VALID ANSWER. If the note is already well-structured Markdown, return it UNCHANGED. Do not restructure something that does not need it.
4. LENGTH. Your output should be about as long as the input, and never materially shorter. If you cannot format the whole note, return the input unchanged rather than a partial answer.
5. STRICT OUTPUT: Output ONLY the Markdown. No outer \`\`\`markdown wrapper, no commentary.`;

/** Daily quota for markdown tidy requests per user. */
export const TIDY_DAILY_CAP = 50;
/** Timeout in milliseconds before falling back to original content. */
export const TIDY_TIMEOUT_MS = 12000;
/**
 * The CEILING on generated tokens — not the number requested.
 *
 * History, because both mistakes are instructive. It was 3000, which is an
 * OUTPUT cap on a transform whose output is as long as its input, so it was
 * an input limit in disguise: a 19k-character note came back cut off at ~63%
 * and that stump replaced the note. `finish_reason` never reaches this
 * module, so nothing could tell a guillotined answer from a finished one.
 *
 * The first repair raised it to a flat 8000 — and groq answered **HTTP 400**,
 * because a fixed ask that large exceeds what some models will emit. The
 * request then fell through to a 12-second timeout and the fallback returned
 * the note unchanged, which the UI cheerfully reported as "already clean".
 * Trading silent destruction for silent failure is not a fix.
 *
 * So the ask is now SIZED TO THE NOTE (`tidyMaxTokensFor`) and this is only
 * the upper bound. A 3.5k-character note asks for ~1800 tokens, which every
 * provider accepts; a note big enough to need more than this ceiling is
 * refused outright by `MAX_TIDY_CHARS`.
 */
export const TIDY_MAX_TOKENS = 4000;

/** Roughly how many characters one token is worth, for English prose. */
const CHARS_PER_TOKEN = 4;

/**
 * The longest note this will attempt.
 *
 * Deliberately below what `TIDY_MAX_TOKENS` could emit, so there is headroom
 * for a formatted version being slightly longer than its input (adding
 * heading markers and table pipes costs characters). Past this the request is
 * REFUSED — a note returned intact with an explanation beats a note silently
 * cut in half.
 */
export const MAX_TIDY_CHARS = Math.floor(TIDY_MAX_TOKENS * CHARS_PER_TOKEN * 0.75);

/**
 * How much shorter than the input a result may be before it is rejected.
 *
 * The backstop for the failure above, and for a model that decides to
 * summarise. Formatting can legitimately shorten a note a little (collapsing
 * ragged whitespace), so this is loose — it is a truncation detector, not a
 * style check.
 */
export const MIN_LENGTH_RATIO = 0.8;

/**
 * How many output tokens to ask for, given the note.
 *
 * A formatted note is a little longer than its raw form — headings, list
 * markers and table pipes all cost characters — so this asks for the input's
 * own size plus 60% headroom, floored so a one-line note still has room to
 * breathe and capped at the provider-safe ceiling.
 *
 * Asking for what is needed rather than a flat maximum is what keeps
 * providers from rejecting the request outright, and costs less besides.
 */
export function tidyMaxTokensFor(content) {
  const inputTokens = Math.ceil((content?.length || 0) / CHARS_PER_TOKEN);
  const wanted = Math.ceil(inputTokens * 1.6) + 400;
  return Math.min(Math.max(wanted, 800), TIDY_MAX_TOKENS);
}

/**
 * Tidy messy text into clean, structured markdown.
 *
 * @param {object} opts
 * @param {string} opts.content  The raw note text to format
 * @param {string} [opts.userId] The authenticated user id (for quota tracking)
 * @param {object} [opts.ai]     Injectable aiService instance (for testing)
 * @returns {Promise<{ formatted: string, provenance: object }>}
 */
export async function tidyMarkdown({ content, userId, ai = undefined }) {
  if (!content || !content.trim()) {
    return {
      formatted: content || '',
      provenance: {
        source: 'fallback',
        reason: 'empty_content',
        model: null,
        provider: null,
        cached: false,
        callsToday: 0,
        cap: TIDY_DAILY_CAP,
      },
    };
  }

  // TOO LONG TO ROUND-TRIP: refuse, do not truncate.
  //
  // The output cap is also an input limit, because a formatted note is about
  // as long as its raw one. Past this the model runs out of budget partway
  // and returns a stump — which used to be written straight over the note.
  // Returning the original with a reason is the only non-destructive answer.
  if (content.length > MAX_TIDY_CHARS) {
    return {
      formatted: content,
      provenance: {
        source: 'fallback',
        reason: 'content_too_long',
        contentChars: content.length,
        maxChars: MAX_TIDY_CHARS,
        model: null,
        provider: null,
        cached: false,
        callsToday: 0,
        cap: TIDY_DAILY_CAP,
      },
    };
  }

  const result = await runAIFeature({
    app: 'notegeek',
    feature: 'tidy_markdown',
    userId,
    system: TIDY_SYSTEM_PROMPT,
    user: content,
    maxCallsPerDay: TIDY_DAILY_CAP,
    timeoutMs: TIDY_TIMEOUT_MS,
    maxTokens: tidyMaxTokensFor(content),
    fallback: () => content,
    ...(ai ? { ai } : {}),
  });

  let formatted = typeof result.data === 'string' ? result.data : result.data?.formatted ?? content;

  // Defensive: strip accidental outer ```markdown ... ``` wrapper if model wrapped the entire response
  const trimmed = formatted.trim();
  if (trimmed.startsWith('```markdown') && trimmed.endsWith('```')) {
    formatted = trimmed.replace(/^```markdown\r?\n?/, '').replace(/\r?\n?```$/, '');
  } else if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
    formatted = trimmed.replace(/^```\r?\n?/, '').replace(/\r?\n?```$/, '');
  }

  // LOST CONTENT: reject rather than apply.
  //
  // The backstop for a response truncated despite the check above, and for a
  // model that decides to summarise. `finish_reason` never reaches this
  // module, so length is the only truncation signal available — and a note
  // that came back 40% shorter is not a tidy whatever caused it.
  if (formatted.trim().length < content.trim().length * MIN_LENGTH_RATIO) {
    return {
      formatted: content,
      provenance: {
        ...result.provenance,
        source: 'fallback',
        reason: 'result_too_short',
        contentChars: content.trim().length,
        resultChars: formatted.trim().length,
      },
    };
  }

  return {
    formatted,
    provenance: result.provenance,
  };
}
