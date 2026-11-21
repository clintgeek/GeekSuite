import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readPenSeen, writePenSeen, readFingerDraws, writeFingerDraws, touchDraws, PEN_PREF_KEYS } from './penPrefs';

describe('pen prefs', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('uses the GeekDay keys', () => {
    expect(PEN_PREF_KEYS).toEqual({ penSeen: 'geekday:inkPenSeen', fingerDraws: 'geekday:inkFingerDraws' });
  });
  it('pen seen: off until written, then stays', () => {
    expect(readPenSeen()).toBe(false);
    writePenSeen();
    writePenSeen();
    expect(readPenSeen()).toBe(true);
    expect(localStorage.getItem('geekday:inkPenSeen')).toBe('1');
  });
  it('finger draws: on and off again', () => {
    expect(readFingerDraws()).toBe(false);
    writeFingerDraws(true);
    expect(readFingerDraws()).toBe(true);
    writeFingerDraws(false);
    expect(readFingerDraws()).toBe(false);
    expect(localStorage.getItem('geekday:inkFingerDraws')).toBe(null);
  });
  it('never throws when storage is refused', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    });
    expect(readPenSeen()).toBe(false);
    expect(() => writePenSeen()).not.toThrow();
    expect(() => writeFingerDraws(true)).not.toThrow();
    expect(readFingerDraws()).toBe(false);
  });
  it('never throws when there is no storage at all', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(readPenSeen()).toBe(false);
    expect(() => writeFingerDraws(true)).not.toThrow();
  });
  it('a finger draws until a pen is seen, or when the writer says so', () => {
    expect(touchDraws({ penSeen: false, fingerDraws: false })).toBe(true);
    expect(touchDraws({ penSeen: true, fingerDraws: false })).toBe(false);
    expect(touchDraws({ penSeen: true, fingerDraws: true })).toBe(true);
  });
});
