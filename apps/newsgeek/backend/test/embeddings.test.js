/**
 * src/cluster/embeddings.js — the one call to the local embeddings service:
 * the URL and body it sends (no passage prefix), the typed failures, the
 * width check, the per-request guard. Never the network: an injected fetch.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  embedPassages, embeddingsConfig, articleText, cosine, EmbeddingsUnavailableError,
  MAX_CHARS_PER_ARTICLE, MAX_CHARS_PER_REQUEST, DEFAULT_EMBEDDINGS_URL,
} from '../src/cluster/embeddings.js';

const vec = (x, dims = 1024) => Array.from({ length: dims }, (_, i) => (i === 0 ? x : 0.5));

function recorder(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return handler(url, init); };
  fetchImpl.calls = calls;
  return fetchImpl;
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('embeddingsConfig', () => {
  test('defaults to the container and mxbai; EMBEDDINGS_URL overrides (trailing slash dropped)', () => {
    assert.deepEqual(embeddingsConfig({}), { url: DEFAULT_EMBEDDINGS_URL, model: 'mxbai-embed-large' });
    assert.equal(embeddingsConfig({ EMBEDDINGS_URL: 'http://emb:1/' }).url, 'http://emb:1');
  });
});

describe('embedPassages', () => {
  test('POSTs {model, input} to <url>/api/embed with NO prefix and returns unit vectors', async () => {
    const f = recorder(() => json({ embeddings: [vec(3), vec(1)] }));
    const out = await embedPassages(['Title one\nExcerpt', 'Title two'], { fetchImpl: f, env: { EMBEDDINGS_URL: 'http://emb:11434' } });
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].url, 'http://emb:11434/api/embed');
    assert.deepEqual(f.calls[0].body, { model: 'mxbai-embed-large', input: ['Title one\nExcerpt', 'Title two'] });
    assert.equal(out.model, 'mxbai-embed-large');
    assert.equal(out.vectors.length, 2);
    const norm = Math.sqrt(out.vectors[0].reduce((s, x) => s + x * x, 0));
    assert.ok(Math.abs(norm - 1) < 1e-9);
  });

  test('a down service, a 5xx, non-JSON, a wrong count or a wrong width are EmbeddingsUnavailableError', async () => {
    const cases = [
      () => { throw new TypeError('fetch failed'); },
      () => json({ error: 'x' }, 503),
      () => new Response('not json', { status: 200 }),
      () => json({ embeddings: [vec(1)] }),
      () => json({ embeddings: [vec(1, 768), vec(1, 768)] }),
    ];
    for (const handler of cases) {
      await assert.rejects(embedPassages(['a', 'b'], { fetchImpl: recorder(handler), env: {} }), (err) => {
        assert.ok(err instanceof EmbeddingsUnavailableError);
        assert.equal(err.inputProblem, false);
        return true;
      });
    }
  });

  test('a 400 is an inputProblem (the article, not the service)', async () => {
    await assert.rejects(embedPassages(['a'], { fetchImpl: recorder(() => json({}, 400)), env: {} }), (err) => err.inputProblem === true && err.status === 400);
  });

  test('a request over the per-request guard is refused before any call', async () => {
    const f = recorder(() => json({ embeddings: [] }));
    const big = Array.from({ length: 9 }, () => 'x'.repeat(MAX_CHARS_PER_ARTICLE));
    await assert.rejects(embedPassages(big, { fetchImpl: f, env: {} }), RangeError);
    assert.equal(f.calls.length, 0);
    assert.ok(MAX_CHARS_PER_ARTICLE * 8 <= MAX_CHARS_PER_REQUEST);
  });
});

describe('articleText / cosine', () => {
  test('title + newline + excerpt, trimmed, capped at MAX_CHARS_PER_ARTICLE', () => {
    assert.equal(articleText({ title: '  Hello ', excerpt: ' world  ' }), 'Hello\nworld');
    assert.equal(articleText({ title: 'Only title', excerpt: '' }), 'Only title');
    assert.equal(articleText({ title: 't', excerpt: 'x'.repeat(5000) }).length, MAX_CHARS_PER_ARTICLE);
  });
  test('cosine of parallel, orthogonal and opposite vectors', () => {
    assert.equal(cosine([1, 0], [2, 0]), 1);
    assert.equal(cosine([1, 0], [0, 3]), 0);
    assert.equal(cosine([1, 0], [-1, 0]), -1);
  });
});
