/**
 * The ONLY way an article becomes a vector (N1 clustering, phase 1).
 * Design: apps/newsgeek/DOCS/CLUSTERING.md.
 *
 * Conventions copied (not imported — apps never import across each other)
 * from NoteGeek's embeddings client
 * (apps/basegeek/packages/api/src/graphql/notegeek/embeddings.js):
 *   - one service: the suite's local Ollama, `datageek_embeddings`, model
 *     `mxbai-embed-large` (1024 dims);
 *   - models are a TABLE (width + prefixes), not a constant, so a model change
 *     is a background re-index (the indexer re-queues every article whose
 *     `embedding.model` differs), not a migration;
 *   - NO FALLBACK PROVIDER. Down, slow, refusing or answering nonsense is an
 *     `EmbeddingsUnavailableError`; the caller backs off and tries the same
 *     service later. Nothing here may ever call aiGeek or a cloud API.
 *
 * Why plain `fetch`, not `lib/safeFetch.js`: the SSRF guard refuses private
 * addresses BY DESIGN, and `datageek_embeddings` is a private container
 * address on datageek_network. That is safe here only because the URL never
 * comes from a source, a feed or a reader: it is EMBEDDINGS_URL (operator
 * env) or the built-in container address. Never pass a user-supplied URL to
 * this module.
 *
 * Article vs article is passage vs passage: mxbai passages get NO prefix
 * (only a search QUERY would get "Represent this sentence for searching
 * relevant passages: "), so `embedPassages` sends the text as is.
 */

/** Container address on datageek_network. No published host port. */
export const DEFAULT_EMBEDDINGS_URL = 'http://datageek_embeddings:11434';
export const DEFAULT_EMBEDDINGS_MODEL = 'mxbai-embed-large';

/** Each model's width (enforced) and passage prefix. Only mxbai for now. */
export const EMBEDDING_MODELS = Object.freeze({
  'mxbai-embed-large': Object.freeze({ dims: 1024, passagePrefix: '' }),
});

/**
 * One article's text is cut here: title + '\n' + excerpt (excerpts are capped
 * at 600 by the schema, titles at 500). mxbai reads ~512 tokens, about 2,000
 * characters, so 1,000 is all of it for nearly every article.
 */
export const MAX_CHARS_PER_ARTICLE = 1000;

/**
 * Ceiling on the characters in ONE request. The Ollama container is shared
 * with NoteGeek's search and serves one request at a time; ~8,000 characters
 * is ~3 s of CPU on this box (NoteGeek, measured 2026-09-30), so a NoteGeek
 * search never waits behind more than that. The indexer splits its batch of
 * 32 to stay under it.
 */
export const MAX_CHARS_PER_REQUEST = 8000;

/**
 * Read at call time so tests (and operators) can change the env without a
 * reload. Defaults are what production needs: a Watchtower redeploy never
 * picks up NEW .env vars, so nothing here may REQUIRE one.
 */
export function embeddingsConfig(env = process.env) {
  const url = (env.EMBEDDINGS_URL || DEFAULT_EMBEDDINGS_URL).replace(/\/+$/, '');
  const model = env.EMBEDDINGS_MODEL || DEFAULT_EMBEDDINGS_MODEL;
  return { url, model };
}

/** The spec for a model; an unknown one gets no prefix and a consistency-only width check. */
export function modelSpec(model) {
  const known = EMBEDDING_MODELS[model];
  if (known) return { model, known: true, ...known };
  return { model, known: false, dims: null, passagePrefix: '' };
}

/**
 * The service could not give us vectors. `status` is the HTTP status when
 * there was one; `inputProblem` marks a 400 — the input, not the service, is
 * at fault, so the indexer sets that article aside instead of backing off.
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

/** Cosine of two vectors (unit vectors in practice; normalised here anyway). */
export function cosine(a, b) {
  let dot = 0; let na = 0; let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!na || !nb) return 0;
  return dot / Math.sqrt(na * nb);
}

/** The text an article is embedded from: title + '\n' + excerpt, trimmed, capped. */
export function articleText(article) {
  const title = String(article?.title ?? '').trim();
  const excerpt = String(article?.excerpt ?? '').trim();
  return (excerpt ? `${title}\n${excerpt}` : title).slice(0, MAX_CHARS_PER_ARTICLE).trim();
}

/**
 * Embed passages with the configured model, in ONE request (the caller keeps
 * it under MAX_CHARS_PER_REQUEST).
 *
 * @param {string[]} texts
 * @param {object} [opts]
 * @param {Function} [opts.fetchImpl]  tests inject a fake; default global fetch
 * @param {number} [opts.timeoutMs]
 * @param {object} [opts.env]
 * @returns {Promise<{ model: string, vectors: number[][] }>} unit vectors, input order
 * @throws {EmbeddingsUnavailableError}
 */
export async function embedPassages(texts, { fetchImpl = fetch, timeoutMs = 60_000, env = process.env } = {}) {
  const { url, model } = embeddingsConfig(env);
  if (!Array.isArray(texts) || texts.length === 0) return { model, vectors: [] };
  const spec = modelSpec(model);
  const input = texts.map((t) => spec.passagePrefix + String(t ?? '').slice(0, MAX_CHARS_PER_ARTICLE));
  const total = input.reduce((n, s) => n + s.length, 0);
  if (total > MAX_CHARS_PER_REQUEST) {
    // A programming error upstream (the indexer splits below this).
    throw new RangeError(`embedPassages: ${total} characters is over the ${MAX_CHARS_PER_REQUEST} per-request guard`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    // Plain fetch on purpose — see the header (private container address,
    // operator-configured URL only).
    res = await fetchImpl(`${url}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, input }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new EmbeddingsUnavailableError(
      err?.name === 'AbortError' ? `embeddings timed out after ${timeoutMs} ms` : 'embeddings unreachable',
      { cause: err },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new EmbeddingsUnavailableError(`embeddings HTTP ${res.status}`, { status: res.status });

  let body;
  try {
    body = await res.json();
  } catch (err) {
    throw new EmbeddingsUnavailableError('embeddings returned non-JSON', { cause: err });
  }
  const vectors = body?.embeddings;
  if (!Array.isArray(vectors) || vectors.length !== input.length) {
    throw new EmbeddingsUnavailableError(`embeddings returned ${vectors?.length ?? 'no'} vectors for ${input.length} inputs`);
  }
  const dims = spec.dims ?? (Array.isArray(vectors[0]) ? vectors[0].length : 0);
  for (const v of vectors) {
    if (!Array.isArray(v) || !dims || v.length !== dims) {
      throw new EmbeddingsUnavailableError(`embeddings returned a ${v?.length ?? '?'}-dim vector, expected ${dims || 'a non-empty vector'} (${model})`);
    }
  }
  return { model, vectors: vectors.map(normalizeVector) };
}

export default {
  DEFAULT_EMBEDDINGS_URL, DEFAULT_EMBEDDINGS_MODEL, EMBEDDING_MODELS, MAX_CHARS_PER_ARTICLE, MAX_CHARS_PER_REQUEST,
  embeddingsConfig, modelSpec, EmbeddingsUnavailableError, normalizeVector, cosine, articleText, embedPassages,
};
