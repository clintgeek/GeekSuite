/**
 * aiCatalogDiscovery.js — everything the catalog job and the two RUNBOOK
 * scripts know about the outside world, in one place, with no network of its
 * own and no Mongo at import.
 *
 * Why it exists
 * -------------
 * Until 2026-09-07 this logic lived in `scripts/discover-free-models.js` and
 * `scripts/probe-free-tier.js`, which meant the catalog was only ever as
 * current as the last time Chef ran `docker exec`. The scheduled job
 * (`aiCatalogJob.js`) needed the same functions, and a service cannot import a
 * script that opens a Mongo connection and calls `process.exit` at the bottom.
 * So the pure and dependency-injected half moved here; the two scripts are now
 * thin CLI wrappers over these exports and behave exactly as they did.
 *
 * Everything below is either pure or takes its side effects as arguments
 * (`callProvider`, `get`, `updateOne`, the model collections). That is what
 * lets the whole module be tested without a network and without a database.
 *
 * Two rules this file must never break:
 *   1. **No credential ever reaches a log or a terminal.** Not a key, not a
 *      key hint, not a URL carrying a key, and never more than
 *      `ERROR_TEXT_LIMIT` characters of a provider's error body — those bodies
 *      carry org ids, entitlement detail and vendor-redacted key fragments
 *      (see services/aiFailureEnvelope.js).
 *   2. **"Dead" means the same thing here as on the request path.**
 *      `classifyFreeTierFailure` in models/AIFreeTier.js is the single judge,
 *      or a row this module buries is dug up by the next call.
 */

import { classifyFreeTierFailure } from '../models/AIFreeTier.js';
import { PROVIDER_IDS } from '../config/aiProviders.js';
import { isDenied } from '../config/aiCatalogOverrides.js';
// The one-door runner's JSON tolerances, imported rather than copied: a model
// that fences its JSON or wraps it in a one-key envelope is a model the
// features can already use, so the probe must judge it the same way they do.
import { parseJson, unwrapSchemaEnvelope } from './aiFeatureRunner.js';

/* ────────────────────────────── constants ───────────────────────────────── */

/** Providers this module knows how to list. Anything else is not in the roster. */
export const PROVIDERS = [...PROVIDER_IDS];

/** How long a row marked dead stays out of selection. */
export const PROBE_MARK_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
/** Per-row wall clock budget. The adapters' own axios timeout is 60 s, which is not a probe. */
export const DEFAULT_PROBE_TIMEOUT_MS = 8000;
/** Hard ceiling on how much provider text may reach a terminal or a log. */
export const ERROR_TEXT_LIMIT = 80;
export const ERROR_TEXT_LIMIT_DETAIL = 200;
/** Budget for one probe answer: enough for the four-field object, not enough to ramble. */
export const PROBE_MAX_TOKENS = 48;
/** How long a listing fetch may take. */
export const LIST_TIMEOUT_MS = 15000;

/**
 * Modality exclusions, not quality exclusions. Vendors are consistent about
 * naming a transcriber a transcriber, so this is cheap and safe; judging
 * whether a *chat* model is any good is the probe's job, not a regex's.
 */
export const CHAT_EXCLUDE = /whisper|tts|guard|embed|embedding|rerank|vision-preview|image|audio|live|veo|imagen|aqa|moderation|distil/i;

/**
 * The provider's own auto-router, where it has one. It is ranked first within
 * its provider because it is alive as long as *any* of that provider's free
 * models is, which is a strictly better bet than any single row.
 */
export const ROUTER_MODEL_IDS = { openrouter: 'openrouter/free' };

/**
 * The probe, verbatim. One structured extraction, because that is what every
 * feature in the suite actually asks a model for (a food log line, an Ask
 * intent, a review draft) — not "reply OK", which a broken model passes.
 *
 * It doubles as the fitness test: a model that returns parseable JSON with the
 * right string fields is `structured` and is preferred; a model that answers
 * with prose is `basic` and is kept, ranked lower. Nothing is excluded for
 * being small — it is ranked. That is the whole replacement for the 30-term
 * `NOT_GENERAL` regex this module deleted.
 */
export const PROBE_SYSTEM = 'Reply with JSON only.';
export const PROBE_USER =
  'Extract the task from: "Call the vet Friday at 3pm #flock". ' +
  'Return {"task": string, "day": string, "time": string, "tag": string}.';

/* ─────────────────────────── safe error text ────────────────────────────── */

/**
 * Trim provider text to something safe to print.
 * @param {string} text
 * @param {number} limit
 */
export function safeErrorText(text, limit = ERROR_TEXT_LIMIT) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit - 1)}…`;
}

/** A listing failure, as a short classified code. */
export function listErrorText(err) {
  const status = err?.response?.status;
  return safeErrorText(status ? `http_${status}` : (err?.code || err?.message || 'error'));
}

/* ──────────────────────────────── listing ───────────────────────────────── */

const isZero = (v) => v == null || Number(v) === 0;

/**
 * Ask one provider what it offers today.
 *
 * `get` is injected so this is testable and so the caller owns the HTTP client;
 * the default is axios with a 15 s cap. `pc` is the `aiService.providers[id]`
 * row — the only place a key is read, and it is never logged from here.
 *
 * @param {string} provider
 * @param {object} pc  provider config: { apiKey, baseURL, accountId }
 * @param {{get?: Function}} [deps]
 */
export async function listModels(provider, pc, deps = {}) {
  const get = deps.get || (async (url, opts = {}) => {
    const { default: axios } = await import('axios');
    return axios.get(url, { timeout: LIST_TIMEOUT_MS, ...opts }).then((r) => r.data);
  });
  const auth = { Authorization: `Bearer ${pc?.apiKey}` };

  switch (provider) {
    case 'groq': return get(`${pc.baseURL || 'https://api.groq.com/openai/v1'}/models`, { headers: auth });
    case 'cerebras': return get(`${pc.baseURL || 'https://api.cerebras.ai/v1'}/models`, { headers: auth });
    case 'together': return get('https://api.together.xyz/v1/models', { headers: auth });
    case 'openrouter': return get('https://openrouter.ai/api/v1/models', { headers: auth });
    case 'cloudflare': {
      if (!pc?.accountId) throw new Error('cloudflare accountId not configured');
      return get(`https://api.cloudflare.com/client/v4/accounts/${pc.accountId}/ai/models/search?task=Text%20Generation&per_page=100`, { headers: auth });
    }
    // Key in a header, never `?key=`: @geeksuite/logger keeps `err.config.url`
    // and drops `err.config.headers`, so a key in a query string is the one
    // credential that reaches the logs in the clear on any failure.
    case 'gemini': return get('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': pc?.apiKey } });
    case 'cohere': return get('https://api.cohere.com/v1/models?page_size=100&endpoint=chat', { headers: auth });
    case 'ollama': return get(`${(pc.baseURL || 'https://ollama.com').replace(/\/v1\/?$/, '').replace(/\/api\/?$/, '')}/api/tags`, { headers: auth });
    case 'llmgateway': return get(`${pc.baseURL || 'https://api.llmgateway.io/v1'}/models`, { headers: auth });
    default: throw new Error(`no lister for ${provider}`);
  }
}

/** How many models a raw listing contained, whatever shape it arrived in. */
export function listingCount(raw) {
  if (Array.isArray(raw)) return raw.length;
  return (raw?.data || raw?.models || raw?.result || []).length;
}

/**
 * Every model the provider listed, as `{ modelId, name }` — the rows that keep
 * `AIModel` current whether or not they are free-tier candidates. A model that
 * stops appearing here is what `deactivateUnlisted` retires.
 */
export function listedRows(provider, raw) {
  const rows = [];
  const push = (modelId, name) => { if (modelId) rows.push({ modelId: String(modelId), name: String(name || modelId) }); };
  switch (provider) {
    case 'groq':
    case 'cerebras':
    case 'openrouter':
    case 'llmgateway':
      for (const m of raw?.data || []) push(m?.id, m?.name || m?.id);
      break;
    case 'together':
      for (const m of Array.isArray(raw) ? raw : raw?.data || []) push(m?.id, m?.display_name || m?.id);
      break;
    case 'cloudflare':
      for (const m of raw?.result || []) push(m?.name, m?.description ? m.name : m?.name);
      break;
    case 'gemini':
      for (const m of raw?.models || []) {
        const id = String(m?.name || '').replace(/^models\//, '');
        push(id, m?.displayName || id);
      }
      break;
    case 'cohere':
      for (const m of raw?.models || []) push(m?.name, m?.name);
      break;
    case 'ollama':
      for (const m of raw?.models || []) push(m?.name, m?.name);
      break;
    default:
      break;
  }
  const seen = new Set();
  return rows.filter((r) => (seen.has(r.modelId) ? false : seen.add(r.modelId)));
}

/**
 * Pure: given a provider and its raw model listing, return free-tier candidate
 * ids. These are the per-provider *listing* rules — what the vendor says is
 * free, and what modality it is. Whether the thing actually answers is the
 * probe's question, not this function's.
 */
export function freeCandidates(provider, raw) {
  const ids = [];
  switch (provider) {
    case 'groq':
    case 'cerebras':
      for (const m of raw?.data || []) if (m?.id && !CHAT_EXCLUDE.test(m.id)) ids.push(m.id);
      break;
    case 'together':
      for (const m of Array.isArray(raw) ? raw : raw?.data || []) {
        if (!m?.id || (m.type && m.type !== 'chat')) continue;
        // Only the explicit "-Free" serverless builds. Together lists pricing
        // 0/0 for dedicated-endpoint models too (billed per hour), and every one
        // of those answers 400 to a serverless call (2026-09-07: 73 of them).
        const free = /-free$/i.test(m.id);
        if (free) ids.push(m.id);
      }
      break;
    case 'openrouter':
      // The listing is the whole answer here: zero price on both halves and a
      // text output modality. No name heuristics, no `:free` suffix rule.
      for (const m of raw?.data || []) {
        if (!m?.id) continue;
        const p = m.pricing || {};
        const outText = !m.architecture?.output_modalities || m.architecture.output_modalities.includes('text');
        if (outText && isZero(p.prompt) && isZero(p.completion) && (String(p.prompt) === '0' || /:free$/.test(m.id))) ids.push(m.id);
      }
      // The auto-router is always a row, listed or not: it is free by
      // definition and alive as long as any free model behind it is.
      ids.push(ROUTER_MODEL_IDS.openrouter);
      break;
    case 'cloudflare':
      for (const m of raw?.result || []) if (m?.name && /text generation/i.test(m.task?.name || 'Text Generation') && !CHAT_EXCLUDE.test(m.name)) ids.push(m.name);
      break;
    case 'gemini':
      for (const m of raw?.models || []) {
        const id = String(m?.name || '').replace(/^models\//, '');
        if (!id || !(m.supportedGenerationMethods || []).includes('generateContent')) continue;
        if (/flash|gemma/i.test(id) && !CHAT_EXCLUDE.test(id)) ids.push(id);
      }
      break;
    case 'cohere':
      for (const m of raw?.models || []) if (m?.name && (m.endpoints || []).includes('chat') && /^command/i.test(m.name)) ids.push(m.name);
      break;
    case 'ollama':
      for (const m of raw?.models || []) if (m?.name && !CHAT_EXCLUDE.test(m.name)) ids.push(m.name);
      break;
    case 'llmgateway':
      for (const m of raw?.data || []) if (m?.id && /free/i.test(m.id) && !CHAT_EXCLUDE.test(m.id)) ids.push(m.id);
      break;
    default:
      break;
  }
  return [...new Set(ids)].sort();
}

/* ───────────────────────── OpenRouter's rich listing ────────────────────── */

/** How many of OpenRouter's paid rows become the governed paid fallback set. */
export const PAID_FALLBACK_COUNT = 3;

/**
 * OpenRouter's `/models` is the only listing that carries price, context
 * length and capabilities per model, machine-readable. It is therefore the one
 * provider whose catalog needs no probing to be *described* — only to be
 * proven alive.
 *
 * `supported_parameters` → capabilities: `structured_outputs` → jsonSchema,
 * `response_format` → jsonMode, `tools` → tools. `pricing` is dollars per
 * token, so ×1e6 for the per-1M unit AIPricing stores.
 *
 * Returns `{ free: rows[], paid: rows[] }`, paid sorted cheapest first, with
 * the first `PAID_FALLBACK_COUNT` structured-capable rows tagged
 * `role: 'paid-fallback'` for Phase 2's governed paid walk. Nothing else is
 * ever paid-tagged, and Phase 1 does not spend a cent through it.
 */
export function openRouterCatalog(raw) {
  const free = [];
  const paid = [];
  for (const m of raw?.data || []) {
    if (!m?.id) continue;
    const params = Array.isArray(m.supported_parameters) ? m.supported_parameters : [];
    const p = m.pricing || {};
    const outText = !m.architecture?.output_modalities || m.architecture.output_modalities.includes('text');
    if (!outText) continue;
    const row = {
      provider: 'openrouter',
      modelId: m.id,
      name: m.name || m.id,
      contextTokens: Number(m.context_length) || 0,
      maxOutputTokens: Number(m.top_provider?.max_completion_tokens) || 0,
      capabilities: {
        jsonSchema: params.includes('structured_outputs'),
        jsonMode: params.includes('response_format'),
        tools: params.includes('tools')
      },
      inputPrice: Number(p.prompt || 0) * 1e6,
      outputPrice: Number(p.completion || 0) * 1e6
    };
    if (isZero(p.prompt) && isZero(p.completion)) free.push({ ...row, isFree: true });
    else paid.push({ ...row, isFree: false });
  }
  paid.sort((a, b) =>
    (a.inputPrice + a.outputPrice) - (b.inputPrice + b.outputPrice) ||
    a.modelId.localeCompare(b.modelId)
  );
  let tagged = 0;
  for (const row of paid) {
    if (tagged >= PAID_FALLBACK_COUNT) break;
    if (row.capabilities.jsonSchema) { row.role = 'paid-fallback'; tagged++; }
  }
  return { free, paid };
}

/* ────────────────────────── probe classification ────────────────────────── */

/**
 * The verdict on a row that *threw*.
 *
 *   dead    — a hard failure: the model is gone, the slug was recycled, or the
 *             credential is refused. Retrying tomorrow changes nothing.
 *   unknown — a 429, a 5xx, a timeout, a socket. The row may be perfectly fine
 *             and this a bad minute; `mark` leaves these alone.
 *
 * Delegates the judgement to `classifyFreeTierFailure` and only names the
 * outcome, so the probe and the request path can never disagree.
 *
 * @param {Error|null} error  null when the call returned
 * @returns {{status: 'alive'|'dead'|'unknown', code: string, http: number|null}}
 */
export function classifyProbeOutcome(error) {
  if (!error) return { status: 'alive', code: 'ok', http: null };
  const { hard, code, status } = classifyFreeTierFailure(error);
  return { status: hard ? 'dead' : 'unknown', code, http: status };
}

/**
 * The structured verdict on one probe: is this row usable, and how well.
 *
 * | verdict | fitness      | rule |
 * |---------|--------------|------|
 * | dead    | null         | hard failure, or HTTP 200 with no text at all |
 * | unknown | null         | 429 / 5xx / timeout / network |
 * | alive   | `basic`      | non-empty text that is not JSON with a `task` and a `day` |
 * | alive   | `structured` | parseable JSON (fences stripped, one-key envelope unwrapped) with string `task` and `day` |
 *
 * HTTP 200 with empty text is dead, not alive: gpt-oss through the Cloudflare
 * and Ollama adapters did exactly that on 2026-09-06, and nothing downstream
 * can use it. That is the blind spot this classification closes.
 *
 * @param {{content?: string}|null} result
 * @param {Error|null} [error]
 * @returns {{status: 'dead'|'unknown'|'alive', fitness: 'structured'|'basic'|null, code: string, http: number|null}}
 */
export function classifyProbe(result, error = null) {
  if (error) return { ...classifyProbeOutcome(error), fitness: null };

  const text = String(result?.content ?? '').trim();
  if (!text) return { status: 'dead', fitness: null, code: 'empty_content', http: null };

  let parsed = parseJson(text);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    // The probe sends no schema, so there is no schema *name* to unwrap by —
    // but a provider that wraps its answer produces exactly one key whose
    // value is the object we asked for. Hand that key in as the name and the
    // runner's own unwrapper does the rest (seen live: Cloudflare llama 3.3).
    const keys = Object.keys(parsed);
    if (keys.length === 1) parsed = unwrapSchemaEnvelope(parsed, { name: keys[0] });
  }

  const isFilledString = (v) => typeof v === 'string' && v.trim().length > 0;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
      isFilledString(parsed.task) && isFilledString(parsed.day)) {
    return { status: 'alive', fitness: 'structured', code: 'ok', http: null };
  }
  return { status: 'alive', fitness: 'basic', code: 'ok', http: null };
}

/* ──────────────────────────────── the probe ─────────────────────────────── */

/**
 * Call one row through `aiService.callProvider` — the same adapter a real call
 * takes, so a row that passes here is a row that works — with a wall-clock cap
 * the adapters do not provide themselves.
 *
 * @param {{provider: string, modelId: string}} row
 * @param {{callProvider: Function, timeoutMs?: number}} deps
 */
export async function probeRow(row, { callProvider, timeoutMs = DEFAULT_PROBE_TIMEOUT_MS }) {
  const started = Date.now();
  let timer = null;
  try {
    const call = Promise.resolve(
      callProvider(row.provider, PROBE_USER, {
        model: row.modelId,
        messages: [
          { role: 'system', content: PROBE_SYSTEM },
          { role: 'user', content: PROBE_USER }
        ],
        maxTokens: PROBE_MAX_TOKENS,
        temperature: 0
      })
    );
    // Attached BEFORE the race: when the timeout wins, the adapter's own
    // rejection arrives later with nobody listening, and an unhandled
    // rejection in a job probing eight vendors in a row is a crash, not a
    // warning.
    call.catch(() => {});

    const guard = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`probe timeout after ${timeoutMs}ms`)), timeoutMs);
    });
    const result = await Promise.race([call, guard]);
    return { ...classifyProbe(result, null), ms: Date.now() - started, message: '' };
  } catch (error) {
    return {
      ...classifyProbe(null, error),
      ms: Date.now() - started,
      message: String(error?.message || '')
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Run the probe across a set of rows and (optionally) write the verdicts back.
 *
 * Sequential on purpose: a parallel fan-out across a vendor's models is a good
 * way to trip the very rate limits this is trying to distinguish from death.
 *
 * @param {object} deps
 * @param {Array} deps.rows          AIFreeTier documents (or plain objects)
 * @param {Function} deps.callProvider
 * @param {Function} [deps.updateOne] (filter, update) => Promise — omit for a dry run
 * @param {object} [deps.options]    { mark, revive, timeout, now }
 */
export async function runProbe({ rows, callProvider, updateOne = null, options = {} }) {
  const { mark = false, revive = false, timeout = DEFAULT_PROBE_TIMEOUT_MS, now = Date.now() } = options;
  const results = [];

  for (const row of rows) {
    const outcome = await probeRow(row, { callProvider, timeoutMs: timeout });
    const result = { provider: row.provider, modelId: row.modelId, ...outcome, marked: null };

    if (updateOne && mark && outcome.status === 'dead') {
      await updateOne(
        { provider: row.provider, modelId: row.modelId },
        {
          $set: {
            probedAt: new Date(now),
            'health.lastFailureAt': new Date(now),
            'health.lastFailureCode': outcome.code,
            'health.coolingUntil': new Date(now + PROBE_MARK_COOLDOWN_MS)
          }
        }
      );
      result.marked = 'cooled 30d';
    } else if (updateOne && revive && outcome.status === 'alive') {
      await updateOne(
        { provider: row.provider, modelId: row.modelId },
        {
          $set: {
            isFree: true,
            fitness: outcome.fitness,
            probedAt: new Date(now),
            'health.consecutiveFailures': 0,
            'health.lastFailureAt': null,
            'health.lastFailureCode': null,
            'health.lastSuccessAt': new Date(now),
            'health.coolingUntil': null
          }
        }
      );
      result.marked = 'revived';
    }

    results.push(result);
  }

  return results;
}

/* ──────────────────────────────── discovery ─────────────────────────────── */

/**
 * List every configured provider, pick the free-tier candidates, probe each
 * one, and report. Parallel across providers, sequential within one (rate
 * limits), and a provider that fails is reported and never aborts the others.
 *
 * Returns a flat result array of three row kinds:
 *   `{ kind: 'listing', provider, count, candidates }` or `{..., error }`
 *   `{ kind: 'probe',   provider, modelId, status, fitness, code, ms }`
 *   `{ kind: 'listed',  provider, modelId, name, isFree, capabilities?, … }`
 *
 * The caller writes: `syncResults` for the job and for `--sync`, `renderReport`
 * for a terminal. This function itself touches no database.
 *
 * @param {object} deps
 * @param {string[]} deps.providers
 * @param {Function} deps.listProvider   (provider) => raw listing
 * @param {Function} deps.probeProvider  aiService.callProvider
 * @param {number} [deps.timeoutMs]
 * @param {boolean} [deps.all]           skip the aiCatalogOverrides deny list
 * @param {number} [deps.now]
 */
export async function discover({ providers, probeProvider, listProvider, timeoutMs, all = false, now = Date.now() }) {
  const results = [];
  await Promise.all(providers.map(async (provider) => {
    let raw;
    try {
      raw = await listProvider(provider);
    } catch (err) {
      results.push({ kind: 'listing', provider, error: listErrorText(err) });
      return;
    }

    const candidates = freeCandidates(provider, raw).filter((id) => all || !isDenied(id));
    const candidateSet = new Set(candidates);

    // Catalog rows for everything the provider listed, so AIModel stays current
    // and a model that disappears can be retired. OpenRouter's listing carries
    // price and capabilities, so its rows are the rich ones.
    if (provider === 'openrouter') {
      const { free, paid } = openRouterCatalog(raw);
      for (const row of [...free, ...paid]) {
        results.push({ kind: 'listed', ...row, isFree: row.isFree && candidateSet.has(row.modelId) });
      }
    } else {
      for (const row of listedRows(provider, raw)) {
        results.push({ kind: 'listed', provider, modelId: row.modelId, name: row.name, isFree: candidateSet.has(row.modelId) });
      }
    }

    results.push({ kind: 'listing', provider, count: listingCount(raw), candidates: candidates.length });

    for (const modelId of candidates) {
      const t = Date.now();
      const outcome = await probeRow({ provider, modelId }, { callProvider: probeProvider, timeoutMs });
      results.push({
        kind: 'probe', provider, modelId,
        status: outcome.status, fitness: outcome.fitness, code: outcome.code,
        ms: Date.now() - t, now
      });
    }
  }));
  return results;
}

/* ──────────────────────────────── the writes ────────────────────────────── */

/**
 * Every write the catalog job makes, each one dependency-injected so the whole
 * write path is testable with plain objects and no Mongo. `deps` carries the
 * collections: `{ freeTier, model, pricing }` — anything with mongoose's
 * `updateOne` / `updateMany` / `deleteMany` shape.
 *
 * Nothing here ever deletes a row for being dead. The aiGeek UI lists these
 * collections, and a row that vanished reads as a config loss, not as a dead
 * model; a cooled row is still visible and still explains itself
 * (`health.lastFailureCode`).
 */

/**
 * A row answered: it is free, it is proven, and its failure memory is cleared.
 *
 * The probe is also a capability observation — a model that came back with
 * parseable JSON can produce structured output, whatever its id suggests — so
 * the `AIModel` row is stamped `capabilities.source: 'probe'` unless the
 * caller passed richer capabilities from a listing.
 */
export async function writeAlive({ provider, modelId, fitness = null, name = null, capabilities = null, contextTokens = null, maxOutputTokens = null, now = new Date() }, deps) {
  const at = new Date(now);
  await deps.freeTier.updateOne(
    { provider, modelId },
    {
      $set: {
        isFree: true,
        fitness,
        probedAt: at,
        'health.consecutiveFailures': 0,
        'health.lastFailureAt': null,
        'health.lastFailureCode': null,
        'health.lastSuccessAt': at,
        'health.coolingUntil': null
      }
    },
    { upsert: true }
  );
  if (deps.model) {
    const caps = capabilities
      ? capabilitiesUpdate(capabilities, 'openrouter-listing')
      : (fitness ? capabilitiesUpdate({ structuredOutput: fitness === 'structured' }, 'probe') : {});
    await deps.model.updateOne(
      { provider, modelId },
      {
        $set: {
          isActive: true,
          lastChecked: at,
          ...(name ? { name } : {}),
          ...caps,
          ...(contextTokens ? { contextTokens } : {}),
          ...(maxOutputTokens ? { maxOutputTokens } : {})
        },
        $setOnInsert: { name: name || modelId }
      },
      { upsert: true }
    );
  }
  return { provider, modelId, wrote: 'alive' };
}

/** A row is gone: cool it 30 days and take its model out of the active list. */
export async function writeDead({ provider, modelId, code = 'unknown', now = new Date() }, deps) {
  const at = new Date(now);
  await deps.freeTier.updateOne(
    { provider, modelId },
    {
      $set: {
        probedAt: at,
        'health.lastFailureAt': at,
        'health.lastFailureCode': code,
        'health.coolingUntil': new Date(at.getTime() + PROBE_MARK_COOLDOWN_MS)
      }
    }
  );
  if (deps.model) {
    await deps.model.updateOne({ provider, modelId }, { $set: { isActive: false, lastChecked: at } });
  }
  return { provider, modelId, wrote: 'dead' };
}

/**
 * A model the provider listed, whether or not it is a free candidate: keep the
 * `AIModel` row current, and where the listing carried a price (OpenRouter),
 * keep `AIPricing` current in its per-1,000,000-token unit.
 */
export async function writeListed(row, deps) {
  const at = new Date(row.now || Date.now());
  const { provider, modelId, name, capabilities, contextTokens, maxOutputTokens, role, inputPrice, outputPrice } = row;
  await deps.model.updateOne(
    { provider, modelId },
    {
      $set: {
        isActive: true,
        lastChecked: at,
        ...(name ? { name } : {}),
        ...(capabilities ? capabilitiesUpdate(capabilities, 'openrouter-listing') : {}),
        ...(contextTokens ? { contextTokens } : {}),
        ...(maxOutputTokens ? { maxOutputTokens } : {}),
        ...(role ? { role } : {})
      },
      $setOnInsert: { name: name || modelId }
    },
    { upsert: true }
  );
  if (deps.pricing && (inputPrice != null || outputPrice != null)) {
    await deps.pricing.updateOne(
      { provider, modelId },
      {
        $set: {
          inputPrice: Number(inputPrice) || 0,
          outputPrice: Number(outputPrice) || 0,
          priceUnit: 'per_1m_tokens',
          lastUpdated: at,
          isActive: true
        }
      },
      { upsert: true }
    );
  }
  return { provider, modelId, wrote: 'listed' };
}

/**
 * `AIModel.capabilities` as a dotted `$set`, so a partial capability read from
 * a listing never blanks the fields it said nothing about.
 *
 * `capabilities.source` is stamped on every write and is the load-bearing
 * part: the schema gives every other field a default, so a row nobody
 * observed reads back as a confident claim of `maxTokens: 4096` and no JSON
 * support. `source` is what `aiModelCapabilitiesService.looksObserved()` uses
 * to tell a measurement from a default.
 *
 * @param {{jsonSchema?: boolean, jsonMode?: boolean, tools?: boolean, structuredOutput?: boolean}} caps
 * @param {'openrouter-listing'|'probe'} source
 */
export function capabilitiesUpdate(caps, source) {
  const set = {};
  if (source) set['capabilities.source'] = source;
  if (caps.jsonSchema != null) set['capabilities.supportsJSONSchema'] = !!caps.jsonSchema;
  if (caps.jsonMode != null) set['capabilities.supportsJSONMode'] = !!caps.jsonMode;
  if (caps.jsonSchema != null || caps.jsonMode != null) {
    set['capabilities.supportsJSONOutput'] = !!(caps.jsonSchema || caps.jsonMode);
  }
  // Two different questions, deliberately kept apart. `supportsJSONSchema` is
  // about *native* response_format support and is only ever read from a
  // listing; `tasks.structuredOutput` is "can this model produce JSON when
  // asked", which is exactly what the probe measures — by any means, fences
  // and envelopes included.
  const structured = caps.structuredOutput ?? (caps.jsonSchema || caps.jsonMode);
  if (structured != null) set['capabilities.tasks.structuredOutput'] = !!structured;
  if (caps.tools != null) {
    set['capabilities.supportsToolCalling'] = !!caps.tools;
    set['capabilities.supportsFunctionCalling'] = !!caps.tools;
  }
  return set;
}

/**
 * Models this provider no longer lists stop being active. This is the 24 h
 * staleness sweep that used to live at the bottom of `refreshModels` — moved
 * here so it happens once per discovery run rather than once per admin click,
 * and so it cannot be defeated by a seeder re-stamping retired ids
 * `isActive: true` on every boot (it was, until Phase 0).
 */
export async function deactivateUnlisted({ provider, listedIds, now = new Date() }, deps) {
  if (!Array.isArray(listedIds)) return { provider, deactivated: 0 };
  const res = await deps.model.updateMany(
    { provider, modelId: { $nin: listedIds }, isActive: true },
    { $set: { isActive: false, lastChecked: new Date(now) } }
  );
  return { provider, deactivated: res?.modifiedCount ?? res?.nModified ?? 0 };
}

/**
 * Catalog rows naming a provider that has left the roster are orphans: `llm7`,
 * `onemin`, `anthropic`. They are removed from the *catalog* collections only.
 *
 * `AIConfig` is never touched by this job. That collection holds the encrypted
 * provider credentials, and a job that can delete a key on the strength of a
 * roster edit is a job that can lose Chef's keys.
 */
export async function pruneUnknownProviders({ providers = PROVIDERS, now = Date.now() } = {}, deps) {
  const filter = { provider: { $nin: providers } };
  const out = {};
  for (const [label, collection] of Object.entries({ AIModel: deps.model, AIFreeTier: deps.freeTier, AIPricing: deps.pricing })) {
    if (!collection) continue;
    const res = await collection.deleteMany(filter);
    out[label] = res?.deletedCount ?? 0;
  }
  void now;
  return out;
}

/**
 * Apply one `discover()` result set. Used by the job and by
 * `discover-free-models.js --sync`, so the manual override and the scheduled
 * run write identically — a difference between them is a bug nobody would see
 * until the catalog disagreed with itself.
 */
export async function syncResults(results, deps, { now = Date.now() } = {}) {
  const counts = { alive: 0, dead: 0, unknown: 0, listed: 0, deactivated: 0 };
  const listedByProvider = new Map();
  const listedByModel = new Map();

  for (const row of results) {
    if (row.kind !== 'listed') continue;
    if (!listedByProvider.has(row.provider)) listedByProvider.set(row.provider, []);
    listedByProvider.get(row.provider).push(row.modelId);
    listedByModel.set(`${row.provider}/${row.modelId}`, row);
    try {
      await writeListed({ ...row, now }, deps);
      counts.listed++;
    } catch (err) {
      counts.listedError = safeErrorText(err?.message || 'error');
    }
  }

  const probes = results.filter((r) => r.kind === 'probe');
  // A row that answered stays active even if it was never in the listing —
  // `openrouter/free` is the auto-router, always a candidate and not always a
  // listed model, and deactivating it right after proving it alive would be a
  // fine way to lose the one row that is alive whenever any free row is.
  for (const row of probes) {
    if (row.status !== 'alive') continue;
    if (!listedByProvider.has(row.provider)) listedByProvider.set(row.provider, []);
    const ids = listedByProvider.get(row.provider);
    if (!ids.includes(row.modelId)) ids.push(row.modelId);
  }
  for (const row of probes) {
    try {
      if (row.status === 'alive') {
        // A listed row carries the provider's own capability and context
        // figures; hand them to the write so the AIModel row is stamped from
        // the listing rather than from the probe's narrower observation.
        const listed = listedByModel.get(`${row.provider}/${row.modelId}`);
        await writeAlive({
          provider: row.provider,
          modelId: row.modelId,
          fitness: row.fitness,
          name: listed?.name ?? null,
          capabilities: listed?.capabilities ?? null,
          contextTokens: listed?.contextTokens ?? null,
          maxOutputTokens: listed?.maxOutputTokens ?? null,
          now
        }, deps);
        counts.alive++;
      } else if (row.status === 'dead') {
        await writeDead({ provider: row.provider, modelId: row.modelId, code: row.code, now }, deps);
        counts.dead++;
      } else {
        counts.unknown++;
      }
    } catch (err) {
      counts.probeError = safeErrorText(err?.message || 'error');
    }
  }

  for (const [provider, listedIds] of listedByProvider) {
    try {
      const res = await deactivateUnlisted({ provider, listedIds, now }, deps);
      counts.deactivated += res.deactivated;
    } catch (err) {
      counts.deactivateError = safeErrorText(err?.message || 'error');
    }
  }

  return counts;
}

/** `discover()` results as `{ [provider]: { listed, candidates, alive, dead, unknown, error } }`. */
export function summarizeByProvider(results) {
  const out = {};
  const bucket = (provider) => (out[provider] ||= { listed: 0, candidates: 0, alive: 0, dead: 0, unknown: 0, structured: 0, error: null });
  for (const row of results) {
    const b = bucket(row.provider);
    if (row.kind === 'listing') {
      if (row.error) b.error = row.error;
      else { b.listed = row.count ?? 0; b.candidates = row.candidates ?? 0; }
    } else if (row.kind === 'probe') {
      b[row.status] = (b[row.status] || 0) + 1;
      if (row.fitness === 'structured') b.structured++;
    }
  }
  return out;
}

/* ─────────────────────────── rate-limit headers ─────────────────────────── */

const RATELIMIT_HEADER = /^x-ratelimit-(limit|remaining|reset)(?:-(requests|tokens))?(?:-(day|minute|hour|second))?$/i;

/**
 * Reset headers come in four flavours across the vendors this suite calls:
 * Groq's Go duration (`2m59.56s`, `1.2s`), a plain number of seconds (`60`),
 * epoch milliseconds (OpenRouter's `x-ratelimit-reset`), and an HTTP date
 * (`retry-after`). Returns milliseconds from now, or null.
 */
export function parseResetToMs(raw, now = Date.now()) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const duration = text.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?(?:(\d+)ms)?$/i);
  if (duration && duration.slice(1).some(Boolean)) {
    const [, h, m, s, ms] = duration;
    return (Number(h || 0) * 3600 + Number(m || 0) * 60 + Number(s || 0)) * 1000 + Number(ms || 0);
  }

  const numeric = Number(text);
  if (Number.isFinite(numeric)) {
    // Epoch milliseconds (13 digits) or epoch seconds (10) rather than a delta.
    if (numeric > 1e12) return Math.max(0, numeric - now);
    if (numeric > 1e9) return Math.max(0, numeric * 1000 - now);
    return numeric * 1000;
  }

  const date = Date.parse(text);
  if (Number.isFinite(date)) return Math.max(0, date - now);
  return null;
}

/**
 * What a provider's response headers say about our own quota, normalized.
 *
 * Parsed, case-insensitively:
 *   `x-ratelimit-(limit|remaining|reset)-(requests|tokens)[-(day|minute|hour|second)]`
 *     — Groq, Cerebras, Together and LLM Gateway all speak some subset of this
 *   `x-ratelimit-(limit|remaining|reset)` (unqualified) — OpenRouter, Together
 *   `retry-after` — everyone, on a 429
 *
 * Unknown headers are ignored. Providers that send none (Gemini, Cloudflare,
 * Cohere, Ollama Cloud) simply never populate this, which is why the *static*
 * table this replaced could not be right: three files declared Groq's TPM as
 * 6000, 12000 and 18000, and the header says which.
 *
 * Where a provider omits the window suffix, the window is inferred from its
 * own reset value (a reset inside 90 s is a per-minute bucket) and otherwise
 * from the vendors' shared convention: requests are a daily allowance, tokens
 * a per-minute one.
 *
 * @param {object} headers  axios response headers (or any plain object)
 * @param {number} [now]
 * @returns {{limits: object, observed: object, retryAfterSeconds: number|null}}
 */
export function parseRateLimitHeaders(headers, now = Date.now()) {
  const limits = {};
  const observed = {};
  let retryAfterSeconds = null;
  if (!headers || typeof headers !== 'object') return { limits, observed, retryAfterSeconds };

  const raw = new Map();
  const entries = typeof headers.entries === 'function' ? [...headers.entries()] : Object.entries(headers);
  for (const [key, value] of entries) raw.set(String(key).toLowerCase(), value);

  // Pass one: bucket every header this module understands by kind and unit.
  const seen = { limit: [], remaining: [], reset: [] };
  for (const [key, value] of raw) {
    const match = key.match(RATELIMIT_HEADER);
    if (!match) continue;
    const [, kindRaw, unitRaw, windowRaw] = match;
    seen[kindRaw.toLowerCase()].push({
      // An unqualified header is about requests everywhere it is sent
      // (OpenRouter, Together); tokens are always spelled out.
      unit: (unitRaw || 'requests').toLowerCase(),
      window: windowRaw ? windowRaw.toLowerCase() : null,
      value
    });
  }

  const resetMsOf = (unit) => {
    const candidates = seen.reset.filter((r) => r.unit === unit).map((r) => parseResetToMs(r.value, now));
    const usable = candidates.filter((ms) => Number.isFinite(ms));
    return usable.length ? Math.min(...usable) : null;
  };

  /** Which bucket a limit without an explicit window belongs to. */
  const windowFor = (unit, explicit) => {
    if (explicit) return explicit === 'day' ? 'Day' : explicit === 'minute' ? 'Minute' : null;
    const resetMs = resetMsOf(unit);
    if (resetMs != null) return resetMs <= 90 * 1000 ? 'Minute' : 'Day';
    // The vendors' shared convention where they say nothing: requests are a
    // daily allowance (Groq's `x-ratelimit-limit-requests` is per day), tokens
    // a per-minute one.
    return unit === 'requests' ? 'Day' : 'Minute';
  };

  for (const row of seen.limit) {
    const number = Number(String(row.value).trim());
    if (!Number.isFinite(number) || number < 0) continue;
    const window = windowFor(row.unit, row.window);
    if (window) limits[`${row.unit}Per${window}`] = number;
  }

  for (const row of seen.remaining) {
    const number = Number(String(row.value).trim());
    if (!Number.isFinite(number) || number < 0) continue;
    if (row.unit === 'tokens') observed.remainingTokens = number;
    else observed.remainingRequests = number;
  }

  const resetMs = resetMsOf('requests') ?? resetMsOf('tokens');
  if (resetMs != null) observed.resetAt = new Date(now + resetMs);

  const retryAfter = raw.get('retry-after');
  if (retryAfter != null) {
    const ms = parseResetToMs(retryAfter, now);
    if (Number.isFinite(ms) && ms >= 0) retryAfterSeconds = Math.ceil(ms / 1000);
  }

  return { limits, observed, retryAfterSeconds };
}

/* ─────────────────────────────── rendering ──────────────────────────────── */

/**
 * Render probe results as a fixed-width table. Pure — takes rows, returns lines.
 * @param {Array<{provider: string, modelId: string, status: string, code: string, ms: number, message?: string}>} results
 */
export function renderTable(results, { detail = false } = {}) {
  const limit = detail ? ERROR_TEXT_LIMIT_DETAIL : ERROR_TEXT_LIMIT;
  const columns = [
    { key: 'provider', head: 'provider' },
    { key: 'modelId', head: 'model' },
    { key: 'status', head: 'result' },
    { key: 'fitness', head: 'fitness' },
    { key: 'code', head: 'code' },
    { key: 'ms', head: 'ms' }
  ];
  const cell = (row, key) => String(row[key] ?? '');
  const widths = columns.map((c) =>
    Math.max(c.head.length, ...results.map((r) => cell(r, c.key).length), 0)
  );

  const line = (values) => values.map((v, i) => String(v).padEnd(widths[i])).join('  ').trimEnd();
  const out = [
    line(columns.map((c) => c.head)),
    line(widths.map((w) => '-'.repeat(w)))
  ];
  for (const r of results) {
    out.push(line(columns.map((c) => cell(r, c.key))));
    if (r.status !== 'alive' && r.message) {
      out.push(`    ${safeErrorText(r.message, limit)}`);
    }
  }
  return out;
}

/** Render a whole `discover()` result set for a terminal. Pure. */
export function renderReport(results) {
  const lines = [];
  const byProvider = new Map();
  for (const r of results) {
    if (r.kind === 'listed') continue;
    if (!byProvider.has(r.provider)) byProvider.set(r.provider, []);
    byProvider.get(r.provider).push(r);
  }
  for (const [provider, rows] of byProvider) {
    const listing = rows.find((r) => r.kind === 'listing');
    const probes = rows.filter((r) => r.kind === 'probe').sort((a, b) => (a.status === b.status ? (a.ms || 0) - (b.ms || 0) : a.status.localeCompare(b.status)));
    lines.push(`\n== ${provider}: ${listing?.error ? `listing failed (${listing.error})` : `${listing?.count ?? 0} listed, ${probes.length} free candidates`}`);
    for (const p of probes) {
      const tail = p.status === 'alive' ? (p.fitness ? `  (${p.fitness})` : '') : (p.code ? `  (${p.code})` : '');
      lines.push(`  ${p.status.padEnd(7)} ${String(p.ms ?? '').padStart(5)}ms  ${p.modelId}${tail}`);
    }
  }
  const probes = results.filter((r) => r.kind === 'probe');
  const alive = probes.filter((r) => r.status === 'alive');
  const dead = probes.filter((r) => r.status === 'dead');
  const unknown = probes.filter((r) => r.status === 'unknown');
  const structured = alive.filter((r) => r.fitness === 'structured');
  lines.push(`\n${alive.length} alive (${structured.length} structured), ${dead.length} dead, ${unknown.length} unknown across ${byProvider.size} providers`);
  return lines.join('\n');
}

export default {
  PROVIDERS,
  PROBE_MARK_COOLDOWN_MS,
  DEFAULT_PROBE_TIMEOUT_MS,
  PROBE_MAX_TOKENS,
  PROBE_SYSTEM,
  PROBE_USER,
  CHAT_EXCLUDE,
  ROUTER_MODEL_IDS,
  safeErrorText,
  listModels,
  listedRows,
  listingCount,
  freeCandidates,
  openRouterCatalog,
  classifyProbeOutcome,
  classifyProbe,
  probeRow,
  runProbe,
  discover,
  syncResults,
  summarizeByProvider,
  writeAlive,
  writeDead,
  writeListed,
  deactivateUnlisted,
  pruneUnknownProviders,
  parseRateLimitHeaders,
  parseResetToMs,
  renderTable,
  renderReport
};
