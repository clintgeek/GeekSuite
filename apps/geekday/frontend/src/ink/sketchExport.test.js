import { describe, it, expect, vi } from 'vitest';
import {
  EXPORT_MAX_EDGE, EXPORT_PADDING, TLDRAW_PIXEL_RATIO, LASSO_MIN_SHORT_EDGE, MIN_READABLE_SCALE,
  SketchExportError, exportSketchPng, fitWithin, flattenOnWhite, readableScale,
  sketchExportOptions, sketchHasShapes, tooLongToRead, unionBounds,
} from './sketchExport';

const fakeCanvas = () => {
  const calls = [];
  const ctx = {
    set fillStyle(v) { calls.push(['fillStyle', v]); },
    fillRect: (...a) => calls.push(['fillRect', ...a]),
    drawImage: (...a) => calls.push(['drawImage', ...a.slice(1)]),
  };
  const canvas = { getContext: () => ctx, toBlob: (cb) => cb(new Blob(['png'], { type: 'image/png' })), calls };
  return canvas;
};

/** The pixel size of tldraw's own export for these options. */
const rendered = (bounds, opts) => ({
  w: (bounds.w + opts.padding * 2) * opts.scale * TLDRAW_PIXEL_RATIO,
  h: (bounds.h + opts.padding * 2) * opts.scale * TLDRAW_PIXEL_RATIO,
});

describe('sketchHasShapes', () => {
  it('knows a blank page from one with ink', () => {
    expect(sketchHasShapes(null)).toBe(false);
    expect(sketchHasShapes('')).toBe(false);
    expect(sketchHasShapes(JSON.stringify({ store: { 'page:page': { typeName: 'page' } }, schema: {} }))).toBe(false);
    expect(sketchHasShapes(JSON.stringify({ store: { 'shape:a': { typeName: 'shape', type: 'draw' } } }))).toBe(true);
    expect(sketchHasShapes('{ "typeName" : "shape" }')).toBe(true);
    expect(sketchHasShapes({ typeName: 'shape' })).toBe(false);
  });
});

describe('the export scale rule', () => {
  it('a whole page: light ink, no tldraw background, never above 1, fits 2000px at 2x', () => {
    const opts = sketchExportOptions({ w: 3000, h: 1200 });
    expect(opts).toMatchObject({ background: false, darkMode: false, padding: EXPORT_PADDING });
    expect(rendered({ w: 3000, h: 1200 }, opts).w).toBeCloseTo(EXPORT_MAX_EDGE);
    expect(sketchExportOptions({ w: 200, h: 100 }).scale).toBe(1);
  });

  it('a small lasso is rendered larger, so its short side reaches 300px', () => {
    const bounds = { w: 220, h: 36 }; // three circled words
    const plain = rendered(bounds, sketchExportOptions(bounds));
    expect(plain.h).toBe(200); // what NoteGeek's rule would give: too small
    const opts = sketchExportOptions(bounds, EXPORT_MAX_EDGE, { minShortEdge: LASSO_MIN_SHORT_EDGE });
    expect(opts.scale).toBeGreaterThan(1);
    expect(rendered(bounds, opts).h).toBeCloseTo(LASSO_MIN_SHORT_EDGE);
    expect(rendered(bounds, opts).w).toBeLessThanOrEqual(EXPORT_MAX_EDGE);
  });

  it('a selection that is already big enough is left at 1', () => {
    const bounds = { w: 600, h: 300 };
    expect(sketchExportOptions(bounds, EXPORT_MAX_EDGE, { minShortEdge: LASSO_MIN_SHORT_EDGE }).scale).toBe(1);
  });

  it('the longest-edge cap wins over the short-side wish: a long thin line stays in bounds', () => {
    const bounds = { w: 950, h: 20 };
    const opts = sketchExportOptions(bounds, EXPORT_MAX_EDGE, { minShortEdge: LASSO_MIN_SHORT_EDGE });
    const out = rendered(bounds, opts);
    expect(out.w).toBeLessThanOrEqual(EXPORT_MAX_EDGE + 0.001);
    expect(out.h).toBeLessThan(LASSO_MIN_SHORT_EDGE);
    expect(opts.scale).toBeLessThan(1);
  });

  it('a single dot never divides by zero', () => {
    const opts = sketchExportOptions({ w: 0, h: 0 }, EXPORT_MAX_EDGE, { minShortEdge: LASSO_MIN_SHORT_EDGE });
    expect(Number.isFinite(opts.scale)).toBe(true);
    expect(opts.scale).toBeGreaterThan(1);
  });

  it('flags ink too long for one legible image', () => {
    expect(tooLongToRead({ w: 900, h: 400 })).toBe(false);
    expect(tooLongToRead({ w: 900, h: 5000 })).toBe(true);
    expect(readableScale({ w: 900, h: 5000 })).toBeLessThan(MIN_READABLE_SCALE);
  });
});

describe('exportSketchPng', () => {
  it('scales down, never up, to the longest edge', () => {
    expect(fitWithin(4000, 1000)).toEqual({ width: 2000, height: 500 });
    expect(fitWithin(300, 200)).toEqual({ width: 300, height: 200 });
  });

  it('flattens onto opaque white before drawing the ink', async () => {
    const canvas = fakeCanvas();
    const out = await flattenOnWhite(new Blob(['x']), {
      loadImage: async () => ({ width: 600, height: 300 }),
      createCanvas: () => canvas,
    });
    expect(out).toMatchObject({ width: 600, height: 300 });
    expect(canvas.calls.slice(0, 3).map((c) => c[0])).toEqual(['fillStyle', 'fillRect', 'drawImage']);
    expect(canvas.calls[0][1]).toBe('#ffffff');
  });

  const editorWith = (boundsById) => ({
    getCurrentPageShapeIds: () => new Set(Object.keys(boundsById)),
    getCurrentPageBounds: () => unionBounds(Object.values(boundsById)),
    getShapePageBounds: (id) => boundsById[id],
  });
  const deps = (extra = {}) => ({
    exportToBlob: vi.fn(async () => new Blob(['raw'])),
    flatten: vi.fn(async () => ({ blob: new Blob(['png'], { type: 'image/png' }), width: 500, height: 300 })),
    toBase64: vi.fn(async () => 'QUJD'),
    ...extra,
  });

  it('exports only the lassoed ids, sized by THEIR bounds, as bare base64 PNG', async () => {
    const editor = editorWith({
      'shape:a': { x: 100, y: 100, w: 120, h: 30 },
      'shape:b': { x: 230, y: 104, w: 90, h: 30 },
      'shape:far': { x: 0, y: 900, w: 900, h: 400 },
    });
    const d = deps();
    const out = await exportSketchPng(editor, { ...d, ids: ['shape:a', 'shape:b'], minShortEdge: LASSO_MIN_SHORT_EDGE });
    const call = d.exportToBlob.mock.calls[0][0];
    expect(call.ids).toEqual(['shape:a', 'shape:b']);
    expect(call.format).toBe('png');
    expect(call.opts).toEqual(sketchExportOptions({ w: 220, h: 34 }, EXPORT_MAX_EDGE, { minShortEdge: LASSO_MIN_SHORT_EDGE }));
    expect(call.opts.scale).toBeGreaterThan(1);
    expect(out).toMatchObject({ base64: 'QUJD', mediaType: 'image/png', tooLong: false });
  });

  it('nothing to export is an error with a plain message', async () => {
    await expect(exportSketchPng(editorWith({}), deps())).rejects.toMatchObject({ name: 'SketchExportError', code: 'empty' });
    await expect(exportSketchPng(editorWith({}), deps({ ids: [] }))).rejects.toBeInstanceOf(SketchExportError);
  });

  it('a failing tldraw export and an oversized image are SketchExportErrors', async () => {
    const editor = editorWith({ 'shape:a': { x: 0, y: 0, w: 10, h: 10 } });
    await expect(exportSketchPng(editor, deps({ exportToBlob: async () => { throw new Error('no svg'); } })))
      .rejects.toMatchObject({ code: 'encode' });
    const big = { size: 7 * 1024 * 1024 };
    await expect(exportSketchPng(editor, deps({ flatten: async () => ({ blob: big, width: 1, height: 1 }) })))
      .rejects.toMatchObject({ code: 'too_large' });
  });
});

describe('unionBounds', () => {
  it('the smallest box holding every box; nulls skipped', () => {
    expect(unionBounds([{ x: 0, y: 0, w: 10, h: 10 }, null, { x: 20, y: 5, w: 10, h: 30 }])).toEqual({ x: 0, y: 0, w: 30, h: 35 });
    expect(unionBounds([null])).toBe(null);
  });
});
