import { describe, it, expect } from 'vitest';
import { weightStatView } from '../weightStatView.js';

describe('weightStatView — the dashboard Weight card', () => {
  it('the value is always the current 7-day average; the change rides in the caption', () => {
    expect(weightStatView({ currentMean: 319.14, totalChange: -4, reason: null })).toEqual({
      value: '319.1', unit: 'lb', caption: '7-day avg · −4.0 lb in 30 days',
    });
    expect(weightStatView({ currentMean: 300, totalChange: 1.25, reason: null }).caption).toBe('7-day avg · +1.3 lb in 30 days');
  });

  it('with no honest change yet it still shows the weight — never "--" when a weight exists', () => {
    // Chef on 2026-09-23: scale readings since 09-15, nothing for nine months
    // before. The card said "--", which read as "no data".
    const v = weightStatView({ currentMean: 319.1, totalChange: null, reason: 'no_baseline', availableFrom: '2026-10-15' });
    expect(v).toEqual({ value: '319.1', unit: 'lb', caption: '7-day avg · 30-day change from Oct 15' });
    expect(weightStatView({ currentMean: 250, totalChange: null, reason: 'insufficient_span', availableFrom: '2026-09-29' }).caption)
      .toBe('7-day avg · 30-day change from Sep 29');
  });

  it('"--" only when there is genuinely no weight', () => {
    expect(weightStatView({ currentMean: null, totalChange: null, reason: 'no_data' })).toEqual({ value: '--', unit: '', caption: 'No weigh-ins yet' });
    expect(weightStatView(null).value).toBe('--');
  });
});
