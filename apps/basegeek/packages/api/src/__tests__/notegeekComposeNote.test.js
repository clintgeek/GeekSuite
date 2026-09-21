/**
 * Compose — building a document out of a pile of scraps.
 *
 * The inverse of Tidy, so the invariants are inverted too. Tidy must not lose
 * content; Compose must lose content (that is the job) and must never return
 * something meant to overwrite the source.
 *
 * The cases that matter here are the ones Tidy and describe-and-log taught:
 * refuse rather than truncate, and report a partial failure rather than
 * returning a document that silently lacks a batch.
 */
import { jest } from '@jest/globals';
import { _resetCounters } from '../services/aiFeatureRunner.js';
import {
  composeNote,
  segmentFragments,
  batchFragments,
  MAX_COMPOSE_CHARS,
  SINGLE_CALL_CHARS,
  COMPOSE_CHUNK_CHARS,
  COMPOSE_MAX_CHUNKS,
} from '../graphql/notegeek/compose.js';

// Same shape the tidy suite uses: `callAI` returns the string directly and
// the provider info rides on `lastProviderInfo`.
const fakeAI = (impl, info = { provider: 'groq', model: 'test-model' }) => ({
  callAI: jest.fn(impl),
  lastProviderInfo: info,
});

beforeEach(() => _resetCounters());

describe('segmentFragments', () => {
  test('splits on blank lines', () => {
    expect(segmentFragments('one\n\ntwo\n\nthree')).toEqual(['one', 'two', 'three']);
  });

  test('splits on horizontal rules, which is how pasted answers are separated', () => {
    expect(segmentFragments('chat msg\n---\nmodel answer')).toEqual(['chat msg', 'model answer']);
  });

  test('keeps a fenced code block whole', () => {
    // Splitting a fence mid-way produces two fragments neither of which
    // parses, and code is exactly what must survive verbatim.
    const input = 'before\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\nafter';
    const parts = segmentFragments(input);
    const fence = parts.find((p) => p.startsWith('```'));
    expect(fence).toContain('const a = 1;');
    expect(fence).toContain('const b = 2;');
    expect(parts).toContain('before');
    expect(parts).toContain('after');
  });

  test('drops empty fragments rather than emitting blanks', () => {
    expect(segmentFragments('a\n\n\n\n\nb')).toEqual(['a', 'b']);
  });

  test('an empty dump has no fragments', () => {
    expect(segmentFragments('')).toEqual([]);
    expect(segmentFragments('   \n\n  ')).toEqual([]);
  });
});

describe('batchFragments', () => {
  test('packs several fragments into one chunk', () => {
    const chunks = batchFragments(['a', 'b', 'c'], 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('a');
    expect(chunks[0]).toContain('c');
  });

  test('starts a new chunk rather than overflowing', () => {
    const chunks = batchFragments(['x'.repeat(60), 'y'.repeat(60)], 100);
    expect(chunks).toHaveLength(2);
  });

  test('never splits a single fragment across chunks', () => {
    // A fragment is a unit of pasted material; halving it loses the context
    // that makes it readable.
    const big = 'z'.repeat(500);
    const chunks = batchFragments([big], 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(big);
  });
});

describe('composeNote refuses rather than truncates', () => {
  test('an empty pile returns nothing and spends no call', async () => {
    const ai = fakeAI(async () => 'x');
    const result = await composeNote({ content: '  ', userId: 'u1', ai });
    expect(result.markdown).toBe('');
    expect(result.provenance.reason).toBe('empty_content');
    expect(ai.callAI).not.toHaveBeenCalled();
  });

  test('a pile past the ceiling is refused up front', async () => {
    const ai = fakeAI(async () => 'x');
    const result = await composeNote({ content: 'x'.repeat(MAX_COMPOSE_CHARS + 1), userId: 'u1', ai });
    expect(result.provenance.reason).toBe('content_too_long');
    expect(result.stats.strategy).toBe('refused');
    expect(ai.callAI).not.toHaveBeenCalled();
  });

  test('the ceiling is high enough for a real dump', () => {
    // The use case starts where tidy stops (12k). A 30-50k pile of chat plus
    // a model answer plus email must fit.
    expect(MAX_COMPOSE_CHARS).toBeGreaterThanOrEqual(50000);
  });
});

describe('composeNote picks a strategy by size', () => {
  test('a small pile goes to ONE call, seeing everything at once', async () => {
    const ai = fakeAI(async () => '# Notes\n\nSomething.');
    const result = await composeNote({ content: 'a scrap\n\nanother scrap', userId: 'u1', ai });

    expect(ai.callAI).toHaveBeenCalledTimes(1);
    expect(result.stats.strategy).toBe('single');
    expect(result.markdown).toContain('# Notes');
  });

  test('a large pile maps then reduces', async () => {
    const big = Array.from({ length: 40 }, (_, i) => `fragment ${i} ` + 'x'.repeat(400)).join('\n\n');
    expect(big.length).toBeGreaterThan(SINGLE_CALL_CHARS);

    const ai = fakeAI(async (_p, opts) => {
      const system = opts?.messages?.[0]?.content || '';
      return system.includes('extracting the substance') ? '- a point' : '# Doc\n\n- a point';
    });

    const result = await composeNote({ content: big, userId: 'u1', ai });

    expect(result.stats.strategy).toBe('map_reduce');
    expect(result.stats.chunks).toBeGreaterThan(1);
    // one call per chunk, plus the reduce
    expect(ai.callAI).toHaveBeenCalledTimes(result.stats.chunks + 1);
    expect(result.markdown).toContain('# Doc');
  });

  test('fans out no further than the chunk cap', async () => {
    const huge = Array.from({ length: 200 }, (_, i) => `f${i} ` + 'x'.repeat(500)).join('\n\n');
    const ai = fakeAI(async () => '- a point');
    const result = await composeNote({ content: huge.slice(0, MAX_COMPOSE_CHARS), userId: 'u1', ai });
    expect(result.stats.chunks).toBeLessThanOrEqual(COMPOSE_MAX_CHUNKS);
  });
});

describe('a partial failure is REPORTED, never silent', () => {
  test('one failed batch is counted and the rest still compose', async () => {
    // The describe-and-log lesson: a document that looks complete while a
    // batch of the source vanished is the worst outcome available.
    const big = Array.from({ length: 40 }, (_, i) => `fragment ${i} ` + 'x'.repeat(400)).join('\n\n');
    let mapCalls = 0;

    const ai = fakeAI(async (_p, opts) => {
      const system = opts?.messages?.[0]?.content || '';
      if (system.includes('extracting the substance')) {
        mapCalls += 1;
        if (mapCalls === 1) throw new Error('provider 400');
        return '- a point';
      }
      return '# Doc\n\n- a point';
    });

    const result = await composeNote({ content: big, userId: 'u1', ai });

    expect(result.stats.chunksFailed).toBe(1);
    expect(result.markdown).toContain('# Doc');
  });

  test('every batch failing yields no document and says why', async () => {
    const big = Array.from({ length: 40 }, (_, i) => `fragment ${i} ` + 'x'.repeat(400)).join('\n\n');
    const ai = fakeAI(async (_p, opts) => {
      const system = opts?.messages?.[0]?.content || '';
      if (system.includes('extracting the substance')) throw new Error('provider down');
      return '# Doc';
    });

    const result = await composeNote({ content: big, userId: 'u1', ai });

    expect(result.markdown).toBe('');
    expect(result.provenance.reason).toBe('all_chunks_failed');
    expect(result.stats.chunksFailed).toBe(result.stats.chunks);
  });

  test('a reduce that returns nothing is a fallback, not a blank document', async () => {
    const big = Array.from({ length: 40 }, (_, i) => `fragment ${i} ` + 'x'.repeat(400)).join('\n\n');
    const ai = fakeAI(async (_p, opts) => {
      const system = opts?.messages?.[0]?.content || '';
      return system.includes('extracting the substance') ? '- a point' : '';
    });

    const result = await composeNote({ content: big, userId: 'u1', ai });
    expect(result.provenance.reason).toBe('reduce_failed');
  });
});

describe('the prompts say what this is and is not', () => {
  test('the reduce prompt forbids inventing conclusions', async () => {
    const { COMPOSE_REDUCE_PROMPT } = await import('../graphql/notegeek/compose.js');
    expect(COMPOSE_REDUCE_PROMPT).toMatch(/do not invent/i);
    expect(COMPOSE_REDUCE_PROMPT).toMatch(/open questions/i);
  });

  test('the map prompt insists specifics survive verbatim', async () => {
    const { COMPOSE_MAP_PROMPT } = await import('../graphql/notegeek/compose.js');
    expect(COMPOSE_MAP_PROMPT).toMatch(/verbatim|exactly/i);
    expect(COMPOSE_MAP_PROMPT).toMatch(/merge duplicates/i);
  });
});
