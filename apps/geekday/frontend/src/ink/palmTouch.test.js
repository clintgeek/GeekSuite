/** A palm on the toolbar in pen mode. Copied from NoteGeek's palmTouch.test.js. */
import { describe, it, expect } from 'vitest';
import { isPalmTouch, PALM_PEN_RECENT_MS } from './palmTouch';

describe('isPalmTouch', () => {
  const now = 100_000;
  it('only in pen mode, only touch', () => {
    expect(isPalmTouch({ pointerType: 'touch', width: 50 }, { penMode: false, lastPenAt: now, now })).toBe(false);
    expect(isPalmTouch({ pointerType: 'pen', width: 50 }, { penMode: true, lastPenAt: now, now })).toBe(false);
    expect(isPalmTouch({ pointerType: 'mouse' }, { penMode: true, lastPenAt: now, now })).toBe(false);
  });
  it('a touch while the pen is near, or a wide contact, is a palm; a fingertip with the pen away is not', () => {
    expect(isPalmTouch({ pointerType: 'touch', width: 6, height: 6 }, { penMode: true, lastPenAt: now - 200, now })).toBe(true);
    expect(isPalmTouch({ pointerType: 'touch', width: 40, height: 30 }, { penMode: true, lastPenAt: 0, now })).toBe(true);
    expect(isPalmTouch({ pointerType: 'touch', width: 6, height: 6 }, { penMode: true, lastPenAt: now - PALM_PEN_RECENT_MS - 1, now })).toBe(false);
  });
});
