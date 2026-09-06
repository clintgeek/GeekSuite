import { describe, it, expect } from 'vitest';
import { safeRedirect } from '../../utils/safeRedirect';

describe('safeRedirect', () => {
  it('falls back to "/" for a falsy input', () => {
    expect(safeRedirect(undefined)).toBe('/');
    expect(safeRedirect(null)).toBe('/');
    expect(safeRedirect('')).toBe('/');
  });

  it('allows a same-origin relative path as-is', () => {
    expect(safeRedirect('/dashboard')).toBe('/dashboard');
    expect(safeRedirect('/ai?tab=keys')).toBe('/ai?tab=keys');
  });

  it('rejects a protocol-relative path (a disguised cross-origin redirect)', () => {
    expect(safeRedirect('//evil.example.com/phish')).toBe('/');
  });

  // Going-over 2026-09-05 — the relative-path branch was a literal
  // `startsWith('/') && !startsWith('//')`, and a browser does not read a URL
  // that literally. Both of these passed it and both leave the origin.
  it('rejects a backslash-disguised protocol-relative path', () => {
    // The WHATWG URL parser treats `\` as `/` in a special scheme, so
    // `location.href = '/\\evil.example.com'` navigates to
    // https://evil.example.com — not to a path on this host.
    expect(safeRedirect('/\\evil.example.com/phish')).toBe('/');
    expect(safeRedirect('\\\\evil.example.com/phish')).toBe('/');
    expect(safeRedirect('/\\/evil.example.com/phish')).toBe('/');
  });

  it('rejects a path that only looks relative until the URL parser strips a tab', () => {
    // ASCII tab / LF / CR are deleted from a URL wherever they appear, so
    // `/<TAB>/evil.example.com` collapses to `//evil.example.com`.
    expect(safeRedirect('/\t/evil.example.com/phish')).toBe('/');
    expect(safeRedirect('/%09/evil.example.com/phish')).toBe('/');
    expect(safeRedirect('/\n/evil.example.com')).toBe('/');
    expect(safeRedirect('/\r/evil.example.com')).toBe('/');
    expect(safeRedirect('/%0A/evil.example.com')).toBe('/');
  });

  it('still allows an ordinary relative path with no such trickery', () => {
    expect(safeRedirect('/aigeek?tab=keys&q=a%20b')).toBe('/aigeek?tab=keys&q=a b');
    expect(safeRedirect('/usergeek')).toBe('/usergeek');
  });

  it('rejects a cross-origin absolute URL disguised with a backslash', () => {
    expect(safeRedirect('https:/\\evil.example.com/')).toBe('/');
  });

  it('rejects a userinfo trick that only resolves after tab-stripping', () => {
    // Reads as clintgeek.com until the tab goes, at which point the real host
    // is evil.example.com and everything before the `@` is userinfo.
    expect(safeRedirect('https://clintgeek.com\t@evil.example.com/')).toBe('/');
  });

  it('allows an absolute https URL on clintgeek.com', () => {
    expect(safeRedirect('https://clintgeek.com/')).toBe('https://clintgeek.com/');
  });

  it('allows an absolute https URL on a *.clintgeek.com subdomain', () => {
    expect(safeRedirect('https://fitnessgeek.clintgeek.com/dashboard')).toBe(
      'https://fitnessgeek.clintgeek.com/dashboard'
    );
  });

  it('rejects an http (non-https) clintgeek.com URL', () => {
    expect(safeRedirect('http://clintgeek.com/')).toBe('/');
  });

  it('rejects a look-alike host that merely ends with the domain string', () => {
    expect(safeRedirect('https://notclintgeek.com/')).toBe('/');
    expect(safeRedirect('https://clintgeek.com.evil.com/')).toBe('/');
  });

  it('rejects an unrelated absolute host', () => {
    expect(safeRedirect('https://evil.example.com/')).toBe('/');
  });

  it('rejects a javascript: URL', () => {
    expect(safeRedirect('javascript:alert(1)')).toBe('/');
  });

  it('rejects a data: URL', () => {
    expect(safeRedirect('data:text/html,<script>alert(1)</script>')).toBe('/');
  });

  it('falls back to "/" for an unparseable/garbage value', () => {
    expect(safeRedirect('not a url at all')).toBe('/');
  });

  it('decodes a URI-encoded relative path before checking it', () => {
    expect(safeRedirect('%2Fdashboard')).toBe('/dashboard');
  });

  it('falls back to "/" when decodeURIComponent throws on malformed encoding', () => {
    expect(safeRedirect('%E0%A4%A')).toBe('/');
  });

  it('decodes a URI-encoded cross-suite URL and allows it', () => {
    expect(safeRedirect(encodeURIComponent('https://startgeek.clintgeek.com/'))).toBe(
      'https://startgeek.clintgeek.com/'
    );
  });
});
