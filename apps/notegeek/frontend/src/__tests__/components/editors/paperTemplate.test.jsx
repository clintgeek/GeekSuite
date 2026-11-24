import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import { PAPER_SHEET_SHAPE_ID, paperSheetRecords } from '@geeksuite/ui';
import { createNoteTheme } from '../../../theme/createAppTheme';
import { resolvePaper, sheetPlacement, sheetViewBox } from '../../../components/editors/paperModel';

/**
 * Templates in a sketch (DOCS/TEMPLATES_SPEC.md T1–T8). Chef, 2026-11-21:
 * "the template should be separate than the paper type ... a permanent part
 * of the page with a forced white paper under."
 *
 * A template is one locked image shape in the drawing; the paper (colour and
 * lines, document meta) is a different thing and neither touches the other.
 * tldraw is a small fake here: a document record, shapes, assets and a
 * camera, with tldraw's own rule that a locked shape ignores changes and
 * deletes. The real editor is exercised by the harness (scenes 23c–23e).
 */

const tl = vi.hoisted(() => ({ editor: null }));

vi.mock('@tldraw/tldraw', () => ({
  useEditor: () => tl.editor,
  // Like tldraw's: recomputed on every render (tests re-render after a change).
  useValue: (_name, fn) => fn(),
}));

import { PaperBackground, PaperPicker } from '../../../components/editors/Paper';
import { guardTemplateSheet, hasInk, setPaper, setPaperTemplate, showTemplateSheet } from '../../../components/editors/usePaper';

const makeEditor = (meta = {}, camera = { x: 0, y: 0, z: 1 }) => {
  const shapes = new Map();
  const assets = new Map();
  const guards = [];
  const editor = {
    shapes,
    assets,
    document: { id: 'document:document', name: '', gridSize: 10, meta },
    camera,
    getDocumentSettings: vi.fn(() => editor.document),
    updateDocumentSettings: vi.fn((settings) => { editor.document = { ...editor.document, ...settings }; }),
    getCamera: vi.fn(() => editor.camera),
    getViewportScreenBounds: vi.fn(() => ({ x: 0, y: 0, w: 390, h: 600 })),
    getViewportPageBounds: vi.fn(() => ({ x: 240.4, y: 910.6, w: 390, h: 600 })),
    zoomToBounds: vi.fn(),
    isDisposed: false,
    mark: vi.fn(),
    batch: (fn) => fn(),
    getShape: (id) => shapes.get(id),
    getAsset: (id) => assets.get(id),
    getCurrentPageShapeIds: () => new Set(shapes.keys()),
    getShapePageBounds: (s) => {
      const shape = typeof s === 'string' ? shapes.get(s) : s;
      return shape ? { x: shape.x, y: shape.y, w: shape.props?.w ?? 10, h: shape.props?.h ?? 10 } : undefined;
    },
    createAssets: vi.fn((list) => list.forEach((a) => assets.set(a.id, a))),
    deleteAssets: vi.fn((ids) => ids.forEach((id) => assets.delete(id))),
    createShapes: vi.fn((list) => list.forEach((s) => shapes.set(s.id, { isLocked: false, ...s }))),
    updateShapes: vi.fn((list) => list.forEach((p) => {
      const prev = shapes.get(p.id);
      if (!prev) return;
      if (prev.isLocked && p.isLocked !== false) return; // tldraw: a locked shape only takes an unlock
      let next = { ...prev, ...p };
      for (const g of guards) next = g(prev, next);
      shapes.set(p.id, next);
    })),
    deleteShapes: vi.fn((ids) => ids.forEach((id) => { if (!shapes.get(id)?.isLocked) shapes.delete(id); })),
    sendToBack: vi.fn(),
    sideEffects: {
      registerBeforeChangeHandler: vi.fn((typeName, handler) => {
        if (typeName === 'shape') guards.push(handler);
        return () => guards.splice(guards.indexOf(handler), 1);
      }),
    },
  };
  return editor;
};
const ink = (editor, id = 'shape:ink', at = { x: 300, y: 950 }) => editor.shapes.set(id, { id, type: 'draw', isLocked: false, ...at, props: {} });
const sheetOf = (editor) => editor.shapes.get(PAPER_SHEET_SHAPE_ID);

const wrap = (ui, mode = 'light') => render(<ThemeProvider theme={createNoteTheme(mode)}>{ui}</ThemeProvider>);
const background = (container) => container.querySelector('.tl-background');

beforeEach(() => { localStorage.removeItem('notegeek:sketchPaper'); });
afterEach(() => { localStorage.removeItem('notegeek:sketchPaper'); tl.editor = null; });

describe('the model', () => {
  it('a new sheet goes to page (0, 0) on a blank sketch, and to what is on screen on one with ink', () => {
    expect(sheetPlacement({ hasInk: false, viewport: { x: 500, y: 900 } })).toEqual({ x: 0, y: 0 });
    expect(sheetPlacement({ hasInk: true, viewport: { x: 240.4, y: 910.6 } })).toEqual({ x: 240, y: 911 });
    expect(sheetPlacement({ hasInk: true, viewport: null })).toEqual({ x: 0, y: 0 });
  });

  it('bringing the sheet into view asks for its full width, from its top, wherever it is', () => {
    const sheet = { x: 240, y: 911, w: 1000, h: 1400 };
    expect(sheetViewBox(sheet, { w: 800, h: 1000 })).toEqual({ x: 240, y: 911, w: 1000, h: 1250 });
    expect(sheetViewBox(sheet, { w: 390, h: 600 })).toEqual({ x: 240, y: 911, w: 1000, h: 1400 });
    expect(sheetViewBox(sheet, { w: 1280, h: 80 }).h).toBe(192);
  });

  it('T8: a sketch with a sheet is in the light scheme even on "Match theme" at night, so black ink is black on the white sheet', () => {
    expect(resolvePaper({ color: 'auto', pattern: 'plain' }, 'dark').colorScheme).toBe('dark');
    expect(resolvePaper({ color: 'auto', pattern: 'plain' }, 'dark', { sheet: true }).colorScheme).toBe('light');
    // Nothing else about the paper changes.
    const plain = resolvePaper({ color: 'green', pattern: 'graph' }, 'dark');
    expect(resolvePaper({ color: 'green', pattern: 'graph' }, 'dark', { sheet: true })).toEqual(plain);
  });

  it('a sheet alone is not ink', () => {
    const editor = makeEditor();
    expect(hasInk(editor)).toBe(false);
    setPaperTemplate(editor, 'cornell');
    expect(hasInk(editor)).toBe(false);
    ink(editor);
    expect(hasInk(editor)).toBe(true);
  });
});

describe('the paper is only paper', () => {
  it('T5: the background draws colour and lines, and nothing for a template — with or without a sheet', () => {
    tl.editor = makeEditor({ paperColor: 'green', paperPattern: 'graph' });
    const plain = wrap(<PaperBackground />);
    const before = background(plain.container).getAttribute('style');
    expect(before).toContain('linear-gradient');
    expect(background(plain.container).style.backgroundColor).toBe('rgb(225, 235, 214)');
    plain.unmount();

    setPaperTemplate(tl.editor, 'meeting');
    const { container } = wrap(<PaperBackground />);
    const bg = background(container);
    expect(bg.getAttribute('style')).toBe(before);
    expect(bg.children).toHaveLength(0);
    expect(bg).toHaveAttribute('data-paper-pattern', 'graph');
    expect(container.querySelector('img')).toBeNull();
  });

  it('the id last night\'s build left in the paper\'s meta draws nothing and is left as it is', () => {
    tl.editor = makeEditor({ paperColor: 'warm', paperPattern: 'lined', paperTemplate: 'meeting' });
    const { container } = wrap(<PaperBackground />);
    expect(background(container).children).toHaveLength(0);
    expect(background(container).getAttribute('style')).toContain('linear-gradient');
    expect(tl.editor.updateDocumentSettings).not.toHaveBeenCalled();
    expect(tl.editor.shapes.size).toBe(0);
  });

  it('T5: choosing colour or lines never touches the sheet; placing a sheet never touches the paper or the device default', () => {
    tl.editor = makeEditor({});
    act(() => setPaperTemplate(tl.editor, 'schedule'));
    const sheet = sheetOf(tl.editor);
    act(() => setPaper(tl.editor, { color: 'green' }));
    act(() => setPaper(tl.editor, { pattern: 'graph' }));
    expect(sheetOf(tl.editor)).toBe(sheet);
    expect(tl.editor.document.meta).toEqual({ paperColor: 'green', paperPattern: 'graph' });
    expect(JSON.parse(localStorage.getItem('notegeek:sketchPaper'))).toEqual({ color: 'green', pattern: 'graph' });
    act(() => setPaperTemplate(tl.editor, 'meeting'));
    expect(tl.editor.document.meta).toEqual({ paperColor: 'green', paperPattern: 'graph' });
    expect(JSON.parse(localStorage.getItem('notegeek:sketchPaper'))).toEqual({ color: 'green', pattern: 'graph' });
    expect(Object.keys(localStorage).filter((k) => /template/i.test(k))).toEqual([]);
  });
});

describe('placing and removing', () => {
  it('T1–T3: one locked image shape on white, under the ink, as one undo step', () => {
    const editor = makeEditor();
    setPaperTemplate(editor, 'meeting');
    expect(editor.mark).toHaveBeenCalledTimes(1);
    const sheet = sheetOf(editor);
    expect(sheet).toMatchObject({ type: 'image', isLocked: true, x: 0, y: 0, meta: { paperTemplate: 'meeting' } });
    expect(sheet.props).toMatchObject({ w: 1000, h: 2800, assetId: 'asset:paper-template-meeting' });
    expect(decodeURIComponent(editor.assets.get('asset:paper-template-meeting').props.src)).toContain('fill="#ffffff"');
    expect(editor.sendToBack).toHaveBeenCalledWith([PAPER_SHEET_SHAPE_ID]);
    expect(editor.updateDocumentSettings).not.toHaveBeenCalled();
    // The camera goes to its top, full width: a two-sheet form is not shrunk to fit.
    const [box, how] = editor.zoomToBounds.mock.calls.at(-1);
    expect(box).toMatchObject({ x: 0, y: 0, w: 1000 });
    expect(box.h).toBeLessThan(2800);
    expect(how).toEqual({ targetZoom: 1, inset: 16 });
  });

  it('T4: once the page has writing, a template cannot be added, swapped or taken off', () => {
    const editor = makeEditor();
    ink(editor);
    setPaperTemplate(editor, 'top3');
    expect(sheetOf(editor)).toBeUndefined();
    expect(editor.mark).not.toHaveBeenCalled();

    const onSheet = makeEditor();
    setPaperTemplate(onSheet, 'top3');
    ink(onSheet);
    onSheet.mark.mockClear();
    setPaperTemplate(onSheet, 'cornell');
    expect(sheetOf(onSheet)).toMatchObject({ x: 0, y: 0, meta: { paperTemplate: 'top3' } });
    setPaperTemplate(onSheet, null);
    expect(sheetOf(onSheet)).toMatchObject({ meta: { paperTemplate: 'top3' } });
    expect(onSheet.mark).not.toHaveBeenCalled();
    // Undo back to a blank page and it can be changed again.
    onSheet.shapes.delete('shape:ink');
    setPaperTemplate(onSheet, 'cornell');
    expect(sheetOf(onSheet)).toMatchObject({ meta: { paperTemplate: 'cornell' } });
  });

  it('on a blank page another template swaps the sheet where it is; the same one again does nothing', () => {
    const editor = makeEditor();
    setPaperTemplate(editor, 'top3');
    editor.getViewportPageBounds = vi.fn(() => ({ x: -5000, y: -5000, w: 390, h: 600 }));
    setPaperTemplate(editor, 'cornell');
    expect(sheetOf(editor)).toMatchObject({ x: 0, y: 0, meta: { paperTemplate: 'cornell' } });
    expect(editor.shapes.size).toBe(1);
    editor.mark.mockClear();
    editor.createShapes.mockClear();
    setPaperTemplate(editor, 'cornell');
    expect(editor.mark).not.toHaveBeenCalled();
    expect(editor.createShapes).not.toHaveBeenCalled();
  });

  it('T4: on a blank page None takes it off; None on a sketch without one does nothing', () => {
    const editor = makeEditor({ paperColor: 'green', paperPattern: 'graph' });
    setPaperTemplate(editor, null);
    expect(editor.mark).not.toHaveBeenCalled();
    setPaperTemplate(editor, 'schedule');
    editor.zoomToBounds.mockClear();
    setPaperTemplate(editor, null);
    expect(sheetOf(editor)).toBeUndefined();
    expect(editor.shapes.size).toBe(0);
    expect(editor.document.meta).toEqual({ paperColor: 'green', paperPattern: 'graph' });
    expect(editor.zoomToBounds).not.toHaveBeenCalled();
    // Its picture stays in the document, so Undo can show it (tldraw keeps assets out of undo).
    expect(editor.assets.has('asset:paper-template-schedule')).toBe(true);
  });

  it('T3: the eraser, Delete and tldraw\'s own Unlock cannot take or free it; the Paper menu still can', () => {
    const editor = makeEditor();
    const off = guardTemplateSheet(editor);
    setPaperTemplate(editor, 'meeting');
    editor.deleteShapes([PAPER_SHEET_SHAPE_ID]); // what the eraser and Delete call
    expect(sheetOf(editor)).toBeDefined();
    editor.updateShapes([{ id: PAPER_SHEET_SHAPE_ID, type: 'image', isLocked: false }]); // tldraw's context menu
    expect(sheetOf(editor).isLocked).toBe(true);
    editor.updateShapes([{ id: PAPER_SHEET_SHAPE_ID, type: 'image', x: 99 }]);
    expect(sheetOf(editor).x).toBe(0);
    setPaperTemplate(editor, 'cornell');
    expect(sheetOf(editor)).toMatchObject({ isLocked: true, meta: { paperTemplate: 'cornell' } });
    setPaperTemplate(editor, null);
    expect(sheetOf(editor)).toBeUndefined();
    expect(typeof off).toBe('function');
  });

  it('the guard leaves every other shape alone, a photo included', () => {
    const editor = makeEditor();
    guardTemplateSheet(editor);
    editor.shapes.set('shape:photo', { id: 'shape:photo', type: 'image', isLocked: true, x: 0, y: 0, meta: {}, props: {} });
    editor.updateShapes([{ id: 'shape:photo', type: 'image', isLocked: false }]);
    expect(editor.shapes.get('shape:photo').isLocked).toBe(false);
  });

  it('showing the sheet is the camera\'s business only, and false when there is none', () => {
    const editor = makeEditor();
    expect(showTemplateSheet(editor)).toBe(false);
    const { shape } = paperSheetRecords('schedule', { x: 50, y: 60 });
    editor.shapes.set(shape.id, { ...shape, isLocked: true });
    expect(showTemplateSheet(editor)).toBe(true);
    expect(editor.zoomToBounds).toHaveBeenCalledWith({ x: 50, y: 60, w: 1000, h: 1400 }, { targetZoom: 1, inset: 16 });
    expect(editor.updateDocumentSettings).not.toHaveBeenCalled();
    expect(showTemplateSheet({ ...editor, isDisposed: true })).toBe(false);
  });
});

describe('the Paper menu\'s Template choice', () => {
  const open = async (user) => {
    await user.click(screen.getByRole('button', { name: 'Paper' }));
    return within(await screen.findByRole('dialog', { name: 'Paper' })).getByRole('group', { name: 'Paper template' });
  };
  const rerenderPicker = (view) => view.rerender(<ThemeProvider theme={createNoteTheme('light')}><PaperPicker /></ThemeProvider>);

  it('sits apart from colour and lines, offering None and the five layouts; dot grid and grid are Lines, not templates', async () => {
    const user = userEvent.setup();
    tl.editor = makeEditor();
    wrap(<PaperPicker />);
    const group = await open(user);
    expect(within(group).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Template: None', 'Template: Schedule', 'Template: Top three', 'Template: Meeting', 'Template: 1:1', 'Template: Cornell',
    ]);
    expect(within(group).getByRole('button', { name: 'Template: None' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getAllByRole('button', { pressed: true })).toHaveLength(1);
    const menu = screen.getByRole('dialog', { name: 'Paper' });
    expect(within(menu).getByRole('group', { name: 'Paper colour' })).toBeInTheDocument();
    const lines = within(menu).getByRole('group', { name: 'Paper lines' });
    expect(within(lines).getByRole('button', { name: 'Lines: Graph' })).toBeInTheDocument();
    expect(within(lines).getByRole('button', { name: 'Lines: Dot grid' })).toBeInTheDocument();
    expect(screen.getByText(/Prints a white sheet into this sketch/)).toBeInTheDocument();
  });

  it('picking one prints the sheet; the menu shows it chosen and says how to take it off', async () => {
    const user = userEvent.setup();
    tl.editor = makeEditor({ paperColor: 'green', paperPattern: 'graph' });
    const view = wrap(<PaperPicker />);
    const group = await open(user);
    await user.click(within(group).getByRole('button', { name: 'Template: Cornell' }));
    expect(sheetOf(tl.editor)).toMatchObject({ isLocked: true, meta: { paperTemplate: 'cornell' } });
    expect(tl.editor.updateDocumentSettings).not.toHaveBeenCalled();
    rerenderPicker(view);
    expect(within(group).getByRole('button', { name: 'Template: Cornell' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: 'Template: None' })).toHaveAttribute('aria-pressed', 'false');
    // The paper is still shown as it was.
    expect(screen.getByRole('button', { name: 'Paper: Engineering green' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Lines: Graph' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/None takes it off/)).toBeInTheDocument();

    await user.click(within(group).getByRole('button', { name: 'Template: None' }));
    expect(sheetOf(tl.editor)).toBeUndefined();
  });

  it('a sheet from a template this build does not know shows no choice pressed, and None still takes it off', async () => {
    const user = userEvent.setup();
    tl.editor = makeEditor();
    const { shape } = paperSheetRecords('meeting');
    tl.editor.shapes.set(shape.id, { ...shape, isLocked: true, meta: { paperTemplate: 'hexagons-from-2031' } });
    wrap(<PaperPicker />);
    const group = await open(user);
    expect(within(group).queryAllByRole('button', { pressed: true })).toHaveLength(0);
    await user.click(within(group).getByRole('button', { name: 'Template: None' }));
    expect(sheetOf(tl.editor)).toBeUndefined();
  });

  it('every choice is a 44px button with a name and a glyph', async () => {
    const user = userEvent.setup();
    tl.editor = makeEditor();
    wrap(<PaperPicker />);
    const group = await open(user);
    for (const b of within(group).getAllByRole('button')) {
      expect(b.tagName).toBe('BUTTON');
      expect(getComputedStyle(b).minHeight).toBe('44px');
      expect(b.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
  });
});
