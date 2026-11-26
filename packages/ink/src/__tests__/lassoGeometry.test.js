import { describe, it, expect } from 'vitest';
import {
  pointInPolygon, boundsOfPoints, shapePagePoints, shapeSample, isCircled, selectByLasso,
  distanceToStroke, strokeAtPoint, isTap, lassoSelection,
} from '../lassoGeometry.js';

const square = (x, y, s) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];
const draw = (id, x, y, points, extra = {}) => ({
  id, type: 'draw', x, y, rotation: 0,
  props: { segments: [{ type: 'free', points: points.map(([px, py]) => ({ x: px, y: py, z: 0.5 })) }], scale: 0.5 },
  ...extra,
});

describe('pointInPolygon', () => {
  it('inside and outside a square', () => {
    const poly = square(0, 0, 100);
    expect(pointInPolygon({ x: 50, y: 50 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 50 }, poly)).toBe(false);
    expect(pointInPolygon({ x: 50, y: -1 }, poly)).toBe(false);
  });
  it('a concave loop: the notch is outside', () => {
    // A "C" shape: the mouth of the C is not inside.
    const c = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 30 }, { x: 30, y: 30 }, { x: 30, y: 70 }, { x: 100, y: 70 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    expect(pointInPolygon({ x: 10, y: 50 }, c)).toBe(true);
    expect(pointInPolygon({ x: 70, y: 50 }, c)).toBe(false);
    expect(pointInPolygon({ x: 70, y: 10 }, c)).toBe(true);
  });
  it('fewer than three points encloses nothing', () => {
    expect(pointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
    expect(pointInPolygon({ x: 0, y: 0 }, null)).toBe(false);
  });
});

describe('shapePagePoints', () => {
  it('adds the shape origin to every segment point, across segments', () => {
    const shape = {
      id: 'shape:a', type: 'draw', x: 200, y: 300, rotation: 0,
      props: { segments: [{ type: 'free', points: [{ x: 0, y: 0, z: 0.5 }, { x: 10, y: 5, z: 0.5 }] }, { type: 'straight', points: [{ x: 20, y: -4 }] }] },
    };
    expect(shapePagePoints(shape)).toEqual([{ x: 200, y: 300 }, { x: 210, y: 305 }, { x: 220, y: 296 }]);
  });
  it('the Fine pen scale does not move the points', () => {
    expect(shapePagePoints(draw('shape:a', 10, 10, [[4, 4]]))).toEqual([{ x: 14, y: 14 }]);
  });
  it('turns the points by the shape rotation about its origin', () => {
    const [p] = shapePagePoints({ ...draw('shape:a', 100, 100, [[10, 0]]), rotation: Math.PI / 2 });
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(110);
  });
  it('other shape types have no points; a sample falls back to the bounds centre', () => {
    const geo = { id: 'shape:g', type: 'geo', x: 0, y: 0, props: {} };
    expect(shapePagePoints(geo)).toEqual([]);
    expect(shapeSample(geo, { x: 10, y: 20, w: 100, h: 40 })).toEqual({ id: 'shape:g', points: [{ x: 60, y: 40 }] });
    expect(shapeSample(geo)).toEqual({ id: 'shape:g', points: [] });
    expect(shapePagePoints(null)).toEqual([]);
  });
});

describe('the selection rule', () => {
  const loop = square(0, 0, 100);
  it('a stroke counts when at least half of its points are inside', () => {
    const half = [{ x: 10, y: 10 }, { x: 90, y: 90 }, { x: 150, y: 10 }, { x: 200, y: 10 }];
    const less = [{ x: 10, y: 10 }, { x: 150, y: 90 }, { x: 150, y: 10 }, { x: 200, y: 10 }];
    expect(isCircled(half, loop)).toBe(true);
    expect(isCircled(less, loop)).toBe(false);
    expect(isCircled([], loop)).toBe(false);
  });
  it('selects whole strokes inside, skips those outside or mostly outside', () => {
    const samples = [
      shapeSample(draw('shape:in', 20, 20, [[0, 0], [10, 10], [20, 0]])),
      shapeSample(draw('shape:out', 300, 20, [[0, 0], [10, 10]])),
      shapeSample(draw('shape:edge', 90, 50, [[0, 0], [20, 0], [40, 0], [60, 0]])),
      shapeSample({ id: 'shape:geo', type: 'geo' }, { x: 40, y: 40, w: 20, h: 20 }),
      shapeSample({ id: 'shape:nothing', type: 'geo' }),
    ];
    expect(selectByLasso(samples, loop)).toEqual(['shape:in', 'shape:geo']);
    expect(selectByLasso(samples, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual([]);
  });
});

describe('a tap', () => {
  it('distance to a stroke is to its line, not only its points', () => {
    const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(distanceToStroke({ x: 50, y: 7 }, line)).toBeCloseTo(7);
    expect(distanceToStroke({ x: 110, y: 0 }, line)).toBeCloseTo(10);
    expect(distanceToStroke({ x: 3, y: 4 }, [{ x: 0, y: 0 }])).toBeCloseTo(5);
    expect(distanceToStroke({ x: 0, y: 0 }, [])).toBe(Infinity);
  });
  it('picks the nearest stroke within the tolerance, or none', () => {
    const samples = [
      { id: 'shape:a', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      { id: 'shape:b', points: [{ x: 0, y: 20 }, { x: 100, y: 20 }] },
    ];
    expect(strokeAtPoint(samples, { x: 50, y: 4 }, 14)).toBe('shape:a');
    expect(strokeAtPoint(samples, { x: 50, y: 17 }, 14)).toBe('shape:b');
    expect(strokeAtPoint(samples, { x: 50, y: 80 }, 14)).toBe(null);
  });
  it('isTap: a drag that never left the slop box', () => {
    expect(isTap([{ x: 5, y: 5 }], 10)).toBe(true);
    expect(isTap([{ x: 5, y: 5 }, { x: 8, y: 6 }, { x: 6, y: 9 }], 10)).toBe(true);
    expect(isTap([{ x: 5, y: 5 }, { x: 40, y: 6 }, { x: 6, y: 40 }], 10)).toBe(false);
  });
});

describe('lassoSelection', () => {
  const samples = [
    shapeSample(draw('shape:word', 100, 100, [[0, 0], [30, 10], [60, 0]])),
    shapeSample(draw('shape:far', 600, 600, [[0, 0], [30, 10]])),
  ];
  it('a loop selects what it encloses', () => {
    expect(lassoSelection(samples, square(80, 80, 120))).toEqual(['shape:word']);
  });
  it('a tap selects the single stroke under it, or nothing', () => {
    expect(lassoSelection(samples, [{ x: 130, y: 112 }])).toEqual(['shape:word']);
    expect(lassoSelection(samples, [{ x: 400, y: 400 }, { x: 401, y: 400 }, { x: 401, y: 401 }])).toEqual([]);
  });
  it('an empty path or an empty page selects nothing', () => {
    expect(lassoSelection(samples, [])).toEqual([]);
    expect(lassoSelection([], square(0, 0, 1000))).toEqual([]);
  });
});

describe('boundsOfPoints', () => {
  it('the box around points', () => {
    expect(boundsOfPoints([{ x: 5, y: 9 }, { x: -1, y: 20 }])).toEqual({ x: -1, y: 9, w: 6, h: 11 });
    expect(boundsOfPoints([])).toBe(null);
  });
});
