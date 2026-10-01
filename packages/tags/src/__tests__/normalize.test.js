import { describe, it, expect } from 'vitest';
import {
  normalizeTag,
  normalizeTags,
  normalizeSegment,
  isNormalizedTag,
  isUnder,
  isDescendant,
  swapPrefix,
  parentTag,
  subtreeRegex,
  escapeRegex,
  TAG_MAX_LENGTH,
  TAGS_MAX,
} from '../index.js';

describe('normalizeTag — the standard, case by case', () => {
  it.each([
    // already standard
    ['work', 'work'],
    ['house/garage', 'house/garage'],
    ['work/geek-suite', 'work/geek-suite'],
    // case
    ['Work', 'work'],
    ['WORK', 'work'],
    ['House/Garage', 'house/garage'],
    // camelCase / PascalCase
    ['geekSuite', 'geek-suite'],
    ['GeekSuite', 'geek-suite'],
    ['work/GeekSuite', 'work/geek-suite'],
    ['myGreatIdea', 'my-great-idea'],
    ['HTTPServer', 'http-server'],
    ['XMLHttpRequest', 'xml-http-request'],
    ['parseHTML', 'parse-html'],
    ['HTTP', 'http'],
    ['iPhone', 'i-phone'],
    // acronym plurals stay whole
    ['URLs', 'urls'],
    ['IDs', 'ids'],
    ['myAPIs', 'my-apis'],
    ['APIsAndMore', 'apis-and-more'],
    // digits
    ['v2Plan', 'v2-plan'],
    ['v2', 'v2'],
    ['covid19', 'covid19'],
    ['plan2', 'plan2'],
    ['2Plan', '2-plan'],
    ['2026', '2026'],
    ['Q3Goals', 'q3-goals'],
    ['ps5', 'ps5'],
    // separators
    ['geek suite', 'geek-suite'],
    ['geek   suite', 'geek-suite'],
    ['geek_suite', 'geek-suite'],
    ['geek__suite', 'geek-suite'],
    ['geek-suite', 'geek-suite'],
    ['geek--suite', 'geek-suite'],
    ['geek.suite', 'geek-suite'],
    ['geek - suite', 'geek-suite'],
    ['geek\tsuite', 'geek-suite'],
    ['geek–suite', 'geek-suite'], // en dash
    ['-lead-and-trail-', 'lead-and-trail'],
    ['_private_', 'private'],
    ['v1.2.3', 'v1-2-3'],
    // dropped punctuation
    ['R&D', 'rd'],
    ['rock & roll', 'rock-roll'],
    ["don't", 'dont'],
    ['C++', 'c'],
    ['c#', 'c'],
    ['a+b', 'ab'],
    ['what?!', 'what'],
    ['(parens)', 'parens'],
    ['"quoted"', 'quoted'],
    ['a,b;c:d', 'abcd'],
    ['email@home', 'emailhome'],
    ['100%', '100'],
    ['back\\slash', 'backslash'],
    ['tilde~', 'tilde'],
    // emoji / symbols vanish
    ['🎉party', 'party'],
    ['🎉', ''],
    ['★', ''],
    // nesting
    [' house // garage/ ', 'house/garage'],
    ['house / garage', 'house/garage'],
    ['/house/', 'house'],
    ['House Projects/Garage Door', 'house-projects/garage-door'],
    ['a b/c d', 'a-b/c-d'],
    ['house/&/garage', 'house/garage'],
    ['#house/garage', 'house/garage'],
    // leading #
    ['#work', 'work'],
    ['##work', 'work'],
    ['#GeekSuite', 'geek-suite'],
    // Unicode letters
    ['café', 'café'],
    ['Café', 'café'],
    ['日記', '日記'],
    ['naïve', 'naïve'],
    ['Straße', 'straße'],
    ['ЖурналДел', 'журнал-дел'],
    ['café', 'café'], // decomposed é → NFKC composes it
    // NFKC
    ['ＷＯＲＫ', 'work'], // full-width
    ['ﬁle', 'file'], // ligature
    // empties
    ['', ''],
    ['   ', ''],
    ['/', ''],
    [' // ', ''],
    ['#', ''],
    ['---', ''],
    ['&&', ''],
    // non-strings
    [null, ''],
    [undefined, ''],
    [42, ''],
    [{}, ''],
  ])('%j → %j', (raw, expected) => {
    expect(normalizeTag(raw)).toBe(expected);
  });

  it('is idempotent on everything it produces', () => {
    const samples = ['GeekSuite', 'House Projects/Garage Door', 'HTTPServer', 'R&D', 'v2Plan', 'ЖурналДел', 'URLs'];
    for (const s of samples) {
      const once = normalizeTag(s);
      expect(normalizeTag(once)).toBe(once);
    }
  });

  it('every output is in the allowed set: lowercase letters/marks/digits, -, /', () => {
    const allowed = /^[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)*(?:\/[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)*)*$/u;
    const samples = ['GeekSuite', 'a  b / c__d', '-x-/-y-', 'R&D/C++/don\'t', '🎉 party / time!', 'Ünïcödé Tëxt'];
    for (const s of samples) {
      const out = normalizeTag(s);
      expect(out).toMatch(allowed);
      expect(out).toBe(out.toLowerCase());
    }
  });

  it('does not enforce the length limit itself (validators do, on the result)', () => {
    expect(normalizeTag('a'.repeat(150))).toHaveLength(150);
    expect(TAG_MAX_LENGTH).toBe(100);
    expect(TAGS_MAX).toBe(50);
  });

  it('normalizeSegment never sees a slash as nesting', () => {
    expect(normalizeSegment('Garage Door')).toBe('garage-door');
    expect(normalizeSegment(null)).toBe('');
  });
});

describe('normalizeTags', () => {
  it('normalizes, drops empties, dedupes post-normalization keeping first position', () => {
    expect(normalizeTags(['b', ' a ', 'House / Garage', '', '/', 'B', 'house/garage', 'GeekSuite', 'geek-suite', 'geek_suite']))
      .toEqual(['b', 'a', 'house/garage', 'geek-suite']);
  });
  it('is [] for a non-array', () => {
    expect(normalizeTags(null)).toEqual([]);
    expect(normalizeTags('work')).toEqual([]);
  });
  it('skips non-string members', () => {
    expect(normalizeTags(['a', null, 3, 'b'])).toEqual(['a', 'b']);
  });
});

describe('isNormalizedTag', () => {
  it('true only for the standard spelling', () => {
    expect(isNormalizedTag('house/garage')).toBe(true);
    expect(isNormalizedTag('House')).toBe(false);
    expect(isNormalizedTag('a b')).toBe(false);
    expect(isNormalizedTag('')).toBe(false);
    expect(isNormalizedTag(null)).toBe(false);
  });
});

describe('path helpers', () => {
  it('isUnder needs the slash — house is not over houseboat', () => {
    expect(isUnder('house', 'house')).toBe(true);
    expect(isUnder('house/garage', 'house')).toBe(true);
    expect(isUnder('houseboat', 'house')).toBe(false);
    expect(isUnder('home', 'house')).toBe(false);
    expect(isUnder('house', '')).toBe(false);
    expect(isUnder(null, 'house')).toBe(false);
  });
  it('isDescendant excludes the tag itself', () => {
    expect(isDescendant('house', 'house')).toBe(false);
    expect(isDescendant('house/garage', 'house')).toBe(true);
  });
  it('swapPrefix moves the subtree and leaves the rest', () => {
    expect(swapPrefix('house/garage/door', 'house', 'home')).toBe('home/garage/door');
    expect(swapPrefix('house', 'house', 'home')).toBe('home');
    expect(swapPrefix('houseboat', 'house', 'home')).toBe('houseboat');
    expect(swapPrefix('garage/door', 'garage', 'house/garage')).toBe('house/garage/door');
  });
  it('parentTag', () => {
    expect(parentTag('house/garage/door')).toBe('house/garage');
    expect(parentTag('house')).toBe('');
    expect(parentTag(null)).toBe('');
  });
  it('subtreeRegex matches the root and below, never a sibling prefix', () => {
    const re = subtreeRegex('house');
    expect(re.test('house')).toBe(true);
    expect(re.test('house/garage')).toBe(true);
    expect(re.test('houseboat')).toBe(false);
    expect(re.test('my/house')).toBe(false);
  });
  it('subtreeRegex is escaped', () => {
    const re = subtreeRegex('a.b');
    expect(re.test('a.b/c')).toBe(true);
    expect(re.test('axb')).toBe(false);
    expect(escapeRegex('a+b(c)')).toBe('a\\+b\\(c\\)');
  });
});
