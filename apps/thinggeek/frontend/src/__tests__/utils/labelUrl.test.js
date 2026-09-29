import { describe, expect, it } from 'vitest';
import { labelsPath, parseLabelIds, thingLabelUrl } from '../../utils/labelUrl';

describe('thingLabelUrl', () => {
  it('is the origin plus the thing path — nothing else', () => {
    expect(thingLabelUrl('t-wendy', 'https://thinggeek.clintgeek.com')).toBe('https://thinggeek.clintgeek.com/thing/t-wendy');
  });

  it('works from any origin — never a hardcoded domain', () => {
    expect(thingLabelUrl('t-wendy', 'http://localhost:1821')).toBe('http://localhost:1821/thing/t-wendy');
  });

  it('strips a trailing slash on the origin so the path never doubles up', () => {
    expect(thingLabelUrl('t-wendy', 'https://thinggeek.clintgeek.com/')).toBe('https://thinggeek.clintgeek.com/thing/t-wendy');
  });

  it('encodes an id that needs it', () => {
    expect(thingLabelUrl('t 1/2', 'https://thinggeek.clintgeek.com')).toBe('https://thinggeek.clintgeek.com/thing/t%201%2F2');
  });

  it('carries no query string or fragment — the QR payload is the URL and nothing else', () => {
    const url = thingLabelUrl('t-wendy', 'https://thinggeek.clintgeek.com');
    expect(url).not.toContain('?');
    expect(url).not.toContain('#');
  });
});

describe('parseLabelIds', () => {
  it('reads a comma-separated ids param', () => {
    expect(parseLabelIds('?ids=a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('dedupes, keeping first-seen order', () => {
    expect(parseLabelIds('?ids=a,b,a,c,b')).toEqual(['a', 'b', 'c']);
  });

  it('ignores blank and whitespace-only entries', () => {
    expect(parseLabelIds('?ids=a,,  ,b,')).toEqual(['a', 'b']);
  });

  it('trims stray whitespace around an id', () => {
    expect(parseLabelIds('?ids= a , b ')).toEqual(['a', 'b']);
  });

  it('is empty with no ids param', () => {
    expect(parseLabelIds('?other=1')).toEqual([]);
    expect(parseLabelIds('')).toEqual([]);
  });

  it('accepts a URLSearchParams directly', () => {
    expect(parseLabelIds(new URLSearchParams('ids=a,b'))).toEqual(['a', 'b']);
  });
});

describe('labelsPath', () => {
  it('builds /labels?ids=... from a list of ids', () => {
    expect(labelsPath(['a', 'b'])).toBe('/labels?ids=a,b');
  });

  it('accepts a single bare id', () => {
    expect(labelsPath('a')).toBe('/labels?ids=a');
  });

  it('drops blanks and encodes each id', () => {
    expect(labelsPath(['a', '', 'b/c'])).toBe('/labels?ids=a,b%2Fc');
  });
});
