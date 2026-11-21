import { describe, expect, it } from 'vitest';
import { inkThumbFor, parseInkThumb } from '../../components/week/inkThumb.js';

const draw = (id, x, y, points, extra = {}) => ({
  id: `shape:${id}`,
  typeName: 'shape',
  type: 'draw',
  x,
  y,
  rotation: 0,
  props: { segments: [{ type: 'free', points }] },
  ...extra,
});

const snapshot = (shapes, wrap = (store) => ({ document: { store, schema: {} }, session: {} })) => {
  const store = { 'page:page': { id: 'page:page', typeName: 'page' } };
  for (const shape of shapes) store[shape.id] = shape;
  return JSON.stringify(wrap(store));
};

describe('parseInkThumb: a day’s ink as polylines, without tldraw', () => {
  it('turns each stroke into path data in page units (the shape’s origin added to its points)', () => {
    const thumb = parseInkThumb(snapshot([draw('a', 100, 50, [{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }])]));
    expect(thumb).toEqual({ paths: ['M100 50L110 55L120 50'], top: 0 });
  });

  it('reads both of tldraw’s wrappings of the store', () => {
    const shapes = [draw('a', 0, 0, [{ x: 1, y: 1 }, { x: 2, y: 2 }])];
    expect(parseInkThumb(snapshot(shapes, (store) => ({ store, schema: {} })))?.paths).toEqual(['M1 1L2 2']);
  });

  it('draws a dot, and skips what is not a stroke', () => {
    const thumb = parseInkThumb(
      snapshot([draw('dot', 5, 5, [{ x: 0, y: 0 }]), { id: 'shape:geo', typeName: 'shape', type: 'geo', x: 0, y: 0, props: {} }])
    );
    expect(thumb.paths).toEqual(['M5 5l0.01 0']);
  });

  it('thins a long stroke: a thumbnail does not need every point', () => {
    const points = Array.from({ length: 2000 }, (_, i) => ({ x: i, y: 0 }));
    const [d] = parseInkThumb(snapshot([draw('long', 0, 0, points)])).paths;
    expect(d.split('L').length).toBeLessThanOrEqual(48);
    expect(d.startsWith('M0 0')).toBe(true);
    expect(d.endsWith('L1999 0')).toBe(true);
  });

  it('starts the picture at the ink when the top of the page is blank', () => {
    expect(parseInkThumb(snapshot([draw('low', 0, 1500, [{ x: 0, y: 0 }, { x: 9, y: 9 }])])).top).toBe(1460);
  });

  it('no picture for bad JSON, an empty page, no content, or another format', () => {
    expect(parseInkThumb('{not json')).toBeNull();
    expect(parseInkThumb(snapshot([]))).toBeNull();
    expect(parseInkThumb('')).toBeNull();
    expect(parseInkThumb(null)).toBeNull();
    expect(parseInkThumb('"just a string"')).toBeNull();
    expect(parseInkThumb('[1,2,3]')).toBeNull();
    expect(parseInkThumb(snapshot([draw('broken', 0, 0, null, { props: { segments: 'nope' } })]))).toBeNull();
  });

  it('parses a content string once', () => {
    const content = snapshot([draw('a', 0, 0, [{ x: 1, y: 1 }, { x: 2, y: 2 }])]);
    expect(inkThumbFor(content)).toBe(inkThumbFor(content));
    expect(inkThumbFor(content)).toEqual(parseInkThumb(content));
  });
});
