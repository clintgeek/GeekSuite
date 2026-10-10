import { formErrors, formFromSource, inputFromForm } from '../../utils/sources';
import { relativeTime } from '../../utils/dates';
import { source } from '../fixtures';

describe('source form', () => {
  it('round-trips a source into a NewsSourceInput with contract field names', () => {
    const form = formFromSource(source('s1', { blockedDomains: ['legacy.com'] }));
    form.blockedDomains += '\nObits.Example.com, ';
    const input = inputFromForm(form);
    expect(input).toEqual({
      name: 'Source s1',
      homepage: 'https://example.com/',
      kind: 'journalism',
      sections: ['local'],
      placeIds: ['clark'],
      feeds: [{ url: 'https://example.com/s1-f1/feed/', format: 'rss', pollEveryMin: 30 }],
      paywall: 'none',
      content: 'excerpt',
      blockedDomains: ['legacy.com', 'obits.example.com'],
      notes: '',
    });
  });

  it('requires a name and an http(s) feed URL', () => {
    const blank = formFromSource(null);
    expect(formErrors(blank)).toMatchObject({ name: expect.any(String), feeds: expect.any(String) });
    expect(formErrors({ ...blank, name: 'x', feeds: [{ url: 'ftp://x', format: 'rss', pollEveryMin: 30 }] }).feeds).toMatch(/http/);
    expect(formErrors({ ...blank, name: 'x', feeds: [{ url: 'https://x/feed', format: 'rss', pollEveryMin: 30 }] })).toEqual({});
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-10-10T15:00:00Z');
  it.each([
    ['2026-10-10T14:59:30Z', 'just now'],
    ['2026-10-10T14:48:00Z', '12m ago'],
    ['2026-10-10T13:00:00Z', '2h ago'],
    ['2026-10-07T15:00:00Z', '3d ago'],
    ['2026-09-02T15:00:00Z', 'Sep 2'],
  ])('%s → %s', (at, want) => expect(relativeTime(at, now)).toBe(want));
});
