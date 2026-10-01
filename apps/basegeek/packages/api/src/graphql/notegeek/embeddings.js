/**
 * embeddings.js — the ONLY way NoteGeek note text becomes a vector.
 *
 * ## The privacy rule this module exists to keep
 *
 * Chef's rule: the digital brain stays on this box. Note text goes to the
 * local embeddings container (`datageek_embeddings`, Ollama running
 * `nomic-embed-text`) and to NOTHING else — not aiGeek, not OpenRouter, not a
 * cloud provider, not as a fallback when the local service is down. When it is
 * down, the answer is "no vectors right now", never "ask someone else".
 *
 * How that is kept true:
 *   - This file imports nothing from the AI stack (`services/ai*`,
 *     `aiFeatureRunner`, provider clients). `notegeekSemantic.test.js` reads
 *     the source of this file, `chunking.js`, `semantic.js` and `indexer.js`
 *     and fails if any of them does.
 *   - There is exactly one network call, a POST to `${url}/api/embed`, and the
 *     url comes from `embeddingsConfig()` — EMBEDDINGS_URL or the container
 *     address. The tests record every fetch and assert each one targeted it.
 *   - There is no retry against a second host. A failure throws
 *     `EmbeddingsUnavailableError` and the callers degrade (search goes
 *     keyword-only; the indexer backs off and tries the same service later).
 *
 * ## nomic-embed-text needs task prefixes
 *
 * Stored text is embedded as `search_document: …`, queries as
 * `search_query: …`. Without them the model still answers, just worse
 * (measured 2026-09-30: 0.66 → 0.62 on a matching pair). `embedTexts` adds
 * them; callers pass plain text.
 */

/** Container address on datageek_network. No published host port. */
export const DEFAULT_EMBEDDINGS_URL = 'http://datageek_embeddings:11434';
export const DEFAULT_EMBEDDINGS_MODEL = 'nomic-embed-text';
/** nomic-embed-text v1.5 at full width. A response of any other size is refused. */
export const EMBEDDING_DIMS = 768;

/**
 * Hard ceiling on the characters in one request (all inputs together). A
 * guard, not a tuning knob: chunking keeps real requests far below it. At
 * ~6 characters a word it is ~1 300 words, ~3 s of CPU on this box — which is
 * also how long a search query can wait behind the indexer, since Ollama
 * serves one request at a time.
 */
export const MAX_CHARS_PER_REQUEST = 8000;
/** One input is cut here before it is sent (nomic's window is 2 048 tokens). */
export const MAX_CHARS_PER_INPUT = 4000;

export const DOCUMENT_PREFIX = 'search_document: ';
export const QUERY_PREFIX = 'search_query: ';

/**
 * Read at call time, not import time, so a test (or an operator) can change
 * the env without a reload. Defaults are what production needs: Watchtower
 * deploys never pick up new .env vars, so nothing here may REQUIRE one.
 */
export function embeddingsConfig() {
  const url = (process.env.EMBEDDINGS_URL || DEFAULT_EMBEDDINGS_URL).replace(/\/+$/, '');
  const model = process.env.EMBEDDINGS_MODEL || DEFAULT_EMBEDDINGS_MODEL;
  return { url, model };
}

/**
 * The service could not give us vectors: down, slow, refusing, or answering
 * nonsense. `status` is the HTTP status when there was one; `inputProblem`
 * marks a 400 — the one case where the input (not the service) is at fault,
 * so the indexer charges the note rather than backing off the whole queue.
 */
export class EmbeddingsUnavailableError extends Error {
  constructor(message, { status = null, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'EmbeddingsUnavailableError';
    this.status = status;
    this.inputProblem = status === 400;
  }
}

/** Scale to unit length so cosine similarity is a plain dot product. */
export function normalizeVector(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i += 1) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum) || 1;
  const out = new Array(vec.length);
  for (let i = 0; i < vec.length; i += 1) out[i] = vec[i] / norm;
  return out;
}

/**
 * Embed a batch of plain strings.
 *
 * @param {string[]} texts
 * @param {{ kind: 'document'|'query', timeoutMs?: number }} opts
 * @returns {Promise<number[][]>} unit vectors, one per input, same order
 * @throws {EmbeddingsUnavailableError}
 */
export async function embedTexts(texts, { kind, timeoutMs = 60000 } = {}) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  if (kind !== 'document' && kind !== 'query') {
    throw new TypeError(`embedTexts: kind must be 'document' or 'query', got ${ kind }`);
  }
  const prefix = kind === 'query' ? QUERY_PREFIX : DOCUMENT_PREFIX;
  const input = texts.map((t) => prefix + String(t ?? '').slice(0, MAX_CHARS_PER_INPUT));
  const total = input.reduce((n, s) => n + s.length, 0);
  if (total > MAX_CHARS_PER_REQUEST) {
    // A programming error upstream (the indexer batches below this). Refuse
    // rather than send a request that would block searches for tens of seconds.
    throw new RangeError(`embedTexts: ${ total } characters is over the ${ MAX_CHARS_PER_REQUEST } per-request guard`);
  }

  const { url, model } = embeddingsConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${ url }/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, input }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new EmbeddingsUnavailableError(
      err?.name === 'AbortError' ? `embeddings timed out after ${ timeoutMs } ms` : `embeddings unreachable: ${ err?.message }`,
      { cause: err },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 200); } catch { /* body is optional */ }
    throw new EmbeddingsUnavailableError(`embeddings HTTP ${ res.status } ${ detail }`.trim(), { status: res.status });
  }

  let body;
  try {
    body = await res.json();
  } catch (err) {
    throw new EmbeddingsUnavailableError('embeddings returned non-JSON', { cause: err });
  }
  const vectors = body?.embeddings;
  if (!Array.isArray(vectors) || vectors.length !== input.length) {
    throw new EmbeddingsUnavailableError(`embeddings returned ${ vectors?.length ?? 'no' } vectors for ${ input.length } inputs`);
  }
  for (const v of vectors) {
    if (!Array.isArray(v) || v.length !== EMBEDDING_DIMS) {
      throw new EmbeddingsUnavailableError(`embeddings returned a ${ v?.length ?? '?' }-dim vector, expected ${ EMBEDDING_DIMS }`);
    }
  }
  return vectors.map(normalizeVector);
}
