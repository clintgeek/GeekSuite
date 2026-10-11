/**
 * utils/openUrl.js — how a story opens (DOCS/NEWSGEEK_PLAN.md "Opening", Chef
 * 2026-10-11): the per-publisher opener (by source, or by publisher domain for
 * an aggregator item), the stale-link fallback, and the window mode.
 */
import { findOpener, linkTargetProps, openOutbound, openingPrefs, pageNavigation, resolveStoryOpen, resolveStoryUrl } from '../../utils/openUrl';
import { article, opener, readerLink } from '../fixtures';

const READER = readerLink('aaa111', 'Example reader', 'https://example.com/read?u={url}&t={title}');
const OTHER = readerLink('bbb222', 'Other reader', 'https://other.example/{url}');
const DIRECT = article('d1', { title: 'Fire & ice', url: 'https://arkadelphian.com/d1/?x=1', sourceId: 's1' });
const VIA = article('v1', {
  title: 'Budget passes',
  url: 'https://uk.reuters.com/a/',
  sourceId: 'gnews',
  viaAggregator: true,
  publisherDomain: 'uk.reuters.com',
});

describe('findOpener', () => {
  it('a direct source: by sourceId, never by domain', () => {
    expect(findOpener(DIRECT, [opener({ sourceId: 's1', linkId: 'aaa111' })])).toMatchObject({ sourceId: 's1' });
    expect(findOpener(DIRECT, [opener({ sourceId: 's2', linkId: 'aaa111' })])).toBeNull();
    expect(findOpener(DIRECT, [opener({ domain: 'arkadelphian.com', linkId: 'aaa111' })])).toBeNull();
  });

  it('an aggregator item: by publisher domain, a suffix on a label boundary', () => {
    expect(findOpener(VIA, [opener({ domain: 'reuters.com', linkId: 'aaa111' })])).toMatchObject({ domain: 'reuters.com' });
    expect(findOpener(VIA, [opener({ domain: 'uk.reuters.com', linkId: 'aaa111' })])).toMatchObject({ domain: 'uk.reuters.com' });
    expect(findOpener(VIA, [opener({ domain: 'ters.com', linkId: 'aaa111' })])).toBeNull();
    expect(findOpener({ ...VIA, publisherDomain: 'notreuters.com' }, [opener({ domain: 'reuters.com', linkId: 'aaa111' })])).toBeNull();
    // Never by the aggregator's own source id.
    expect(findOpener(VIA, [opener({ sourceId: 'gnews', linkId: 'aaa111' })])).toBeNull();
  });

  it('the most specific covering domain wins', () => {
    const openers = [opener({ domain: 'reuters.com', linkId: 'aaa111' }), opener({ domain: 'uk.reuters.com', linkId: 'bbb222' })];
    expect(findOpener(VIA, openers).linkId).toBe('bbb222');
    expect(findOpener(VIA, [...openers].reverse()).linkId).toBe('bbb222');
  });

  it('an aggregator item with no publisher domain has no opener', () => {
    expect(findOpener({ ...VIA, publisherDomain: null }, [opener({ domain: 'reuters.com', linkId: 'aaa111' })])).toBeNull();
  });
});

describe('resolveStoryUrl', () => {
  it('no opener: the original link', () => {
    expect(resolveStoryUrl(DIRECT, { openers: [], readerLinks: [READER] })).toBe(DIRECT.url);
    expect(resolveStoryOpen(DIRECT, {}).link).toBeNull();
  });

  it('a direct source with an opener: the reader link, each value encoded on its own', () => {
    const out = resolveStoryOpen(DIRECT, { openers: [opener({ sourceId: 's1', linkId: 'aaa111' })], readerLinks: [READER, OTHER] });
    expect(out.url).toBe('https://example.com/read?u=https%3A%2F%2Farkadelphian.com%2Fd1%2F%3Fx%3D1&t=Fire%20%26%20ice');
    expect(out.link).toBe(READER);
  });

  it('an aggregator item on a subdomain of the opener’s domain', () => {
    expect(resolveStoryUrl(VIA, { openers: [opener({ domain: 'reuters.com', linkId: 'bbb222' })], readerLinks: [READER, OTHER] })).toBe(
      'https://other.example/https%3A%2F%2Fuk.reuters.com%2Fa%2F'
    );
  });

  it('a stale opener (its link was edited or removed) falls back to the original', () => {
    expect(resolveStoryOpen(DIRECT, { openers: [opener({ sourceId: 's1', linkId: 'gone00' })], readerLinks: [READER] })).toEqual({ url: DIRECT.url, link: null });
  });

  it('a template that doesn’t fill to an http(s) URL falls back to the original', () => {
    const broken = readerLink('ccc333', 'Broken', 'javascript:{url}');
    expect(resolveStoryUrl(DIRECT, { openers: [opener({ sourceId: 's1', linkId: 'ccc333' })], readerLinks: [broken] })).toBe(DIRECT.url);
  });
});

describe('window mode', () => {
  it('a new tab: target _blank with noopener noreferrer; this window: no target, noreferrer', () => {
    expect(linkTargetProps(true)).toEqual({ target: '_blank', rel: 'noopener noreferrer' });
    expect(linkTargetProps(false)).toEqual({ rel: 'noreferrer' });
    expect(linkTargetProps()).toEqual({ target: '_blank', rel: 'noopener noreferrer' });
  });

  it('openOutbound: window.open in a new tab, location.assign in this window', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const assign = vi.spyOn(pageNavigation, 'assign').mockImplementation(() => {});
    try {
      openOutbound('https://a.test/', true);
      expect(open).toHaveBeenCalledWith('https://a.test/', '_blank', 'noopener,noreferrer');
      expect(assign).not.toHaveBeenCalled();
      openOutbound('https://b.test/', false);
      expect(assign).toHaveBeenCalledWith('https://b.test/');
      expect(open).toHaveBeenCalledTimes(1);
    } finally {
      open.mockRestore();
      assign.mockRestore();
    }
  });

  it('openingPrefs fills the defaults: a new tab, no openers, no links', () => {
    expect(openingPrefs(undefined)).toEqual({ openInNewTab: true, openers: [], readerLinks: [] });
    expect(openingPrefs({ openInNewTab: false, openers: [1], readerLinks: [2] })).toEqual({ openInNewTab: false, openers: [1], readerLinks: [2] });
  });
});
