/**
 * photoSketchSnapshot.js — the photo sketch note's body (DOCS/HANDWRITING.md §3).
 *
 * Each photographed page becomes a tldraw image shape with its JPEG embedded
 * as an image asset, stacked top to bottom, so the pages open in the sketch
 * editor and can be marked up with the S Pen.
 *
 * ## Built by tldraw, not by hand
 *
 * A hand-written snapshot crashed tldraw's migrations on 2026-09-26: its
 * schema header was invented. So nothing here writes a record or a schema by
 * hand. `createTLStore` builds a real store with the same shape and binding
 * utils `<Tldraw>` uses; `ensureStoreIsUsable` adds the document and page
 * records exactly as the editor would; `store.put` validates every asset and
 * shape against tldraw's own validators; and `getStoreSnapshot()` — what the
 * editor's `store.getSnapshot()` returns, minus its deprecation warning —
 * serialises the records with the current schema. Before the body is handed
 * back it is loaded into a second fresh store (`loadStoreSnapshot`, the path
 * the editor takes on open, migrations included), so a snapshot that would
 * not open is refused here rather than saved.
 *
 * This module imports tldraw, so the photo page loads it with a dynamic
 * `import()` at save time; tldraw stays out of the page's own chunk.
 */
import {
  createTLStore,
  defaultShapeUtils,
  defaultBindingUtils,
  AssetRecordType,
  createShapeId,
  getIndices,
} from '@tldraw/tldraw';
import { PHOTO_MEDIA_TYPE } from './photoPages';

/** Page units: each photo is laid out this wide, its height by its aspect. */
export const PHOTO_SHAPE_WIDTH = 1000;

/** Page units between stacked pages. */
export const PHOTO_SHAPE_GAP = 48;

const newStore = () => createTLStore({ shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils });

/**
 * The shape layout for pages of the given pixel sizes: `{ x, y, w, h }` each,
 * top to bottom, all PHOTO_SHAPE_WIDTH wide.
 */
export function photoLayout(sizes, { width = PHOTO_SHAPE_WIDTH, gap = PHOTO_SHAPE_GAP } = {}) {
  let y = 0;
  return (sizes || []).map(({ width: pw, height: ph }) => {
    const h = Math.max(1, Math.round((width * Math.max(1, ph)) / Math.max(1, pw)));
    const box = { x: 0, y, w: width, h };
    y += h + gap;
    return box;
  });
}

/**
 * The snapshot, as the JSON string a sketch note stores.
 *
 * @param {Array<{ dataUrl: string, width: number, height: number, bytes?: number }>} pages
 * @returns {string}
 */
export function buildPhotoSketchSnapshot(pages) {
  if (!Array.isArray(pages) || pages.length === 0) throw new Error('No pages to keep.');
  const store = newStore();
  store.ensureStoreIsUsable();
  const pageRecord = store.query.records('page').get()[0];
  if (!pageRecord) throw new Error('tldraw made no page.');

  const layout = photoLayout(pages);
  const indices = getIndices(pages.length);
  const records = [];
  pages.forEach((p, i) => {
    const assetId = AssetRecordType.createId();
    records.push(AssetRecordType.create({
      id: assetId,
      type: 'image',
      props: {
        name: `page-${i + 1}.jpg`,
        src: p.dataUrl,
        w: p.width,
        h: p.height,
        mimeType: PHOTO_MEDIA_TYPE,
        isAnimated: false,
        ...(p.bytes > 0 ? { fileSize: p.bytes } : {}),
      },
      meta: {},
    }));
    const box = layout[i];
    records.push(store.schema.types.shape.create({
      id: createShapeId(),
      type: 'image',
      parentId: pageRecord.id,
      index: indices[i],
      x: box.x,
      y: box.y,
      // Locked: the S Pen's eraser (and a stray drag) skip locked shapes, so
      // marking up a page never rubs out or moves the photo under it.
      isLocked: true,
      props: {
        w: box.w,
        h: box.h,
        assetId,
        playing: true,
        url: '',
        crop: null,
        flipX: false,
        flipY: false,
      },
      meta: { photoPage: i + 1 },
    }));
  });
  store.put(records);

  const serialized = JSON.stringify(store.getStoreSnapshot());
  assertLoads(serialized);
  return serialized;
}

/**
 * Load a serialized snapshot into a fresh store the way the editor does
 * (migrations and validation included). Throws when it would not open.
 */
export function assertLoads(serialized) {
  const check = newStore();
  check.loadStoreSnapshot(JSON.parse(serialized));
  return check;
}
