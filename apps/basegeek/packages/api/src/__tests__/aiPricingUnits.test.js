/**
 * aiPricingUnits.test.js — the unit the AIPricing collection is denominated in.
 *
 * Pricing is stored per *million* tokens. Every provider quotes that way and
 * the seed data follows: anthropic opus at 15/75, gemini-2.5-pro at 1.25/10.
 * `getCostAnalysis` used to divide token counts by 1000 against those numbers,
 * which overstated every estimate by exactly 1000x, and the AIPricing schema
 * advertised `per_1k_tokens` while holding per-1M values.
 *
 * The headline case is deliberately boring arithmetic: a million tokens at $15
 * per million costs fifteen dollars. If that ever comes back 15000, the unit
 * has drifted again.
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';

const { default: aiDirectorService, costForTokens, TOKENS_PER_PRICE_UNIT } =
  await import('../services/aiDirectorService.js');
const { default: AIPricing } = await import('../models/AIPricing.js');

afterEach(() => {
  jest.restoreAllMocks();
});

describe('costForTokens — dollars per million tokens', () => {
  it('charges 15 for 1,000,000 tokens at a price of 15', () => {
    expect(costForTokens(1_000_000, 15)).toBe(15);
  });

  it('scales linearly below and above the unit', () => {
    expect(costForTokens(500_000, 15)).toBe(7.5);
    expect(costForTokens(2_000_000, 15)).toBe(30);
    expect(costForTokens(0, 15)).toBe(0);
  });

  it('treats a missing or non-numeric price as free rather than NaN', () => {
    expect(costForTokens(1_000_000, undefined)).toBe(0);
    expect(costForTokens(1_000_000, null)).toBe(0);
    expect(costForTokens(1_000_000, 'Unknown')).toBe(0);
  });

  it('states the unit it divides by', () => {
    expect(TOKENS_PER_PRICE_UNIT).toBe(1_000_000);
  });
});

describe('getCostAnalysis — the same unit end to end', () => {
  /**
   * The analysis estimates input tokens from prompt length (length / 4) and
   * takes output tokens verbatim from expectedResponseLength. An empty prompt
   * plus a million expected output tokens isolates one multiplication, so the
   * assertion is the headline case and nothing else.
   */
  it('costs a 1,000,000-token response at price 15 as $15', async () => {
    jest.spyOn(aiDirectorService, 'collectModelInformation').mockResolvedValue({
      success: true,
      data: {
        providers: {
          anthropic: {
            hasApiKey: true,
            isEnabled: true,
            totalModels: 1,
            models: [{
              id: 'claude-test',
              name: 'Claude Test',
              pricing: { input: 15, output: 15 },
              freeTier: { isFree: false, limits: {}, notes: '' },
            }],
          },
        },
      },
    });

    const result = await aiDirectorService.getCostAnalysis('', 1_000_000);

    expect(result.success).toBe(true);
    const [model] = result.data.analysis.anthropic.models;
    expect(model.outputTokens).toBe(1_000_000);
    expect(model.estimatedCost).toBe(15);
  });

  it('does not fall over on models whose pricing is Unknown', async () => {
    jest.spyOn(aiDirectorService, 'collectModelInformation').mockResolvedValue({
      success: true,
      data: {
        providers: {
          groq: {
            hasApiKey: true,
            isEnabled: true,
            totalModels: 1,
            models: [{
              id: 'mystery',
              name: 'Mystery',
              pricing: { input: 'Unknown', output: 'Unknown' },
              freeTier: { isFree: false, limits: {}, notes: '' },
            }],
          },
        },
      },
    });

    const result = await aiDirectorService.getCostAnalysis('hello', 1000);
    expect(result.success).toBe(true);
    expect(result.data.analysis.groq.models[0].estimatedCost).toBe(0);
  });
});

describe('AIPricing schema', () => {
  it('documents the stored unit as per-1M tokens', () => {
    const doc = new AIPricing({ provider: 'anthropic', modelId: 'x', inputPrice: 15, outputPrice: 75 });
    expect(doc.priceUnit).toBe('per_1m_tokens');
  });
});
