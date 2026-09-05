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

/**
 * A timestamp from the API, whatever shape it arrived in.
 *
 * The GraphQL `Date` scalar serializes to epoch milliseconds *as a string*
 * (which is why the old routing card called `parseInt` on `lastSeen`), while
 * the same instant nested inside a `JSON` scalar — `usage.lastUsed` — comes
 * through as an ISO string. One parser, so a row never renders "Invalid Date"
 * because it read the field from the other envelope.
 */
export const parseWhen = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value);
  const date = /^\d+$/.test(raw) ? new Date(parseInt(raw, 10)) : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** A timestamp as a local date/time, or a fallback when there isn't one. */
export const formatWhen = (value, fallback = 'Never') => {
  const date = parseWhen(value);
  return date ? date.toLocaleString() : fallback;
};

/**
 * The app id aiGeek files a call under when it could not name the caller —
 * no API key, or a key whose `appName` resolved to nothing. It is a real
 * bucket rather than a missing row, so the console can show what is calling
 * without identifying itself instead of quietly dropping it.
 */
export const UNATTRIBUTED_APP_ID = 'unattributed';

/** The server normalizes a key's `appName` to lowercase; the console must agree. */
export const normalizeAppId = (appName) => (appName || '').trim().toLowerCase();

/**
 * The per-feature rows inside one app's usage entry, as `[{ feature, ...usage }]`.
 *
 * The server groups usage by resolved app id and hangs a `feature` sub-label
 * off it. Which container it uses is the server's business and has changed
 * once already, so read both shapes and an array, and return `[]` when there
 * is no sub-label at all — a caller that never sets one is the common case
 * and must not render an empty second line.
 */
export const featureRows = (appUsage) => {
  const raw = appUsage?.featureUsage ?? appUsage?.features ?? null;
  if (!raw) return [];
  const entries = Array.isArray(raw)
    ? raw.map(entry => [entry.feature ?? entry.name, entry])
    : Object.entries(raw);
  return entries
    .filter(([feature]) => feature)
    .map(([feature, usage]) => ({ feature, ...(usage || {}) }))
    .sort((a, b) => (b.calls || 0) - (a.calls || 0));
};

/** "search ×803 · summarize ×120" — the feature line under an app's name. */
export const featureLine = (appUsage) => {
  const rows = featureRows(appUsage);
  if (rows.length === 0) return null;
  return rows.map(row => (row.calls ? `${row.feature} ×${row.calls}` : row.feature)).join(' · ');
};

/** Free-tier limits applied when a model has no stored limits of its own. */
export const FREE_TIER_DEFAULTS = {
  requestsPerMinute: 30,
  requestsPerDay: 14400,
  tokensPerMinute: 18000,
  tokensPerDay: 5184000
};
