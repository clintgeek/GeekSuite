/**
 * The enums, as the reader sees them. Values mirror
 * packages/schemas/newsgeek/constants.js (CommonJS; the frontend keeps its
 * own copy rather than bundling it) — keep the two in step.
 */
// The labels a SOURCE can carry (the source form, Add a source, Everything's flags).
export const SECTIONS = ['local', 'state', 'national', 'world', 'tech'];
// The sections a STORY can land in for a reader (NewsArticle.section; Today's
// order). "Around Arkansas" (2026-10-11) is another town's paper reporting its
// own town — never a source label. Mirrors constants.js STORY_SECTIONS.
export const STORY_SECTIONS = [...SECTIONS, 'around'];
export const SECTION_LABEL = { local: 'Local', state: 'State', national: 'National', world: 'World', tech: 'Tech', around: 'Around Arkansas' };

export const SOURCE_KINDS = ['journalism', 'official', 'aggregator'];
export const KIND_LABEL = { journalism: 'Journalism', official: 'Official', aggregator: 'Aggregator' };

export const SOURCE_STATUSES = ['discovered', 'verified', 'active', 'broken', 'retired'];
export const STATUS_LABEL = { discovered: 'Discovered', verified: 'Verified', active: 'Active', broken: 'Broken', retired: 'Retired' };

export const FEED_FORMATS = ['rss', 'atom', 'nws'];
export const PAYWALLS = ['none', 'metered', 'hard'];
export const PAYWALL_LABEL = { none: 'No paywall', metered: 'Metered', hard: 'Hard paywall' };
export const CONTENT_LEVELS = ['title', 'excerpt', 'full'];
export const CONTENT_LABEL = { title: 'Title only', excerpt: 'Excerpt', full: 'Full text in feed' };

export const HEALTH_STATES = ['ok', 'stale', 'failing', 'broken', 'never'];

export const labelFor = (map, value) => map[value] ?? (value ? value.charAt(0).toUpperCase() + value.slice(1) : '');

/** Latest's section flags: All, then the sections in briefing order. */
export const SECTION_TABS = [{ id: 'all', label: 'All' }, ...SECTIONS.map((id) => ({ id, label: SECTION_LABEL[id] }))];
