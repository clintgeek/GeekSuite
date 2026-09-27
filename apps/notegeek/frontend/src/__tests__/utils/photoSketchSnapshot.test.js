/**
 * The photo sketch note's snapshot (DOCS/HANDWRITING.md §3), built with the
 * REAL tldraw store — no mock. A hand-made snapshot crashed tldraw's
 * migrations once; this proves the body we save goes through tldraw's own
 * validators on the way in and its migrations on the way back out.
 */
import { describe, it, expect } from 'vitest';
import { createTLStore, defaultShapeUtils, defaultBindingUtils } from '@tldraw/tldraw';
import {
  buildPhotoSketchSnapshot,
  assertLoads,
  photoLayout,
  PHOTO_SHAPE_WIDTH,
  PHOTO_SHAPE_GAP,
} from '../../utils/photoSketchSnapshot';
import {
  estimateSnapshotChars,
  photoSizeCheck,
  dataUrlChars,
  SNAPSHOT_BASE_CHARS,
  SNAPSHOT_PER_PAGE_CHARS,
} from '../../utils/photoPages';
import { SNAPSHOT_CONTENT_MAX } from '../../utils/saveGuards';
import { sketchHasShapes } from '../../utils/sketchExport';

// A real 1x1 JPEG, and a fake "page" of any size built from it: the bytes
// only need to be a valid data: URL for tldraw's validator.
const JPEG_1PX = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const page = (width, height, base64 = JPEG_1PX) => ({
  dataUrl: `data:image/jpeg;base64,${base64}`,
  width,
  height,
  bytes: Math.floor((base64.length * 3) / 4),
});

const records = (json) => Object.values(JSON.parse(json).store);

describe('buildPhotoSketchSnapshot', () => {
  it('makes one image asset and one locked image shape per page, in page order, stacked', () => {
    const json = buildPhotoSketchSnapshot([page(1500, 2000), page(2000, 1500)]);
    const recs = records(json);
    const assets = recs.filter((r) => r.typeName === 'asset');
    const shapes = recs.filter((r) => r.typeName === 'shape');
    expect(assets).toHaveLength(2);
    expect(shapes).toHaveLength(2);
    expect(assets.every((a) => a.type === 'image' && a.props.mimeType === 'image/jpeg')).toBe(true);
    expect(assets.every((a) => a.props.src.startsWith('data:image/jpeg;base64,'))).toBe(true);

    const byPage = [...shapes].sort((a, b) => a.meta.photoPage - b.meta.photoPage);
    expect(byPage.map((s) => s.type)).toEqual(['image', 'image']);
    expect(byPage.every((s) => s.isLocked)).toBe(true);
    // Each shape points at its own asset.
    expect(new Set(byPage.map((s) => s.props.assetId)).size).toBe(2);
    for (const s of byPage) expect(assets.map((a) => a.id)).toContain(s.props.assetId);
    // Stacked top to bottom, full width, aspect kept.
    expect(byPage[0]).toMatchObject({ x: 0, y: 0 });
    expect(byPage[0].props).toMatchObject({ w: PHOTO_SHAPE_WIDTH, h: Math.round(PHOTO_SHAPE_WIDTH * 2000 / 1500) });
    expect(byPage[1].y).toBe(byPage[0].props.h + PHOTO_SHAPE_GAP);
    expect(byPage[1].props.h).toBe(Math.round(PHOTO_SHAPE_WIDTH * 1500 / 2000));
    // Index order follows page order, so the stack draws in order.
    expect(byPage[0].index < byPage[1].index).toBe(true);
  });

  it('is a document snapshot with tldraw\'s own schema, and reads as a sketch with ink', () => {
    const json = buildPhotoSketchSnapshot([page(1000, 1000)]);
    const parsed = JSON.parse(json);
    expect(parsed.schema.schemaVersion).toBe(2);
    expect(parsed.schema.sequences['com.tldraw.shape.image']).toBeGreaterThan(0);
    expect(parsed.schema.sequences['com.tldraw.asset.image']).toBeGreaterThan(0);
    const types = new Set(records(json).map((r) => r.typeName));
    expect(types).toEqual(new Set(['document', 'page', 'asset', 'shape']));
    // The editor page's "Convert handwriting to text" is enabled on it.
    expect(sketchHasShapes(json)).toBe(true);
  });

  it('loads back into a fresh tldraw store, migrations and validators included', () => {
    const json = buildPhotoSketchSnapshot([page(1500, 2000), page(1500, 2000)]);
    const store = createTLStore({ shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils });
    store.loadStoreSnapshot(JSON.parse(json));
    const shapes = store.allRecords().filter((r) => r.typeName === 'shape');
    expect(shapes).toHaveLength(2);
    expect(store.allRecords().filter((r) => r.typeName === 'asset')).toHaveLength(2);
  });

  it('refuses nothing to keep, and a page tldraw would reject', () => {
    expect(() => buildPhotoSketchSnapshot([])).toThrow(/No pages/);
    // tldraw's image shape requires a non-zero size; a src must be a URL.
    expect(() => buildPhotoSketchSnapshot([{ dataUrl: 'not a url', width: 10, height: 10 }])).toThrow();
  });

  it('assertLoads throws on a snapshot tldraw cannot migrate (the 2026-09-26 crash)', () => {
    const json = buildPhotoSketchSnapshot([page(10, 10)]);
    const bad = JSON.parse(json);
    bad.schema = { schemaVersion: 1, storeVersion: 99, recordVersions: {} };
    expect(() => assertLoads(JSON.stringify(bad))).toThrow();
    expect(() => assertLoads(json)).not.toThrow();
  });
});

describe('photoLayout', () => {
  it('stacks pages PHOTO_SHAPE_WIDTH wide with a gap, height by aspect', () => {
    expect(photoLayout([{ width: 2000, height: 1000 }, { width: 1000, height: 2000 }])).toEqual([
      { x: 0, y: 0, w: 1000, h: 500 },
      { x: 0, y: 500 + PHOTO_SHAPE_GAP, w: 1000, h: 2000 },
    ]);
  });
});

describe('the snapshot size estimate', () => {
  // Real-sized base64 payloads (random, so not compressible), to hold the
  // estimate's overhead constants to what tldraw actually writes.
  const payload = (bytes) => {
    const raw = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i += 1) raw[i] = (i * 2654435761) >>> 24;
    raw[0] = 0xff; raw[1] = 0xd8; raw[2] = 0xff;
    let s = '';
    for (let i = 0; i < raw.length; i += 1) s += String.fromCharCode(raw[i]);
    return btoa(s);
  };

  it('is never below the real snapshot, and within a few KB of it', () => {
    for (const count of [1, 2, 8]) {
      const pages = Array.from({ length: count }, () => page(1500, 2000, payload(20_000)));
      const real = buildPhotoSketchSnapshot(pages).length;
      const est = estimateSnapshotChars(pages);
      expect(est).toBeGreaterThanOrEqual(real);
      expect(est - real).toBeLessThan(SNAPSHOT_BASE_CHARS + count * SNAPSHOT_PER_PAGE_CHARS);
    }
  });

  it('counts a page as its data: URL plus a fixed overhead', () => {
    expect(dataUrlChars(3)).toBe('data:image/jpeg;base64,'.length + 4);
    expect(estimateSnapshotChars([{ bytes: 300 }, { bytes: 300 }]))
      .toBe(SNAPSHOT_BASE_CHARS + 2 * (SNAPSHOT_PER_PAGE_CHARS + dataUrlChars(300)));
  });

  it('the guard refuses a set over SNAPSHOT_CONTENT_MAX, before anything is created', () => {
    // Eight pages at 600 KB of JPEG each: ~6.4 MB of base64 — over 5 MB.
    const heavy = Array.from({ length: 8 }, () => ({ bytes: 600_000 }));
    const over = photoSizeCheck(heavy);
    expect(over.ok).toBe(false);
    expect(over.chars).toBeGreaterThan(SNAPSHOT_CONTENT_MAX);
    expect(over.message).toMatch(/too big for one note/);
    // Eight at 400 KB fit.
    const fits = photoSizeCheck(Array.from({ length: 8 }, () => ({ bytes: 400_000 })));
    expect(fits.ok).toBe(true);
    expect(fits.message).toBeNull();
    // An exact length overrides the estimate, either way.
    expect(photoSizeCheck(heavy, { chars: 10 }).ok).toBe(true);
    expect(photoSizeCheck([], { chars: SNAPSHOT_CONTENT_MAX + 1 }).ok).toBe(false);
    expect(photoSizeCheck([], { chars: SNAPSHOT_CONTENT_MAX }).ok).toBe(true);
  });
});
