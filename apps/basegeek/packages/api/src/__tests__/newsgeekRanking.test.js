/**
 * newsgeekRanking.test.js — Today's ranking, the pure part
 * (graphql/newsgeek/ranking.js; DOCS/NEWSGEEK_PLAN.md "Ranking: the front
 * page", Chef 2026-10-11). No Mongo: plain rows in, sections out.
 */
import {
  createContext, ringIndex, sectionOf, rankFrontPage, judge, whyChips, typicalGapMs, freshness,
  PER_SOURCE_CAP, RING_WEIGHTS, ARKANSAS_WEIGHT, WINDOW_DAYS,
} from '../graphql/newsgeek/ranking.js';

const H = 3600 * 1000;
const D = 24 * H;
const NOW = new Date('2026-10-11T12:00:00Z').getTime();
const ago = (ms) => new Date(NOW - ms);

// A small gazetteer shaped like production's (towns under counties under the state).
const P = {};
const place = (slug, name, kind, parent) => {
  P[slug] = { _id: `p-${slug}`, slug, name, kind, parentId: parent ? P[parent]._id : null };
};
place('us', 'United States', 'country', null);
place('arkansas', 'Arkansas', 'state', 'us');
place('clark', 'Clark County', 'county', 'arkansas');
place('arkadelphia', 'Arkadelphia', 'town', 'clark');
place('gurdon', 'Gurdon', 'town', 'clark');
place('garland', 'Garland County', 'county', 'arkansas');
place('hot-springs', 'Hot Springs', 'town', 'garland');
place('hsv', 'Hot Springs Village', 'town', 'garland');
place('pulaski', 'Pulaski County', 'county', 'arkansas');
place('little-rock', 'Little Rock', 'town', 'pulaski');
place('faulkner', 'Faulkner County', 'county', 'arkansas');
place('conway', 'Conway', 'town', 'faulkner');
place('hot-spring-county', 'Hot Spring County', 'county', 'arkansas');
place('malvern', 'Malvern', 'town', 'hot-spring-county');
place('miller', 'Miller County', 'county', 'arkansas');
place('texarkana', 'Texarkana', 'town', 'miller');
const PLACES = Object.values(P);
const id = (slug) => P[slug]._id;

// Chef's ring, closest first.
const CHEF_RING = ['arkadelphia', 'clark', 'hot-springs', 'little-rock', 'conway', 'garland', 'hot-spring-county'].map(id);
const ctxFor = (over = {}) => createContext({ places: PLACES, homePlaces: CHEF_RING, now: NOW, ...over });

const S = (key, over = {}) => ({ _id: `s-${key}`, name: key, kind: 'journalism', sections: ['local'], places: [], ...over });
const SRC = {
  arkadelphian: S('arkadelphian', { places: [id('clark'), id('arkadelphia')] }),
  dg: S('dg', { sections: ['state'], places: [id('arkansas')] }),
  apNational: S('ap', { kind: 'aggregator', sections: ['national', 'world'], places: [id('us')] }),
  hill: S('hill', { sections: ['national'], places: [id('us')] }),
  verge: S('verge', { sections: ['tech'] }),
  texarkana: S('texarkana', { places: [id('texarkana'), id('miller')] }),
  arkTv: S('arktv', { sections: ['state'], places: [id('little-rock'), id('pulaski'), id('arkansas')] }),
  nws: S('nws', { kind: 'official', places: [id('clark'), id('hot-spring-county')] }),
};
let n = 0;
const A = (source, over = {}) => {
  n += 1;
  // Ingest gives every article its source's places, plus what the text names.
  const own = over.own || [];
  return {
    _id: `a${String(n).padStart(4, '0')}`,
    sourceId: source._id,
    publishedAt: ago(over.age ?? H),
    places: [...(source.places || []), ...own.map(id)],
    publisherDomain: over.domain ?? null,
    expiresAt: over.expiresAt ?? null,
    title: over.title || `story ${n}`,
  };
};

const QUOTAS = { local: 8, state: 5, national: 5, world: 3, tech: 4 };
const rank = ({ candidates, sources = Object.values(SRC), counts = new Map(), quotas = QUOTAS, ctx = ctxFor() }) =>
  rankFrontPage({ ctx, candidates, sources, counts, quotas });
const titlesIn = (sections, key) => (sections.find((s) => s.key === key)?.items || []).map((e) => e.article.title);

describe('the ring: a place matches an entry that is the place or one of its ancestors', () => {
  const ctx = ctxFor();

  it('a town in the ring matches its own entry, the closest one wins', () => {
    expect(ringIndex(ctx, id('arkadelphia'))).toBe(0); // also under Clark County (1): best wins
  });

  it('a town not in the ring matches through its county (Gurdon → Clark County)', () => {
    expect(ringIndex(ctx, id('gurdon'))).toBe(1);
  });

  it('Hot Springs Village matches Garland County, NOT the city of Hot Springs', () => {
    expect(ringIndex(ctx, id('hsv'))).toBe(CHEF_RING.indexOf(id('garland')));
    expect(ringIndex(ctx, id('hot-springs'))).toBe(2);
  });

  it('a place outside every entry, and the state above them, match nothing', () => {
    expect(ringIndex(ctx, id('texarkana'))).toBe(-1);
    expect(ringIndex(ctx, id('arkansas'))).toBe(-1);
  });

  it('unknown and duplicate ring ids are dropped, order kept', () => {
    const c = createContext({ places: PLACES, homePlaces: ['nope', id('conway'), id('conway'), id('gurdon')], now: NOW });
    expect(c.ring).toEqual([id('conway'), id('gurdon')]);
  });
});

describe('the story’s section, per reader', () => {
  const ctx = ctxFor();

  it('a Democrat-Gazette story about Arkadelphia is Local', () => {
    expect(sectionOf(ctx, A(SRC.dg, { own: ['arkadelphia'] }), SRC.dg)).toBe('local');
  });

  it('an AP story (via a national aggregator) tagged Little Rock is Local', () => {
    expect(sectionOf(ctx, A(SRC.apNational, { own: ['little-rock'] }), SRC.apNational)).toBe('local');
  });

  it('an Arkansas-tagged national story is State', () => {
    expect(sectionOf(ctx, A(SRC.hill, { own: ['arkansas'] }), SRC.hill)).toBe('state');
    expect(sectionOf(ctx, A(SRC.hill, { own: ['texarkana'] }), SRC.hill)).toBe('state');
  });

  it('an untagged national story is National; a tech source’s is Tech', () => {
    expect(sectionOf(ctx, A(SRC.hill), SRC.hill)).toBe('national');
    expect(sectionOf(ctx, A(SRC.apNational), SRC.apNational)).toBe('national'); // its FIRST section
    expect(sectionOf(ctx, A(SRC.verge), SRC.verge)).toBe('tech');
  });

  it('a ring-local source is Local even when the story names no place', () => {
    expect(sectionOf(ctx, A(SRC.arkadelphian), SRC.arkadelphian)).toBe('local');
  });

  it('a source’s inherited places never make every story Local (Arkansas TV covers Little Rock + Pulaski)', () => {
    expect(sectionOf(ctx, A(SRC.arkTv), SRC.arkTv)).toBe('state');
  });

  it('a local source outside the ring is State for this reader', () => {
    expect(sectionOf(ctx, A(SRC.texarkana), SRC.texarkana)).toBe('state');
  });

  it('a reader with no ring: Local is the source’s label (the old behaviour)', () => {
    const none = createContext({ places: PLACES, now: NOW });
    expect(sectionOf(none, A(SRC.texarkana), SRC.texarkana)).toBe('local');
    expect(sectionOf(none, A(SRC.dg, { own: ['arkadelphia'] }), SRC.dg)).toBe('state');
  });
});

describe('pace-normalised freshness', () => {
  it('typicalGap is 7 days / weekly count, clamped to [1 h, 3 days]', () => {
    expect(typicalGapMs(7)).toBe(D);
    expect(typicalGapMs(280)).toBe(H);
    expect(typicalGapMs(0)).toBe(3 * D);
  });

  it('nothing older than the window scores', () => {
    expect(freshness(WINDOW_DAYS * D + 1, 7, WINDOW_DAYS * D)).toBe(0);
  });

  it('a 7-a-week paper’s 2-day-old story outranks a 40-a-day source’s 6-hour-old story at equal locality', () => {
    const weekly = S('weekly', { sections: ['state'], places: [id('arkansas')] });
    const firehose = S('firehose', { sections: ['state'], places: [id('arkansas')] });
    const counts = new Map([[weekly._id, 7], [firehose._id, 280]]);
    const slow = A(weekly, { age: 2 * D, title: 'slow' });
    const fast = A(firehose, { age: 6 * H, title: 'fast' });
    const ctx = ctxFor();
    expect(judge(ctx, slow, weekly, 7).section).toBe('state');
    const out = rank({ candidates: [fast, slow], sources: [weekly, firehose], counts });
    expect(titlesIn(out, 'state')).toEqual(['slow', 'fast']);
  });
});

describe('locality and priority', () => {
  it('ring position sets the weight; Arkansas elsewhere gets the state weight', () => {
    const ctx = ctxFor();
    const s = SRC.hill;
    const sc = (own) => judge(ctx, A(s, { own, age: 2 * H }), s, 50).score;
    expect(sc(['arkadelphia'])).toBeGreaterThan(sc(['little-rock']));
    expect(sc(['little-rock'])).toBeGreaterThan(sc(['texarkana']));
    expect(sc(['texarkana'])).toBeGreaterThan(sc([]));
    expect(RING_WEIGHTS[0]).toBe(1);
    expect(ARKANSAS_WEIGHT).toBe(0.25);
  });

  it('a favourite’s story leads its section even when another scores higher', () => {
    const fav = S('fav', { sections: ['national'] });
    const other = S('other', { sections: ['national'] });
    const counts = new Map([[fav._id, 7], [other._id, 7]]);
    const ctx = ctxFor({ favoriteSourceIds: [fav._id] });
    const old = A(fav, { age: 5 * D, title: 'fav-old' });
    const fresh = A(other, { age: H, title: 'fresh' });
    // ×3 alone would not lift a 5-day-old story past a fresh one here…
    expect(judge(ctxFor(), old, fav, 7).score * 3).toBeLessThan(judge(ctxFor(), fresh, other, 7).score);
    // …but favourites lead.
    expect(titlesIn(rank({ ctx, candidates: [fresh, old], sources: [fav, other], counts }), 'national')).toEqual(['fav-old', 'fresh']);
  });

  it('“Less” sinks a source below an otherwise equal one', () => {
    const a = S('a', { sections: ['national'] });
    const b = S('b', { sections: ['national'] });
    const counts = new Map([[a._id, 7], [b._id, 7]]);
    const ctx = ctxFor({ lessSourceIds: [a._id] });
    const out = rank({ ctx, candidates: [A(a, { age: H, title: 'a-new' }), A(b, { age: 12 * H, title: 'b-older' })], sources: [a, b], counts });
    expect(titlesIn(out, 'national')).toEqual(['b-older', 'a-new']);
  });
});

describe('diversity: at most PER_SOURCE_CAP stories per source per section', () => {
  it('the cap is 5', () => {
    expect(PER_SOURCE_CAP).toBe(5);
  });

  it('the 6th story from one source is held back while a lower-scored story from another gets in', () => {
    const big = S('big', { sections: ['national'] });
    const small = S('small', { sections: ['national'] });
    const counts = new Map([[big._id, 7], [small._id, 7]]);
    const bigs = [1, 2, 3, 4, 5, 6].map((i) => A(big, { age: i * H, title: `big${i}` }));
    const lower = A(small, { age: 3 * D, title: 'small' });
    const ctx = ctxFor();
    expect(judge(ctx, lower, small, 7).score).toBeLessThan(judge(ctx, bigs[5], big, 7).score);
    const out = rank({ candidates: [...bigs, lower], sources: [big, small], counts, quotas: { ...QUOTAS, national: 6 } });
    expect(titlesIn(out, 'national')).toEqual(['big1', 'big2', 'big3', 'big4', 'big5', 'small']);
    expect(out.find((s) => s.key === 'national').moreCount).toBe(1);
  });

  it('Google News items count against their publisher’s domain, not the aggregator', () => {
    const gn = S('gn', { kind: 'aggregator', sections: ['national'] });
    const counts = new Map([[gn._id, 7]]);
    const fromA = [1, 2, 3, 4, 5, 6].map((i) => A(gn, { age: i * H, domain: 'apnews.com', title: `ap${i}` }));
    const fromB = [7, 8].map((i) => A(gn, { age: i * H, domain: 'www.reuters.com', title: `r${i}` }));
    const out = rank({ candidates: [...fromA, ...fromB], sources: [gn], counts, quotas: { ...QUOTAS, national: 10 } });
    // 5 from apnews.com (the 6th held back) and both Reuters: 7 from ONE aggregator source.
    expect(titlesIn(out, 'national')).toEqual(['ap1', 'ap2', 'ap3', 'ap4', 'ap5', 'r7', 'r8']);
  });
});

describe('quotas are caps, never targets', () => {
  it('a quiet section stays short and an empty one is left out', () => {
    const out = rank({ candidates: [A(SRC.verge, { title: 't1' })], counts: new Map([[SRC.verge._id, 7]]) });
    expect(out.map((s) => s.key)).toEqual(['tech']);
    expect(titlesIn(out, 'tech')).toEqual(['t1']);
  });

  it('a busy section stops at its quota and says how many more', () => {
    const many = Array.from({ length: 9 }, (_, i) => A(SRC.hill, { age: (i + 1) * H, title: `h${i}` }));
    const out = rank({ candidates: many, counts: new Map([[SRC.hill._id, 7]]), quotas: { ...QUOTAS, national: 3 } });
    // 3 shown (under the cap of 5), 6 more.
    expect(out.find((s) => s.key === 'national')).toMatchObject({ moreCount: 6 });
    expect(titlesIn(out, 'national')).toHaveLength(3);
  });

  it('a quota of 0 leaves the section out; sections come in briefing order', () => {
    const out = rank({
      candidates: [A(SRC.verge), A(SRC.hill), A(SRC.dg), A(SRC.arkadelphian)],
      quotas: { ...QUOTAS, national: 0 },
    });
    expect(out.map((s) => s.key)).toEqual(['local', 'state', 'tech']);
  });

  it('stories outside the window never show (local keeps 10 days, others 7)', () => {
    const out = rank({ candidates: [A(SRC.arkadelphian, { age: 9 * D, title: 'local9' }), A(SRC.hill, { age: 8 * D, title: 'nat8' })] });
    expect(titlesIn(out, 'local')).toEqual(['local9']);
    expect(titlesIn(out, 'national')).toEqual([]);
  });
});

describe('official alerts lead Local', () => {
  it('an active local alert comes first, whatever the score', () => {
    const counts = new Map([[SRC.nws._id, 50], [SRC.arkadelphian._id, 7]]);
    const alert = A(SRC.nws, { age: 20 * H, expiresAt: new Date(NOW + H), title: 'alert' });
    const story = A(SRC.arkadelphian, { age: H, title: 'story' });
    expect(titlesIn(rank({ candidates: [story, alert], counts }), 'local')).toEqual(['alert', 'story']);
  });
});

describe('why chips', () => {
  it('name the ring place, the priority and Official', () => {
    const ctx = ctxFor({ favoriteSourceIds: [SRC.dg._id], lessSourceIds: [SRC.nws._id] });
    expect(whyChips(ctx, A(SRC.dg, { own: ['gurdon'] }), SRC.dg)).toEqual(['Gurdon', '★ Favorite']);
    expect(whyChips(ctx, A(SRC.dg, { own: ['little-rock'] }), SRC.dg)).toEqual(['Little Rock', '★ Favorite']);
    expect(whyChips(ctx, A(SRC.nws), SRC.nws)).toEqual(['Clark County', 'Less', 'Official']);
    expect(whyChips(ctx, A(SRC.hill, { own: ['texarkana'] }), SRC.hill)).toEqual(['Arkansas']);
    expect(whyChips(ctx, A(SRC.verge), SRC.verge)).toEqual([]);
  });

  it('an untagged story from a ring-local source names the source’s best place', () => {
    expect(whyChips(ctxFor(), A(SRC.arkadelphian), SRC.arkadelphian)).toEqual(['Arkadelphia']);
  });
});
