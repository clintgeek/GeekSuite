import { describe, it, expect } from 'vitest';
import { weightStatView } from '../weightStatView.js';

describe('weightStatView — the dashboard Weight card', () => {
  it('prints a signed smoothed change with what it is measured against', () => {
    expect(weightStatView({ totalChange: -4, reason: null })).toEqual({ value: '−4.0', unit: 'lb', caption: '7-day avg vs 30 days ago' });
    expect(weightStatView({ totalChange: 1.25, reason: null }).value).toBe('+1.3');
  });

  it('says when the trend will exist instead of printing a number', () => {
    const v = weightStatView({ totalChange: null, reason: 'insufficient_span', availableFrom: '2026-09-29' });
    expect(v.value).toBe('--');
    expect(v.caption).toBe('30-day trend from 29 Sep');
  });

  it('says why there is no number when the log has a gap, or is empty', () => {
    expect(weightStatView({ totalChange: null, reason: 'no_baseline' }).caption).toBe('No weigh-ins around 30 days ago');
    expect(weightStatView({ totalChange: null, reason: 'no_data' }).caption).toBe('No weigh-ins yet');
  });
});
