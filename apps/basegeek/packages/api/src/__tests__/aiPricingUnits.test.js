/**
 * aiPricingUnits.test.js — the unit the AIPricing collection is denominated in.
 *
 * Pricing is stored per *million* tokens. Every provider quotes that way and
 * the seed data follows: cohere command-r-plus at 2.5, gemini-2.5-pro at
 * 1.25/10. (`anthropic` opus at 15/75 was the loudest row in the table until
 * the provider was retired on 2026-09-07; the headline case below keeps 15 as
 * a synthetic price because the arithmetic is the point, not the vendor.)
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
          cohere: {
            hasApiKey: true,
            isEnabled: true,
            totalModels: 1,
            models: [{
              id: 'command-test',
              name: 'Command Test',
              pricing: { input: 15, output: 15 },
              freeTier: { isFree: false, limits: {}, notes: '' },
            }],
          },
        },
      },
    });

    const result = await aiDirectorService.getCostAnalysis('', 1_000_000);

    expect(result.success).toBe(true);
    const [model] = result.data.analysis.cohere.models;
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
    const doc = new AIPricing({ provider: 'cohere', modelId: 'x', inputPrice: 15, outputPrice: 75 });
    expect(doc.priceUnit).toBe('per_1m_tokens');
  });
});

/**
 * Going-over 2026-09-05 — the seed data itself, not just `costForTokens`.
 *
 * The unit test above pinned the arithmetic and asserted nothing about the
 * numbers fed to it, so the groq and together blocks sat in the table as the
 * vendor prices divided by 1000 — per-1K figures in a per-1M table — for as
 * long as they had existed. The effect: `/director/analyze-cost` under-reported
 * both providers by 1000x, and `recommendProvider(priority: 'cost')` ranked
 * them as effectively free against correctly-priced Gemini models.
 *
 * These cases need no external price list. They assert the two things that are
 * true of a per-1M table whatever the vendor charges: no paid model costs a
 * fraction of a cent per million tokens, and no single row has an
 * input/output ratio that no real price list has ever had.
 */
describe('the seeded price table is denominated per 1M tokens', () => {
  const table = aiDirectorService.providerPricing;

  const rows = Object.entries(table).flatMap(([provider, models]) =>
    Object.entries(models).map(([modelId, price]) => ({ provider, modelId, ...price }))
  );

  it('has rows for every provider it prices', () => {
    expect(rows.length).toBeGreaterThan(40);
  });

  it('prices no paid model below $0.01 per million tokens', () => {
    // A per-1K value in this table reads as 0.0002-0.002; the cheapest real
    // per-1M price in the whole set is Gemini 2.0 Flash Lite at 0.075.
    const suspicious = rows.filter(
      (r) => (r.input > 0 && r.input < 0.01) || (r.output > 0 && r.output < 0.01)
    );
    expect(suspicious).toEqual([]);
  });

  it('has no row whose input and output differ by more than 100x', () => {
    // gemini-1.5-flash was `{input: 0.00035, output: 1.05}` — a 3000x ratio
    // inside one row, which is the tell that only one half was converted.
    const lopsided = rows.filter((r) => {
      if (!r.input || !r.output) return false;
      const ratio = Math.max(r.input, r.output) / Math.min(r.input, r.output);
      return ratio > 100;
    });
    expect(lopsided).toEqual([]);
  });

  // The reference row was `anthropic`'s cheapest (claude-3-haiku at 0.25) until
  // the provider came out on 2026-09-07. Cohere is now the priciest thing left
  // in the table, which makes it the same test: a block converted the wrong way
  // (per-1K figures left in a per-1M table) puts groq at 0.00027 and fails here.
  it('keeps groq and together in the same order of magnitude as cohere', () => {
    const cheapestPaid = Math.min(...Object.values(table.cohere).map((p) => p.input));
    const groqPrices = Object.values(table.groq).map((p) => p.input).filter((p) => p > 0);
    const togetherPrices = Object.values(table.together).map((p) => p.input).filter((p) => p > 0);
    // Groq and Together are cheaper than Cohere — but by a single order of
    // magnitude, not by four.
    expect(Math.min(...groqPrices)).toBeGreaterThan(cheapestPaid / 100);
    expect(Math.min(...togetherPrices)).toBeGreaterThan(cheapestPaid / 100);
  });

  it('keeps a model whose own name says Free priced at zero', () => {
    expect(table.together['meta-llama/Llama-3.3-70B-Instruct-Turbo-Free']).toEqual({ input: 0, output: 0 });
  });
});

/**
 * Going-over 2026-09-05 — ordering when a model has no AIPricing row.
 *
 * `collectModelInformation` sets `pricing` to `{input: 'Unknown', output:
 * 'Unknown'}` for most of the catalog. `('Unknown' || 0)` is the STRING
 * 'Unknown', so the cheapest-model reduce concatenated ('UnknownUnknown') and
 * compared strings, and the final sort's `costA - costB` was NaN — the default
 * `priority: 'cost'` ordering was arbitrary. That is exactly the call
 * StoryGeek's epub pipeline makes before reading `recommendations[0]`.
 */
describe('unpriced models sort last, not free', () => {
  const { constructor: AIDirectorService } = aiDirectorService;

  it('reads a real number as itself', () => {
    expect(AIDirectorService.numericPrice(0.27)).toBe(0.27);
    expect(AIDirectorService.numericPrice(0)).toBe(0);
  });

  it("reads 'Unknown', null, undefined and NaN as Infinity", () => {
    expect(AIDirectorService.numericPrice('Unknown')).toBe(Infinity);
    expect(AIDirectorService.numericPrice(null)).toBe(Infinity);
    expect(AIDirectorService.numericPrice(undefined)).toBe(Infinity);
    expect(AIDirectorService.numericPrice(NaN)).toBe(Infinity);
  });

  it('totals a priced model and refuses to total a half-priced one', () => {
    expect(AIDirectorService.totalPriceOf({ pricing: { input: 1, output: 3 } })).toBe(4);
    expect(AIDirectorService.totalPriceOf({ pricing: { input: 1, output: 'Unknown' } })).toBe(Infinity);
    expect(AIDirectorService.totalPriceOf({})).toBe(Infinity);
  });

  it('orders a priced model ahead of an unpriced one', () => {
    const priced = { pricing: { input: 5, output: 5 } };
    const unpriced = { pricing: { input: 'Unknown', output: 'Unknown' } };
    const free = { pricing: { input: 0, output: 0 } };
    const sorted = [unpriced, priced, free]
      .sort((a, b) => AIDirectorService.totalPriceOf(a) - AIDirectorService.totalPriceOf(b));
    expect(sorted[0]).toBe(free);
    expect(sorted[1]).toBe(priced);
    // Before the fix this comparison was 'UnknownUnknown' < 10, i.e. false,
    // and the reduce picked whichever model happened to come first.
    expect(AIDirectorService.totalPriceOf(unpriced) > AIDirectorService.totalPriceOf(priced)).toBe(true);
  });
});
