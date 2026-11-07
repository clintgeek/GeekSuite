/**
 * insightsAI — the governed door for FitnessGeek's AI insight prose.
 *
 * The six `fitnessInsights*` queries and `fitnessInsightsChat` are what the
 * UI reaches (the frontend maps `/insights/*` onto them). Until 2026-11-06
 * they called `aiService.chat(prompt)` bare: no routing row, no feature tag,
 * no need, no per-user cap, no timeout, no provenance — and a model outage
 * surfaced as a GraphQL error. They now walk through `runAIFeature` like
 * every other in-gateway feature.
 *
 * Insight prose has no deterministic fallback — a brief with the words taken
 * out is not a brief — so the fallback is a **friendly refusal**, the same
 * `{ ok: false, reason, message }` envelope fitnessgeek's REST twin
 * (`aiInsightsService.unavailable`) answers with, and which the dashboard
 * card, the Reports panels and the chat thread already render in place.
 *
 * Feature names match the REST twin's (`brief`, `summary`, `correlations`,
 * `weeklyReport`, `trendWatch`, `coaching`, `chat`) so the usage panel and
 * any per-feature routing read the same before and after.
 */

import logger from '../../lib/logger.js';
import { runAIFeature } from '../../services/aiFeatureRunner.js';

export const INSIGHT_NEED = 'prose:balanced';
// Same budget as the REST twin (`PROSE_TIMEOUT_MS`): a 30-day context is a
// long prompt and a free row can take a while on it.
export const INSIGHT_TIMEOUT_MS = 45000;
// Per user, per feature, per UTC day. The card only fetches when expanded, so
// this bounds a runaway loop rather than rationing a person.
export const INSIGHT_MAX_CALLS_PER_DAY = 20;
export const CHAT_MAX_CALLS_PER_DAY = 60;
export const CHAT_HISTORY_TURNS = 20;
export const UNAVAILABLE_MESSAGE = "The assistant isn't available right now.";

/**
 * Client-sent chat history, reduced to what a chat history is: user and
 * assistant turns with string content, the last few. `ChatMessageInput.role`
 * is a free String, so without this a client could slip in a second system
 * turn after the one carrying the data.
 */
export function sanitizeChatHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(turn => turn && typeof turn.content === 'string' && (turn.role === 'user' || turn.role === 'assistant'))
    .map(turn => ({ role: turn.role, content: turn.content }))
    .slice(-CHAT_HISTORY_TURNS);
}

/**
 * Ask for one insight. Never throws for a model problem (cap, outage,
 * timeout, empty answer); those come back as `ok: false` with the sentence.
 *
 * @returns {Promise<{ok, type, content, reason, message, generatedAt, context?, provenance}>}
 */
export async function runInsight({
  userId,
  feature,
  type,
  messages,
  context,
  maxTokens = 800,
  maxCallsPerDay = INSIGHT_MAX_CALLS_PER_DAY,
}) {
  const { data, provenance } = await runAIFeature({
    app: 'fitnessgeek',
    feature,
    userId,
    messages,
    need: INSIGHT_NEED,
    timeoutMs: INSIGHT_TIMEOUT_MS,
    maxCallsPerDay,
    maxTokens,
    // What the bare `chat()` path got from the provider default; the runner's
    // own 0.2 is tuned for JSON, not for a coach's paragraph.
    temperature: 0.7,
    fallback: () => null,
  });

  const base = { type, generatedAt: new Date(), ...(context !== undefined ? { context } : {}), provenance };
  if (provenance?.source === 'model' && typeof data === 'string' && data) {
    return { ...base, ok: true, content: data, reason: null, message: null };
  }

  logger.info({ feature, reason: provenance?.reason }, '[fitnessgeek] AI insight unavailable — answering with the friendly message');
  return { ...base, ok: false, content: null, reason: provenance?.reason || 'unavailable', message: UNAVAILABLE_MESSAGE };
}
