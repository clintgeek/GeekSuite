/**
 * Shared formatting for the AIGeek tabs.
 *
 * These were inline consts in the 2,200-line page. They are here because two
 * or more tabs read each one, and because a money formatter that disagrees
 * with itself between the Usage tab and the Catalog tab is the kind of bug
 * nobody files and everybody distrusts.
 *
 * Note the two price units in play, which the API keeps apart deliberately:
 * `formatCost` renders a recorded dollar total, while `formatPricingCell`
 * renders a *rate* from the AIPricing collection, which stores dollars per
 * 1,000,000 tokens.
 */

/** A recorded spend: `$0.0000`, four places, never blank. */
export const formatCost = (cost) => {
  if (cost === undefined || cost === null) return '$0.0000';
  return `$${cost.toFixed(4)}`;
};

/** A token count with thousands separators; `0` rather than an empty cell. */
export const formatTokens = (tokens) => {
  if (tokens === undefined || tokens === null) return '0';
  return tokens.toLocaleString();
};

/**
 * A per-1M-token price. The catalog stores the string `'Unknown'` for models
 * whose price nobody has confirmed, which is not the same as free — an em dash
 * says "we don't know", `$0/M` would claim "it's free".
 */
export const formatPricingCell = (value) => {
  if (value === undefined || value === null || value === 'Unknown' || value === '') return '—';
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(num)) return '—';
  return `$${num}/M`;
};

/** A context window as a compact label: 131072 → "131k ctx". */
export const formatContextWindow = (tokens) =>
  typeof tokens === 'number' && tokens > 0
    ? `${Math.round(tokens / 1000)}k ctx`
    : 'context unknown';

/** "name · provider · 131k ctx" — the one-line identity of a model. */
export const freeModelSummary = (model) =>
  [model.name, model.provider, formatContextWindow(model.contextWindow)].join(' · ');

/** Free-tier limits applied when a model has no stored limits of its own. */
export const FREE_TIER_DEFAULTS = {
  requestsPerMinute: 30,
  requestsPerDay: 14400,
  tokensPerMinute: 18000,
  tokensPerDay: 5184000
};
