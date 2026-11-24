/**
 * A template SHEET: a page template printed into the drawing itself
 * (DOCS/TEMPLATES_SPEC.md, revision of 2026-11-21, T1–T8).
 *
 * Chef, 2026-11-21: "the template should be separate than the paper type ...
 * the template should then become a permanent part of the page with a forced
 * white paper under."
 *
 * So a template is not a background and not a paper setting. Choosing one
 * places ONE locked image shape in the sketch: a white sheet, PAPER_PAGE wide
 * and `paperTemplateHeight` tall, with the template printed on it in fixed colours. Because it is an
 * ordinary tldraw image shape with an inline SVG asset:
 *   - it saves with the note and opens the same in NoteGeek, in GeekDay and
 *     in any older build (no custom shape type to be missing);
 *   - it is in thumbnails, print and exports;
 *   - being locked, it cannot be selected, moved or erased; it comes off only
 *     through `removePaperSheet`;
 *   - the app's paper (colour, lines, grid) is untouched and carries on
 *     around and below it.
 *
 * Only templates that are a LAYOUT are sheets. Dot grid and Grid are kinds of
 * paper, not templates (`tiles` in templates.js): `isPaperSheetTemplate` is
 * false for them.
 *
 * No tldraw import: the record builders are pure, and the three functions
 * that take an editor use only its public methods, so this file is testable
 * with a stub and adds nothing to a bundle that has no tldraw.
 */
import { PAPER_PAGE, PAPER_TEMPLATES, PAPER_TEMPLATE_META_KEY, paperTemplateDataUri, paperTemplateHeight } from './templates.js';

/** One sheet per sketch, so its shape has a fixed id. */
export const PAPER_SHEET_SHAPE_ID = 'shape:paper-template';
/**
 * The sheet's picture is an asset with one fixed id PER TEMPLATE
 * (`asset:paper-template-meeting`), and an asset is never deleted or
 * rewritten once made. tldraw keeps assets out of its undo history, so a
 * single asset that was deleted on Remove, or overwritten on a change of
 * template, left Undo with a sheet whose picture was gone or was the wrong
 * one (seen in the harness, 2026-11-21). An unused asset is a few kB.
 */
export const PAPER_SHEET_ASSET_ID = 'asset:paper-template';
export const paperSheetAssetId = (templateId) => `${PAPER_SHEET_ASSET_ID}-${templateId}`;

/** White paper, always; print greys that read on it. The same in every app and theme. */
export const PAPER_SHEET_COLORS = {
  ground: '#ffffff',
  ink: '#595d66',
  line: 'rgba(60, 70, 85, 0.42)',
  accent: '#595d66',
};

/** The templates that can be placed as a sheet, in menu order. */
export const PAPER_SHEET_TEMPLATES = PAPER_TEMPLATES.filter((t) => !t.tiles);

const sheetIds = new Set(PAPER_SHEET_TEMPLATES.map((t) => t.id));

export const isPaperSheetTemplate = (id) => typeof id === 'string' && sheetIds.has(id);

/**
 * Is this shape record a template sheet? By its fixed id, or by the mark it
 * carries (`meta.paperTemplate`) — never by being an image: a photo sketch's
 * pages are image shapes too.
 */
export function isPaperSheetShape(shape) {
  if (!shape || shape.type !== 'image') return false;
  return shape.id === PAPER_SHEET_SHAPE_ID || typeof shape.meta?.[PAPER_TEMPLATE_META_KEY] === 'string';
}

/** The template id a sheet shape was printed from, or null. */
export function paperSheetTemplateOf(shape) {
  if (!isPaperSheetShape(shape)) return null;
  const id = shape.meta?.[PAPER_TEMPLATE_META_KEY];
  return typeof id === 'string' && id ? id : null;
}

/**
 * The asset and the shape that make a sheet of `templateId` with its top-left
 * at page (x, y); null for an id that cannot be a sheet. The shape is given
 * UNLOCKED; `placePaperSheet` locks it once it is at the back.
 */
export function paperSheetRecords(templateId, { x = 0, y = 0 } = {}) {
  if (!isPaperSheetTemplate(templateId)) return null;
  const w = PAPER_PAGE.width;
  const h = paperTemplateHeight(templateId);
  const label = PAPER_SHEET_TEMPLATES.find((t) => t.id === templateId).label;
  const assetId = paperSheetAssetId(templateId);
  return {
    asset: {
      id: assetId,
      typeName: 'asset',
      type: 'image',
      props: {
        name: `${label} template`,
        src: paperTemplateDataUri(templateId, PAPER_SHEET_COLORS),
        w,
        h,
        mimeType: 'image/svg+xml',
        isAnimated: false,
      },
      meta: { [PAPER_TEMPLATE_META_KEY]: templateId },
    },
    shape: {
      id: PAPER_SHEET_SHAPE_ID,
      type: 'image',
      x: Math.round(Number(x) || 0),
      y: Math.round(Number(y) || 0),
      props: { w, h, assetId },
      meta: { [PAPER_TEMPLATE_META_KEY]: templateId },
    },
  };
}

/** The sketch's sheet shape on the editor's current page, or null. */
export function paperSheetOf(editor) {
  const shape = editor?.getShape?.(PAPER_SHEET_SHAPE_ID);
  return shape && isPaperSheetShape(shape) ? shape : null;
}

/**
 * Take the sheet off. A locked shape ignores `deleteShapes`, so it is
 * unlocked first. Its asset stays (see PAPER_SHEET_ASSET_ID). One batch: one undo step when the caller has set a mark.
 * @returns {boolean} whether there was a sheet to remove
 */
export function removePaperSheet(editor) {
  const shape = paperSheetOf(editor);
  if (!shape) return false;
  editor.batch(() => {
    editor.updateShapes([{ id: shape.id, type: shape.type, isLocked: false }]);
    editor.deleteShapes([shape.id]);
  });
  return true;
}

/**
 * Print `templateId` into the sketch at page (x, y), under everything
 * already drawn, and lock it. Replaces the sheet the sketch has, if any.
 * @returns {boolean} false for an id that cannot be a sheet (nothing changes)
 */
export function placePaperSheet(editor, templateId, at) {
  const records = paperSheetRecords(templateId, at);
  if (!records) return false;
  editor.batch(() => {
    removePaperSheet(editor);
    if (!editor.getAsset?.(records.asset.id)) editor.createAssets([records.asset]);
    editor.createShapes([records.shape]);
    editor.sendToBack([records.shape.id]);
    editor.updateShapes([{ id: records.shape.id, type: 'image', isLocked: true }]);
  });
  return true;
}
