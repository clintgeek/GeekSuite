import { describe, it, expect } from 'vitest';
import { noteHref, noteLinkMarkup } from '../../utils/noteLinks';

describe('noteLinkMarkup', () => {
  it('writes a markdown link to the note\'s route', () => {
    expect(noteLinkMarkup({ id: 'abc', title: 'nginx layout' })).toBe('[nginx layout](/notes/abc)');
  });

  it('escapes brackets in a title so the markdown link does not break', () => {
    expect(noteLinkMarkup({ id: '1', title: 'Re: [draft] plans' })).toBe(
      '[Re: \\[draft\\] plans](/notes/1)'
    );
  });

  it('never produces an empty label', () => {
    expect(noteLinkMarkup({ id: '1', title: '   ' })).toBe('[Untitled note](/notes/1)');
  });

  it('routes to the same path the rest of the app links to', () => {
    expect(noteHref('abc')).toBe('/notes/abc');
  });
});
