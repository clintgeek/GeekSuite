/**
 * aiDeadProviders.test.js — `llm7` and `onemin` are gone, and stay gone.
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
 * Existing Mongo rows holding either provider value are orphaned data, not
 * broken data: `findOneAndUpdate` does not run validators by default, so the
 * tightened enums cannot break a read. See DOCS/AI_CATALOG.md.
 */

import { describe, it, expect } from '@jest/globals';

const DEAD = ['llm7', 'onemin'];

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

  it('defines no rate-limit bucket for either', () => {
    for (const dead of DEAD) {
      expect(aiService.rateLimits[dead]).toBeUndefined();
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
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(
      new URL('../services/aiService.js', import.meta.url),
      'utf8'
    );
    expect(source).not.toMatch(/llm7|onemin|LLM7|OneMin/i);
  });
});

describe('the capability matrix has no retired providers', () => {
  it('drops the llm7 block', () => {
    for (const dead of DEAD) {
      expect(aiModelCapabilitiesService.knownCapabilities?.[dead]).toBeUndefined();
    }
  });
});

describe('every AI schema enum refuses the retired providers', () => {
  const models = {
    AIUsage, AIConfig, AIPricing, AIFreeTier, AIModel, AIAppConfig,
  };

  for (const [name, model] of Object.entries(models)) {
    it(`${name}.provider accepts neither`, () => {
      const values = model.schema.path('provider')?.enumValues;
      // Not every one of these keys its provider at the document root; where it
      // does, the enum must be clean.
      if (!values) return;
      for (const dead of DEAD) {
        expect(values).not.toContain(dead);
      }
      expect(values).toContain('anthropic');
    });
  }
});
