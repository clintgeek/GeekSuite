/**
 * embeddings.js — the ONLY way NoteGeek note text becomes a vector.
 *
 * ## The privacy rule this module exists to keep
 *
 * Chef's rule: the digital brain stays on this box. Note text goes to the
 * local embeddings container (`datageek_embeddings`, Ollama running
 * `mxbai-embed-large`) and to NOTHING else — not aiGeek, not OpenRouter, not a
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
 * ## Models are a table, not a constant
 *
 * Each model has its own width, its own task prefixes and its own score scale
 * (`EMBEDDING_MODELS`). The default is `mxbai-embed-large` since 2026-10-01
 * (1024 dims; a query gets "Represent this sentence for searching relevant
 * passages: ", a passage no prefix). It replaced `nomic-embed-text` (768
 * dims, `search_query: ` / `search_document: `) because nomic squashed every
 * score into 0.50–0.73, so unrelated notes and true hits overlapped, while
 * mxbai pulls them apart (live, Chef's 36 notes: "what pills do I take every
 * day" → the meds note 0.720, the next note 0.439). Without its prefixes a
 * model still answers, just worse (nomic, 2026-09-30: 0.66 → 0.62 on a
 * matching pair). `embedTexts` adds them; callers pass plain text.
 *
 * Vectors of two models never meet: every chunk records its `model`, search
 * and related read only the current model's chunks, and the indexer's sweep
 * re-queues every note that has none (`indexer.js`). Changing the model is a
 * background re-index, not a migration.
 */

/** Container address on datageek_network. No published host port. */
export const DEFAULT_EMBEDDINGS_URL = 'http://datageek_embeddings:11434';
export const DEFAULT_EMBEDDINGS_MODEL = 'mxbai-embed-large';

/**
 * What we know about each model. `dims` is enforced: a response of any other
 * width is refused. `search` and `relatedMin` are the model's score scale,
 * read by `semantic.js` — how each number was chosen is written there, next
 * to the rule that uses it.
 */
export const EMBEDDING_MODELS = Object.freeze({
  'mxbai-embed-large': Object.freeze({
    dims: 1024,
    queryPrefix: 'Represent this sentence for searching relevant passages: ',
    documentPrefix: '',
    search: Object.freeze({ floor: 0.55, gap: 0.08, bestMin: 0.60, bestMargin: 0.08, bestAgreeMargin: 0.04 }),
    // Catalog search, calibrated live 2026-10-03 on Chef's library (554 books,
    // 723 games; one vector per item, catalog text only). Catalog scores sit
    // lower than note passages. True hits: books "cyberpunk" 0.60–0.70,
    // "memoir about growing up in a cult" 0.71–0.76, "funny fantasy" 0.59–0.64;
    // games "co-op shooter" 0.66–0.71, "cozy farming" 0.52–0.60, "soulslike"
    // 0.47–0.55, "space exploration" 0.57–0.66. Nonsense tops out at books
    // 0.546 / games 0.513 ("quantum chromodynamics") and 0.48 / 0.45
    // ("recipes for sourdough bread"). floor 0.50 keeps sourdough out entirely
    // and lets at most a handful of near-misses through for physics jargon;
    // gap 0.10 keeps "cyberpunk" to its six real book hits. Only search uses
    // these; the what-next shortlist ranks by seed similarity, no floor.
    catalogSearch: Object.freeze({ floor: 0.50, gap: 0.10 }),
    relatedMin: 0.70,
  }),
  'nomic-embed-text': Object.freeze({
    dims: 768,
    queryPrefix: 'search_query: ',
    documentPrefix: 'search_document: ',
    search: Object.freeze({ floor: 0.55, gap: 0.06, bestMin: 0.65, bestMargin: 0.08, bestAgreeMargin: 0.04 }),
    // UNCALIBRATED — see the mxbai entry.
    catalogSearch: Object.freeze({ floor: 0.55, gap: 0.06 }),
    relatedMin: 0.65,
  }),
});

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
 * The spec for a model (the configured one by default). A model not in the
 * table — EMBEDDINGS_MODEL set to try one — gets no prefixes, no width check
 * beyond "every vector in a response the same width", and the default
 * model's score scale: it works, uncalibrated, until it is added here.
 */
export function modelSpec(model = embeddingsConfig().model) {
  const known = EMBEDDING_MODELS[model];
  if (known) return { model, known: true, ...known };
  const fallback = EMBEDDING_MODELS[DEFAULT_EMBEDDINGS_MODEL];
  return {
    model, known: false, dims: null, queryPrefix: '', documentPrefix: '',
    search: fallback.search, catalogSearch: fallback.catalogSearch, relatedMin: fallback.relatedMin,
  };
}

/**
 * Hard ceiling on the characters in one request (all inputs together). A
 * guard, not a tuning knob: chunking keeps real requests far below it. At
 * ~6 characters a word it is ~1 300 words, ~3 s of CPU on this box — which is
 * also how long a search query can wait behind the indexer, since Ollama
 * serves one request at a time.
 */
export const MAX_CHARS_PER_REQUEST = 8000;
/**
 * One input is cut here before it is sent. mxbai reads 512 tokens (nomic
 * 2 048); chunking caps a passage at 350 words / 3 000 characters, which is
 * about what mxbai reads. Ollama truncates anything past its window, and the
 * 40-word chunk overlap means a truncated tail opens the next passage anyway.
 */
export const MAX_CHARS_PER_INPUT = 4000;

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
 * Embed a batch of plain strings with the configured model.
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
  const { url, model } = embeddingsConfig();
  const spec = modelSpec(model);
  const prefix = kind === 'query' ? spec.queryPrefix : spec.documentPrefix;
  const input = texts.map((t) => prefix + String(t ?? '').slice(0, MAX_CHARS_PER_INPUT));
  const total = input.reduce((n, s) => n + s.length, 0);
  if (total > MAX_CHARS_PER_REQUEST) {
    // A programming error upstream (the indexer batches below this). Refuse
    // rather than send a request that would block searches for tens of seconds.
    throw new RangeError(`embedTexts: ${ total } characters is over the ${ MAX_CHARS_PER_REQUEST } per-request guard`);
  }

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
  // A known model's width is fixed; an unknown one must at least be consistent.
  const dims = spec.dims ?? (Array.isArray(vectors[0]) ? vectors[0].length : 0);
  for (const v of vectors) {
    if (!Array.isArray(v) || !dims || v.length !== dims) {
      throw new EmbeddingsUnavailableError(`embeddings returned a ${ v?.length ?? '?' }-dim vector, expected ${ dims || 'a non-empty vector' } (${ model })`);
    }
  }
  return vectors.map(normalizeVector);
}
