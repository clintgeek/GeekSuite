import { describe, expect, it } from 'vitest';
import { classifyFormFactor } from '@geeksuite/ui';
import { thingNavFor } from '../../hooks/useThingNav';

const ff = (width, height, coarse) => classifyFormFactor({ width, height, coarse, fine: !coarse });

describe('which navigation ThingGeek draws', () => {
  it('a touch tablet takes the rail in either grip', () => {
    expect(thingNavFor(ff(800, 1280, true), true)).toBe('rail');
    expect(thingNavFor(ff(1280, 800, true), false)).toBe('rail');
  });
  it('a phone keeps the tab bar, sideways too', () => {
    expect(thingNavFor(ff(390, 844, true), true)).toBe('bottom');
    expect(thingNavFor(ff(844, 390, true), true)).toBe('bottom');
  });
  it('a mouse is as it always was: the tab bar below md, the sidebar from there up — never the rail', () => {
    expect(thingNavFor(ff(700, 900, false), true)).toBe('bottom');
    expect(thingNavFor(ff(1000, 800, false), false)).toBe('sidebar');
    expect(thingNavFor(ff(1440, 900, false), false)).toBe('sidebar');
  });
});
