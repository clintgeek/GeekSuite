import { describe, it, expect } from 'vitest';
import { formatPostgresUptime } from '../../utils/uptime';

describe('formatPostgresUptime', () => {
  it('writes an interval the way Mongo and Redis uptime are written', () => {
    expect(formatPostgresUptime({ days: 12, hours: 4, minutes: 33, seconds: 7, milliseconds: 120 })).toBe('12d 4h 33m');
  });

  it('copes with a short interval and leaves a string alone', () => {
    expect(formatPostgresUptime({ minutes: 5, seconds: 2 })).toBe('5m');
    expect(formatPostgresUptime('3 days')).toBe('3 days');
    expect(formatPostgresUptime(null)).toBe('');
  });
});
