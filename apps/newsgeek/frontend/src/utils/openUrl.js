/**
 * Opening a story (DOCS/NEWSGEEK_PLAN.md "Opening", Chef 2026-10-11).
 *
 * Two per-reader prefs decide it (NewsPrefs):
 * - `openInNewTab` (default true): every outbound story link (the headline,
 *   "Open at publisher", the open-with links, the Also-in links) opens in a
 *   new tab, or in this window so Back returns to NewsGeek.
 * - `openers`: per publisher, one of the reader's open-with links to use
 *   instead of the original link. A direct source is keyed by `sourceId`, a
 *   Google News item by its publisher's domain (a suffix on a label
 *   boundary: an opener for reuters.com covers uk.reuters.com).
 *
 * The tap rule: the headline opens the publisher UNLESS the reader chose
 * another opener for that publisher. Two exceptions always use the original:
 * "Open at publisher" in the ⋯ menu, and each Also-in link.
 *
 * A link id is a hash of its template (the gateway's), so an opener whose
 * template was edited finds no link and the story opens at the publisher.
 */
import { coveringDomain } from './publishers';
import { buildReaderUrl } from './readerLinks';

/** Is this story's publisher keyed by domain (an aggregator item) rather than by source? */
export const keyedByDomain = (article) => Boolean(article?.viaAggregator);

/**
 * The opener entry that applies to this story, or null. For an aggregator
 * item the most specific covering domain wins (uk.reuters.com over reuters.com).
 */
export function findOpener(article, openers = []) {
  if (!article || !openers?.length) return null;
  if (!keyedByDomain(article)) {
    return openers.find((o) => o.sourceId && o.sourceId === article.sourceId) ?? null;
  }
  const domain = article.publisherDomain;
  if (!domain) return null;
  const byDomain = openers.filter((o) => !o.sourceId && o.domain);
  const covering = byDomain
    .filter((o) => coveringDomain([o.domain], domain))
    .sort((a, b) => b.domain.length - a.domain.length);
  return covering[0] ?? null;
}

/**
 * Where the headline goes: `{ url, link }`. `link` is the reader link used
 * (null for the original). Falls back to the original when no opener
 * applies, its link is gone, or the filled-in template isn't an http(s) URL.
 */
export function resolveStoryOpen(article, { openers = [], readerLinks = [] } = {}) {
  const original = { url: article?.url ?? '', link: null };
  const opener = findOpener(article, openers);
  if (!opener) return original;
  const link = readerLinks.find((l) => l.id === opener.linkId);
  if (!link) return original;
  const url = buildReaderUrl(link.template, { url: article.url, title: article.title });
  return url ? { url, link } : original;
}

/** The headline's URL (resolveStoryOpen's `url`). */
export const resolveStoryUrl = (article, prefs) => resolveStoryOpen(article, prefs).url;

/** Attributes for an outbound `<a>`: a new tab, or this window. */
export function linkTargetProps(openInNewTab = true) {
  return openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : { rel: 'noreferrer' };
}

/**
 * This-window navigation, behind a seam: jsdom won't let a test spy on
 * window.location.assign, and a real assign would end the test's page.
 */
export const pageNavigation = {
  assign(url) {
    window.location.assign(url);
  },
};

/** Open an outbound URL from code (a menu item): a new tab, or this window. */
export function openOutbound(url, openInNewTab = true) {
  if (!url) return;
  if (openInNewTab) window.open(url, '_blank', 'noopener,noreferrer');
  else pageNavigation.assign(url);
}

/** The opening prefs from a NewsPrefs object, with the defaults filled in. */
export function openingPrefs(newsPrefs) {
  return {
    openInNewTab: newsPrefs?.openInNewTab ?? true,
    openers: newsPrefs?.openers ?? [],
    readerLinks: newsPrefs?.readerLinks ?? [],
  };
}
