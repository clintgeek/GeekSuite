/**
 * notegeekSuggestRanking.test.js
 *
 * The local, model-free half of AI_IDEAS #3, pinned as pure functions.
 *
 * What matters here is not "does TF-IDF work" — it is the product rules that
 * ride on it and that a later refactor could quietly lose:
 *
 *   - a tag the user has never used can never be suggested;
 *   - a tag already on the note is not suggested again;
 *   - the note being written is never offered as related to itself;
 *   - the title outweighs the body, because it is the more reliable signal;
 *   - the model may reorder candidates and nothing else — not their titles,
 *     not their scores, and never an id it was not given.
 */

import { describe, test, expect } from '@jest/globals';

const {
  tokenize,
  rankByCosine,
  localSuggestions,
  validateRerank,
  applyRerank,
  buildCandidates,
  MAX_SUGGESTIONS,
} = await import('../graphql/notegeek/suggest.js');

const id = (n) => `00000000000000000000000${ n }`;

const CORPUS = [
  { _id: id(1), title: 'Watchtower digest landmine', tags: ['homelab', 'docker'] },
  { _id: id(2), title: 'nginx layout and the wildcard cert', tags: ['homelab', 'nginx'] },
  { _id: id(3), title: 'Sourdough starter schedule', tags: ['baking'] },
  { _id: id(4), title: 'Reverse proxy notes for nginx', tags: ['nginx'] },
  { _id: id(5), title: '', tags: ['untitled-tag'] },
];

describe('tokenize', () => {
  test('strips HTML, urls and stop words, and splits tag separators', () => {
    expect(tokenize('<p>The <b>nginx</b> proxy</p>')).toEqual(['nginx', 'proxy']);
    expect(tokenize('see https://example.com/nginx for more')).toEqual(['see']);
    expect(tokenize('blood-pressure homelab/nginx')).toEqual(['blood', 'pressure', 'homelab', 'nginx']);
  });

  test('null and empty input are not an error', () => {
    expect(tokenize(null)).toEqual([]);
    expect(tokenize('')).toEqual([]);
    expect(tokenize('a an the of')).toEqual([]);
  });
});

describe('rankByCosine', () => {
  test('an empty query or an empty corpus ranks nothing', () => {
    expect(rankByCosine([], [{ key: 'a', tokens: ['x'], payload: 'a' }])).toEqual([]);
    expect(rankByCosine(['x'], [])).toEqual([]);
  });

  test('scores are bounded, ordered, and zero-scoring docs are dropped', () => {
    const docs = [
      { key: 'a', payload: 'a', tokens: ['nginx', 'proxy'] },
      { key: 'b', payload: 'b', tokens: ['sourdough', 'starter'] },
    ];
    const ranked = rankByCosine(['nginx'], docs);
    expect(ranked.map((r) => r.key)).toEqual(['a']);
    expect(ranked[0].score).toBeGreaterThan(0);
    expect(ranked[0].score).toBeLessThanOrEqual(1);
  });

  test('ties break deterministically, so the same input never reshuffles', () => {
    const docs = [
      { key: 'b', payload: 'b', tokens: ['nginx'] },
      { key: 'a', payload: 'a', tokens: ['nginx'] },
    ];
    expect(rankByCosine(['nginx'], docs).map((r) => r.key)).toEqual(['a', 'b']);
  });
});

describe('localSuggestions', () => {
  test('suggests only tags the user already has', () => {
    const { tags } = localSuggestions({
      title: 'Kubernetes ingress and nginx',
      excerpt: 'kubernetes kubernetes kubernetes',
      tags: [],
      notes: CORPUS,
    });
    const names = tags.map((t) => t.tag);
    expect(names).toContain('nginx');
    // "kubernetes" is all over the query and is not one of the user's tags.
    expect(names).not.toContain('kubernetes');
    for (const name of names) {
      expect(CORPUS.some((n) => (n.tags || []).includes(name))).toBe(true);
    }
  });

  test('a tag already on the note is not offered again', () => {
    const without = localSuggestions({ title: 'nginx proxy', excerpt: '', tags: [], notes: CORPUS });
    expect(without.tags.map((t) => t.tag)).toContain('nginx');
    const withTag = localSuggestions({ title: 'nginx proxy', excerpt: '', tags: ['NGINX'], notes: CORPUS });
    expect(withTag.tags.map((t) => t.tag)).not.toContain('nginx');
  });

  test('the note being written is never related to itself, and untitled notes are not candidates', () => {
    const { related } = localSuggestions({
      title: 'nginx layout and the wildcard cert',
      excerpt: '',
      tags: [],
      noteId: id(2),
      notes: CORPUS,
    });
    const ids = related.map((r) => r.id);
    expect(ids).not.toContain(id(2));
    expect(ids).not.toContain(id(5));
    expect(ids).toContain(id(4));
  });

  test('the title outweighs the body', () => {
    const titled = localSuggestions({ title: 'sourdough starter', excerpt: 'nginx', tags: [], notes: CORPUS });
    expect(titled.related[0].id).toBe(id(3));
    const bodied = localSuggestions({ title: 'nginx', excerpt: 'sourdough starter', tags: [], notes: CORPUS });
    expect(bodied.related[0].id).not.toBe(id(3));
  });

  test('never returns more than five of either half', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      _id: id(100 + i),
      title: `nginx note ${ i }`,
      tags: [`tag-nginx-${ i }`],
    }));
    const out = localSuggestions({ title: 'nginx', excerpt: '', tags: [], notes: many });
    expect(out.related.length).toBe(MAX_SUGGESTIONS);
    expect(out.tags.length).toBe(MAX_SUGGESTIONS);
  });

  test('a note with nothing in common produces nothing rather than noise', () => {
    const out = localSuggestions({ title: 'zzzz qqqq', excerpt: '', tags: [], notes: CORPUS });
    expect(out.related).toEqual([]);
    expect(out.tags).toEqual([]);
  });
});

describe('the model may only reorder what it was given', () => {
  const candidateIds = new Set([id(1), id(2)]);

  test('validateRerank rejects invented, duplicated and malformed ids', () => {
    expect(validateRerank({ related: [{ id: id(1), why: 'both homelab' }] }, candidateIds)).toBe(true);
    expect(validateRerank({ related: [] }, candidateIds)).toBe(true);
    expect(validateRerank({ related: [{ id: id(9), why: 'x' }] }, candidateIds)).toBe(false);
    expect(validateRerank({ related: [{ id: id(1) }, { id: id(1) }] }, candidateIds)).toBe(false);
    expect(validateRerank({ related: [{ id: 7 }] }, candidateIds)).toBe(false);
    expect(validateRerank({ related: 'nope' }, candidateIds)).toBe(false);
    expect(validateRerank(null, candidateIds)).toBe(false);
  });

  test('applyRerank keeps our title and our score, and takes only the order', () => {
    const local = [
      { id: id(1), title: 'Watchtower digest landmine', score: 0.4, why: null },
      { id: id(2), title: 'nginx layout', score: 0.9, why: null },
    ];
    const out = applyRerank(local, [
      { id: id(1), why: 'both about watchtower' },
      { id: id(9), why: 'invented' },
    ]);
    expect(out.map((r) => r.id)).toEqual([id(1), id(2)]);
    expect(out[0]).toMatchObject({ title: 'Watchtower digest landmine', score: 0.4, why: 'both about watchtower' });
    // Anything the model left out keeps its local place behind what it chose.
    expect(out[1].why).toBeNull();
  });

  test('a candidate the keyword ranking scored at zero can still be surfaced', () => {
    // The whole reason the model half exists: it must be able to FIND a link,
    // not only to demote one. The title comes from the candidate we handed
    // over, and the score is an honest 0.
    const candidates = [{ id: id(7), title: 'Reverse proxy notes' }];
    const out = applyRerank([], [{ id: id(7), why: 'both about proxying' }], candidates);
    expect(out).toEqual([
      { id: id(7), title: 'Reverse proxy notes', score: 0, why: 'both about proxying' },
    ]);
  });

  test('an id in neither the local rows nor the candidates is dropped', () => {
    expect(applyRerank([], [{ id: id(9), why: 'invented' }], [])).toEqual([]);
  });
});

describe('buildCandidates', () => {
  test('drops the note itself and untitled notes, and caps the list', () => {
    const out = buildCandidates(CORPUS, id(1));
    expect(out.map((c) => c.id)).toEqual([id(2), id(3), id(4)]);
    expect(out.every((c) => typeof c.title === 'string' && c.title.length > 0)).toBe(true);
    const many = Array.from({ length: 80 }, (_, i) => ({ _id: id(200 + i), title: `t${ i }`, tags: [] }));
    expect(buildCandidates(many, null)).toHaveLength(50);
  });
});
