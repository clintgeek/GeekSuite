/**
 * Reader-added sources: the pure parts of the Add sheet and the Sources
 * sections (DOCS/NEWSGEEK_PLAN.md "Reader-added sources").
 */
import { FEED_FORMATS, PAYWALLS, SECTIONS } from './vocab';

/**
 * What the reader pasted, as a URL to discover — or '' when it isn't one.
 * Accepts a bare domain ("magnoliareporter.com" → https://magnoliareporter.com),
 * and a share-sheet paste with words around the link ("Read this https://…").
 */
export function normalizeLink(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return '';
  const embedded = /https?:\/\/[^\s<>"']+/i.exec(raw);
  let candidate = embedded ? embedded[0] : raw;
  if (!embedded) {
    if (/\s/.test(candidate)) return '';
    candidate = candidate.replace(/^\/\//, '');
    if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) candidate = `https://${candidate}`;
  }
  try {
    const u = new URL(candidate);
    if (!/^https?:$/.test(u.protocol)) return '';
    if (!u.hostname.includes('.')) return '';
    return u.toString();
  } catch {
    return '';
  }
}

/** Sheet kinds a reader may pick. `aggregator` is admin-only and not what a pasted site is. */
export const ADD_KINDS = ['journalism', 'official'];

/** The preview's editable values, seeded from discovery's suggestions. */
export function previewFormFrom(result, places = []) {
  const idBySlug = new Map(places.map((p) => [p.slug, p.id]));
  const suggest = result?.suggest ?? {};
  const sections = (suggest.sections ?? []).filter((s) => SECTIONS.includes(s));
  return {
    name: suggest.name || result?.site?.name || '',
    feedUrl: result?.feeds?.[0]?.url ?? '',
    kind: ADD_KINDS.includes(suggest.kind) ? suggest.kind : 'journalism',
    sections,
    placeIds: (suggest.placeSlugs ?? []).map((slug) => idBySlug.get(slug)).filter(Boolean),
    defaultOn: false,
  };
}

export function previewErrors(form) {
  const errors = {};
  if (!form.name.trim()) errors.name = 'Give it a name.';
  if (!form.sections.length) errors.sections = 'Pick at least one section.';
  if (!form.feedUrl) errors.feedUrl = 'Pick a feed.';
  return errors;
}

/** The preview as a NewsSourceInput. An `unknown` paywall is sent as none (the contract's enum). */
export function inputFromPreview(form, result) {
  const feed = (result?.feeds ?? []).find((f) => f.url === form.feedUrl) ?? { url: form.feedUrl };
  const level = result?.paywall?.level;
  return {
    name: form.name.trim(),
    homepage: result?.site?.homepage || null,
    kind: form.kind,
    sections: form.sections,
    placeIds: form.placeIds,
    feeds: [{ url: feed.url, format: FEED_FORMATS.includes(feed.format) ? feed.format : 'rss' }],
    paywall: PAYWALLS.includes(level) ? level : 'none',
  };
}

/** The GraphQL error code (and extensions) off an ApolloError, if any. */
export function gqlCode(err) {
  const first = err?.graphQLErrors?.[0];
  return { code: first?.extensions?.code ?? null, extensions: first?.extensions ?? {}, message: first?.message ?? err?.message ?? '' };
}

/**
 * Which Sources section a source sits in:
 *   mine    "In your paper"        — on for me
 *   off     "Turned off"           — on by default (or mine), and I switched it off
 *   others  "From other readers"   — another reader's, off for me
 *   retired "Retired"              — nobody's paper
 */
export function groupFor(source) {
  if (source.status === 'retired') return 'retired';
  if (source.onForMe) return 'mine';
  if (source.defaultOn || source.addedByMe) return 'off';
  return 'others';
}

export const GROUPS = [
  { id: 'mine', title: 'In your paper', empty: 'Nothing in your paper yet. Turn a source on below, or add one.' },
  { id: 'others', title: 'From other readers', empty: 'Nobody else has added a source yet.' },
  { id: 'off', title: 'Turned off', empty: 'You haven’t turned anything off.' },
  { id: 'retired', title: 'Retired', empty: '' },
];

/** "magnoliareporter.com — 14 stories — Magnolia, El Dorado" */
export function suggestionLine(s) {
  const parts = [s.domain, `${s.count} ${s.count === 1 ? 'story' : 'stories'}`];
  const places = (s.places ?? []).map((p) => p.name).filter(Boolean);
  if (places.length) parts.push(places.join(', '));
  return parts.join(' — ');
}
