/**
 * aiDeadProviders.test.js — `llm7`, `onemin` and `anthropic` are gone, and
 * stay gone.
 *
 * The roster dropped both on 2026-09-04 (see aiProviderRoster.test.js), but the
 * implementations outlived the roster: `callLLM7` and `callOneMin` sat in
 * aiService dereferencing `this.providers.llm7` / `.onemin` on `undefined`,
 * their rate-limit buckets and seed model lists were still built on every boot,
 * and six schema enums still accepted the strings. None of it was reachable —
 * which is exactly why it could rot unnoticed.
 *
 * These cases are the tripwire. A `callLLM7` that comes back, or a provider
 * enum that quietly regains `llm7` because someone copy-pasted an older list,
 * fails here rather than in production six weeks later.
 *
 * `anthropic` joined them on 2026-09-07, for the opposite reason: it worked.
 * The account ran out of credit and is not being refilled, so a provider that
 * answered correctly became a provider that 400s on every call — and the one
 * caller that pinned it (fitnessgeek's meal plan) had been failing for weeks.
 * The whole adapter came out with the roster row: `callClaude`,
 * `anthropicMessagesFrom`, the `refreshModels` and `seedInitialModels`
 * branches, the capability and pricing blocks, `JSON_SCHEMA_SUPPORTED` /
 * `JSON_MODE_SUPPORTED` / `TOOL_FORWARDING_PROVIDERS` memberships, and the six
 * schema enums. The tool and content-block translation was good work — it is in
 * git history, and `geminiContentsFrom` carries the same F-02 finding forward.
 *
 * Comments are allowed to name a retired provider — that is how the removal
 * stays explained, and the F-xx incident notes are the most valuable thing in
 * this subsystem. Code is not.
 *
 * Existing Mongo rows holding any of these provider values are orphaned data,
 * not broken data: `findOneAndUpdate` does not run validators by default, so
 * the tightened enums cannot break a read. See DOCS/AI_CATALOG.md.
 */

import { describe, it, expect } from '@jest/globals';

const DEAD = ['llm7', 'onemin'];
/** Retired providers whose *comments* are kept on purpose (see the header). */
const RETIRED = [...DEAD, 'anthropic'];

/**
 * A source file with every comment line dropped, so a case can assert that a
 * retired provider survives only as an explanation. Covers `//` lines and the
 * `*` / `/*` continuation lines of a JSDoc block; a trailing `// note` on a
 * line of code is not stripped, which is the conservative direction — such a
 * line still fails, and gets rewritten.
 */
async function codeOnly(relativePath) {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  return source
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');
}

const { default: aiService } = await import('../services/aiService.js');
const { default: aiModelCapabilitiesService } = await import('../services/aiModelCapabilitiesService.js');
const { default: AIUsage } = await import('../models/AIUsage.js');
const { default: AIConfig } = await import('../models/AIConfig.js');
const { default: AIPricing } = await import('../models/AIPricing.js');
const { default: AIFreeTier } = await import('../models/AIFreeTier.js');
const { default: AIModel } = await import('../models/AIModel.js');
const { default: AIAppConfig } = await import('../models/AIAppConfig.js');

describe('aiService no longer carries the retired providers', () => {
  it('has no callLLM7 / callOneMin methods', () => {
    expect(aiService.callLLM7).toBeUndefined();
    expect(aiService.callOneMin).toBeUndefined();
    expect(aiService.call1minAI).toBeUndefined();
  });

  it('has no callClaude / anthropicMessagesFrom', () => {
    expect(aiService.callClaude).toBeUndefined();
    expect(aiService.anthropicMessagesFrom).toBeUndefined();
    // The Gemini translator is the one that carries F-02 now, so it had better
    // still be here.
    expect(typeof aiService.geminiContentsFrom).toBe('function');
  });

  it('defines no anthropic provider, and callProvider cannot route to one', async () => {
    expect(aiService.providers.anthropic).toBeUndefined();
    expect(aiService.fallbackOrder).not.toContain('anthropic');
    await expect(aiService.callProvider('anthropic', 'hi', {})).rejects.toThrow();
  });

  it('names no retired provider in its code — only in its comments', async () => {
    const code = await codeOnly('../services/aiService.js');
    for (const retired of RETIRED) {
      expect(code.toLowerCase()).not.toContain(retired);
    }
    // A claude model id would come back through a seed row or a default, which
    // is how a retired provider gets a second life.
    expect(code).not.toMatch(/claude/i);
  });

  it('defines no rate-limit bucket for any of them', () => {
    for (const retired of RETIRED) {
      expect(aiService.rateLimits[retired]).toBeUndefined();
    }
  });

  it('keeps a rate-limit bucket only for providers it can actually call', () => {
    for (const provider of Object.keys(aiService.rateLimits)) {
      expect(aiService.providers[provider]).toBeDefined();
    }
  });

  it('no longer seeds their model lists', async () => {
    // seedInitialModels' table is a local, so read the source instead: the
    // point is that no code path can write an AIModel row for either id.
    //
    // This used to read the file verbatim, comments included. That was too
    // strict, and it broke on 2026-09-07 the moment a comment explaining a
    // *different* Phase 0 deletion mentioned that the second routing stack was
    // still ranking `llm7` and `onemin` — a true and useful sentence. The rule
    // for every retired provider is the same now: comments may name them, code
    // may not.
    const code = await codeOnly('../services/aiService.js');
    expect(code).not.toMatch(/llm7|onemin|LLM7|OneMin/i);
  });
});

describe('the services that carry per-provider tables have no retired providers', () => {
  // These two outlived the roster by a day: rateLimitService kept a throttling
  // bucket for each, and aiDirectorService both priced `llm7` and named it in
  // the provider list it walks when it collects model information. Neither is
  // reachable — aiService.providers defines no such provider — which is
  // exactly why they sat there. Removed 2026-09-05 with the OpenAI-compat pass.
  it('rateLimitService defines no limit bucket for either', async () => {
    const { default: rateLimitService } = await import('../services/rateLimitService.js');
    for (const dead of DEAD) {
      expect(rateLimitService.limits[dead]).toBeUndefined();
    }
    expect(rateLimitService.limits.groq).toBeDefined();
  });

  it('aiDirectorService prices none of them, and walks none of them', async () => {
    const { default: aiDirectorService } = await import('../services/aiDirectorService.js');
    for (const retired of RETIRED) {
      expect(aiDirectorService.providerPricing[retired]).toBeUndefined();
    }
    expect(aiDirectorService.providerPricing.groq).toBeDefined();

    // The hardcoded provider list inside collectModelInformation is the one
    // place a retired id can come back by copy-paste, and seedInitialPricing is
    // the other, so read the source.
    const code = await codeOnly('../services/aiDirectorService.js');
    expect(code).not.toMatch(/llm7|onemin|LLM7|OneMin/i);
    expect(code.toLowerCase()).not.toContain('anthropic');
    expect(code).not.toMatch(/claude/i);
  });

  it('rateLimitService carries no retired provider in its source either', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(
      new URL('../services/rateLimitService.js', import.meta.url),
      'utf8'
    );
    expect(source).not.toMatch(/llm7|onemin|LLM7|OneMin/i);
  });
});

describe('the capability matrix has no retired providers', () => {
  it('drops the llm7 and anthropic blocks', () => {
    for (const retired of RETIRED) {
      expect(aiModelCapabilitiesService.knownCapabilities?.[retired]).toBeUndefined();
    }
    expect(aiModelCapabilitiesService.knownCapabilities.gemini).toBeDefined();
  });

  // FINDING F-04: a provider marked capable with no adapter behind it does not
  // fail loudly — it is *selected*, and the tools or response_format are
  // dropped at an adapter that never existed. So the allowlists have to lose a
  // provider the same day the provider goes.
  it('claims no tool forwarding and no native structured output for anthropic', () => {
    expect(aiModelCapabilitiesService.supportsTools('anthropic', 'claude-3-5-sonnet-20241022')).toBe(false);
    expect(aiModelCapabilitiesService.supportsJSONSchema('anthropic', 'claude-3-5-sonnet-20241022')).toBe(false);
    expect(aiModelCapabilitiesService.supportsJSONMode('anthropic', 'claude-3-5-sonnet-20241022')).toBe(false);
    // Gemini is the bespoke adapter left with both; groq forwards tools only.
    expect(aiModelCapabilitiesService.supportsTools('gemini', 'gemini-2.5-flash')).toBe(true);
    expect(aiModelCapabilitiesService.supportsJSONSchema('gemini', 'gemini-2.5-flash')).toBe(true);
    expect(aiModelCapabilitiesService.supportsTools('groq', 'llama-3.3-70b-versatile')).toBe(true);
    expect(aiModelCapabilitiesService.supportsJSONSchema('groq', 'llama-3.3-70b-versatile')).toBe(false);
  });

  it('names no retired provider in its code — only in its comments', async () => {
    const code = await codeOnly('../services/aiModelCapabilitiesService.js');
    for (const retired of RETIRED) {
      expect(code.toLowerCase()).not.toContain(retired);
    }
    expect(code).not.toMatch(/claude/i);
  });

  // Zero callers, and it could not have had a working one: the query ended in
  // `.populate('pricing').populate('freeTier')` and AIModel declares neither
  // path, so mongoose 8 throws StrictPopulateError. Deleted 2026-09-07 in the
  // same pass; recorded here so it does not get pasted back.
  it('no longer carries getModelsForTask', () => {
    expect(aiModelCapabilitiesService.getModelsForTask).toBeUndefined();
  });
});

describe('the roster and the UI list agree that anthropic is gone', () => {
  it('is not in PROVIDER_IDS, DEFAULT_MODELS, or the rotation', async () => {
    const { PROVIDER_IDS, DEFAULT_MODELS, FALLBACK_ORDER, PROVIDERS_BY_ID } =
      await import('../config/aiProviders.js');
    for (const retired of RETIRED) {
      expect(PROVIDER_IDS).not.toContain(retired);
      expect(DEFAULT_MODELS[retired]).toBeUndefined();
      expect(FALLBACK_ORDER).not.toContain(retired);
      expect(PROVIDERS_BY_ID[retired]).toBeUndefined();
    }
    // No surviving row may name a claude model as its default.
    for (const model of Object.values(DEFAULT_MODELS)) {
      expect(model).not.toMatch(/claude/i);
    }
  });
});

describe('every AI schema enum refuses the retired providers', () => {
  const models = {
    AIUsage, AIConfig, AIPricing, AIFreeTier, AIModel, AIAppConfig,
  };

  for (const [name, model] of Object.entries(models)) {
    it(`${name}.provider accepts none of them`, () => {
      const values = model.schema.path('provider')?.enumValues;
      // Not every one of these keys its provider at the document root; where it
      // does, the enum must be clean.
      if (!values) return;
      for (const retired of RETIRED) {
        expect(values).not.toContain(retired);
      }
      // A live provider, so an enum emptied by a bad edit fails here too.
      expect(values).toContain('groq');
    });
  }
});
