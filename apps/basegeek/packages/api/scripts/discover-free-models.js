#!/usr/bin/env node
/**
 * discover-free-models — ask every configured provider what it offers *today*,
 * keep the free-tier candidates, probe each one live, and (with --sync) make
 * the AIFreeTier catalog match reality.
 *
 *   node scripts/discover-free-models.js               # report only
 *   node scripts/discover-free-models.js --sync        # upsert alive as isFree, cool dead 30d
 *   node scripts/discover-free-models.js --provider groq,cloudflare
 *   node scripts/discover-free-models.js --timeout 6000
 *
 * Run inside the basegeek container (provider keys live in the aiGeek DB, the
 * Mongo host resolves only on the Docker network):
 *   docker exec basegeek sh -c 'cd /app/apps/basegeek/packages/api && node scripts/discover-free-models.js'
 *
 * "Free" per provider (2026-09-07):
 *   groq        every chat model (rate-limited free tier); whisper/tts/guard excluded
 *   cerebras    every chat model (free tier)
 *   together    ids ending in -Free, or pricing input+output == 0
 *   openrouter  pricing prompt+completion == 0 (the ":free" slugs)
 *   cloudflare  every Text Generation model (Workers AI daily allocation)
 *   gemini      flash / flash-lite / gemma chat models (API free tier)
 *   cohere      chat-capable command models (trial key)
 *   ollama      whatever /api/tags lists on the configured host
 *   llmgateway  ids containing "free" or pricing 0
 * Never prints a key, a URL with a key, or more than 80 chars of any error body.
 */
import path from 'node:path';
import axios from 'axios';
import { probeRow, safeErrorText, DEFAULT_PROBE_TIMEOUT_MS, PROBE_MARK_COOLDOWN_MS } from './probe-free-tier.js';

const PROVIDERS = ['groq', 'cerebras', 'together', 'openrouter', 'cloudflare', 'gemini', 'cohere', 'ollama', 'llmgateway'];
const CHAT_EXCLUDE = /whisper|tts|guard|embed|embedding|rerank|vision-preview|image|audio|live|veo|imagen|aqa|moderation|distil/i;
// Models that answer but are not general assistants: tiny/LoRA builds, translators, vision,
// domain or safety models, code-only, "arabic"/"saudi" variants. `--all` keeps them.
export const NOT_GENERAL = /lora|[-/](0\.6|1|1\.7|2|3|4)b[-_/:]|2\.6b|7b-chat-hf|translate|vision|arabic|saudi|safety|-code\b|code:free|:free$|fin:|sante|note-preview|laguna|sea-lion|granite|gemma-2b|gemma-7b|mistral-7b|allam|orpheus|compound|omni|ocr|reasoning/i;
export function isGeneralAssistant(modelId) {
  // openrouter ":free" slugs are kept only for the two general MiniMax models and the router
  if (/^(minimax\/minimax-m[0-9.]+:free|openrouter\/free)$/.test(modelId)) return true;
  return !NOT_GENERAL.test(modelId);
}

export function parseArgs(argv) {
  const o = { sync: false, all: false, timeout: DEFAULT_PROBE_TIMEOUT_MS, providers: PROVIDERS, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sync') o.sync = true;
    else if (a === '--all') o.all = true;
    else if (a === '--timeout') o.timeout = Number(argv[++i]);
    else if (a === '--provider') o.providers = String(argv[++i]).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

const isZero = (v) => v == null || Number(v) === 0;

/** Pure: given a provider and its raw model listing, return free-tier candidate ids. */
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
      for (const m of raw?.data || []) {
        if (!m?.id) continue;
        const p = m.pricing || {};
        const outText = !m.architecture?.output_modalities || m.architecture.output_modalities.includes('text');
        if (outText && isZero(p.prompt) && isZero(p.completion) && (String(p.prompt) === '0' || /:free$/.test(m.id))) ids.push(m.id);
      }
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

async function listModels(provider, pc) {
  const auth = { Authorization: `Bearer ${pc.apiKey}` };
  const get = (url, opts = {}) => axios.get(url, { timeout: 15000, ...opts }).then((r) => r.data);
  switch (provider) {
    case 'groq': return get(`${pc.baseURL || 'https://api.groq.com/openai/v1'}/models`, { headers: auth });
    case 'cerebras': return get(`${pc.baseURL || 'https://api.cerebras.ai/v1'}/models`, { headers: auth });
    case 'together': return get('https://api.together.xyz/v1/models', { headers: auth });
    case 'openrouter': return get('https://openrouter.ai/api/v1/models', { headers: auth });
    case 'cloudflare': {
      if (!pc.accountId) throw new Error('cloudflare accountId not configured');
      return get(`https://api.cloudflare.com/client/v4/accounts/${pc.accountId}/ai/models/search?task=Text%20Generation&per_page=100`, { headers: auth });
    }
    case 'gemini': return get(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(pc.apiKey)}`);
    case 'cohere': return get('https://api.cohere.com/v1/models?page_size=100&endpoint=chat', { headers: auth });
    case 'ollama': return get(`${(pc.baseURL || 'https://ollama.com').replace(/\/v1\/?$/, '')}/api/tags`, { headers: auth });
    case 'llmgateway': return get(`${pc.baseURL || 'https://api.llmgateway.io/v1'}/models`, { headers: auth });
    default: throw new Error(`no lister for ${provider}`);
  }
}

function listErrorText(err) {
  const status = err?.response?.status;
  return safeErrorText(status ? `http_${status}` : (err?.code || err?.message || 'error'));
}

export function renderReport(results) {
  const lines = [];
  const byProvider = new Map();
  for (const r of results) {
    if (!byProvider.has(r.provider)) byProvider.set(r.provider, []);
    byProvider.get(r.provider).push(r);
  }
  for (const [provider, rows] of byProvider) {
    const listing = rows.find((r) => r.kind === 'listing');
    const probes = rows.filter((r) => r.kind === 'probe').sort((a, b) => (a.status === b.status ? (a.ms || 0) - (b.ms || 0) : a.status.localeCompare(b.status)));
    lines.push(`\n== ${provider}: ${listing?.error ? `listing failed (${listing.error})` : `${listing?.count ?? 0} listed, ${probes.length} free candidates`}`);
    for (const p of probes) lines.push(`  ${p.status.padEnd(7)} ${String(p.ms ?? '').padStart(5)}ms  ${p.modelId}${p.code && p.status !== 'alive' ? `  (${p.code})` : ''}`);
  }
  const alive = results.filter((r) => r.kind === 'probe' && r.status === 'alive');
  const dead = results.filter((r) => r.kind === 'probe' && r.status === 'dead');
  const unknown = results.filter((r) => r.kind === 'probe' && r.status === 'unknown');
  lines.push(`\n${alive.length} alive, ${dead.length} dead, ${unknown.length} unknown across ${byProvider.size} providers`);
  return lines.join('\n');
}

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
    const ids = freeCandidates(provider, raw).filter((id) => all || isGeneralAssistant(id));
    const total = Array.isArray(raw) ? raw.length : (raw?.data || raw?.models || raw?.result || []).length;
    results.push({ kind: 'listing', provider, count: total, candidates: ids.length });
    for (const modelId of ids) {
      const t = Date.now();
      const outcome = await probeRow({ provider, modelId }, { callProvider: probeProvider, timeoutMs });
      results.push({ kind: 'probe', provider, modelId, status: outcome.status, code: outcome.code, ms: Date.now() - t, now });
    }
  }));
  return results;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  let closers = [];
  let exitCode = 0;
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) { console.log('usage: discover-free-models.js [--sync] [--all] [--provider a,b] [--timeout ms]'); process.exit(0); }
    const here = path.dirname(new URL(import.meta.url).pathname);
    const envPath = path.resolve(here, '../../../.env.production');
    const { default: dotenv } = await import('dotenv');
    const loaded = dotenv.config({ path: envPath });
    if (loaded.error && !(process.env.AIGEEK_MONGODB_URI || process.env.MONGODB_URI)) {
      throw new Error(`Could not read ${envPath} — run on the baseGeek host or inside the basegeek container`);
    }
    const { default: AIFreeTier } = await import('../src/models/AIFreeTier.js');
    const { default: aiService } = await import('../src/services/aiService.js');
    const { getAIGeekConnection } = await import('../src/config/database.js');
    const conn = getAIGeekConnection();
    closers = [conn];
    if (conn.readyState === 0) await conn.asPromise();
    let n = 0;
    while (!aiService.initialized && n++ < 100) await new Promise((r) => setTimeout(r, 100));

    const configured = opts.providers.filter((p) => aiService.providers[p]?.apiKey && aiService.providers[p].enabled !== false);
    const skipped = opts.providers.filter((p) => !configured.includes(p));
    if (skipped.length) console.log(`not configured (no key): ${skipped.join(', ')}`);

    const results = await discover({
      providers: configured,
      listProvider: (p) => listModels(p, aiService.providers[p]),
      probeProvider: (provider, prompt, config) => aiService.callProvider(provider, prompt, config),
      timeoutMs: opts.timeout,
      all: opts.all,
    });
    console.log(renderReport(results));

    if (opts.sync) {
      const now = new Date();
      let upserts = 0; let cooled = 0;
      for (const r of results.filter((x) => x.kind === 'probe')) {
        if (r.status === 'alive') {
          await AIFreeTier.updateOne(
            { provider: r.provider, modelId: r.modelId },
            { $set: { isFree: true, 'health.coolingUntil': null, 'health.consecutiveFailures': 0, 'health.lastSuccessAt': now, 'health.lastFailureCode': null } },
            { upsert: true }
          );
          upserts++;
        } else if (r.status === 'dead') {
          const res = await AIFreeTier.updateOne(
            { provider: r.provider, modelId: r.modelId },
            { $set: { 'health.coolingUntil': new Date(now.getTime() + PROBE_MARK_COOLDOWN_MS), 'health.lastFailureCode': r.code, 'health.lastFailureAt': now } }
          );
          cooled += res.modifiedCount || 0;
        }
      }
      console.log(`sync: ${upserts} alive rows upserted as free, ${cooled} existing dead rows cooled 30d`);
    } else {
      console.log('Re-run with --sync to write the alive rows into AIFreeTier and cool the dead ones.');
    }
  } catch (err) {
    console.error(`discover-free-models failed: ${safeErrorText(err?.message || String(err), 200)}`);
    exitCode = 1;
  } finally {
    for (const c of closers) { try { await c.close(); } catch { /* ignore */ } }
    process.exit(exitCode);
  }
}
