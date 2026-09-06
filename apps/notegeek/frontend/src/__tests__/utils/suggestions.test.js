import { describe, it, expect, beforeEach } from 'vitest';
import { dismissKey, excerptFor, readDismissed, writeDismissed } from '../../utils/suggestions';

/**
 * What the gateway is told, and what the tab remembers.
 *
 * The excerpt rule is the one with teeth: a mind-map or handwritten body is a
 * serialized editor snapshot, and sending its "text" would put shape ids and
 * coordinates in front of a model for no benefit at all.
 */
describe('excerptFor', () => {
  it('strips markup from a readable body', () => {
    expect(excerptFor('<p>hello <b>there</b></p>', 'text')).toBe('hello there');
    expect(excerptFor('# Heading\n\nsome text', 'markdown')).toBe('Heading some text');
  });

  it('sends nothing at all for a snapshot body', () => {
    expect(excerptFor('{"shapes":[{"x":1}]}', 'handwritten')).toBe('');
    expect(excerptFor('{"nodes":[]}', 'mindmap')).toBe('');
  });

  it('is safe on an empty note', () => {
    expect(excerptFor('', 'text')).toBe('');
    expect(excerptFor(undefined, 'text')).toBe('');
  });

  it('caps the excerpt at 500 characters', () => {
    expect(excerptFor('word '.repeat(500), 'markdown')).toHaveLength(500);
  });
});

describe('dismissal', () => {
  beforeEach(() => sessionStorage.clear());

  it('is remembered per note, and an unsaved note shares one slot', () => {
    expect(readDismissed('n1')).toBe(false);
    writeDismissed('n1');
    expect(readDismissed('n1')).toBe(true);
    expect(readDismissed('n2')).toBe(false);
    expect(dismissKey(null)).toBe(dismissKey(undefined));
  });
});
