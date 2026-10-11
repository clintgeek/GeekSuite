import { buildReaderUrl, readerLinkErrors } from '../../utils/readerLinks';

describe('buildReaderUrl', () => {
  it('encodes each placeholder value on its own, never the finished URL', () => {
    expect(
      buildReaderUrl('https://example.com/read?u={url}&t={title}', { url: 'https://pub.example/a?b=1&c=2#x', title: 'Fire & ice: "50%"' })
    ).toBe('https://example.com/read?u=https%3A%2F%2Fpub.example%2Fa%3Fb%3D1%26c%3D2%23x&t=Fire%20%26%20ice%3A%20%2250%25%22');
  });
  it('a placeholder in the path gets the same per-value encoding', () => {
    expect(buildReaderUrl('https://example.com/{url}', { url: 'https://pub.example/a?b=1&c=2#x' })).toBe(
      'https://example.com/https%3A%2F%2Fpub.example%2Fa%3Fb%3D1%26c%3D2%23x'
    );
  });
  it('refuses anything that is not http(s) after substitution', () => {
    expect(buildReaderUrl('javascript:alert({url})', { url: 'https://pub.example/' })).toBeNull();
    expect(buildReaderUrl('{url}', { url: 'https://pub.example/' })).toBeNull();
    expect(buildReaderUrl('data:text/html,{url}', { url: 'x' })).toBeNull();
    expect(buildReaderUrl('', { url: 'x' })).toBeNull();
    expect(buildReaderUrl('http://example.com/?u={url}', { url: 'x' })).toBe('http://example.com/?u=x');
  });
});

describe('readerLinkErrors (mirrors the gateway)', () => {
  const ok = { label: 'Reader', template: 'https://example.com/read?u={url}&t={title}' };
  it('accepts a good link', () => expect(readerLinkErrors(ok)).toEqual({}));
  it('needs a label of 1–40 characters', () => {
    expect(readerLinkErrors({ ...ok, label: '  ' }).label).toBeTruthy();
    expect(readerLinkErrors({ ...ok, label: 'x'.repeat(41) }).label).toBeTruthy();
    expect(readerLinkErrors({ ...ok, label: 'x'.repeat(40) }).label).toBeUndefined();
  });
  it('must be http(s), must contain {url}, and only {url}/{title}', () => {
    expect(readerLinkErrors({ ...ok, template: 'ftp://example.com/{url}' }).template).toMatch(/http/);
    expect(readerLinkErrors({ ...ok, template: 'https://example.com/?t={title}' }).template).toMatch(/\{url\}/);
    expect(readerLinkErrors({ ...ok, template: 'https://example.com/?u={url}&x={source}' }).template).toMatch(/\{source\}/);
  });
});
