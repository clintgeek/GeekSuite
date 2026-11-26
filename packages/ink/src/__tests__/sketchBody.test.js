import { describe, it, expect } from 'vitest';
import { isEmptySketchBody, isReadableSketchBody, parseSketchBody } from '../sketchBody.js';

const SNAP = JSON.stringify({ store: { 'page:page': { id: 'page:page', typeName: 'page' } }, schema: {} });

describe('sketchBody', () => {
  it('an empty or missing body is empty, and readable (a new note is not a failure)', () => {
    for (const body of ['', '  \n', null, undefined]) {
      expect(isEmptySketchBody(body)).toBe(true);
      expect(isReadableSketchBody(body)).toBe(true);
    }
  });

  it('a store snapshot and an editor snapshot are readable', () => {
    expect(isReadableSketchBody(SNAP)).toBe(true);
    expect(isReadableSketchBody(JSON.stringify({ document: { store: {} }, session: {} }))).toBe(true);
  });

  it.each([
    ['invalid JSON', 'not json'],
    ['a truncated body', SNAP.slice(0, SNAP.length - 9)],
    ['{} (tldraw would load nothing and call it blank)', '{}'],
    ['an array', '[]'],
    ['null', 'null'],
    ['a string', '"hello"'],
    ['a store that is not an object', '{"store":[]}'],
    ['not text', 42],
  ])('%s is not readable', (_, body) => {
    expect(isReadableSketchBody(body)).toBe(false);
    expect(() => parseSketchBody(body)).toThrow();
  });
});
