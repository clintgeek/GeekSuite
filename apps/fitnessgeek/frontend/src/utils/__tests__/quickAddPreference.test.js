/**
 * The opt-in switch for natural-language quick-add. Two things matter and
 * both are stated as rules in DOCS/AI_IDEAS.md: it is **off** until somebody
 * turns it on, and a browser that will not give us storage reads as off
 * rather than throwing on the Food Log page.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  QUICK_ADD_NL_KEY,
  isNaturalQuickAddEnabled,
  setNaturalQuickAddEnabled,
} from '../quickAddPreference.js';

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('quickAddPreference', () => {
  it('is off by default', () => {
    expect(isNaturalQuickAddEnabled()).toBe(false);
  });

  it('round-trips both ways', () => {
    setNaturalQuickAddEnabled(true);
    expect(window.localStorage.getItem(QUICK_ADD_NL_KEY)).toBe('true');
    expect(isNaturalQuickAddEnabled()).toBe(true);

    setNaturalQuickAddEnabled(false);
    expect(isNaturalQuickAddEnabled()).toBe(false);
  });

  it('anything but the literal string "true" is off', () => {
    for (const value of ['1', 'yes', 'TRUE', '', 'false']) {
      window.localStorage.setItem(QUICK_ADD_NL_KEY, value);
      expect(isNaturalQuickAddEnabled()).toBe(false);
    }
  });

  it('a browser that refuses storage reads as off and writes without throwing', () => {
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(isNaturalQuickAddEnabled()).toBe(false);
    expect(() => setNaturalQuickAddEnabled(true)).not.toThrow();
  });
});
