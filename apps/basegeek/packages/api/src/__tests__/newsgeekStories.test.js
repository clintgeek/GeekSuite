/**
 * newsgeekStories.test.js — stories on Today, the pure part (2026-11-27):
 * graphql/newsgeek/dedupe.js collapseStories (voices, the section vote, the
 * representative) and what ranking.js does with them (coverage, Top Stories,
 * notices and lone search results, wire copy, the per-source cap).
 * DOCS/NEWSGEEK_PLAN.md "Stories on the front page". Plain rows in.
 */
import {
  createContext, rankFrontPage, judge, coverage, kindWeight, sectionLocality, sectionOf, sourceCap, recentVoices, topScore,
  isWireAuthor, typicalGapMs, freshness, voicesChip,
  TOP_KEY, TOP_TITLE, TOP_QUOTA, TOP_MIN_VOICES, VOICE_WINDOW_HOURS, COVERAGE_FULL_VOICES, OFFICIAL_WEIGHT,
  LONE_AGGREGATOR_WEIGHT, LONE_TITLE_ONLY_WEIGHT, ARKANSAS_WEIGHT, RING_WEIGHTS, WINDOW_DAYS,
} from '../graphql/newsgeek/ranking.js';
import {
  collapseStories, collapseDuplicates, storySection, sectionVote, outletKey, ALSO_IN_MAX,
} from '../graphql/newsgeek/dedupe.js';

const H = 3600 * 1000;
const D = 24 * H;
const NOW = new Date('2026-11-27T12:00:00Z').getTime();
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
place('miller', 'Miller County', 'county', 'arkansas');
place('texarkana', 'Texarkana', 'town', 'miller');
const id = (slug) => P[slug]._id;
const RING = ['arkadelphia', 'clark', 'hot-springs', 'little-rock', 'garland'].map(id);

const S = (key, over = {}) => ({ _id: `s-${key}`, name: key, kind: 'journalism', sections: ['local'], places: [], access: { paywall: 'none', content: 'excerpt' }, ...over });
const SRC = {
  arkadelphian: S('The Arkadelphian', { places: [id('clark'), id('arkadelphia')] }),
  sentinel: S('Sentinel-Record', { places: [id('garland'), id('hot-springs')], access: { paywall: 'hard', content: 'excerpt' } }),
  texarkana: S('Texarkana Today', { places: [id('texarkana'), id('miller')] }),
  katv: S('KATV', { sections: ['state'], places: [id('arkansas')] }),
  kark: S('KARK', { sections: ['state'], places: [id('arkansas')] }),
  thv: S('THV11', { sections: ['state'], places: [id('arkansas')] }),
  dg: S('Democrat-Gazette', { sections: ['state'], places: [id('arkansas')], access: { paywall: 'hard', content: 'excerpt' } }),
  logCabin: S('Log Cabin Democrat', { sections: ['state'], places: [id('arkansas')], access: { paywall: 'metered', content: 'excerpt' } }),
  signal: S('The OBU Signal', { places: [id('arkadelphia')] }),
  hill: S('The Hill', { sections: ['national'], places: [id('us')] }),
  pbs: S('PBS NewsHour', { sections: ['national'], places: [id('us')] }),
  npr: S('NPR', { sections: ['national', 'world'], places: [id('us')] }),
  bbc: S('BBC News', { sections: ['world'], access: { paywall: 'metered', content: 'excerpt' } }),
  verge: S('The Verge', { sections: ['tech'] }),
  hn: S('Hacker News', { sections: ['tech'], access: { paywall: 'none', content: 'title' } }),
  gnAp: S('Google News: AP', { kind: 'aggregator', sections: ['national', 'world'], places: [id('us')] }),
  gnLr: S('Google News: Little Rock', { kind: 'aggregator', sections: ['local'], places: [id('little-rock')] }),
  city: S('City of Hot Springs', { kind: 'official', places: [id('hot-springs')] }),
};
const SOURCES = Object.values(SRC);
const sourceById = new Map(SOURCES.map((s) => [s._id, s]));
const ctxFor = (over = {}) => createContext({ places: Object.values(P), homePlaces: RING, now: NOW, ...over });

let n = 0;
const A = (source, title, over = {}) => {
  n += 1;
  return {
    _id: `a-${String(n).padStart(4, '0')}`,
    sourceId: source._id,
    title,
    publisher: over.publisher || source.name,
    publisherDomain: over.publisherDomain || null,
    url: `https://x.test/${n}`,
    publishedAt: ago(over.age ?? H),
    places: [...(source.places || []), ...(over.own || []).map(id)],
    storyId: over.story ?? null,
    expiresAt: over.expiresAt ?? null,
    ...(over.wire ? { wire: true } : {}),
  };
};
const stories = (articles, ctx = ctxFor()) => collapseStories({ ctx, articles, sourceById });
const one = (articles, ctx) => {
  const out = stories(articles, ctx).filter((u) => u.members.length > 1);
  expect(out).toHaveLength(1);
  return out[0];
};
const QUOTAS = { local: 8, state: 5, national: 5, world: 3, tech: 4, around: 3 };
const rank = (candidates, { ctx = ctxFor(), quotas = QUOTAS, counts = new Map() } = {}) =>
  rankFrontPage({ ctx, candidates, sources: SOURCES, counts, quotas, collapse: collapseStories });
const titlesIn = (sections, key) => (sections.find((s) => s.key === key)?.items || []).map((e) => e.article.title);
const itemIn = (sections, key, title) => sections.find((s) => s.key === key)?.items.find((e) => e.article.title === title);

describe('collapseStories: one unit per story', () => {
  it('articles that share a story are one unit; its voices are its distinct outlets', () => {
    const u = one([
      A(SRC.hill, 'Court strikes down tariff order', { story: 'st1', age: 5 * H }),
      A(SRC.pbs, 'Justices void the tariff order', { story: 'st1', age: 4 * H }),
      A(SRC.npr, 'Supreme Court rules against tariffs', { story: 'st1', age: 3 * H }),
    ]);
    expect(u.voices).toBe(3);
    expect(u.alsoIn).toHaveLength(2);
    expect(u.members).toHaveLength(3);
  });

  it('twelve articles from one outlet are one voice', () => {
    const many = Array.from({ length: 12 }, (_, i) => A(SRC.hill, `Tariff ruling angle number ${i}`, { story: 'st1', age: (i + 1) * H }));
    const u = one([...many, A(SRC.pbs, 'Justices void the tariff order', { story: 'st1' })]);
    expect(u.voices).toBe(2);
    expect(u.alsoIn).toHaveLength(1); // one link per other outlet
  });

  it('syndicated copies (the same headline on three stations) are one telling, credited to whoever had it first', () => {
    const T = 'Court strikes down the tariff order in a 6-3 ruling';
    const u = one([
      A(SRC.gnAp, T, { story: 'st1', age: 6 * H, publisher: 'AP News' }),
      A(SRC.kark, T, { story: 'st1', age: 5 * H }),
      A(SRC.thv, T, { story: 'st1', age: 4 * H }),
      A(SRC.hill, 'Tariff order falls at the Supreme Court', { story: 'st1', age: 3 * H }),
    ]);
    expect(u.voices).toBe(2);
    expect(u.voiceTimes.map((v) => v.outlet).sort()).toEqual(['apnews', 'hill']);
  });

  it('articles with no story yet are exactly what collapseDuplicates decided', () => {
    const rows = [A(SRC.hill, 'One story about one thing here'), A(SRC.pbs, 'Another story about another thing')];
    const out = stories(rows);
    const plain = collapseDuplicates({ ctx: ctxFor(), articles: rows, sourceById });
    expect(out.map((u) => u.rep._id).sort()).toEqual(plain.map((u) => u.rep._id).sort());
    expect(out.every((u) => u.voices === 1 && u.members.length === 1)).toBe(true);
  });

  it('an official notice never joins a story, even carrying its id', () => {
    const out = stories([
      A(SRC.city, 'Board of Directors agenda for Tuesday', { story: 'st1' }),
      A(SRC.sentinel, 'City board to vote on the budget Tuesday', { story: 'st1' }),
      A(SRC.katv, 'Hot Springs board takes up its budget', { story: 'st1' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((u) => u.source.kind === 'official').members).toHaveLength(1);
  });

  it('alsoIn stops at ALSO_IN_MAX', () => {
    const outlets = [SRC.hill, SRC.pbs, SRC.npr, SRC.bbc, SRC.verge, SRC.katv, SRC.kark, SRC.thv];
    const u = one(outlets.map((s, i) => A(s, `A different headline about the ruling ${i}`, { story: 'st1' })));
    expect(u.voices).toBe(8);
    expect(u.alsoIn).toHaveLength(ALSO_IN_MAX);
  });

  it('outletKey: one outlet however it is written', () => {
    expect(outletKey({ publisher: 'The Arkadelphian' })).toBe(outletKey({ publisher: 'Arkadelphian' }));
    expect(outletKey({ publisher: '' }, { name: 'KATV' })).toBe('katv');
  });
});

describe('the story’s section is a vote', () => {
  const ctx = ctxFor();

  it('four statewide outlets each naming Little Rock: Local', () => {
    const u = one([SRC.katv, SRC.kark, SRC.thv, SRC.dg].map((s, i) => A(s, `Man arrested in Neely Road arson, telling ${i}`, { story: 'st1', own: ['little-rock'] })));
    expect(u.section).toBe('local');
  });

  it('a national story with one local angle stays National', () => {
    const u = one([
      A(SRC.hill, 'Nvidia reinstates its chief executive', { story: 'st1' }),
      A(SRC.pbs, 'Nvidia board brings back its CEO', { story: 'st1' }),
      A(SRC.npr, 'Nvidia chief returns after board reversal', { story: 'st1' }),
      A(SRC.thv, 'Little Rock investors react to Nvidia news', { story: 'st1', own: ['little-rock'] }),
    ]);
    expect(u.section).toBe('national');
  });

  it('the hometown paper’s label is a weak vote: with more statewide outlets and no place named, the story is State', () => {
    const u = one([
      A(SRC.arkadelphian, 'Lawmaker files bill to replace Medicaid expansion', { story: 'st1' }),
      A(SRC.katv, 'Bill would replace Medicaid expansion program', { story: 'st1' }),
      A(SRC.kark, 'Republican files Medicaid expansion replacement', { story: 'st1' }),
    ]);
    expect(sectionVote(ctx, u.members.find((m) => m.source === SRC.arkadelphian).article, SRC.arkadelphian)).toEqual({ section: 'local', strong: false });
    expect(u.section).toBe('state');
  });

  it('the hometown paper and another town’s paper: Local, as before stories', () => {
    const u = one([
      A(SRC.arkadelphian, 'Weekend rain chances ahead for the area', { story: 'st1' }),
      A(SRC.texarkana, 'Rain expected across the region this weekend', { story: 'st1' }),
    ]);
    expect(u.section).toBe('local');
  });

  it('the wire rule: a station and the wire, nobody naming Arkansas, is National', () => {
    const u = one([
      A(SRC.thv, 'Libyan army vows retaliation after drone strike', { story: 'st1' }),
      A(SRC.gnAp, 'Two Libyan naval officers die after drone attack', { story: 'st1', publisher: 'AP News' }),
    ]);
    expect(u.section).toBe('national');
  });

  it('a world newsroom’s label outvotes the wire’s (AP reaches us labelled national, whatever it reports)', () => {
    const u = one([
      A(SRC.bbc, 'Deadly fire erupts near Cairo', { story: 'st1' }),
      A(SRC.gnAp, 'A fire on a Cairo highway kills at least 30', { story: 'st1', publisher: 'AP News' }),
      A(SRC.gnAp, 'At least 30 killed in blaze in Egypt', { story: 'st1', publisher: 'Reuters' }),
    ]);
    expect(u.section).toBe('world');
  });

  it('ties go to the earlier front-page section', () => {
    const members = [
      { outlet: 'a', vote: { section: 'tech', strong: true }, article: {}, source: SRC.verge },
      { outlet: 'b', vote: { section: 'national', strong: true }, article: {}, source: SRC.hill },
    ];
    expect(storySection(ctx, members)).toBe('national');
  });
});

describe('the story’s representative', () => {
  it('a telling that is itself in the story’s section: a Local story is shown by its local telling', () => {
    const u = one([
      A(SRC.hill, 'Hot Springs park named in national parks funding fight', { story: 'st1', age: H }),
      A(SRC.katv, 'Hot Springs National Park faces funding cut', { story: 'st1', own: ['hot-springs'], age: 2 * H }),
      A(SRC.kark, 'Funding cut looms for Hot Springs National Park', { story: 'st1', own: ['hot-springs'], age: 3 * H }),
    ]);
    expect(u.section).toBe('local');
    expect(u.source).not.toBe(SRC.hill);
  });

  it('a ★ Favorite represents a story in its own section, not one that belongs elsewhere', () => {
    const ctx = ctxFor({ favoriteSourceIds: [SRC.arkadelphian._id] });
    const local = one([
      A(SRC.arkadelphian, 'Weekend rain chances ahead for the area', { story: 'st1', age: 20 * H }),
      A(SRC.texarkana, 'Rain expected across the region this weekend', { story: 'st1', age: H }),
    ], ctx);
    expect(local.source).toBe(SRC.arkadelphian);
    const state = one([
      A(SRC.arkadelphian, 'Lawmaker files bill to replace Medicaid expansion', { story: 'st2' }),
      A(SRC.katv, 'Bill would replace Medicaid expansion program', { story: 'st2' }),
      A(SRC.kark, 'Republican files Medicaid expansion replacement', { story: 'st2' }),
    ], ctx);
    expect(state.section).toBe('state');
    expect(state.source).not.toBe(SRC.arkadelphian);
    expect(state.alsoIn.map((x) => x.publisher)).toContain('The Arkadelphian');
  });

  it('the favourite’s copy of a statehouse story earns no ★ boost in State', () => {
    const ctx = ctxFor({ favoriteSourceIds: [SRC.arkadelphian._id] });
    const T = 'Republican lawmaker files bill to replace Medicaid expansion';
    // The favourite's copy is the most readable one (the others are walled), so it IS the face.
    const rows = [
      A(SRC.arkadelphian, T, { story: 'st1', age: 30 * H }),
      A(SRC.dg, T, { story: 'st1', age: 31 * H }),
      A(SRC.logCabin, 'Bill would replace the Medicaid expansion program', { story: 'st1', age: 32 * H }),
      A(SRC.katv, 'A fresh statehouse report about something else', { age: H }),
    ];
    const u = stories(rows, ctx).find((x) => x.members.length > 1);
    expect(u.section).toBe('state');
    expect(u.source).toBe(SRC.arkadelphian);
    expect(u.repOwn).toBe(false);
    const state = rank(rows, { ctx }).find((x) => x.key === 'state').items;
    // No lead, no ×3, no chip: the fresh report is first.
    expect(state.map((e) => e.article.title)).toEqual(['A fresh statehouse report about something else', T]);
    expect(state[1].why).not.toContain('★ Favorite');
    expect(state[1].priority).toBe('normal');
  });

  it('between two hometown papers telling a Local story, the ★ Favorite is its face', () => {
    const rows = [
      A(SRC.arkadelphian, 'Humane Society scores land to build new shelter', { story: 'st1', age: 5 * H }),
      A(SRC.signal, 'Humane Society gets land to build its new shelter', { story: 'st1', age: H }),
    ];
    expect(one(rows).source).toBe(SRC.signal); // nobody's favourite: the newest words
    expect(one(rows, ctxFor({ favoriteSourceIds: [SRC.arkadelphian._id] })).source).toBe(SRC.arkadelphian);
  });

  it('...and on its own beat it does: a Local story is led by the favourite, with the chip', () => {
    const ctx = ctxFor({ favoriteSourceIds: [SRC.arkadelphian._id] });
    const rows = [
      A(SRC.arkadelphian, 'Weekend rain chances ahead for the area', { story: 'st1', age: 30 * H }),
      A(SRC.texarkana, 'Rain expected across the region this weekend', { story: 'st1', age: 29 * H }),
      A(SRC.sentinel, 'A fresh Hot Springs report about something else', { age: H }),
    ];
    const local = rank(rows, { ctx }).find((x) => x.key === 'local').items;
    expect(local[0].source).toBe(SRC.arkadelphian);
    expect(local[0].why).toContain('★ Favorite');
  });

  it('a hard paywall is not the face of a story when anything else is', () => {
    const u = one([
      A(SRC.dg, 'Army calls detonation of bomb chemicals in Iowa a success', { story: 'st1', age: H, wire: true }),
      A(SRC.sentinel, 'Army calls the detonation of bomb chemicals in Iowa a success', { story: 'st1', age: 2 * H, wire: true }),
      A(SRC.hill, 'Acting Army Secretary hails Iowa detonation', { story: 'st1', age: 3 * H }),
    ]);
    expect(u.source).toBe(SRC.hill);
  });

  it('a title-only post of a newsroom’s story does not front it', () => {
    const T = 'Iranian authorities flog singer who performed without hijab';
    const u = one([A(SRC.bbc, T, { story: 'st1', age: 5 * H }), A(SRC.hn, T, { story: 'st1', age: 2 * H })]);
    expect(u.section).toBe('world');
    expect(u.source).toBe(SRC.bbc);
  });

  it('a national story is shown by a national newsroom, not by the Arkansas paper that ran the wire', () => {
    const u = one([
      A(SRC.sentinel, 'Court strikes down the tariff order', { story: 'st1', age: H, wire: true }),
      A(SRC.pbs, 'Supreme Court strikes down tariff order', { story: 'st1', age: 3 * H }),
    ]);
    expect(u.section).toBe('national');
    expect(u.source).toBe(SRC.pbs);
  });

  it('the report over a live blog, a podcast or a video', () => {
    const u = one([
      A(SRC.hill, 'Live updates: Army detonation in Iowa set for Wednesday', { story: 'st1', age: H }),
      A(SRC.pbs, 'WATCH LIVE: Army offers update after Iowa detonation', { story: 'st1', age: H }),
      A(SRC.npr, 'Army detonates five tons of explosives in Iowa', { story: 'st1', age: 2 * H }),
    ]);
    expect(u.source).toBe(SRC.npr);
  });

  it('a typical headline over an angle', () => {
    const u = one([
      A(SRC.pbs, 'From her apartment, a photographer captures a unique view', { story: 'st1', age: H }),
      A(SRC.hill, 'Thanksgiving parade postponed over storm forecast', { story: 'st1', age: 2 * H }),
      A(SRC.npr, 'Storm forecast forces Thanksgiving parade to be postponed', { story: 'st1', age: 3 * H }),
    ]);
    expect(u.source).not.toBe(SRC.pbs);
  });

  it('a link that opens: direct and free, then a search result, then a paywall', () => {
    const T = 'Court strikes down the tariff order in a 6-3 ruling';
    // The same wire story on a free station and through Google News: the station's copy.
    const station = one([A(SRC.gnAp, T, { story: 'st9', publisher: 'AP News', age: 2 * H }), A(SRC.katv, T, { story: 'st9', age: H })]);
    expect(station.section).toBe('national');
    expect(station.source).toBe(SRC.katv);
    // ...and on a hard-paywalled paper: the search result, which at least opens.
    const walled = one([A(SRC.gnAp, T, { story: 'st8', publisher: 'AP News', age: 2 * H }), A(SRC.dg, T, { story: 'st8', age: H })]);
    expect(walled.source).toBe(SRC.gnAp);
  });

  it('direct over aggregator, then free over paywalled', () => {
    const direct = one([
      A(SRC.gnLr, 'Compassion Center serves Thanksgiving meals', { story: 'st1', own: [], publisher: 'FOX16.com', age: H }),
      A(SRC.katv, 'Compassion Center serves Thanksgiving meals to hundreds', { story: 'st1', own: ['little-rock'], age: 2 * H }),
    ]);
    expect(direct.source).toBe(SRC.katv);
    const free = one([
      A(SRC.dg, 'Compassion Center serves up Thanksgiving meals', { story: 'st2', own: ['little-rock'], age: H }),
      A(SRC.katv, 'Compassion Center serves Thanksgiving meals to hundreds', { story: 'st2', own: ['little-rock'], age: 2 * H }),
    ]);
    expect(free.source).toBe(SRC.katv);
  });

  it('a paper that runs Tuesday’s wire story on Thursday has not made it fresh (toldAt)', () => {
    const T = 'China launches spacecraft carrying three astronauts into orbit';
    const u = one([
      A(SRC.gnAp, T, { story: 'st1', age: 55 * H, publisher: 'AP News' }),
      A(SRC.sentinel, T, { story: 'st1', age: H }),
      A(SRC.pbs, 'Chinese crew lifts off for the space station', { story: 'st1', age: 50 * H }),
    ]);
    const late = u.members.find((m) => m.source === SRC.sentinel);
    expect(late.toldAt).toBe(NOW - 55 * H);
    expect(u.toldAt).toBeLessThanOrEqual(NOW - 50 * H);
  });
});

describe('coverage in the score', () => {
  it('is 0 alone, 1 at COVERAGE_FULL_VOICES, and the second outlet matters more than the eighth', () => {
    expect(coverage(1)).toBe(0);
    expect(coverage(COVERAGE_FULL_VOICES)).toBe(1);
    expect(coverage(50)).toBe(1);
    expect(coverage(2) - coverage(1)).toBeGreaterThan(coverage(8) - coverage(7));
  });

  it('a story two outlets told outranks a fresher story told once', () => {
    const out = rank([
      A(SRC.hill, 'A lone and very fresh report about something', { age: H }),
      A(SRC.pbs, 'Governor signs the highway funding bill', { story: 'st1', age: 8 * H }),
      A(SRC.npr, 'Highway funding bill signed into law', { story: 'st1', age: 8 * H }),
    ]);
    expect(titlesIn(out, 'national')[0]).not.toBe('A lone and very fresh report about something');
    expect(out.find((s) => s.key === 'national').items[0].why).toContain(voicesChip(2));
  });

  it('only outlets from the last VOICE_WINDOW_HOURS count: Monday’s fifteen are not Friday’s', () => {
    const ctx = ctxFor();
    const old = { voiceTimes: ['a', 'b', 'c', 'd'].map((outlet) => ({ outlet, at: NOW - (VOICE_WINDOW_HOURS + 1) * H })) };
    expect(recentVoices(ctx, old).count).toBe(0);
    const mixed = { voiceTimes: [...old.voiceTimes, { outlet: 'e', at: NOW - H }, { outlet: 'e', at: NOW - 2 * H }] };
    expect(recentVoices(ctx, mixed)).toEqual({ count: 1, newestAt: NOW - H });
  });
});

describe('Top Stories', () => {
  const big = (story, titles, over = {}) => [SRC.hill, SRC.pbs, SRC.npr, SRC.bbc].slice(0, titles.length).map((s, i) => A(s, titles[i], { story, age: 6 * H, ...over }));

  it('needs TOP_MIN_VOICES outlets in the window; leads the paper; is not printed again in its section', () => {
    const three = big('st1', ['Court strikes down tariff order today', 'Justices void the tariff order', 'Tariff order falls at Supreme Court']);
    const two = big('st2', ['Senate passes the farm bill', 'Farm bill clears the Senate']);
    const out = rank([...three, ...two]);
    expect(TOP_MIN_VOICES).toBe(3);
    expect(out[0].key).toBe(TOP_KEY);
    expect(out[0].title).toBe(TOP_TITLE);
    expect(out[0].moreCount).toBe(0);
    expect(out[0].items).toHaveLength(1);
    const national = titlesIn(out, 'national');
    expect(national).toHaveLength(1); // the farm bill; the tariff story is in Top only
    expect(three.map((a) => a.title)).not.toContain(national[0]);
  });

  it('its chips say how many told it and where it would otherwise be', () => {
    const out = rank(big('st1', ['Court strikes down tariff order today', 'Justices void the tariff order', 'Tariff order falls at Supreme Court']));
    expect(out[0].items[0].why.slice(0, 2)).toEqual(['3 sources', 'National']);
  });

  it('no story with three outlets: no Top Stories, and the paper is as before', () => {
    const out = rank(big('st2', ['Senate passes the farm bill', 'Farm bill clears the Senate']));
    expect(out.map((s) => s.key)).toEqual(['national']);
  });

  it('holds at most TOP_QUOTA; the rest stay in their sections', () => {
    const all = [];
    for (let i = 0; i < TOP_QUOTA + 2; i += 1) {
      all.push(...big(`st${i}`, [`Event ${i} happens somewhere today`, `Somewhere, event ${i} happened`, `What to know about event ${i}`]));
    }
    // National at 20 so the per-source cap (5 there) is not what this test measures.
    const out = rank(all, { quotas: { ...QUOTAS, national: 20 } });
    expect(out[0].items).toHaveLength(TOP_QUOTA);
    expect(titlesIn(out, 'national')).toHaveLength(2);
  });

  it('a ring story is lifted: three outlets on Little Rock beat four on a far-away event of the same age', () => {
    const ctx = ctxFor();
    const far = topScore(ctx, { count: 4, newestAt: NOW - 6 * H }, 0);
    const near = topScore(ctx, { count: 3, newestAt: NOW - 6 * H }, RING_WEIGHTS[0]);
    expect(near).toBeGreaterThan(far);
    expect(topScore(ctx, { count: 2, newestAt: NOW }, 1)).toBe(0);
  });

  it('an active alert stays at the head of Local, never in Top', () => {
    const alert = A(SRC.city, 'Tornado Warning for Garland County', { expiresAt: new Date(NOW + H) });
    const out = rank([alert, ...big('st1', ['Court strikes down tariff order today', 'Justices void the tariff order', 'Tariff order falls at Supreme Court'])]);
    expect(titlesIn(out, 'local')).toEqual(['Tornado Warning for Garland County']);
  });
});

describe('what kind of item it is', () => {
  const ctx = ctxFor();

  it('a notice ranks under a report; an active alert does not', () => {
    const notice = A(SRC.city, 'Civil Service Commission Meeting');
    const alert = A(SRC.city, 'Tornado Warning', { expiresAt: new Date(NOW + H) });
    expect(kindWeight(ctx, notice, SRC.city)).toBe(OFFICIAL_WEIGHT);
    expect(kindWeight(ctx, alert, SRC.city)).toBe(1);
    const out = rank([A(SRC.city, 'Civil Service Commission Meeting', { age: H }), A(SRC.sentinel, 'Garland County man charged after stabbing', { age: H })]);
    expect(titlesIn(out, 'local')).toEqual(['Garland County man charged after stabbing', 'Civil Service Commission Meeting']);
  });

  it('a lone search result and a lone title-only post rank under a report, until a second outlet tells the story', () => {
    const hit = A(SRC.gnLr, 'Arkansas High School vs. El Dorado High School', { publisher: 'FloWrestling' });
    expect(kindWeight(ctx, hit, SRC.gnLr, 1)).toBe(LONE_AGGREGATOR_WEIGHT);
    expect(kindWeight(ctx, hit, SRC.gnLr, 2)).toBe(1);
    const post = A(SRC.hn, 'Buy Nothing Day');
    expect(kindWeight(ctx, post, SRC.hn, 1)).toBe(LONE_TITLE_ONLY_WEIGHT);
    expect(kindWeight(ctx, post, SRC.hn, 2)).toBe(1);
    expect(kindWeight(ctx, A(SRC.verge, 'A report'), SRC.verge, 1)).toBe(1);
  });
});

describe('locality is earned in the story’s section', () => {
  const ctx = ctxFor();

  it('the ring counts only in Local', () => {
    const a = A(SRC.arkadelphian, 'Lawmaker files bill to replace Medicaid expansion');
    expect(sectionLocality(ctx, a, SRC.arkadelphian, 'local').value).toBe(RING_WEIGHTS[0]);
    const inState = sectionLocality(ctx, a, SRC.arkadelphian, 'state');
    expect(inState.value).toBe(ARKANSAS_WEIGHT);
    expect(judge(ctx, a, SRC.arkadelphian, 7, 'state').why).not.toContain('Arkadelphia');
  });

  it('in National, “Arkansas” counts only when the story names an Arkansas place itself', () => {
    const wire = A(SRC.dg, 'China launches spacecraft with three astronauts');
    expect(sectionLocality(ctx, wire, SRC.dg, 'national').value).toBe(0);
    expect(judge(ctx, wire, SRC.dg, 7, 'national').why).toEqual([]);
    const named = A(SRC.hill, 'Senator from Texarkana leads the farm bill', { own: ['texarkana'] });
    expect(sectionLocality(ctx, named, SRC.hill, 'national').value).toBe(ARKANSAS_WEIGHT);
  });
});

describe('wire copy', () => {
  it('is known by its byline', () => {
    for (const a of ['The Associated Press', 'ALI SWENSON The Associated Press', 'Reuters', 'AP', 'Stateline']) expect(isWireAuthor(a)).toBe(true);
    for (const a of ['Tia Lyons', 'Staff Reports', '', null, 'Apollo Jones']) expect(isWireAuthor(a)).toBe(false);
  });

  it('inherits nothing from the paper that carried it: National, no ring chip', () => {
    const ctx = ctxFor();
    const wire = A(SRC.sentinel, 'Wall Street recovers most early losses', { wire: true });
    expect(sectionOf(ctx, wire, SRC.sentinel)).toBe('national');
    expect(judge(ctx, wire, SRC.sentinel, 7).why).toEqual([]);
    // The same article unmarked is Local for this reader, as before.
    expect(sectionOf(ctx, { ...wire, wire: undefined }, SRC.sentinel)).toBe('local');
  });

  it('wire copy that names a ring place is still Local', () => {
    const ctx = ctxFor();
    const wire = A(SRC.katv, 'Federal grant goes to Hot Springs airport', { wire: true, own: ['hot-springs'] });
    expect(sectionOf(ctx, wire, SRC.katv)).toBe('local');
  });
});

describe('the per-source cap', () => {
  it('a ★ Favorite may take half the block, any other source a quarter (at least one)', () => {
    expect(sourceCap(8, 'favorite')).toBe(4);
    expect(sourceCap(5, 'favorite')).toBe(3);
    expect(sourceCap(8, 'normal')).toBe(2);
    expect(sourceCap(5, 'normal')).toBe(1);
    expect(sourceCap(3, 'normal')).toBe(1);
    expect(sourceCap(4, 'less')).toBe(1);
  });

  it('Local: four from the favourite, two from any other paper, and the rest of the ring gets in', () => {
    const ctx = ctxFor({ favoriteSourceIds: [SRC.arkadelphian._id] });
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => A(SRC.arkadelphian, `Arkadelphian report number ${i}`, { age: (i + 1) * H })),
      ...Array.from({ length: 5 }, (_, i) => A(SRC.sentinel, `Sentinel report number ${i}`, { age: (i + 1) * H })),
      A(SRC.katv, 'Little Rock council votes on budget', { own: ['little-rock'], age: 2 * H }),
    ];
    const local = rank(rows, { ctx }).find((s) => s.key === 'local').items;
    const from = (s) => local.filter((e) => e.source === s).length;
    expect(from(SRC.arkadelphian)).toBe(4);
    expect(from(SRC.sentinel)).toBe(2);
    expect(from(SRC.katv)).toBe(1);
  });
});

describe('the pace clamp (2026-11-27)', () => {
  it('typicalGap is 7 days / weekly count, clamped to [6 h, 1 day]', () => {
    expect(typicalGapMs(7)).toBe(D);
    expect(typicalGapMs(14)).toBe(12 * H);
    expect(typicalGapMs(280)).toBe(6 * H);
    expect(typicalGapMs(0)).toBe(D);
  });

  it('a busy newsroom’s story from yesterday evening is still alive at breakfast', () => {
    // Before: exp(-15 / 3) = 0.007. For ten mornings no daily paper made Local.
    expect(freshness(15 * H, 280, WINDOW_DAYS * D)).toBeGreaterThan(0.35);
  });

  it('pace still helps: at the same age the weekly paper’s story is fresher than the firehose’s', () => {
    expect(freshness(D, 7, WINDOW_DAYS * D)).toBeGreaterThan(2 * freshness(D, 280, WINDOW_DAYS * D));
  });

  it('...but a slow feed’s story no longer stays fresh for a week', () => {
    expect(freshness(4 * D, 1, WINDOW_DAYS * D)).toBeLessThan(0.15);
  });
});
