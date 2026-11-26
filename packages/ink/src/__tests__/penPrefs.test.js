import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPenPrefs, readPref, writePref, readJsonPref, touchDraws, MAX_CAMERAS, MAX_RECENT_PENS } from '../penPrefs.js';

const KEYS = {
  penSeen: 't:penSeen', fingerDraws: 't:fingerDraws', barPosition: 't:bar', cameras: 't:cameras', recentPens: 't:pens',
};

describe('pen prefs', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('only the prefs an app names a key for', () => {
    expect(Object.keys(createPenPrefs({ penSeen: 'a', fingerDraws: 'b' })).sort())
      .toEqual(['readFingerDraws', 'readPenSeen', 'writeFingerDraws', 'writePenSeen']);
  });

  it('pen seen and finger draws are stored as "1" under the given keys', () => {
    const p = createPenPrefs(KEYS);
    expect(p.readPenSeen()).toBe(false);
    p.writePenSeen(); p.writePenSeen();
    expect(localStorage.getItem('t:penSeen')).toBe('1');
    p.writeFingerDraws(true);
    expect(localStorage.getItem('t:fingerDraws')).toBe('1');
    p.writeFingerDraws(false);
    expect(localStorage.getItem('t:fingerDraws')).toBe(null);
  });

  it('bar position: one of four, bottom otherwise', () => {
    const p = createPenPrefs(KEYS);
    expect(p.readBarPosition()).toBe('bottom');
    p.writeBarPosition('left');
    expect(p.readBarPosition()).toBe('left');
    p.writeBarPosition('diagonal');
    expect(localStorage.getItem('t:bar')).toBe(null);
    localStorage.setItem('t:bar', 'sideways');
    expect(p.readBarPosition()).toBe('bottom');
  });

  it('cameras: per note, valid only, least recently used dropped past the cap', () => {
    const p = createPenPrefs(KEYS);
    expect(p.readCamera(null)).toBe(null);
    p.writeCamera('n1', { x: 1, y: 2, z: 0.5 });
    expect(p.readCamera('n1')).toEqual({ x: 1, y: 2, z: 0.5 });
    p.writeCamera('n2', { x: 1, y: 2, z: 0 });
    expect(p.readCamera('n2')).toBe(null);
    for (let i = 0; i < MAX_CAMERAS + 5; i++) p.writeCamera(`m${i}`, { x: i, y: 0, z: 1 });
    expect(Object.keys(JSON.parse(localStorage.getItem('t:cameras')))).toHaveLength(MAX_CAMERAS);
    localStorage.setItem('t:cameras', 'not json');
    expect(p.readCamera('n1')).toBe(null);
  });

  it('recent pens: newest first, no repeats, at most three', () => {
    const p = createPenPrefs(KEYS);
    expect(p.readRecentPens()).toEqual([]);
    p.pushRecentPen({ color: 'black', size: 's' });
    p.pushRecentPen({ color: 'blue', size: 'fine' });
    p.pushRecentPen({ color: 'black', size: 's' });
    expect(p.readRecentPens()).toEqual([{ color: 'black', size: 's' }, { color: 'blue', size: 'fine' }]);
    ['red', 'green', 'violet'].forEach((color) => p.pushRecentPen({ color, size: 'm' }));
    expect(p.readRecentPens()).toHaveLength(MAX_RECENT_PENS);
    expect(p.pushRecentPen({ color: 'x' })).toHaveLength(MAX_RECENT_PENS);
  });

  it('never throws when storage is refused or missing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    });
    const p = createPenPrefs(KEYS);
    expect(p.readPenSeen()).toBe(false);
    expect(() => p.writePenSeen()).not.toThrow();
    expect(() => p.writeCamera('n', { x: 0, y: 0, z: 1 })).not.toThrow();
    expect(readPref('k')).toBe(null);
    expect(() => writePref('k', 'v')).not.toThrow();
    expect(readJsonPref('k', 7)).toBe(7);
    vi.stubGlobal('localStorage', undefined);
    expect(p.readRecentPens()).toEqual([]);
    expect(() => p.writeFingerDraws(true)).not.toThrow();
  });

  it('a finger draws until a pen is seen, or when the writer says so', () => {
    expect(touchDraws({ penSeen: false, fingerDraws: false })).toBe(true);
    expect(touchDraws({ penSeen: true, fingerDraws: false })).toBe(false);
    expect(touchDraws({ penSeen: true, fingerDraws: true })).toBe(true);
  });
});
