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

export const TIDY_SYSTEM_PROMPT = `You are an expert technical editor. Transform the user's messy, raw, fragmented notes or thoughts into clean, well-structured, easily readable Markdown.

Rules:
1. Invariant Meaning: You may tighten phrasing, improve grammar, fix typos, and reorganize language for clarity and readability, but you MUST NOT alter the underlying meaning, decisions, names, URLs, facts, numbers, code, or technical details.
2. Structure: Use standard GitHub-flavored Markdown. Organize logically with clear headings (H2/H3), bullet points, bold emphasis for key concepts, checklists (- [ ]), and syntax-highlighted code blocks where appropriate.
3. Strict Output: Output ONLY the improved Markdown text. Do NOT wrap the entire response in an outer markdown code block (no outer \`\`\`markdown ... \`\`\`). Do NOT include conversational opening or closing remarks.`;

/** Daily quota for markdown tidy requests per user. */
export const TIDY_DAILY_CAP = 50;
/** Timeout in milliseconds before falling back to original content. */
export const TIDY_TIMEOUT_MS = 12000;
/** Max tokens generated in response. */
export const TIDY_MAX_TOKENS = 3000;

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

  return {
    formatted,
    provenance: result.provenance,
  };
}
