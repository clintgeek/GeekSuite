#!/usr/bin/env node
/**
 * check-provider.js — "I just pasted a key. Does it work?"
 *
 * Why this exists
 * ---------------
 * That question came up three times on 2026-09-16 (Cerebras, then Gemini, then
 * a third time) and each answer was a throwaway script that got deleted. The
 * answer has four parts and they fail differently, which is the whole point of
 * separating them:
 *
 *   1. is the key loaded into the running service at all?
 *   2. does the vendor's `/models` listing accept it?        ← auth
 *   3. which of those are free-tier chat candidates?          ← modality filter
 *   4. does an actual inference call answer?                  ← entitlement
 *
 * Cerebras passed 1-3 and failed 4 with `http_402`: the key was perfectly
 * valid, the account simply had no credit. A listing check alone would have
 * called that a success, and a probe alone would have called it a bad key.
 *
 * Writes NOTHING. It is safe to run against production at any time; the
 * catalog job is what records verdicts.
 *
 * Usage
 * -----
 *   node scripts/check-provider.js gemini
 *   node scripts/check-provider.js            # every provider holding a key
 *
 * In production the app runs in a container, so:
 *   docker exec basegeek sh -lc 'cd /app/apps/basegeek/packages/api && \
 *     node scripts/check-provider.js gemini'
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));

const { default: aiService } = await import('../src/services/aiService.js');
const discovery = await import('../src/services/aiCatalogDiscovery.js');

const uri = process.env.AIGEEK_MONGODB_URI || 'mongodb://localhost:27017/aiGeek?authSource=admin';
await mongoose.connect(uri);
await aiService.loadConfigurations();

const keyed = Object.entries(aiService.providers)
  .filter(([, pc]) => pc?.apiKey && pc.enabled !== false)
  .map(([id]) => id);

const providers = wanted.length ? wanted : keyed;
if (wanted.length === 0) {
  process.stdout.write(`providers holding a key: ${keyed.join(', ') || '(none)'}\n`);
}

let failures = 0;

for (const provider of providers) {
  process.stdout.write(`\n=== ${provider} ===\n`);
  const pc = aiService.providers[provider];

  // 1. Is it configured?
  if (!pc) { process.stdout.write('  not in the roster\n'); failures++; continue; }
  if (!pc.apiKey) { process.stdout.write('  no key stored\n'); failures++; continue; }
  process.stdout.write(`  key: loaded   enabled: ${pc.enabled !== false}   default model: ${pc.model}\n`);

  // 2. Does the listing accept the key? This is the auth test.
  let raw;
  try {
    raw = await discovery.listModels(provider, pc);
    process.stdout.write(`  listing: OK (${discovery.listingCount(raw)} model(s))\n`);
  } catch (err) {
    process.stdout.write(`  listing: FAILED — ${discovery.listErrorText(err)}\n`);
    failures++;
    continue;
  }

  // 3. Which are free-tier chat candidates, after the modality filter?
  const candidates = discovery.freeCandidates(provider, raw);
  process.stdout.write(`  free chat candidates: ${candidates.length}\n`);
  if (candidates.length === 0) continue;

  // 4. Do they actually answer? Entitlement, quota and health in one.
  const results = await discovery.runProbe({
    rows: candidates.slice(0, 5).map((modelId) => ({ provider, modelId })),
    callProvider: (p, prompt, config) => aiService.callProvider(p, prompt, config),
    options: { now: Date.now() }          // no updateOne: writes nothing
  });

  for (const r of results) {
    const mark = r.status === 'alive' ? 'OK  ' : 'FAIL';
    process.stdout.write(
      `    ${mark} ${String(r.fitness ?? '—').padEnd(11)} ${String(r.ms + 'ms').padEnd(8)} ` +
      `${r.modelId}${r.status === 'alive' ? '' : `  (${r.code})`}\n`
    );
  }
  if (!results.some((r) => r.status === 'alive')) {
    process.stdout.write('  nothing answered — the key lists but does not serve\n');
    failures++;
  }
}

process.stdout.write(failures === 0 ? '\nall checked providers answered\n' : `\n${failures} provider(s) could not serve\n`);
await mongoose.disconnect();
process.exit(failures === 0 ? 0 : 1);
