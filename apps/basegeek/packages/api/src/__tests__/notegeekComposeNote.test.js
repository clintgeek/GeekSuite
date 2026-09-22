/**
 * Compose — building a document out of a pile of scraps.
 *
 * Built as the inverse of Tidy, so the invariants are inverted too. Tidy must
 * not lose content; Compose must lose content (that is the job) and must never
 * return something meant to overwrite the source. Tidy itself was removed on
 * 2026-09-22 — Compose turned out to be what it was always wanted for — but
 * the contrast is still what these tests are checking.
 *
 * The cases that matter here are the ones Tidy and describe-and-log taught:
 * refuse rather than truncate, and report a partial failure rather than
 * returning a document that silently lacks a batch.
 */
import { jest } from '@jest/globals';
import { _resetCounters, _resetNeedCache } from '../services/aiFeatureRunner.js';
import {
  composeNote,
  segmentFragments,
  batchFragments,
  looksDegenerate,
  MAX_COMPOSE_CHARS,
  SINGLE_CALL_CHARS,
  COMPOSE_CHUNK_CHARS,
  COMPOSE_MAX_CHUNKS,
  COMPOSE_NEED,
} from '../graphql/notegeek/compose.js';

// `callAI` returns the string directly and the provider info rides on
// `lastProviderInfo`, which is the shape the whole gateway's AI tests use.
const fakeAI = (impl, info = { provider: 'groq', model: 'test-model' }) => ({
  callAI: jest.fn(impl),
  lastProviderInfo: info,
});

beforeEach(() => { _resetCounters(); _resetNeedCache(); });

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
    // The use case starts where one call stops. A 30-50k pile of chat plus
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

/**
 * The 2026-09-22 failure, and the two defences against it.
 *
 * Chef pasted ~2.4k characters of terminal output and Compose handed back a
 * "document" that repeated one numbered line — with an invented GitHub URL —
 * thirty-eight times until it hit the token ceiling mid-link. It shipped,
 * because the only check was `markdown.trim()`.
 *
 * Root cause was routing: `runAIFeature` named no `need`, so synthesis went
 * to `groq/allam-2-7b`, a 7B row. The same input on the row `prose:deep`
 * resolves to produced a correct 1.7k document. Both halves are tested here,
 * because the routing fix makes it rare and the guard is what makes it safe.
 */

/** The live failure, shortened but the same shape: numbered, repeating. */
const LOOPED = ['# Troubleshooting', '', 'A summary of the issues.', '', '## Next steps', '']
  .concat(
    Array.from({ length: 38 }, (_, i) =>
      `${i + 1}. Confirm the issue: [Issue 1000](https://github.com/notegeek/notegeek/issues/1000)`)
  )
  .join('\n');

/** What a good answer to the same material looks like. */
const REAL_DOCUMENT = `# NoteGeek content length and refusal handling

This covers the refusal handling deployed for long notes.

## Deployment status

Tidy can no longer overwrite a note with a fragment. Long notes come back
untouched with an explanation instead of being cut at 63%.

| Component | Status |
| --- | --- |
| Gateway | both guards, both refusal reasons |
| Frontend chunk | reads provenance.reason |

## Open questions

- Which specific note was mangled, and when?

## Next steps

- [ ] Identify and recover any mangled notes from the browser cache.
- [ ] Give Plan's Weekly and Backlog views more than complete-or-delete.
`.trim(); // the runner trims model output, so the fixture must match what a caller sees

describe('looksDegenerate', () => {
  test('catches the document that repeated one line 38 times', () => {
    const verdict = looksDegenerate(LOOPED);
    expect(verdict).not.toBeNull();
    expect(verdict.reason).toBe('degenerate_output');
  });

  test('sees through the numbering, which made every repeat look distinct', () => {
    // The live failure numbered its repeats 1..38. Comparing raw lines would
    // have called all thirty-eight unique and passed the loop straight through.
    expect(looksDegenerate(LOOPED).detail.repeatedLines).toBeGreaterThan(4);
  });

  test('lets a real document through', () => {
    expect(looksDegenerate(REAL_DOCUMENT)).toBeNull();
  });

  test('does not count table rules and checkboxes as repetition', () => {
    // Real markdown repeats short structural lines constantly. A guard that
    // counted them would refuse most well-formed documents.
    const tableHeavy = ['# Costs', '', '| a | b |', '| --- | --- |']
      .concat(Array.from({ length: 12 }, (_, i) => `| row ${i} | ${i * 10} |`))
      .concat(['', '## Next steps', ''])
      .concat(Array.from({ length: 6 }, (_, i) => `- [ ] task number ${i} to do`))
      .join('\n');
    expect(looksDegenerate(tableHeavy)).toBeNull();
  });

  test('says nothing about an answer too short to judge', () => {
    expect(looksDegenerate('# Title\n\nOne short paragraph of prose here.')).toBeNull();
  });
});

describe('a looping answer never reaches the user', () => {
  test('is discarded rather than offered as a document', async () => {
    const ai = fakeAI(async () => LOOPED);
    const r = await composeNote({ content: 'some short pile of scraps', userId: 'u1', ai });
    // Empty, not "here is your document with a warning". There is no
    // salvageable part of an answer that says one sentence forty times.
    expect(r.markdown).toBe('');
    expect(r.stats.degenerate).toBe(true);
    expect(r.provenance.reason).toBe('degenerate_output');
    expect(r.provenance.source).toBe('fallback');
  });

  test('the same guard applies on the map-reduce path', async () => {
    // Both paths must hold the same standard — the single-call check being
    // "applied consistently and simply not enough" is how this shipped.
    const big = Array.from({ length: 40 }, (_, i) => `fragment ${i} ${'x'.repeat(400)}`).join('\n\n');
    expect(big.length).toBeGreaterThan(SINGLE_CALL_CHARS);
    const ai = fakeAI(async (_prompt, opts) => {
      const system = opts?.messages?.[0]?.content || '';
      return system.includes('assembling one coherent') ? LOOPED : '- a point';
    });
    const r = await composeNote({ content: big, userId: 'u2', ai });
    expect(r.markdown).toBe('');
    expect(r.stats.degenerate).toBe(true);
  });

  test('a good document is returned untouched', async () => {
    const ai = fakeAI(async () => REAL_DOCUMENT);
    const r = await composeNote({ content: 'some short pile of scraps', userId: 'u3', ai });
    expect(r.markdown).toBe(REAL_DOCUMENT);
    expect(r.stats.degenerate).toBeUndefined();
  });
});

describe('an answer cut off at the token ceiling is labelled', () => {
  test('truncated is true when the model ran out of room', async () => {
    const ai = fakeAI(async () => REAL_DOCUMENT, {
      provider: 'ollama', model: 'gemma4:31b', finishReason: 'length',
    });
    const r = await composeNote({ content: 'a pile', userId: 'u4', ai });
    // The document is real and is still returned — it just stops mid-thought,
    // and only the user can decide whether that will do.
    expect(r.markdown).toBe(REAL_DOCUMENT);
    expect(r.stats.truncated).toBe(true);
  });

  test('and false on a complete answer', async () => {
    const ai = fakeAI(async () => REAL_DOCUMENT, {
      provider: 'ollama', model: 'gemma4:31b', finishReason: 'stop',
    });
    const r = await composeNote({ content: 'a pile', userId: 'u5', ai });
    expect(r.stats.truncated).toBe(false);
  });
});

describe('compose asks for a model that can do this', () => {
  test('states a need rather than taking whatever rotation offers', async () => {
    // The whole root cause: with no need, synthesis went to a 7B row.
    const resolveNeed = jest.fn(async () => ({
      provider: 'ollama', modelId: 'gemma4:31b', why: ['golden set 1'],
    }));
    const ai = { ...fakeAI(async () => REAL_DOCUMENT), resolveNeed };
    const r = await composeNote({ content: 'a pile', userId: 'u6', ai });

    expect(resolveNeed).toHaveBeenCalledWith(COMPOSE_NEED);
    // And the resolved row is what actually got called, not just recorded.
    expect(ai.callAI).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ provider: 'ollama', model: 'gemma4:31b' })
    );
    expect(r.provenance.need).toEqual(
      expect.objectContaining({ asked: COMPOSE_NEED, resolved: true })
    );
  });

  test('an unresolvable need degrades to the ordinary walk rather than failing', async () => {
    // The catalog is a live thing. "Nothing measurably meets this today" is a
    // reason to fall back, not to refuse the user their compose.
    const ai = { ...fakeAI(async () => REAL_DOCUMENT), resolveNeed: jest.fn(async () => null) };
    const r = await composeNote({ content: 'a pile', userId: 'u7', ai });
    expect(r.markdown).toBe(REAL_DOCUMENT);
    expect(r.provenance.need).toEqual(
      expect.objectContaining({ asked: COMPOSE_NEED, resolved: false })
    );
  });

  test('a resolver that throws costs nothing', async () => {
    const ai = {
      ...fakeAI(async () => REAL_DOCUMENT),
      resolveNeed: jest.fn(async () => { throw new Error('catalog down'); }),
    };
    const r = await composeNote({ content: 'a pile', userId: 'u8', ai });
    expect(r.markdown).toBe(REAL_DOCUMENT);
  });
});

describe('one fan-out resolves its need once', () => {
  test('eight MAP calls do not mean eight catalog reads', async () => {
    // Without the cache this was nine identical Mongo queries to answer one
    // question — and, less obviously, nine independent picks, so a compose
    // could come back written in several voices.
    const resolveNeed = jest.fn(async () => ({
      provider: 'ollama', modelId: 'gemma4:31b', why: [],
    }));
    const big = Array.from({ length: 40 }, (_, i) => `fragment ${i} ${'x'.repeat(400)}`).join('\n\n');
    const ai = { ...fakeAI(async () => REAL_DOCUMENT), resolveNeed };

    const r = await composeNote({ content: big, userId: 'u9', ai });

    expect(r.stats.chunks).toBeGreaterThan(1);
    expect(resolveNeed).toHaveBeenCalledTimes(1);
    // Every call still went to the resolved row, not just the first.
    for (const call of ai.callAI.mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({ provider: 'ollama', model: 'gemma4:31b' }));
    }
  });
});
