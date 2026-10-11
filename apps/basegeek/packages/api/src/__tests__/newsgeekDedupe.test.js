/**
 * newsgeekDedupe.test.js — duplicate collapse, the pure part
 * (graphql/newsgeek/dedupe.js; DOCS/NEWSGEEK_PLAN.md "Ingest hygiene", Chef
 * 2026-10-11). Plain rows in, groups out.
 */
import { createContext } from '../graphql/newsgeek/ranking.js';
import {
  dupKey, collapseDuplicates, ALSO_IN_MAX, DUP_WINDOW_MS,
} from '../graphql/newsgeek/dedupe.js';

const H = 3600 * 1000;
const NOW = new Date('2026-10-11T12:00:00Z').getTime();
const ago = (ms) => new Date(NOW - ms);

const P = {};
const place = (slug, name, kind, parent) => { P[slug] = { _id: `p-${slug}`, slug, name, kind, parentId: parent ? P[parent]._id : null }; };
place('us', 'United States', 'country', null);
place('arkansas', 'Arkansas', 'state', 'us');
place('clark', 'Clark County', 'county', 'arkansas');
place('arkadelphia', 'Arkadelphia', 'town', 'clark');
place('garland', 'Garland County', 'county', 'arkansas');
place('hot-springs', 'Hot Springs', 'town', 'garland');
place('pulaski', 'Pulaski County', 'county', 'arkansas');
place('little-rock', 'Little Rock', 'town', 'pulaski');
const id = (slug) => P[slug]._id;
const RING = ['arkadelphia', 'clark', 'hot-springs', 'little-rock', 'garland'].map(id);
const ctxFor = (over = {}) => createContext({ places: Object.values(P), homePlaces: RING, now: NOW, ...over });

const S = (key, over = {}) => ({ _id: `s-${key}`, name: key, kind: 'journalism', sections: ['local'], places: [], ...over });
const SRC = {
  arkadelphian: S('Arkadelphian', { places: [id('clark'), id('arkadelphia')] }),
  sentinel: S('Sentinel-Record', { places: [id('garland'), id('hot-springs')] }),
  katv: S('KATV', { sections: ['state'], places: [id('arkansas')] }),
  kark: S('KARK', { sections: ['state'], places: [id('arkansas')] }),
  thv: S('THV11', { sections: ['state'], places: [id('arkansas')] }),
  gnAp: S('Google News: AP', { kind: 'aggregator', sections: ['national', 'world'], places: [id('us')] }),
  gnArk: S('Google News: Arkadelphia', { kind: 'aggregator', sections: ['local'], places: [id('clark'), id('arkadelphia')] }),
  nws: S('NWS', { kind: 'official', places: [id('clark')] }),
  nws2: S('NWS SHV', { kind: 'official', places: [id('clark')] }),
};
const sourceById = new Map(Object.values(SRC).map((s) => [s._id, s]));

let n = 0;
const A = (source, title, over = {}) => {
  n += 1;
  const own = (over.own || []).map(id);
  return {
    _id: `a-${String(n).padStart(4, '0')}`, sourceId: source._id, title, publisher: over.publisher || source.name,
    publisherDomain: over.publisherDomain || null, url: `https://x.test/${n}`, publishedAt: ago(over.age ?? H),
    places: [...(source.places || []), ...own],
  };
};
const collapse = (articles, ctx = ctxFor()) => collapseDuplicates({ ctx, articles, sourceById });
const multi = (groups) => groups.filter((g) => g.members.length > 1);

const AP_TITLE = 'Governor signs prison funding bill into law';

describe('dupKey', () => {
  it('an obituary-shaped aggregator title keys on the name alone', () => {
    const t = 'Elendle Buck Obituary (2026) - Arkadelphia, AR - Smith Family Funeral Home';
    expect(dupKey({ title: t, publisher: 'Legacy.com', publisherDomain: 'legacy.com' }, SRC.gnArk)).toBe('elendle buck');
    expect(dupKey({ title: 'Elendle Buck' }, SRC.arkadelphian)).toBe('elendle buck');
    expect(dupKey({ title: 'Obituary: Elendle Buck' }, SRC.arkadelphian)).toBe('elendle buck');
    // A known obituary host makes it obituary-shaped even without the word.
    expect(dupKey({ title: 'Elendle Buck - Arkadelphia, AR', publisherDomain: 'www.dignitymemorial.com' }, SRC.gnArk)).toBe('elendle buck');
  });

  it('a trailing aggregator " - Publisher" is stripped (ingest does it too); other " - " titles stay whole', () => {
    expect(dupKey({ title: `${AP_TITLE} - AP News`, publisher: 'AP News' }, SRC.gnAp)).toBe('governor signs prison funding bill into law');
    expect(dupKey({ title: 'Razorbacks win - and the SEC notices' }, SRC.katv)).toBe('razorbacks win and the sec notices');
  });

  it('never for official sources or one-word keys', () => {
    expect(dupKey({ title: 'Heat Advisory issued October 11 by NWS Little Rock AR' }, SRC.nws)).toBeNull();
    expect(dupKey({ title: 'Obituaries' }, SRC.arkadelphian)).toBeNull();
  });
});

describe('collapseDuplicates', () => {
  it('AP copy across three sources → one group, alsoIn 2 (representative excluded)', () => {
    const rows = [A(SRC.katv, AP_TITLE, { age: 3 * H }), A(SRC.kark, AP_TITLE, { age: 2 * H }), A(SRC.thv, AP_TITLE, { age: H }), A(SRC.katv, 'Something else entirely happened today')];
    const groups = collapse(rows);
    expect(groups).toHaveLength(2);
    const [g] = multi(groups);
    expect(g.members).toHaveLength(3);
    expect(g.rep).toBe(rows[0]); // all direct state sources: earliest wins
    expect(g.alsoIn).toEqual([
      { publisher: 'KARK', url: rows[1].url, sourceId: SRC.kark._id },
      { publisher: 'THV11', url: rows[2].url, sourceId: SRC.thv._id },
    ]);
  });

  it(`alsoIn holds at most ${ALSO_IN_MAX}`, () => {
    const many = Array.from({ length: 8 }, (_, i) => S(`tv${i}`, { sections: ['state'] }));
    for (const s of many) sourceById.set(s._id, s);
    const g = multi(collapse(many.map((s) => A(s, AP_TITLE))))[0];
    expect(g.members).toHaveLength(8);
    expect(g.alsoIn).toHaveLength(ALSO_IN_MAX);
  });

  it('an obituary on the paper and on legacy.com → one; the direct paper wins', () => {
    const legacy = A(SRC.gnArk, 'Elendle Buck Obituary (2026) - Arkadelphia, AR - Smith Family Funeral Home', { publisher: 'Legacy.com', publisherDomain: 'legacy.com', age: 5 * H });
    const direct = A(SRC.arkadelphian, 'Elendle Buck', { age: 2 * H });
    const [g] = multi(collapse([legacy, direct]));
    expect(g.rep).toBe(direct);
    expect(g.alsoIn).toEqual([{ publisher: 'Legacy.com', url: legacy.url, sourceId: SRC.gnArk._id }]);
  });

  it('a short key without an obituary never groups ("Police Beat" twice is two columns)', () => {
    expect(multi(collapse([A(SRC.katv, 'Police Beat'), A(SRC.kark, 'Police Beat')]))).toEqual([]);
  });

  it('a ★ Favorite source wins the group, per reader', () => {
    const rows = [A(SRC.katv, AP_TITLE, { age: 3 * H }), A(SRC.kark, AP_TITLE, { age: 2 * H })];
    expect(multi(collapse(rows))[0].rep).toBe(rows[0]);
    expect(multi(collapse(rows, ctxFor({ favoriteSourceIds: [SRC.kark._id] })))[0].rep).toBe(rows[1]);
  });

  it('direct beats aggregator, then local beats state, then earliest', () => {
    const gn = A(SRC.gnAp, AP_TITLE, { publisher: 'AP News', age: 9 * H });
    const state = A(SRC.katv, AP_TITLE, { age: 8 * H });
    const local = A(SRC.sentinel, AP_TITLE, { age: H });
    const g = multi(collapse([gn, state, local]))[0];
    expect(g.members.map((m) => m.article)).toEqual([local, state, gn]);
  });

  it('72 h is the window: 71 h apart groups, 73 h apart does not', () => {
    expect(multi(collapse([A(SRC.katv, AP_TITLE, { age: 72 * H }), A(SRC.kark, AP_TITLE, { age: H })]))).toHaveLength(1);
    expect(multi(collapse([A(SRC.katv, AP_TITLE, { age: 74 * H }), A(SRC.kark, AP_TITLE, { age: H })]))).toEqual([]);
    expect(DUP_WINDOW_MS).toBe(72 * H);
  });

  it('never two articles from one source in a group; official sources never group', () => {
    expect(multi(collapse([A(SRC.katv, AP_TITLE, { age: 2 * H }), A(SRC.katv, AP_TITLE, { age: H })]))).toEqual([]);
    const alert = 'Flood Warning issued October 11 at 3:00PM CDT by NWS';
    expect(multi(collapse([A(SRC.nws, alert), A(SRC.nws2, alert)]))).toEqual([]);
  });

  it('the wire rule: no own Arkansas place + a national member → the group is National, not State', () => {
    const rows = [A(SRC.katv, AP_TITLE, { age: 2 * H }), A(SRC.gnAp, AP_TITLE, { publisher: 'AP News', age: H })];
    const g = multi(collapse(rows))[0];
    expect(g.rep).toBe(rows[0]);           // the state paper's copy represents it…
    expect(g.section).toBe('national');    // …but it is filed under National
    // Alone, the state copy is State (the per-story rule is unchanged).
    expect(collapse([rows[0]])[0].section).toBe('state');
  });

  it('a group with an own Arkansas place keeps the representative\'s section (local stays local)', () => {
    const rows = [A(SRC.katv, 'Arkadelphia council approves new water plant', { own: ['arkadelphia'], age: 2 * H }), A(SRC.gnAp, 'Arkadelphia council approves new water plant', { publisher: 'AP News', age: H })];
    const g = multi(collapse(rows))[0];
    expect(g.section).toBe('local');
  });

  it('inherited places don\'t count as own: a Sentinel-Record wire copy still leaves Local', () => {
    const rows = [A(SRC.sentinel, AP_TITLE, { age: 2 * H }), A(SRC.gnAp, AP_TITLE, { publisher: 'AP News', age: H })];
    expect(multi(collapse(rows))[0].section).toBe('national');
  });
});
