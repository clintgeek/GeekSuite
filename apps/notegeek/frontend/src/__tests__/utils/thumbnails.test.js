import { describe, it, expect, beforeEach } from 'vitest';
import {
  sketchGeometry,
  mindMapGeometry,
  tintCodeLine,
  thumbnailKey,
  _clearThumbnailCache,
} from '../../utils/thumbnails';

const drawShape = (id, x, y, points) => ({
  id, typeName: 'shape', type: 'draw', x, y,
  props: { segments: [{ type: 'free', points: points.map(([px, py]) => ({ x: px, y: py, z: 0.5 })) }] },
});

beforeEach(() => _clearThumbnailCache());

describe('sketchGeometry', () => {
  it('turns tldraw draw shapes into absolute polylines, and geo shapes into boxes', () => {
    const content = JSON.stringify({
      store: {
        'shape:a': drawShape('shape:a', 100, 50, [[0, 0], [10, 5]]),
        'shape:b': { id: 'shape:b', typeName: 'shape', type: 'geo', x: 0, y: 0, props: { w: 40, h: 20 } },
        'page:p': { id: 'page:p', typeName: 'page' },
      },
    });
    const g = sketchGeometry(content, 'k1');
    expect(g.paths).toEqual(['M100 50L110 55']);
    expect(g.boxes).toEqual([{ x: 0, y: 0, w: 40, h: 20 }]);
    expect(g.viewBox.split(' ')).toHaveLength(4);
  });

  it('draws a photo sketch note\'s pages (image shapes) as their outlines', () => {
    const content = JSON.stringify({ store: {
      'shape:p1': { typeName: 'shape', type: 'image', x: 0, y: 0, props: { w: 1000, h: 1333 } },
      'shape:p2': { typeName: 'shape', type: 'image', x: 0, y: 1381, props: { w: 1000, h: 1333 } },
    } });
    const g = sketchGeometry(content, 'photos');
    expect(g.boxes).toEqual([{ x: 0, y: 0, w: 1000, h: 1333 }, { x: 0, y: 1381, w: 1000, h: 1333 }]);
  });

  it('thins a dense stroke to a fixed budget', () => {
    const pts = Array.from({ length: 5000 }, (_, i) => [i, Math.sin(i)]);
    const content = JSON.stringify({ store: { 'shape:a': drawShape('shape:a', 0, 0, pts) } });
    const g = sketchGeometry(content, 'dense');
    expect(g.paths[0].split('L').length).toBeLessThanOrEqual(48);
  });

  it('returns null for an empty or unreadable sketch (the row shows a glyph)', () => {
    expect(sketchGeometry('', 'e1')).toBeNull();
    expect(sketchGeometry('{not json', 'e2')).toBeNull();
    expect(sketchGeometry(JSON.stringify({ store: {} }), 'e3')).toBeNull();
  });

  it('parses a given note version once', () => {
    const content = JSON.stringify({ store: { 'shape:a': drawShape('shape:a', 0, 0, [[0, 0], [1, 1]]) } });
    expect(sketchGeometry(content, 'same')).toBe(sketchGeometry(content, 'same'));
  });
});

describe('mindMapGeometry', () => {
  it('takes the root and its first children, top to bottom', () => {
    const content = JSON.stringify({
      nodes: [
        { id: '0', position: { x: 0, y: 0 }, data: { label: 'Root', isRoot: true } },
        { id: '1', position: { x: 0, y: 200 }, data: { label: 'Second' } },
        { id: '2', position: { x: 0, y: 100 }, data: { label: 'First' } },
        { id: '3', position: { x: 0, y: 300 }, data: { label: 'Grandchild' } },
      ],
      edges: [
        { source: '0', target: '1' }, { source: '0', target: '2' }, { source: '1', target: '3' },
      ],
    });
    expect(mindMapGeometry(content, 'm1')).toEqual({ root: 'Root', children: ['First', 'Second'], more: 0 });
  });

  it('is null for an empty map', () => {
    expect(mindMapGeometry('{}', 'm2')).toBeNull();
  });
});

describe('tintCodeLine', () => {
  const kinds = (line) => tintCodeLine(line).filter((t) => t.kind !== 'plain').map((t) => [t.kind, t.text]);

  it('tints keywords, strings, numbers and comments', () => {
    expect(kinds('const x = "hi" + 42; // note')).toEqual([
      ['keyword', 'const'], ['string', '"hi"'], ['number', '42'], ['comment', '// note'],
    ]);
  });

  it('does not treat a URL inside a string as a comment', () => {
    expect(kinds("fetch('https://x.dev')")).toEqual([['string', "'https://x.dev'"]]);
  });

  it('treats # as a comment only at the start of a line', () => {
    expect(kinds('# heading')).toEqual([['comment', '# heading']]);
    expect(kinds('echo a # b').map(([k]) => k)).not.toContain('comment');
  });

  it('reassembles to the original line', () => {
    const line = 'export function debounce(fn, wait = 200) {';
    expect(tintCodeLine(line).map((t) => t.text).join('')).toBe(line);
  });
});

describe('thumbnailKey', () => {
  it('changes when the note does', () => {
    const a = thumbnailKey({ id: '1', updatedAt: 't1', content: 'abc' });
    expect(thumbnailKey({ id: '1', updatedAt: 't2', content: 'abc' })).not.toBe(a);
    expect(thumbnailKey({ id: '1', updatedAt: 't1', content: 'abcd' })).not.toBe(a);
  });
});
