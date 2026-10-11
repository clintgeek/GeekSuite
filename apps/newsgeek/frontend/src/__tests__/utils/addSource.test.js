import { groupFor, inputFromPreview, normalizeLink, previewFormFrom, suggestionLine } from '../../utils/addSource';

describe('normalizeLink', () => {
  it('accepts bare domains, full URLs and a link pasted with words around it', () => {
    expect(normalizeLink('magnoliareporter.com')).toBe('https://magnoliareporter.com/');
    expect(normalizeLink('  https://www.arkadelphian.com/news/x  ')).toBe('https://www.arkadelphian.com/news/x');
    expect(normalizeLink('Read this: https://example.com/story?id=1 via the app')).toBe('https://example.com/story?id=1');
    expect(normalizeLink('http://example.com')).toBe('http://example.com/');
  });
  it('refuses what is not a web link', () => {
    expect(normalizeLink('')).toBe('');
    expect(normalizeLink('not a link')).toBe('');
    expect(normalizeLink('localhost')).toBe('');
    expect(normalizeLink('ftp://example.com/')).toBe('');
    expect(normalizeLink('javascript:alert(1)')).toBe('');
  });
});

describe('groupFor', () => {
  const s = (o) => ({ status: 'active', onForMe: false, defaultOn: false, addedByMe: false, ...o });
  it('sorts sources into the Sources sections', () => {
    expect(groupFor(s({ onForMe: true, defaultOn: true }))).toBe('mine');
    expect(groupFor(s({ onForMe: true, defaultOn: false, addedByMe: true }))).toBe('mine');
    expect(groupFor(s({ defaultOn: false }))).toBe('others');
    expect(groupFor(s({ defaultOn: true }))).toBe('off');
    expect(groupFor(s({ addedByMe: true }))).toBe('off');
    expect(groupFor(s({ status: 'retired', onForMe: true }))).toBe('retired');
  });
});

describe('preview → input', () => {
  const result = {
    site: { name: 'Site', homepage: 'https://site.com/' },
    feeds: [{ url: 'https://site.com/feed/', format: 'atom' }, { url: 'https://site.com/rss', format: 'weird' }],
    paywall: { level: 'metered' },
    suggest: { name: 'Suggested', kind: 'aggregator', sections: ['local', 'bogus'], placeSlugs: ['a', 'missing'] },
  };
  it('seeds from the suggestions (aggregator never offered; unknown sections and slugs dropped)', () => {
    expect(previewFormFrom(result, [{ id: 'pa', slug: 'a' }])).toEqual({
      name: 'Suggested',
      feedUrl: 'https://site.com/feed/',
      kind: 'journalism',
      sections: ['local'],
      placeIds: ['pa'],
      defaultOn: false,
    });
  });
  it('sends the chosen feed, a known format, and paywall unknown as none', () => {
    const form = { name: ' X ', feedUrl: 'https://site.com/rss', kind: 'official', sections: ['state'], placeIds: [] };
    expect(inputFromPreview(form, result)).toEqual({
      name: 'X',
      homepage: 'https://site.com/',
      kind: 'official',
      sections: ['state'],
      placeIds: [],
      feeds: [{ url: 'https://site.com/rss', format: 'rss' }],
      paywall: 'metered',
    });
    expect(inputFromPreview(form, { ...result, paywall: { level: 'unknown' } }).paywall).toBe('none');
  });
});

it('suggestionLine', () => {
  expect(suggestionLine({ domain: 'magnoliareporter.com', count: 14, places: [{ name: 'Magnolia' }, { name: 'El Dorado' }] })).toBe(
    'magnoliareporter.com — 14 stories — Magnolia, El Dorado'
  );
  expect(suggestionLine({ domain: 'x.com', count: 1, places: [] })).toBe('x.com — 1 story');
});
