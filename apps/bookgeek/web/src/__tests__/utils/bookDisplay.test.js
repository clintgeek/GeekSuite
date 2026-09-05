import { describe, it, expect } from 'vitest';
import {
  API_BASE,
  decodeBasicHtmlEntities,
  formatDescriptionForDisplay,
  getCoverUrl,
} from '../../utils/bookDisplay';
import { BOOKS } from '../fixtures';

describe('API_BASE', () => {
  it('stays the localhost dev default under jsdom (hostname is "localhost")', () => {
    expect(API_BASE).toBe('http://localhost:1800/api');
  });
});

describe('getCoverUrl', () => {
  it('returns null for a falsy book', () => {
    expect(getCoverUrl(null)).toBeNull();
    expect(getCoverUrl(undefined)).toBeNull();
  });

  it('returns null when the book has neither id nor _id', () => {
    expect(getCoverUrl({ title: 'No id' })).toBeNull();
  });

  it('builds the cover URL from id and a cache-busting updatedAt', () => {
    const book = BOOKS[0]; // id "b1", updatedAt "2026-09-01"
    const url = getCoverUrl(book);
    expect(url).toBe(`${API_BASE}/books/b1/cover?v=${encodeURIComponent('2026-09-01')}`);
  });

  it('prefers updatedAt over createdAt', () => {
    const book = { id: 'x', updatedAt: '2026-02-01', createdAt: '2026-01-01' };
    expect(getCoverUrl(book)).toContain(encodeURIComponent('2026-02-01'));
  });

  it('falls back to createdAt when updatedAt is missing', () => {
    const book = { id: 'x', createdAt: '2026-01-01' };
    expect(getCoverUrl(book)).toContain(encodeURIComponent('2026-01-01'));
  });

  it('falls back to _id when id is absent', () => {
    const book = { _id: 'rest-id', createdAt: '2026-01-01' };
    expect(getCoverUrl(book)).toContain('/books/rest-id/cover');
  });
});

describe('decodeBasicHtmlEntities', () => {
  it('returns an empty string for non-string input', () => {
    expect(decodeBasicHtmlEntities(null)).toBe('');
    expect(decodeBasicHtmlEntities(undefined)).toBe('');
    expect(decodeBasicHtmlEntities(42)).toBe('');
  });

  it('decodes the entities the description formatter can produce', () => {
    expect(decodeBasicHtmlEntities('Jones &amp; Sons')).toBe('Jones & Sons');
    expect(decodeBasicHtmlEntities('&quot;locked in&quot;')).toBe('"locked in"');
    expect(decodeBasicHtmlEntities('it&#39;s')).toBe("it's");
    expect(decodeBasicHtmlEntities('a&nbsp;b')).toBe('a b');
    expect(decodeBasicHtmlEntities('1 &lt; 2 &gt; 0')).toBe('1 < 2 > 0');
  });
});

describe('formatDescriptionForDisplay', () => {
  it('returns an empty string for non-string input', () => {
    expect(formatDescriptionForDisplay(null)).toBe('');
    expect(formatDescriptionForDisplay(undefined)).toBe('');
  });

  it('leaves plain text alone (only entities decode)', () => {
    expect(formatDescriptionForDisplay("A gripping thriller.")).toBe('A gripping thriller.');
  });

  it('turns <br> into a newline and <p> boundaries into a blank line', () => {
    const raw = '<p>First paragraph.</p><p>Second paragraph.<br/>Same para, new line.</p>';
    expect(formatDescriptionForDisplay(raw)).toBe(
      'First paragraph.\n\nSecond paragraph.\nSame para, new line.'
    );
  });

  it('turns <li> items into "- " bullets, one per line', () => {
    const raw = '<ul><li>First</li><li>Second</li></ul>';
    expect(formatDescriptionForDisplay(raw)).toBe('- First\n- Second');
  });

  it('strips remaining tags and decodes entities in the same pass', () => {
    const raw = BOOKS[0].description; // real fixture: &quot;/&mdash;-ish entities + <br/>
    const out = formatDescriptionForDisplay(raw);
    expect(out).not.toContain('<');
    expect(out).toContain('"locked in"');
    expect(out).toContain('A gripping near-future thriller.');
  });

  it('collapses runs of internal whitespace per line and trims edges', () => {
    const raw = '  Lots   of    space   here  ';
    expect(formatDescriptionForDisplay(raw)).toBe('Lots of space here');
  });

  it('collapses three or more blank lines down to one blank line', () => {
    const raw = 'One\n\n\n\nTwo';
    expect(formatDescriptionForDisplay(raw)).toBe('One\n\nTwo');
  });
});
