/**
 * sketchExport.js — NoteGeek's side of the sketch picture. The export itself
 * (tldraw's export flattened onto white, the size rules, the errors) is
 * @geeksuite/ink's `exportSketchPng`, shared with GeekDay. What is NoteGeek's:
 *
 *   - the template sheet (DOCS/TEMPLATES_SPEC.md T6) is a shape, so it is in
 *     the picture a person gets (share, print) and is left OUT of the picture
 *     a model reads unless the caller says `sheet: true` (a filled-in form);
 *   - print: one image per photographed page (`exportSketchForPrint`).
 */
import { isPaperSheetShape } from '@geeksuite/ui';
import { exportSketchPng as exportInk, flattenOnWhite, SketchExportError } from '@geeksuite/ink';

/**
 * The current page of a tldraw editor as a white-backed PNG. Takes every
 * option of @geeksuite/ink's `exportSketchPng`, plus:
 *
 * @param {boolean} [deps.sheet=false]  with the template sheet, if the sketch
 *   has one: true for a picture a person will look at, false (the default)
 *   for one a model will read. Ignored when `ids` is given.
 */
export function exportSketchPng(editor, { sheet = false, ...deps } = {}) {
  return exportInk(editor, { ...deps, skipShape: sheet ? null : isPaperSheetShape });
}

/** Print resolution: about 300 dpi across a 7.5in text block. */
export const PRINT_MAX_EDGE = 3000;

const overlaps = (a, b) => a && b
  && a.x < b.x + b.w && a.x + a.w > b.x
  && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * A sketch as the images a printed page shows, top to bottom.
 *
 * A plain sketch is one image of all its ink. A photo sketch
 * (DOCS/HANDWRITING.md §3) stacks one photographed page per image shape, and
 * one image of the whole stack would shrink every page to a strip, so it
 * prints one image per photo: that photo plus whatever ink overlaps it.
 * Ink that touches no photo follows as one more image.
 *
 * @returns {Promise<Array<{ blob: Blob, width: number, height: number }>>}
 * @throws {SketchExportError} code `empty` | `encode`
 */
export async function exportSketchForPrint(editor, { exportToBlob, flatten = flattenOnWhite } = {}) {
  const shapes = editor.getCurrentPageShapesSorted?.() || [];
  if (!shapes.length) {
    throw new SketchExportError('empty', 'This sketch is empty.');
  }
  const once = (ids) => exportSketchPng(editor, {
    exportToBlob, flatten, ids, maxEdge: PRINT_MAX_EDGE, maxBytes: Infinity, base64: false,
  });
  // A template sheet is an image shape too, but it is not a photographed page.
  const photos = shapes.filter((s) => s.type === 'image' && !isPaperSheetShape(s));
  if (!photos.length) return [await once(shapes.map((s) => s.id))];

  const boundsOf = (s) => editor.getShapePageBounds?.(s.id) || null;
  const photoBounds = photos
    .map((p) => ({ shape: p, b: boundsOf(p) }))
    .sort((a, b) => (a.b?.y ?? 0) - (b.b?.y ?? 0));
  const claimed = new Set(photos.map((p) => p.id));
  const out = [];
  for (const { shape, b } of photoBounds) {
    const ink = shapes.filter((s) => s.type !== 'image' && overlaps(boundsOf(s), b));
    // (A template sheet under a photo stays with the loose ink below.)
    ink.forEach((s) => claimed.add(s.id));
    out.push(await once([shape.id, ...ink.map((s) => s.id)]));
  }
  const loose = shapes.filter((s) => !claimed.has(s.id));
  if (loose.length) out.push(await once(loose.map((s) => s.id)));
  return out;
}
