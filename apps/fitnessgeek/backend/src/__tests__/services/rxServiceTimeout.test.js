// RxNav calls had no timeout at all (axios has none by default), so a stalled
// RxNav held the medication search open until the browser gave up.

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const get = jest.fn();
jest.unstable_mockModule('axios', () => ({ __esModule: true, default: { get } }));

const rx = await import('../../services/rxService.js');

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ data: {} });
});

describe('rxService', () => {
  test('every RxNav call carries a timeout', async () => {
    await rx.searchApproximate('lisinopril');
    await rx.resolveRxcuiByName('lisinopril');
    await rx.relatedByTty('29046', 'IN');
    await rx.getRxTermsInfo('29046');
    await rx.getClassesByRxcui('29046', 'ATC');

    expect(get).toHaveBeenCalledTimes(5);
    for (const [url, config] of get.mock.calls) {
      expect(url).toMatch(/^https:\/\/rxnav\.nlm\.nih\.gov\/REST\//);
      expect(config?.timeout).toBe(rx.RXNAV_TIMEOUT_MS);
      expect(config.timeout).toBeGreaterThan(0);
      expect(config.timeout).toBeLessThanOrEqual(10000);
    }
  });

  test('the query still goes out as params', async () => {
    await rx.searchApproximate('metformin', 5);
    expect(get.mock.calls[0][1].params).toEqual({ term: 'metformin', maxEntries: 5 });
  });
});
