/**
 * Shared formatting for the AIGeek status page.
 *
 * These were inline consts in the 2,200-line page. They are here because two
 * or more panels read each one, and because a money formatter that disagrees
 * with itself between the Usage panel and the Catalog panel is the kind of bug
 * nobody files and everybody distrusts.
 *
 * `formatPricingCell` and `FREE_TIER_DEFAULTS` were here until Phase 3
 * (2026-09-07). The first rendered a per-1M-token *rate* from AIPricing in a
 * catalog column that no longer exists; the second supplied starting numbers
 * for a free-tier limits form that no longer exists either. The catalog job
 * observes both now (DOCS/AIGEEK_CATALOG_JOB.md), so there was nothing left
 * for a human to type and nothing left to seed a box with.
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


/**
 * A whole-dollar-ish money label for the spend line: `$1.76`, two places.
 *
 * Distinct from `formatCost` on purpose. `formatCost` renders a *recorded
 * per-provider total* at four places, because a free-tier month is genuinely
 * `$0.0004` and rounding it to `$0.00` would read as "nothing is metered".
 * The spend line is the monthly headline against a $10 budget, where four
 * places is noise.
 */
export const formatUsd = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(num)) return '$0.00';
  return `$${num.toFixed(2)}`;
};

/**
 * "6 minutes ago" / "2 days ago" / "never" — how long since `value`.
 *
 * The attention panel and the catalog line both answer "when did this last
 * work?", and a raw locale timestamp makes a reader do the subtraction. Built
 * on `parseWhen`, so it reads either envelope the API sends (see above).
 *
 * `Intl.RelativeTimeFormat` rather than a hand-rolled ladder: it is in every
 * browser these apps support and it gets the plurals right.
 */
const AGO_STEPS = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
];

export const formatAgo = (value, fallback = 'never') => {
  const date = parseWhen(value);
  if (!date) return fallback;
  const elapsed = Date.now() - date.getTime();
  if (elapsed < 60 * 1000) return 'just now';
  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, ms] of AGO_STEPS) {
    if (elapsed >= ms) return relative.format(-Math.round(elapsed / ms), unit);
  }
  return 'just now';
};

/**
 * A rate-limit number as a compact label: `14400` → `14.4k`.
 *
 * The catalog table shows what the provider's own headers reported, and four
 * of those columns at full width is what pushed the old tab into a sideways
 * scroll on a phone.
 */
export const formatLimit = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value % 1_000 ? 1 : 0)}k`;
  return String(value);
};

/**
 * The five sections of the status page, in the order they scroll past.
 *
 * Shared between the anchor nav and the page body so a section can never be
 * in the nav without existing, or exist without being reachable from it. The
 * ids are also what `?tab=` maps onto — see `TAB_SECTIONS`.
 */
export const SECTIONS = [
  { id: 'needs-attention', label: 'Needs attention' },
  { id: 'usage', label: 'Usage and cost' },
  { id: 'apps-keys', label: 'Apps and keys' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'try-it', label: 'Try it' },
];

/**
 * Where the retired tab slugs land now.
 *
 * `/api-keys` still redirects to `/aigeek?tab=keys` (App.jsx), and links to a
 * tab exist in tickets and in the mobile harness. Configuration's providers
 * moved into Apps and keys, so both slugs point there.
 */
export const TAB_SECTIONS = {
  configuration: 'apps-keys',
  usage: 'usage',
  keys: 'apps-keys',
  catalog: 'catalog',
};
