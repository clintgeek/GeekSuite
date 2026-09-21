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
 * Max tokens generated in response.
 *
 * This is an OUTPUT cap, and a tidy's output is about as long as its input —
 * so it is also, in effect, an input limit. At 3000 (~12k characters) a
 * 19k-character note came back cut off around 63% of the way through, and
 * that stump replaced the whole note. Nothing detected it: `finish_reason`
 * never reaches this module, so a guillotined response is indistinguishable
 * from a complete one.
 *
 * Raised, and `MAX_TIDY_CHARS` below now refuses anything that still would
 * not fit rather than silently truncating it.
 */
export const TIDY_MAX_TOKENS = 8000;

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
    maxTokens: TIDY_MAX_TOKENS,
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
