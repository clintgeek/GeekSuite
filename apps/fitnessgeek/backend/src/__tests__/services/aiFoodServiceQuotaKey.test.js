/**
 * aiFoodService — every feature call carries the per-user `quotaKey`
 * (audit 2026-11-06, #14). See unifiedFoodClassifyQuotaKey.test.js for the
 * search-path half.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

const mod = (p) => new URL(p, import.meta.url).pathname;
const feature = jest.fn();

jest.unstable_mockModule(mod('../../services/aiGeekClient.js'), () => ({
  __esModule: true,
  default: { feature, isConfigured: () => true, getStatus: () => ({}), modelsAlive: async () => [] },
  UNAVAILABLE_MESSAGE: "The assistant isn't available right now.",
  MAX_TIMEOUT_MS: 60000
}));

const { default: aiFoodService } = await import('../../services/aiFoodService.js');

const declined = { ok: false, data: null, reason: 'unavailable', provenance: { source: 'none', hints: [] } };

beforeEach(() => {
  feature.mockReset();
  feature.mockResolvedValue(declined);
});

describe('quotaKey', () => {
  test('foodClassify buckets by the user', async () => {
    await aiFoodService.classifyFoodInput('big mac', { userId: 'u1' });
    expect(feature.mock.calls[0][0]).toBe('foodClassify');
    expect(feature.mock.calls[0][1].quotaKey).toBe('u1');
  });

  test('foodScore buckets by the user', async () => {
    await aiFoodService.scoreResultsRelevance('a', [{ name: 'a' }], { userId: 'u1' });
    expect(feature.mock.calls[0][0]).toBe('foodScore');
    expect(feature.mock.calls[0][1].quotaKey).toBe('u1');
  });

  test('foodSanityCheck buckets by the user', async () => {
    await aiFoodService.sanityCheckResults('a', [{ name: 'a' }], { userId: 'u1' });
    expect(feature.mock.calls[0][0]).toBe('foodSanityCheck');
    expect(feature.mock.calls[0][1].quotaKey).toBe('u1');
  });

  test('no user still works (old one-argument callers)', async () => {
    const result = await aiFoodService.classifyFoodInput('big mac');
    expect(result.type).toBe('unknown');
    expect(feature.mock.calls[0][1].quotaKey).toBeUndefined();
  });
});
