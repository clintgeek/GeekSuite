/**
 * InkCanvas against a MOCK of tldraw (jsdom cannot run the real canvas). The
 * mock keeps the rules that matter, as NoteGeek's HandwrittenEditor test does:
 * useEditor() only inside <Tldraw>, updateViewportScreenBounds wants a Box,
 * `options`/`components` must keep their identity, store.listen filters by
 * source, and changes made inside mergeRemoteChanges are 'remote'.
 * What real tldraw does with all this was checked in a real browser, not here.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';

const tl = vi.hoisted(() => ({ editors: [], renders: [], exportSketchPng: null }));

vi.mock('./sketchExport', async (importOriginal) => ({
  ...(await importOriginal()),
  exportSketchPng: (...args) => tl.exportSketchPng(...args),
}));

vi.mock('@tldraw/tldraw', async () => {
  const React = await import('react');
  const EditorContext = React.createContext(null);
  class Box {
    constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); }
    equals(o) { return !!o && o.x === this.x && o.y === this.y && o.w === this.w && o.h === this.h; }
  }
  const makeEditor = () => {
    let tool = 'select';
    const editor = {
      records: new Map([['page:page', { id: 'page:page', typeName: 'page' }]]),
      remote: false,
      listeners: [],
      instance: { isReadonly: false, isPenMode: false },
      camera: { x: 5, y: 5, z: 1 },
      cameraOptions: { isLocked: false },
      styles: new Map(),
      emit(source = editor.remote ? 'remote' : 'user') {
        editor.listeners.forEach(({ fn, filter }) => { if (!filter?.source || filter.source === source) fn({ source }); });
      },
      /** A user stroke, as tldraw would record it. */
      draw(id, x = 100, y = 100) {
        editor.records.set(id, { id, typeName: 'shape', type: 'draw', parentId: 'page:page', x, y, rotation: 0, props: { segments: [{ type: 'free', points: [{ x: 0, y: 0 }, { x: 40, y: 10 }, { x: 80, y: 0 }] }] } });
        editor.emit();
      },
      store: {
        listen: vi.fn((fn, filter) => { const l = { fn, filter }; editor.listeners.push(l); return () => { editor.listeners = editor.listeners.filter((x) => x !== l); }; }),
        mergeRemoteChanges: vi.fn((fn) => { editor.remote = true; try { fn(); } finally { editor.remote = false; } }),
        getStoreSnapshot: vi.fn(() => ({ store: Object.fromEntries(editor.records), schema: { schemaVersion: 2 } })),
        allRecords: vi.fn(() => [...editor.records.values()]),
        remove: vi.fn((ids) => { ids.forEach((id) => editor.records.delete(id)); editor.emit(); }),
      },
      history: { clear: vi.fn() },
      sideEffects: { registerBeforeCreateHandler: vi.fn(() => vi.fn()) },
      user: { updateUserPreferences: vi.fn(), getIsDynamicResizeMode: () => false },
      getInstanceState: vi.fn(() => editor.instance),
      updateInstanceState: vi.fn((p) => { editor.instance = { ...editor.instance, ...p }; return editor; }),
      getCameraOptions: vi.fn(() => editor.cameraOptions),
      getCamera: vi.fn(() => editor.camera),
      /** The document record: `meta` is where NoteGeek keeps a sketch's paper, and we keep the template. */
      getDocumentSettings: vi.fn(() => editor.records.get('document:document') || { id: 'document:document', typeName: 'document', meta: {} }),
      updateDocumentSettings: vi.fn((settings) => {
        editor.records.set('document:document', { ...editor.getDocumentSettings(), ...settings });
        editor.emit();
        return editor;
      }),
      getCurrentPageBounds: vi.fn(() => {
        const all = editor.shapes();
        if (!all.length) return undefined;
        return { maxY: Math.max(...all.map((sh) => sh.y + 10)) };
      }),
      setCameraOptions: vi.fn((o) => { editor.cameraOptions = { ...editor.cameraOptions, ...o }; return editor; }),
      setCamera: vi.fn((c, opts) => { if (editor.cameraOptions.isLocked && !opts?.force) return editor; editor.camera = { ...editor.camera, ...c }; return editor; }),
      getZoomLevel: vi.fn(() => editor.camera.z),
      updateViewportScreenBounds: vi.fn((b) => { if (!b || typeof b.equals !== 'function') throw new TypeError('e.equals is not a function'); }),
      setCurrentTool: vi.fn((id) => { tool = id; return editor; }),
      getCurrentToolId: vi.fn(() => tool),
      setStyleForNextShapes: vi.fn((style, value) => { editor.styles.set(style.id, value); return editor; }),
      isIn: vi.fn(() => false),
      complete: vi.fn(() => editor),
      cancel: vi.fn(() => editor),
      mark: vi.fn(() => editor),
      bailToMark: vi.fn(() => editor),
      dispatch: vi.fn(() => editor),
      undo: vi.fn(),
      redo: vi.fn(),
      getCanUndo: vi.fn(() => true),
      getCanRedo: vi.fn(() => false),
      getCurrentPageId: vi.fn(() => 'page:page'),
      shapes: () => [...editor.records.values()].filter((r) => r.typeName === 'shape'),
      getCurrentPageShapes: vi.fn(() => editor.shapes()),
      getCurrentPageShapeIds: vi.fn(() => new Set(editor.shapes().map((s) => s.id))),
      getShapePageBounds: vi.fn((id) => { const s = editor.records.get(id); return s ? { x: s.x, y: s.y, w: 80, h: 10 } : undefined; }),
      // What @geeksuite/ui's placePaperSheet / removePaperSheet call. As in tldraw 2.4.6:
      // a locked shape ignores deleteShapes, and updateShapes may always unlock.
      getShape: vi.fn((id) => { const r = editor.records.get(id); return r?.typeName === 'shape' ? r : undefined; }),
      getAsset: vi.fn((id) => { const r = editor.records.get(id); return r?.typeName === 'asset' ? r : undefined; }),
      batch: vi.fn((fn) => { fn(); return editor; }),
      createAssets: vi.fn((assets) => { assets.forEach((a) => editor.records.set(a.id, a)); editor.emit(); return editor; }),
      createShapes: vi.fn((shapes) => {
        shapes.forEach((sh) => editor.records.set(sh.id, { typeName: 'shape', parentId: 'page:page', rotation: 0, isLocked: false, ...sh }));
        editor.emit();
        return editor;
      }),
      sendToBack: vi.fn(() => editor),
      updateShapes: vi.fn((partials) => {
        partials.forEach((part) => { const sh = editor.records.get(part.id); if (sh) editor.records.set(part.id, { ...sh, ...part }); });
        editor.emit();
        return editor;
      }),
      deleteShapes: vi.fn((ids) => {
        ids.forEach((id) => { if (!editor.records.get(id)?.isLocked) editor.records.delete(id); });
        editor.emit();
        return editor;
      }),
    };
    return editor;
  };
  const Tldraw = ({ onMount, options, components, hideUi, children }) => {
    const [editor] = React.useState(makeEditor);
    const [ready, setReady] = React.useState(false);
    tl.renders.push({ options, components, hideUi });
    React.useLayoutEffect(() => {
      tl.editors.push(editor);
      const off = onMount(editor);
      setReady(true);
      return off;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once, like tldraw
    }, []);
    const Background = components?.Background;
    return (
      <EditorContext.Provider value={editor}>
        <div className="tl-container">
          <div className="tl-canvas" data-testid="canvas">{ready && Background ? <Background /> : null}</div>
          {ready ? children : null}
        </div>
      </EditorContext.Provider>
    );
  };
  return {
    Box,
    Tldraw,
    DefaultColorStyle: { id: 'tldraw:color' },
    DefaultSizeStyle: { id: 'tldraw:size' },
    exportToBlob: vi.fn(),
    getPointerInfo: (e) => ({ point: { x: e.clientX, y: e.clientY }, pointerId: e.pointerId, button: e.button, isPen: e.pointerType === 'pen' }),
    loadSnapshot: vi.fn((store, snapshot) => {
      const editor = tl.editors.find((e) => e.store === store);
      editor.records = new Map(Object.entries(snapshot.store));
      editor.emit();
    }),
    useEditor: () => {
      const editor = React.useContext(EditorContext);
      if (!editor) throw new Error('useEditor must be used inside of the <Tldraw /> or <TldrawEditor /> components');
      return editor;
    },
    useValue: (_name, fn) => fn(),
  };
});

import { paperSheetRecords } from '@geeksuite/ui';
import { InkCanvas, LASSO_EMPTY_HINT, sketchHasShapes } from './index';

const shapeRecord = (id, y = 300) => [id, { id, typeName: 'shape', type: 'draw', parentId: 'page:page', x: 300, y, rotation: 0, props: { segments: [{ type: 'free', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }] }] } }];
const snapshotWith = (...ids) => JSON.stringify({
  store: Object.fromEntries([['page:page', { id: 'page:page', typeName: 'page' }], ...ids.map((id) => shapeRecord(id))]),
  schema: { schemaVersion: 2 },
});
/** A saved page whose document meta is `meta`, with these shapes. */
const snapshotWithMeta = (meta, ...ids) => JSON.stringify({
  store: Object.fromEntries([
    ['document:document', { id: 'document:document', typeName: 'document', meta }],
    ['page:page', { id: 'page:page', typeName: 'page' }],
    ...ids.map((id) => shapeRecord(id)),
  ]),
  schema: { schemaVersion: 2 },
});
const metaOf = (body) => JSON.parse(body).store['document:document']?.meta;

const WIDTH = 800; // zoom 0.8
function mount(props = {}, { mode = 'light' } = {}) {
  const apiRef = { current: null };
  const handlers = { onChange: vi.fn(), onLasso: vi.fn(), onLassoError: vi.fn(), onTouchDrawsChange: vi.fn(), onPanStateChange: vi.fn() };
  const theme = createTheme({ palette: { mode } });
  const ui = (p) => (
    <ThemeProvider theme={theme}>
      <div style={{ position: 'relative' }}><InkCanvas apiRef={apiRef} {...handlers} {...p} /></div>
    </ThemeProvider>
  );
  const view = render(ui(props));
  return { apiRef, ...handlers, editor: tl.editors[tl.editors.length - 1], rerender: (p) => view.rerender(ui({ ...props, ...p })), unmount: view.unmount };
}
const pointer = (el, type, init) => {
  const { pointerId = 1, pointerType = 'mouse', ...mouse } = init;
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...mouse });
  Object.defineProperty(e, 'pointerId', { value: pointerId });
  Object.defineProperty(e, 'pointerType', { value: pointerType });
  act(() => { el.dispatchEvent(e); });
  return e;
};
const wheel = (el, init) => {
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 400, clientY: 500, ...init });
  act(() => { el.dispatchEvent(e); });
  return e;
};
const drag = (el, points, init = {}) => {
  pointer(el, 'pointerdown', { clientX: points[0][0], clientY: points[0][1], ...init });
  points.slice(1).forEach(([x, y]) => pointer(el, 'pointermove', { clientX: x, clientY: y, ...init }));
  const end = points[points.length - 1];
  pointer(el, 'pointerup', { clientX: end[0], clientY: end[1], ...init });
};

describe('InkCanvas (tldraw mocked)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    tl.editors.length = 0;
    tl.renders.length = 0;
    tl.exportSketchPng = vi.fn(async () => ({ base64: 'QUJD', mediaType: 'image/png', tooLong: false }));
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({ left: 0, top: 0, right: WIDTH, bottom: 1000, width: WIDTH, height: 1000, x: 0, y: 0 }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mounts a blank page: pen tool, NoteGeek stroke settings, tldraw UI hidden, stable props', () => {
    const { editor, rerender, onChange } = mount({ content: null });
    expect(screen.getByTestId('ink-canvas')).toHaveAttribute('aria-label', 'Handwriting page');
    expect(editor.getCurrentToolId()).toBe('draw');
    expect(editor.styles.get('tldraw:size')).toBe('s');
    expect(editor.styles.get('tldraw:color')).toBe('black');
    expect(editor.sideEffects.registerBeforeCreateHandler).toHaveBeenCalledWith('shape', expect.any(Function));
    rerender({ content: null });
    expect(tl.renders.every((r) => r.hideUi === true)).toBe(true);
    expect(new Set(tl.renders.map((r) => r.options)).size).toBe(1);
    expect(new Set(tl.renders.map((r) => r.components)).size).toBe(1);
    expect(tl.renders[0].options).toEqual({ maxPointsPerDrawShape: 200 });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('opens at the top of the page, zoomed out: 1000 page units across the container, and tldraw gets a Box', () => {
    const { editor, apiRef, onPanStateChange } = mount();
    act(() => { vi.advanceTimersByTime(250); });
    expect(editor.camera).toEqual({ x: 0, y: 0, z: 0.8 });
    expect(editor.updateViewportScreenBounds).toHaveBeenCalled();
    expect(apiRef.current.view()).toEqual({ x: 0, y: 0, z: 0.8, zoomed: false, pageHeight: 4200 });
    expect(screen.getByTestId('ink-canvas')).toHaveAttribute('data-ink-zoomed', 'false');
    expect(onPanStateChange).toHaveBeenLastCalledWith({ zoomed: false });
    expect(screen.queryByTestId('ink-fit')).toBe(null);
  });

  it('tldraw\'s own camera stays locked: nothing but the page\'s gestures can move it', () => {
    const { editor } = mount();
    expect(editor.cameraOptions).toMatchObject({ isLocked: true, wheelBehavior: 'none' });
    editor.setCamera({ x: 50, y: 50, z: 2 }); // a tldraw pan or zoom: refused by the lock
    expect(editor.camera).toEqual({ x: 0, y: 0, z: 0.8 });
  });

  it('the wheel scrolls the page and stops at its top and its foot', () => {
    const { editor } = mount();
    const canvas = screen.getByTestId('canvas');
    const e = wheel(canvas, { deltaY: 400 });
    expect(e.defaultPrevented).toBe(true);
    expect(editor.camera).toEqual({ x: 0, y: -500, z: 0.8 }); // 400 px at zoom 0.8
    wheel(canvas, { deltaX: 200 });
    expect(editor.camera.x).toBe(0); // zoomed out: the page cannot sit to the side
    wheel(canvas, { deltaY: -100000 });
    expect(editor.camera.y).toBe(0);
    wheel(canvas, { deltaY: 100000 });
    expect(editor.camera.y).toBe(-(4200 - 1000 / 0.8)); // three sheets, less the 1250 units on screen
  });

  it('zooming in is reported, offers Fit, and Fit goes back to the whole width', () => {
    const { editor, onPanStateChange, apiRef } = mount();
    const canvas = screen.getByTestId('canvas');
    wheel(canvas, { deltaY: 300 });
    wheel(canvas, { deltaY: -50, ctrlKey: true });
    expect(editor.camera.z).toBeGreaterThan(0.8 * 1.5);
    expect(onPanStateChange).toHaveBeenLastCalledWith({ zoomed: true });
    expect(screen.getByTestId('ink-canvas')).toHaveAttribute('data-ink-zoomed', 'true');
    for (let i = 0; i < 10; i++) wheel(canvas, { deltaY: -60, ctrlKey: true });
    expect(editor.camera.z).toBeCloseTo(2.4); // three times fit, no further
    const fit = screen.getByTestId('ink-fit');
    expect(fit).toHaveAttribute('aria-label', 'Fit page to width');
    const y = editor.camera.y;
    fireEvent.click(fit);
    expect(editor.camera).toEqual({ x: 0, y, z: 0.8 });
    expect(onPanStateChange).toHaveBeenLastCalledWith({ zoomed: false });
    expect(screen.queryByTestId('ink-fit')).toBe(null);
    for (let i = 0; i < 10; i++) wheel(canvas, { deltaY: 60, ctrlKey: true });
    expect(editor.camera.z).toBe(0.8); // never out past fit
    expect(apiRef.current.view().zoomed).toBe(false);
  });

  it('a finger pans the page once a pen has been seen, and draws nothing; with "Finger draws" on it does not pan', () => {
    localStorage.setItem('geekday:inkPenSeen', '1');
    const { editor, onChange } = mount();
    const canvas = screen.getByTestId('canvas');
    const swipe = () => {
      pointer(canvas, 'pointerdown', { pointerType: 'touch', pointerId: 5, clientX: 300, clientY: 600 });
      pointer(window, 'pointermove', { pointerType: 'touch', pointerId: 5, clientX: 300, clientY: 580 });
      pointer(window, 'pointermove', { pointerType: 'touch', pointerId: 5, clientX: 300, clientY: 500 });
      pointer(window, 'pointerup', { pointerType: 'touch', pointerId: 5, clientX: 300, clientY: 500 });
    };
    swipe();
    expect(editor.camera).toEqual({ x: 0, y: -100, z: 0.8 }); // 80 px at zoom 0.8
    expect(editor.instance.isPenMode).toBe(true); // tldraw ignored the finger
    fireEvent.click(screen.getByTestId('ink-finger-draws'));
    swipe();
    expect(editor.camera.y).toBe(-100);
    expect(editor.instance.isPenMode).toBe(false); // now it is ink
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('the page grows: a whole sheet is always free below the lowest ink', () => {
    const { editor, apiRef } = mount();
    expect(apiRef.current.view().pageHeight).toBe(4200);
    act(() => { editor.draw('shape:a', 100, 2900); }); // on the third sheet
    expect(apiRef.current.view().pageHeight).toBe(5600);
    act(() => { editor.draw('shape:b', 100, 5000); }); // more ink is measured after a moment, not per point
    expect(apiRef.current.view().pageHeight).toBe(5600);
    act(() => { vi.advanceTimersByTime(250); });
    expect(apiRef.current.view().pageHeight).toBe(7000);
    // Erasing does not pull the paper out from under the view.
    act(() => { editor.store.remove(['shape:b']); vi.advanceTimersByTime(250); });
    expect(apiRef.current.view().pageHeight).toBe(7000);
  });

  it('a saved page with ink far down opens tall enough, and at the top', () => {
    const body = JSON.stringify({ store: Object.fromEntries([['page:page', { id: 'page:page', typeName: 'page' }], shapeRecord('shape:low', 6000)]), schema: { schemaVersion: 2 } });
    const { apiRef, editor } = mount({ content: body });
    expect(apiRef.current.view()).toMatchObject({ y: 0, z: 0.8, pageHeight: 8400 });
    wheel(screen.getByTestId('canvas'), { deltaY: 100000 });
    expect(editor.camera.y).toBe(-(8400 - 1250));
  });

  it('a resized pane keeps the top-left of the view and stays on the page', () => {
    const { editor } = mount();
    act(() => { vi.advanceTimersByTime(250); });
    wheel(screen.getByTestId('canvas'), { deltaY: 400 });
    expect(editor.camera).toEqual({ x: 0, y: -500, z: 0.8 });
    Element.prototype.getBoundingClientRect.mockImplementation(() => ({ left: 0, top: 0, right: 500, bottom: 1000, width: 500, height: 1000, x: 0, y: 0 }));
    act(() => { window.dispatchEvent(new Event('scroll')); });
    expect(editor.camera).toEqual({ x: 0, y: -500, z: 0.5 });
  });

  it('loads content as a remote change: never an onChange, never undoable', () => {
    const { editor, onChange, apiRef } = mount({ content: snapshotWith('shape:a') });
    expect(editor.store.mergeRemoteChanges).toHaveBeenCalledTimes(1);
    expect(editor.history.clear).toHaveBeenCalled();
    expect(apiRef.current.hasShapes()).toBe(true);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onChange).not.toHaveBeenCalled();
    expect(apiRef.current.flush()).toBe(null);
  });

  it('a user stroke is saved once, 400 ms after the last edit, as the store snapshot', () => {
    const { editor, onChange } = mount();
    act(() => { editor.draw('shape:a'); });
    act(() => { vi.advanceTimersByTime(300); });
    act(() => { editor.draw('shape:b'); });
    expect(editor.store.getStoreSnapshot).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(399); });
    expect(onChange).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onChange).toHaveBeenCalledTimes(1);
    const body = onChange.mock.calls[0][0];
    expect(sketchHasShapes(body)).toBe(true);
    expect(Object.keys(JSON.parse(body).store)).toEqual(['page:page', 'shape:a', 'shape:b']);
  });

  it('our own save coming back as content is an echo: no reload, even after more ink', () => {
    const { editor, onChange, rerender } = mount();
    act(() => { editor.draw('shape:a'); });
    act(() => { vi.advanceTimersByTime(400); });
    const first = onChange.mock.calls[0][0];
    act(() => { editor.draw('shape:b'); }); // the writer carried on
    rerender({ content: first }); // the parent hands the first save back
    expect(editor.store.mergeRemoteChanges).not.toHaveBeenCalled();
    expect(editor.shapes().map((s) => s.id)).toEqual(['shape:a', 'shape:b']);
    act(() => { vi.advanceTimersByTime(400); });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('content from outside is loaded; null blanks the page; a page shown again is loaded again', () => {
    const { editor, onChange, rerender, apiRef } = mount();
    act(() => { editor.draw('shape:a'); });
    act(() => { vi.advanceTimersByTime(400); });
    const dayA = onChange.mock.calls[0][0];
    rerender({ content: dayA });
    rerender({ content: snapshotWith('shape:other') });
    expect(editor.shapes().map((s) => s.id)).toEqual(['shape:other']);
    rerender({ content: null });
    expect(apiRef.current.hasShapes()).toBe(false);
    rerender({ content: dayA }); // back to the first day: NOT an echo any more
    expect(editor.shapes().map((s) => s.id)).toEqual(['shape:a']);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('an unreadable snapshot shows a blank page rather than the previous one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender, apiRef, onChange } = mount({ content: snapshotWith('shape:a') });
    rerender({ content: '{not json' });
    expect(apiRef.current.hasShapes()).toBe(false);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onChange).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('flush() hands pending ink over now and returns it; unmount and hiding flush too', () => {
    const { editor, onChange, apiRef, unmount } = mount();
    act(() => { editor.draw('shape:a'); });
    let out;
    act(() => { out = apiRef.current.flush(); });
    expect(out).toBe(onChange.mock.calls[0][0]);
    expect(apiRef.current.flush()).toBe(null);
    act(() => { editor.draw('shape:b'); });
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(onChange).toHaveBeenCalledTimes(2);
    visibility.mockRestore();
    act(() => { editor.draw('shape:c'); });
    unmount();
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(apiRef.current).toBe(null);
  });

  it('the toolbar: test ids, labels, aria-pressed, undo and redo', () => {
    const { editor, apiRef } = mount();
    const pen = screen.getByTestId('ink-tool-pen');
    const eraser = screen.getByTestId('ink-tool-eraser');
    const lasso = screen.getByTestId('ink-tool-lasso');
    expect(screen.getByRole('toolbar', { name: 'Ink tools' })).toBeInTheDocument();
    expect(lasso).toHaveAttribute('aria-label', 'Circle to make a task');
    expect(pen).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(eraser);
    expect(editor.getCurrentToolId()).toBe('eraser');
    expect(eraser).toHaveAttribute('aria-pressed', 'true');
    expect(pen).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(lasso);
    expect(lasso).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ink-lasso-layer')).toHaveAttribute('data-active', 'true');
    act(() => { apiRef.current.setTool('pen'); });
    expect(editor.getCurrentToolId()).toBe('draw');
    expect(screen.getByTestId('ink-lasso-layer')).toHaveAttribute('data-active', 'false');
    fireEvent.click(screen.getByTestId('ink-undo'));
    expect(editor.undo).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('ink-redo')).toBeDisabled(); // nothing to redo
    act(() => { apiRef.current.redo(); apiRef.current.undo(); });
    expect(editor.redo).toHaveBeenCalledTimes(1);
    expect(editor.undo).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('ink-undo')).not.toHaveAttribute('aria-pressed');
  });

  it('who draws: a finger until a pen is seen; then only pen and mouse; "Finger draws" turns it back on', () => {
    const { editor, onTouchDrawsChange } = mount();
    const canvas = screen.getByTestId('canvas');
    expect(onTouchDrawsChange).toHaveBeenLastCalledWith(true);
    pointer(canvas, 'pointerdown', { pointerType: 'touch', pointerId: 7 });
    expect(editor.instance.isPenMode).toBe(false); // tldraw lets the finger draw
    pointer(window, 'pointerup', { pointerType: 'touch', pointerId: 7 });

    pointer(canvas, 'pointerdown', { pointerType: 'pen', pointerId: 2 });
    expect(localStorage.getItem('geekday:inkPenSeen')).toBe('1');
    expect(onTouchDrawsChange).toHaveBeenLastCalledWith(false);
    pointer(canvas, 'pointerdown', { pointerType: 'touch', pointerId: 7 });
    expect(editor.instance.isPenMode).toBe(true); // tldraw ignores the finger
    pointer(canvas, 'pointerdown', { pointerType: 'mouse' });
    expect(editor.instance.isPenMode).toBe(false); // the mouse still draws

    const toggle = screen.getByTestId('ink-finger-draws');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('geekday:inkFingerDraws')).toBe('1');
    expect(onTouchDrawsChange).toHaveBeenLastCalledWith(true);
    pointer(canvas, 'pointerdown', { pointerType: 'touch', pointerId: 8 });
    expect(editor.instance.isPenMode).toBe(false);
  });

  it('a second finger takes back the first finger\'s mark and is ignored', () => {
    const { editor } = mount();
    const canvas = screen.getByTestId('canvas');
    pointer(canvas, 'pointerdown', { pointerType: 'touch', pointerId: 1 });
    expect(editor.mark).toHaveBeenCalledTimes(1);
    pointer(canvas, 'pointerdown', { pointerType: 'touch', pointerId: 2 });
    expect(editor.cancel).toHaveBeenCalledTimes(1);
    expect(editor.bailToMark).toHaveBeenCalledWith(editor.mark.mock.calls[0][0]);
    expect(editor.instance.isPenMode).toBe(true);
  });

  it('a device that already has a pen starts with fingers not drawing', () => {
    localStorage.setItem('geekday:inkPenSeen', '1');
    const { onTouchDrawsChange } = mount();
    expect(onTouchDrawsChange).toHaveBeenLastCalledWith(false);
  });

  it('lasso: a loop round a stroke exports just those shapes, calls onLasso, highlights, and returns to the pen', async () => {
    const { editor, onLasso, onChange, apiRef } = mount({ content: snapshotWith('shape:a') }); // stroke at page 300..350, 300
    fireEvent.click(screen.getByTestId('ink-tool-lasso'));
    const layer = screen.getByTestId('ink-lasso-layer');
    // Page (250..400, 250..350) at zoom 0.8 is client (200..320, 200..280).
    drag(layer, [[200, 200], [320, 200], [320, 280], [200, 280]]);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(tl.exportSketchPng).toHaveBeenCalledWith(editor, expect.objectContaining({ ids: ['shape:a'], minShortEdge: 300, exportToBlob: expect.any(Function) }));
    expect(onLasso).toHaveBeenCalledWith({ shapeIds: ['shape:a'], image: { base64: 'QUJD', mediaType: 'image/png' } });
    expect(screen.getByTestId('ink-lasso-highlight')).toBeInTheDocument();
    expect(screen.getByTestId('ink-tool-pen')).toHaveAttribute('aria-pressed', 'true');
    act(() => { apiRef.current.clearLasso(); });
    expect(screen.queryByTestId('ink-lasso-highlight')).toBe(null);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onChange).not.toHaveBeenCalled(); // the loop is never ink
    expect(editor.dispatch).not.toHaveBeenCalled();
  });

  it('lasso: a loop round nothing shows the hint and stays in lasso; a tap picks the stroke under it', async () => {
    const { onLasso } = mount({ content: snapshotWith('shape:a') });
    fireEvent.click(screen.getByTestId('ink-tool-lasso'));
    const layer = screen.getByTestId('ink-lasso-layer');
    drag(layer, [[500, 500], [600, 500], [600, 600], [500, 600]]);
    expect(screen.getByTestId('ink-hint')).toHaveTextContent(LASSO_EMPTY_HINT);
    expect(screen.getByTestId('ink-tool-lasso')).toHaveAttribute('aria-pressed', 'true');
    expect(tl.exportSketchPng).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.getByTestId('ink-hint')).toHaveTextContent('');
    drag(layer, [[260, 242]]); // page (325, 302.5): on the stroke
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(onLasso).toHaveBeenCalledTimes(1);
  });

  it('lasso: a finger that does not draw does not lasso; a failed or unreadable export is reported in plain words', async () => {
    localStorage.setItem('geekday:inkPenSeen', '1');
    const { onLasso, onLassoError } = mount({ content: snapshotWith('shape:a') });
    const loop = [[200, 200], [320, 200], [320, 280], [200, 280]];
    fireEvent.click(screen.getByTestId('ink-tool-lasso'));
    drag(screen.getByTestId('ink-lasso-layer'), loop, { pointerType: 'touch' });
    await act(async () => { await Promise.resolve(); });
    expect(tl.exportSketchPng).not.toHaveBeenCalled();

    const failure = new Error('Could not turn the sketch into an image (no svg).');
    failure.name = 'SketchExportError';
    tl.exportSketchPng = vi.fn(async () => { throw failure; });
    drag(screen.getByTestId('ink-lasso-layer'), loop, { pointerType: 'pen' });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(onLassoError).toHaveBeenLastCalledWith(failure.message);
    expect(screen.queryByTestId('ink-lasso-highlight')).toBe(null);

    tl.exportSketchPng = vi.fn(async () => ({ base64: 'QUJD', mediaType: 'image/png', tooLong: true }));
    fireEvent.click(screen.getByTestId('ink-tool-lasso'));
    drag(screen.getByTestId('ink-lasso-layer'), loop, { pointerType: 'pen' });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(onLassoError).toHaveBeenLastCalledWith(expect.stringMatching(/too much writing/));
    expect(onLasso).not.toHaveBeenCalled();
  });

  it('lasso: the loop and the highlight follow the page when it is scrolled and zoomed', async () => {
    const { editor, onLasso } = mount({ content: snapshotWith('shape:a') }); // stroke at page 300..350, 300
    const canvas = screen.getByTestId('canvas');
    wheel(canvas, { deltaY: 100 }); // camera y -125
    wheel(canvas, { deltaY: -40, ctrlKey: true, clientX: 0, clientY: 0 }); // zoom in about the pane's corner
    const { x, y, z } = editor.camera;
    expect(z).toBeGreaterThan(1);
    const at = (px, py) => [(px + x) * z, (py + y) * z];
    fireEvent.click(screen.getByTestId('ink-tool-lasso'));
    const layer = screen.getByTestId('ink-lasso-layer');
    // The same screen loop as the unscrolled test now circles nothing…
    drag(layer, [[200, 200], [320, 200], [320, 280], [200, 280]]);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(onLasso).not.toHaveBeenCalled();
    // …and the loop drawn where the stroke now is circles it.
    drag(layer, [at(250, 250), at(400, 250), at(400, 350), at(250, 350)]);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(onLasso).toHaveBeenCalledWith(expect.objectContaining({ shapeIds: ['shape:a'] }));
    const box = screen.getByTestId('ink-lasso-highlight');
    expect(Number(box.getAttribute('x'))).toBeCloseTo((300 + x) * z - 6);
    expect(Number(box.getAttribute('y'))).toBeCloseTo((300 + y) * z - 6);
    expect(Number(box.getAttribute('width'))).toBeCloseTo(80 * z + 12);
  });

  describe('paper and templates', () => {
    const openMenu = () => fireEvent.click(screen.getByTestId('ink-page'));
    const pickPaper = (id) => fireEvent.click(screen.getByTestId(`ink-page-${id}`));
    const pickSheet = (id) => fireEvent.click(screen.getByTestId(`ink-sheet-${id}`));
    const canvasAttr = (name) => screen.getByTestId('ink-canvas').getAttribute(name);
    const paper = () => canvasAttr('data-ink-paper');
    const sheet = () => canvasAttr('data-ink-sheet');
    const sheetState = () => canvasAttr('data-ink-sheet-state');
    const SHEET_ID = 'shape:paper-template';
    /** A saved page that already holds a template sheet (as NoteGeek or GeekDay saved it) and these strokes. */
    const snapshotWithSheet = (templateId, { x = 0, y = 0, meta = {} } = {}, ...ids) => {
      const { asset, shape } = paperSheetRecords(templateId, { x, y });
      return JSON.stringify({
        store: Object.fromEntries([
          ['document:document', { id: 'document:document', typeName: 'document', meta }],
          ['page:page', { id: 'page:page', typeName: 'page' }],
          [asset.id, asset],
          [shape.id, { ...shape, typeName: 'shape', parentId: 'page:page', rotation: 0, isLocked: true }],
          ...ids.map((id) => shapeRecord(id)),
        ]),
        schema: { schemaVersion: 2 },
      });
    };
    const storeOf = (body) => JSON.parse(body).store;

    it('a blank day is Ruled with no template; the Page menu lists the papers and the templates separately', () => {
      mount();
      expect(paper()).toBe('none');
      expect(sheet()).toBe('none');
      expect(sheetState()).toBe('none');
      expect(screen.getByTestId('ink-rules')).toBeInTheDocument();
      expect(screen.queryByTestId('ink-pattern')).toBe(null);
      expect(screen.queryByTestId('ink-sheet-preview')).toBe(null);
      const button = screen.getByTestId('ink-page');
      expect(button).toHaveAttribute('aria-label', 'Page');
      expect(button).toHaveAttribute('aria-haspopup', 'menu');
      expect(button).toHaveAttribute('aria-expanded', 'false');
      openMenu();
      expect(button).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('menu', { name: 'Page' })).toBeInTheDocument();
      const items = screen.getAllByRole('menuitemradio');
      expect(items.map((el) => el.getAttribute('data-testid'))).toEqual([
        'ink-page-none', 'ink-page-dots', 'ink-page-grid',
        'ink-sheet-none', 'ink-sheet-schedule', 'ink-sheet-top3', 'ink-sheet-meeting', 'ink-sheet-oneonone', 'ink-sheet-cornell',
      ]);
      expect(items.map((el) => el.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'true', 'false', 'false', 'false', 'false', 'false']);
      expect(screen.getByTestId('ink-page-none')).toHaveAccessibleName(/^Paper: Ruled/);
      expect(screen.getByTestId('ink-sheet-none')).toHaveAccessibleName(/^Template: No template/);
      expect(screen.getByTestId('ink-page-default')).toHaveAttribute('role', 'menuitemcheckbox');
    });

    it('a paper is a background all the way down the page: never a shape, hidden from assistive tech', () => {
      const { editor } = mount();
      openMenu();
      pickPaper('grid');
      expect(paper()).toBe('grid');
      expect(editor.getDocumentSettings().meta).toEqual({ paperTemplate: 'grid' });
      const img = screen.getByTestId('ink-pattern');
      expect(img).toHaveAttribute('alt', '');
      expect(img).toHaveAttribute('aria-hidden', 'true');
      expect(img.style.width).toBe('800px'); // the page's 1000 units at zoom 0.8
      expect(img.style.height).toBe(`${4200 * 0.8}px`); // the whole page, not one sheet
      expect(decodeURIComponent(img.getAttribute('src'))).toContain('viewBox="0 0 1000 4200"');
      expect(img.closest('[data-testid="ink-paper"]')).toHaveAttribute('aria-hidden', 'true');
      expect(screen.queryByTestId('ink-rules')).toBe(null);
      expect(editor.shapes()).toEqual([]);
      pickPaper('none');
      expect(screen.getByTestId('ink-rules')).toBeInTheDocument();
    });

    it('the paper moves and scales with the page', () => {
      const { editor, rerender } = mount();
      openMenu();
      pickPaper('dots');
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
      wheel(screen.getByTestId('canvas'), { deltaY: 200 });
      rerender({}); // the mock's useValue is not reactive; real tldraw re-renders on the camera
      expect(screen.getByTestId('ink-pattern').style.transform).toBe('translate(0px, -200px)');
      wheel(screen.getByTestId('canvas'), { deltaY: -100, ctrlKey: true, clientX: 0, clientY: 0 });
      expect(screen.getByTestId('ink-pattern').style.width).toBe(`${1000 * editor.camera.z}px`);
    });

    it('a paper chosen on a blank day saves nothing by itself; it rides along with the first ink', () => {
      const { editor, onChange, apiRef } = mount();
      openMenu();
      pickPaper('dots');
      act(() => { vi.advanceTimersByTime(1000); });
      expect(onChange).not.toHaveBeenCalled();
      expect(apiRef.current.flush()).toBe(null);
      act(() => { editor.draw('shape:a'); });
      act(() => { vi.advanceTimersByTime(400); });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(metaOf(onChange.mock.calls[0][0])).toEqual({ paperTemplate: 'dots' });
    });

    it('a first stroke that is taken back on a blank day saves nothing either', () => {
      const { editor, onChange } = mount();
      act(() => { editor.draw('shape:a'); });
      act(() => { editor.store.remove(['shape:a']); });
      act(() => { vi.advanceTimersByTime(1000); });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('on a page that already has a note, a paper is saved beside the page\'s other meta', () => {
      const { onChange } = mount({ content: snapshotWithMeta({ paperColor: 'warm', paperPattern: 'lined' }, 'shape:a') });
      openMenu();
      pickPaper('grid');
      act(() => { vi.advanceTimersByTime(400); });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(metaOf(onChange.mock.calls[0][0])).toEqual({ paperColor: 'warm', paperPattern: 'lined', paperTemplate: 'grid' });
      pickPaper('none'); // Ruled, on purpose
      act(() => { vi.advanceTimersByTime(400); });
      expect(metaOf(onChange.mock.calls[1][0]).paperTemplate).toBe('none');
      expect(screen.queryByTestId('ink-pattern')).toBe(null);
    });

    it('a page whose ink was all erased still has a note: a paper chosen on it is saved', () => {
      const { editor, onChange } = mount({ content: snapshotWith('shape:a') });
      act(() => { editor.store.remove(['shape:a']); vi.advanceTimersByTime(400); });
      expect(onChange).toHaveBeenCalledTimes(1);
      openMenu();
      pickPaper('dots');
      act(() => { vi.advanceTimersByTime(400); });
      expect(onChange).toHaveBeenCalledTimes(2);
      expect(metaOf(onChange.mock.calls[1][0])).toEqual({ paperTemplate: 'dots' });
    });

    it('a saved page opens on its own paper, whatever this device\'s default is, and is not rewritten', () => {
      localStorage.setItem('geekday:pageTemplate', 'grid');
      const { onChange } = mount({ content: snapshotWithMeta({ paperTemplate: 'dots' }, 'shape:a') });
      expect(paper()).toBe('dots');
      act(() => { vi.advanceTimersByTime(1000); });
      expect(onChange).not.toHaveBeenCalled();
    });

    it.each(['schedule', 'top3', 'meeting', 'cornell', 'weekly-from-the-future'])(
      'meta that says paperTemplate "%s" and no sheet (last night\'s build, or an unknown id): ruled, no template, and the key is left as it was',
      (id) => {
        localStorage.setItem('geekday:pageTemplate', 'grid');
        localStorage.setItem('geekday:pageSheet', 'meeting');
        const { editor, onChange } = mount({ content: snapshotWithMeta({ paperTemplate: id }, 'shape:a') });
        expect(paper()).toBe('none');
        expect(sheet()).toBe('none');
        expect(canvasAttr('data-ink-light')).toBe('false');
        expect(screen.getByTestId('ink-rules')).toBeInTheDocument();
        expect(screen.queryByTestId('ink-pattern')).toBe(null);
        expect(screen.queryByTestId('ink-sheet-preview')).toBe(null);
        expect(editor.shapes().map((sh) => sh.id)).toEqual(['shape:a']); // no sheet was made for it
        act(() => { vi.advanceTimersByTime(1000); });
        expect(onChange).not.toHaveBeenCalled(); // not rewritten on open
        openMenu();
        expect(screen.getByTestId('ink-page-none')).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByTestId('ink-sheet-none')).toHaveAttribute('aria-checked', 'true');
        pickPaper('none'); // already what is on screen: nothing to write
        act(() => { editor.draw('shape:b'); });
        act(() => { vi.advanceTimersByTime(400); });
        expect(metaOf(onChange.mock.calls[0][0])).toEqual({ paperTemplate: id });
      },
    );

    it('a page written before any of this (ink, nothing stored) stays ruled under any default, and gains no key and no sheet', () => {
      localStorage.setItem('geekday:pageTemplate', 'dots');
      localStorage.setItem('geekday:pageSheet', 'schedule');
      const { editor, onChange } = mount({ content: snapshotWith('shape:a') });
      expect(paper()).toBe('none');
      expect(sheet()).toBe('none');
      act(() => { editor.draw('shape:b'); });
      act(() => { vi.advanceTimersByTime(400); });
      const store = storeOf(onChange.mock.calls[0][0]);
      expect(store['document:document']).toBeUndefined();
      expect(Object.keys(store)).toEqual(['page:page', 'shape:a', 'shape:b']);
    });

    it('a template chosen from the menu is printed into the drawing: one locked sheet at the top of the page, one undo step', () => {
      const { editor } = mount({ content: snapshotWithMeta({ paperTemplate: 'grid' }) });
      openMenu();
      pickSheet('meeting');
      expect(sheet()).toBe('meeting');
      expect(sheetState()).toBe('placed');
      expect(screen.getByTestId('ink-sheet-meeting')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('ink-sheet-none')).toHaveAttribute('aria-checked', 'false');
      const placed = editor.getShape(SHEET_ID);
      expect(placed).toMatchObject({ type: 'image', x: 0, y: 0, isLocked: true, meta: { paperTemplate: 'meeting' }, props: { w: 1000, h: 1400 } });
      expect(editor.getAsset(placed.props.assetId).props.src).toContain('ACTIONS');
      expect(editor.sendToBack).toHaveBeenCalledWith([SHEET_ID]);
      // One history mark, set before anything was changed.
      expect(editor.mark).toHaveBeenCalledTimes(1);
      expect(editor.mark.mock.invocationCallOrder[0]).toBeLessThan(editor.createShapes.mock.invocationCallOrder[0]);
      // The paper is not touched, and is still drawn (it shows below the sheet).
      expect(paper()).toBe('grid');
      expect(editor.getDocumentSettings().meta).toEqual({ paperTemplate: 'grid' });
      expect(screen.getByTestId('ink-pattern')).toBeInTheDocument();
      expect(screen.queryByTestId('ink-sheet-preview')).toBe(null); // the sheet is tldraw's to draw now
      pickSheet('meeting'); // already there: nothing happens
      expect(editor.mark).toHaveBeenCalledTimes(1);
    });

    it('placing a template on a blank day is a choice: it is saved, though there is no ink', () => {
      const { onChange, apiRef } = mount();
      openMenu();
      pickSheet('cornell');
      expect(apiRef.current.hasShapes()).toBe(false); // a sheet is not writing
      act(() => { vi.advanceTimersByTime(400); });
      expect(onChange).toHaveBeenCalledTimes(1);
      const store = storeOf(onChange.mock.calls[0][0]);
      expect(store[SHEET_ID]).toMatchObject({ isLocked: true, meta: { paperTemplate: 'cornell' } });
      expect(store[store[SHEET_ID].props.assetId].typeName).toBe('asset');
    });

    it('a template placed and taken off again before it was saved leaves a blank day: nothing is saved', () => {
      const { onChange, editor } = mount();
      openMenu();
      pickSheet('top3');
      pickSheet('none');
      expect(editor.getShape(SHEET_ID)).toBeUndefined();
      act(() => { vi.advanceTimersByTime(1000); });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('"No template" takes the sheet off a page with no writing as one undo step and saves; the paper is untouched', () => {
      const { editor, onChange } = mount({ content: snapshotWithSheet('schedule', { meta: { paperTemplate: 'dots' } }) });
      expect(sheet()).toBe('schedule');
      expect(sheetState()).toBe('placed');
      openMenu();
      expect(screen.getByTestId('ink-sheet-schedule')).toHaveAttribute('aria-checked', 'true');
      pickSheet('none');
      expect(editor.mark).toHaveBeenCalledTimes(1);
      expect(sheet()).toBe('none');
      expect(editor.shapes()).toEqual([]);
      expect(paper()).toBe('dots');
      act(() => { vi.advanceTimersByTime(400); });
      expect(onChange).toHaveBeenCalledTimes(1);
      const store = storeOf(onChange.mock.calls[0][0]);
      expect(store[SHEET_ID]).toBeUndefined();
      expect(store['document:document'].meta).toEqual({ paperTemplate: 'dots' });
    });

    it('choosing another template replaces the sheet where it is; a paper change never touches it', () => {
      const { editor } = mount({ content: snapshotWithSheet('cornell', { x: 60, y: 1500 }) });
      openMenu();
      pickSheet('top3');
      expect(editor.getShape(SHEET_ID)).toMatchObject({ x: 60, y: 1500, isLocked: true, meta: { paperTemplate: 'top3' } });
      expect(editor.shapes().filter((sh) => sh.type === 'image')).toHaveLength(1);
      const before = editor.getShape(SHEET_ID);
      pickPaper('grid');
      pickPaper('none');
      expect(editor.getShape(SHEET_ID)).toBe(before);
    });

    it('T4: the first mark fixes the template: on a page with writing it cannot be added, swapped or taken off', () => {
      const { editor, onChange } = mount({ content: snapshotWithSheet('cornell', { x: 60, y: 1500 }, 'shape:a') });
      openMenu();
      for (const id of ['none', 'schedule', 'top3', 'meeting', 'oneonone', 'cornell']) {
        expect(screen.getByTestId(`ink-sheet-${id}`)).toHaveAttribute('aria-disabled', 'true');
      }
      expect(screen.getByTestId('ink-sheet-cornell')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('ink-sheet-locked')).toHaveTextContent(/has writing on it, so its template stays/);
      // The papers are not locked.
      expect(screen.getByTestId('ink-page-grid')).not.toHaveAttribute('aria-disabled', 'true');
      pickSheet('top3');
      pickSheet('none');
      expect(editor.getShape(SHEET_ID)).toMatchObject({ x: 60, y: 1500, meta: { paperTemplate: 'cornell' } });
      expect(editor.mark).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(1000); });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('T4: a page with writing and no template cannot be given one; a blank page can', () => {
      const { editor } = mount({ content: snapshotWith('shape:a') });
      openMenu();
      expect(screen.getByTestId('ink-sheet-meeting')).toHaveAttribute('aria-disabled', 'true');
      pickSheet('meeting');
      expect(editor.getShape(SHEET_ID)).toBeUndefined();
      expect(sheet()).toBe('none');
    });

    it('the first stroke locks the template the page has; the menu says so at once', () => {
      const { editor } = mount();
      openMenu();
      pickSheet('meeting');
      expect(screen.queryByTestId('ink-sheet-locked')).toBe(null);
      act(() => { editor.draw('shape:a'); });
      expect(screen.getByTestId('ink-sheet-locked')).toBeInTheDocument();
      pickSheet('none');
      expect(editor.getShape(SHEET_ID)).toMatchObject({ meta: { paperTemplate: 'meeting' } });
    });

    it('a saved page with a sheet opens with it, wherever NoteGeek put it, and is neither moved nor rewritten', () => {
      localStorage.setItem('geekday:pageSheet', 'meeting');
      const { editor, onChange, apiRef } = mount({ content: snapshotWithSheet('cornell', { x: 240, y: 5000 }) });
      expect(sheet()).toBe('cornell');
      expect(sheetState()).toBe('placed');
      expect(editor.getShape(SHEET_ID)).toMatchObject({ x: 240, y: 5000 });
      expect(apiRef.current.view().pageHeight).toBe(7000); // tall enough to reach it
      expect(apiRef.current.hasShapes()).toBe(false);
      act(() => { vi.advanceTimersByTime(1000); });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('a sheet from a newer build (a template this one does not know) is still a sheet: shown, not ink, removable', () => {
      const body = JSON.parse(snapshotWithSheet('cornell'));
      body.store[SHEET_ID].meta = { paperTemplate: 'weekly-from-the-future' };
      const { editor, apiRef } = mount({ content: JSON.stringify(body) });
      expect(sheet()).toBe('weekly-from-the-future');
      expect(canvasAttr('data-ink-light')).toBe('true');
      expect(apiRef.current.hasShapes()).toBe(false);
      openMenu();
      expect(screen.getAllByRole('menuitemradio').filter((el) => el.getAttribute('aria-checked') === 'true').map((el) => el.dataset.testid)).toEqual(['ink-page-none']);
      pickSheet('none');
      expect(editor.getShape(SHEET_ID)).toBeUndefined();
    });

    it('the sheet is not ink: a page that has only a sheet takes its first stroke as first ink, and keeps its paper', () => {
      localStorage.setItem('geekday:pageTemplate', 'dots');
      const { editor, onChange, apiRef } = mount();
      expect(paper()).toBe('dots'); // the device's paper, not yet stored
      openMenu();
      pickSheet('meeting');
      // The page now has content: the paper it was made on is kept with it.
      expect(editor.getDocumentSettings().meta).toEqual({ paperTemplate: 'dots' });
      act(() => { editor.draw('shape:a'); });
      expect(apiRef.current.hasShapes()).toBe(true);
      expect(editor.shapes().filter((sh) => sh.type === 'image')).toHaveLength(1); // not placed twice
      act(() => { vi.advanceTimersByTime(400); });
      expect(Object.keys(storeOf(onChange.mock.calls.at(-1)[0]))).toEqual(expect.arrayContaining([SHEET_ID, 'shape:a']));
    });

    it('the lasso never picks the sheet: a loop over the whole page takes the writing only, and a tap on bare sheet takes nothing', async () => {
      const { editor, onLasso } = mount({ content: snapshotWithSheet('meeting', {}, 'shape:a') }); // stroke at page 300..350, 300
      fireEvent.click(screen.getByTestId('ink-tool-lasso'));
      const layer = screen.getByTestId('ink-lasso-layer');
      drag(layer, [[400, 400]]); // page (500, 500): on the sheet (the mock's bounds put its centre nowhere near)
      expect(screen.getByTestId('ink-hint')).toHaveTextContent(LASSO_EMPTY_HINT);
      // The sheet's own page bounds are never even asked for.
      expect(editor.getShapePageBounds).not.toHaveBeenCalledWith(SHEET_ID);
      drag(layer, [[0, 0], [790, 0], [790, 990], [0, 990]]); // round everything on screen
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(tl.exportSketchPng).toHaveBeenCalledTimes(1);
      expect(tl.exportSketchPng).toHaveBeenCalledWith(editor, expect.objectContaining({ ids: ['shape:a'] }));
      expect(onLasso).toHaveBeenCalledWith(expect.objectContaining({ shapeIds: ['shape:a'] }));
    });

    it('a sheet with nothing written on it cannot be circled at all', () => {
      mount({ content: snapshotWithSheet('meeting') });
      fireEvent.click(screen.getByTestId('ink-tool-lasso'));
      drag(screen.getByTestId('ink-lasso-layer'), [[0, 0], [790, 0], [790, 990], [0, 990]]);
      expect(screen.getByTestId('ink-hint')).toHaveTextContent(LASSO_EMPTY_HINT);
      expect(tl.exportSketchPng).not.toHaveBeenCalled();
    });

    it('a blank day previews this device\'s template and paper, saves nothing, and the first ink prints the sheet for real', () => {
      localStorage.setItem('geekday:pageTemplate', 'dots');
      localStorage.setItem('geekday:pageSheet', 'schedule');
      const { editor, onChange, apiRef, rerender } = mount();
      rerender({}); // the mock's useValue is not reactive; real tldraw re-renders on the camera
      expect(paper()).toBe('dots');
      expect(sheet()).toBe('schedule');
      expect(sheetState()).toBe('preview');
      const preview = screen.getByTestId('ink-sheet-preview');
      expect(preview).toHaveAttribute('alt', '');
      expect(preview).toHaveAttribute('aria-hidden', 'true');
      expect(preview.style.width).toBe('800px');
      expect(preview.style.height).toBe('1120px'); // one sheet
      const svg = decodeURIComponent(preview.getAttribute('src'));
      expect(svg).toContain('<rect width="1000" height="1400" fill="#ffffff"/>'); // the white sheet, as it will be placed
      expect(svg).toContain('6 AM');
      // Shown, not stored: nothing in the document, nothing saved.
      expect(editor.shapes()).toEqual([]);
      expect(editor.getDocumentSettings().meta).toEqual({});
      act(() => { vi.advanceTimersByTime(1000); });
      expect(onChange).not.toHaveBeenCalled();
      expect(apiRef.current.flush()).toBe(null);
      openMenu();
      expect(screen.getByTestId('ink-sheet-schedule')).toHaveAttribute('aria-checked', 'true');
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

      act(() => { editor.draw('shape:a'); });
      expect(sheetState()).toBe('placed');
      expect(sheet()).toBe('schedule');
      expect(screen.queryByTestId('ink-sheet-preview')).toBe(null);
      expect(editor.getShape(SHEET_ID)).toMatchObject({ x: 0, y: 0, isLocked: true, meta: { paperTemplate: 'schedule' } });
      expect(editor.mark).not.toHaveBeenCalled(); // part of the stroke's own undo step
      act(() => { vi.advanceTimersByTime(400); });
      expect(onChange).toHaveBeenCalledTimes(1);
      const store = storeOf(onChange.mock.calls[0][0]);
      expect(store[SHEET_ID].meta).toEqual({ paperTemplate: 'schedule' });
      expect(store['shape:a']).toBeDefined();
      expect(store['document:document'].meta).toEqual({ paperTemplate: 'dots' });
    });

    it('"No template" on a previewed blank day puts the preview away, and still saves nothing', () => {
      localStorage.setItem('geekday:pageSheet', 'meeting');
      const { editor, onChange, rerender } = mount();
      expect(sheetState()).toBe('preview');
      openMenu();
      pickSheet('none');
      expect(sheetState()).toBe('none');
      expect(screen.queryByTestId('ink-sheet-preview')).toBe(null);
      act(() => { editor.draw('shape:a'); });
      expect(editor.getShape(SHEET_ID)).toBeUndefined(); // the first ink prints nothing
      act(() => { vi.advanceTimersByTime(400); });
      expect(onChange).toHaveBeenCalledTimes(1);
      // Another blank day gets the preview again.
      rerender({ content: snapshotWith('shape:x') });
      rerender({ content: null });
      expect(sheetState()).toBe('preview');
    });

    it('choosing the previewed template from the menu places it for real', () => {
      localStorage.setItem('geekday:pageSheet', 'meeting');
      const { editor, onChange } = mount();
      openMenu();
      pickSheet('meeting');
      expect(sheetState()).toBe('placed');
      expect(editor.getShape(SHEET_ID)).toBeDefined();
      act(() => { vi.advanceTimersByTime(400); });
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('the device default never reaches a day that has a note: one with ink, one with a sheet, one erased bare', () => {
      localStorage.setItem('geekday:pageSheet', 'meeting');
      const { rerender, editor, onChange } = mount({ content: snapshotWith('shape:a') });
      expect(sheet()).toBe('none');
      rerender({ content: snapshotWithSheet('cornell') });
      expect(sheet()).toBe('cornell');
      rerender({ content: snapshotWith('shape:b') });
      act(() => { editor.store.remove(['shape:b']); vi.advanceTimersByTime(400); }); // erased bare, and saved so
      expect(sheet()).toBe('none');
      expect(sheetState()).toBe('none');
      expect(editor.getShape(SHEET_ID)).toBeUndefined();
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('"Use for new days" makes the paper and template on screen this device\'s default, and turns it off again', () => {
      const { onChange } = mount();
      openMenu();
      const toggle = screen.getByTestId('ink-page-default');
      expect(toggle).toHaveAttribute('aria-checked', 'true'); // Ruled, no template, is the default until something else is
      pickPaper('dots');
      pickSheet('meeting');
      expect(toggle).toHaveAttribute('aria-checked', 'false');
      expect(toggle).toHaveTextContent('Open new days as Meeting on Dot grid on this device');
      expect(localStorage.getItem('geekday:pageTemplate')).toBe(null);
      expect(localStorage.getItem('geekday:pageSheet')).toBe(null);
      act(() => { vi.advanceTimersByTime(400); });
      const saves = onChange.mock.calls.length;
      fireEvent.click(toggle);
      expect(localStorage.getItem('geekday:pageTemplate')).toBe('dots');
      expect(localStorage.getItem('geekday:pageSheet')).toBe('meeting');
      expect(toggle).toHaveAttribute('aria-checked', 'true');
      fireEvent.click(toggle);
      expect(localStorage.getItem('geekday:pageTemplate')).toBe(null);
      expect(localStorage.getItem('geekday:pageSheet')).toBe('none');
      expect(toggle).toHaveAttribute('aria-checked', 'false');
      expect(paper()).toBe('dots'); // this page keeps its own choices
      expect(sheet()).toBe('meeting');
      act(() => { vi.advanceTimersByTime(1000); });
      expect(onChange).toHaveBeenCalledTimes(saves); // the default is the device's, never the note's
    });

    it('a blank load forgets the previous page\'s paper and sheet', () => {
      const { rerender, editor } = mount({ content: snapshotWithSheet('top3', { meta: { paperTemplate: 'grid' } }, 'shape:a') });
      expect(paper()).toBe('grid');
      expect(sheet()).toBe('top3');
      rerender({ content: null });
      expect(paper()).toBe('none');
      expect(sheet()).toBe('none');
      expect([...editor.records.keys()].filter((id) => /^(shape|asset):/.test(id))).toEqual([]);
    });

    it('a page with a sheet is a light page in the dark theme: tldraw\'s light scheme and the light paper, so dark ink reads on the white sheet', () => {
      const { editor } = mount({ content: snapshotWithSheet('meeting') }, { mode: 'dark' });
      expect(canvasAttr('data-ink-light')).toBe('true');
      expect(editor.user.updateUserPreferences).toHaveBeenLastCalledWith({ colorScheme: 'light' });
      expect(screen.getByTestId('ink-paper').style.backgroundColor).toBe('rgb(255, 252, 245)'); // the diary's light paper
      // Without the sheet the same theme is a dark page again.
      openMenu();
      pickSheet('none');
      expect(canvasAttr('data-ink-light')).toBe('false');
      expect(editor.user.updateUserPreferences).toHaveBeenLastCalledWith({ colorScheme: 'dark' });
      expect(screen.getByTestId('ink-paper').style.backgroundColor).not.toBe('rgb(255, 252, 245)');
    });

    it('a previewed blank day in the dark theme is already a light page', () => {
      localStorage.setItem('geekday:pageSheet', 'top3');
      const { editor } = mount({}, { mode: 'dark' });
      expect(sheetState()).toBe('preview');
      expect(canvasAttr('data-ink-light')).toBe('true');
      expect(editor.user.updateUserPreferences).toHaveBeenLastCalledWith({ colorScheme: 'light' });
    });

    it('readOnly: the page still shows its paper and its sheet, and offers no menu', () => {
      mount({ content: snapshotWithSheet('cornell', { meta: { paperTemplate: 'grid' } }, 'shape:a'), readOnly: true });
      expect(paper()).toBe('grid');
      expect(sheet()).toBe('cornell');
      expect(screen.getByTestId('ink-pattern')).toBeInTheDocument();
      expect(screen.queryByTestId('ink-page')).toBe(null);
    });
  });

  it('readOnly: no toolbar, no lasso layer, nothing saved, tldraw read-only', () => {
    const { editor, onChange, onTouchDrawsChange, apiRef } = mount({ content: snapshotWith('shape:a'), readOnly: true });
    expect(screen.queryByTestId('ink-toolbar')).toBe(null);
    expect(screen.queryByTestId('ink-lasso-layer')).toBe(null);
    expect(editor.instance.isReadonly).toBe(true);
    expect(editor.getCurrentToolId()).toBe('hand');
    expect(onTouchDrawsChange).toHaveBeenLastCalledWith(false);
    act(() => { apiRef.current.setTool('eraser'); });
    expect(editor.getCurrentToolId()).toBe('hand');
    act(() => { editor.emit('user'); vi.advanceTimersByTime(1000); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('follows the app theme: tldraw dark mode in a dark theme', () => {
    const { editor } = mount({}, { mode: 'dark' });
    expect(editor.user.updateUserPreferences).toHaveBeenLastCalledWith({ colorScheme: 'dark' });
  });
});
