// @vitest-environment jsdom
/**
 * Template sheets (DOCS/TEMPLATES_SPEC.md, revision of 2026-11-21): a
 * template is one locked image shape printed into the drawing, on white.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  PAPER_PAGE,
  PAPER_SHEET_ASSET_ID,
  PAPER_SHEET_COLORS,
  PAPER_SHEET_SHAPE_ID,
  PAPER_SHEET_TEMPLATES,
  isPaperSheetShape,
  isPaperSheetTemplate,
  paperSheetAssetId,
  paperSheetOf,
  paperSheetRecords,
  paperSheetTemplateOf,
  paperTemplateSvg,
  placePaperSheet,
  removePaperSheet,
} from '../paper/index.js';
import * as ui from '../index.js';

/** A stand-in for the tldraw editor: records, and tldraw's rule that a locked shape cannot be deleted. */
function stubEditor() {
  const shapes = new Map();
  const assets = new Map();
  const calls = [];
  const editor = {
    shapes,
    assets,
    calls,
    batch: (fn) => { fn(); },
    getShape: (id) => shapes.get(id),
    getAsset: (id) => assets.get(id),
    createAssets: (list) => { list.forEach((a) => assets.set(a.id, a)); calls.push('createAssets'); },
    deleteAssets: (ids) => { ids.forEach((id) => assets.delete(id)); },
    createShapes: (list) => { list.forEach((s) => shapes.set(s.id, { isLocked: false, ...s })); calls.push('createShapes'); },
    updateShapes: (list) => {
      list.forEach((p) => {
        const s = shapes.get(p.id);
        if (!s) return;
        if (s.isLocked && p.isLocked !== false) return;
        shapes.set(p.id, { ...s, ...p });
      });
    },
    deleteShapes: (ids) => { ids.forEach((id) => { if (!shapes.get(id)?.isLocked) shapes.delete(id); }); },
    sendToBack: vi.fn(() => { calls.push('sendToBack'); }),
  };
  return editor;
}

describe('template sheets', () => {
  it('only the layouts are sheets: dot grid and grid are paper, not templates', () => {
    expect(PAPER_SHEET_TEMPLATES.map((t) => t.id)).toEqual(['schedule', 'top3', 'meeting', 'cornell']);
    expect(isPaperSheetTemplate('meeting')).toBe(true);
    for (const id of ['dots', 'grid', 'none', '', null, undefined, 7]) expect(isPaperSheetTemplate(id)).toBe(false);
    expect(paperSheetRecords('grid')).toBeNull();
    expect(ui.placePaperSheet).toBe(placePaperSheet);
  });

  it('a sheet is white paper with an edge, whatever colours the app has', () => {
    expect(PAPER_SHEET_COLORS.ground).toBe('#ffffff');
    const svg = paperTemplateSvg('cornell', PAPER_SHEET_COLORS);
    expect(svg).toContain(`<rect width="${PAPER_PAGE.width}" height="${PAPER_PAGE.height}" fill="#ffffff"/>`);
    // Without a ground the template is still transparent (GeekDay's dot grid and grid).
    expect(paperTemplateSvg('grid')).not.toContain('<rect');
  });

  it('the records: one image asset holding the SVG, one image shape the size of a sheet', () => {
    const { asset, shape } = paperSheetRecords('meeting', { x: 12.4, y: -3.6 });
    expect(asset).toMatchObject({ id: 'asset:paper-template-meeting', typeName: 'asset', type: 'image' });
    expect(paperSheetAssetId('meeting')).toBe(`${PAPER_SHEET_ASSET_ID}-meeting`);
    expect(asset.props).toMatchObject({ w: 1000, h: 1400, mimeType: 'image/svg+xml', isAnimated: false });
    expect(asset.props.src.startsWith('data:image/svg+xml')).toBe(true);
    expect(decodeURIComponent(asset.props.src)).toContain('ACTIONS');
    expect(shape).toMatchObject({ id: PAPER_SHEET_SHAPE_ID, type: 'image', x: 12, y: -4 });
    expect(shape.props).toEqual({ w: 1000, h: 1400, assetId: 'asset:paper-template-meeting' });
    expect(shape.meta).toEqual({ paperTemplate: 'meeting' });
  });

  it('knows its own shape, and never mistakes a photo for one', () => {
    const { shape } = paperSheetRecords('top3');
    expect(isPaperSheetShape(shape)).toBe(true);
    expect(paperSheetTemplateOf(shape)).toBe('top3');
    const photo = { id: 'shape:photo1', type: 'image', props: { w: 800, h: 1100 }, meta: {} };
    expect(isPaperSheetShape(photo)).toBe(false);
    expect(paperSheetTemplateOf(photo)).toBeNull();
    expect(isPaperSheetShape({ id: PAPER_SHEET_SHAPE_ID, type: 'draw' })).toBe(false);
    expect(isPaperSheetShape(null)).toBe(false);
  });

  it('placing: under the ink, then locked', () => {
    const editor = stubEditor();
    expect(placePaperSheet(editor, 'schedule')).toBe(true);
    expect(editor.calls).toEqual(['createAssets', 'createShapes', 'sendToBack']);
    expect(editor.sendToBack).toHaveBeenCalledWith([PAPER_SHEET_SHAPE_ID]);
    expect(paperSheetOf(editor)).toMatchObject({ isLocked: true, x: 0, y: 0 });
    expect(paperSheetTemplateOf(paperSheetOf(editor))).toBe('schedule');
    expect(editor.assets.has('asset:paper-template-schedule')).toBe(true);
  });

  it('placing another replaces the first: one sheet, each template its own asset', () => {
    const editor = stubEditor();
    placePaperSheet(editor, 'schedule');
    placePaperSheet(editor, 'cornell', { x: 200, y: 300 });
    expect(editor.shapes.size).toBe(1);
    expect(paperSheetOf(editor)).toMatchObject({ x: 200, y: 300, isLocked: true });
    expect(paperSheetOf(editor).props.assetId).toBe('asset:paper-template-cornell');
    expect(decodeURIComponent(editor.getAsset('asset:paper-template-cornell').props.src)).toContain('SUMMARY');
    // tldraw keeps assets out of undo: the first one must still be there for Undo to show.
    expect(editor.assets.has('asset:paper-template-schedule')).toBe(true);
    placePaperSheet(editor, 'schedule');
    expect(editor.calls.filter((c) => c === 'createAssets')).toHaveLength(2);
  });

  it('an id that is not a sheet changes nothing', () => {
    const editor = stubEditor();
    placePaperSheet(editor, 'meeting');
    expect(placePaperSheet(editor, 'grid')).toBe(false);
    expect(placePaperSheet(editor, 'nope')).toBe(false);
    expect(paperSheetTemplateOf(paperSheetOf(editor))).toBe('meeting');
  });

  it('removing unlocks first (a locked shape cannot be deleted), and leaves the asset for Undo', () => {
    const editor = stubEditor();
    expect(removePaperSheet(editor)).toBe(false);
    placePaperSheet(editor, 'meeting');
    editor.deleteShapes([PAPER_SHEET_SHAPE_ID]);
    expect(paperSheetOf(editor)).not.toBeNull(); // locked: the eraser's path does nothing
    expect(removePaperSheet(editor)).toBe(true);
    expect(paperSheetOf(editor)).toBeNull();
    expect(editor.assets.has('asset:paper-template-meeting')).toBe(true);
  });
});
