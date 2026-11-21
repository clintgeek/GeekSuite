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

import { InkCanvas, LASSO_EMPTY_HINT, sketchHasShapes } from './index';

const snapshotWith = (...ids) => JSON.stringify({
  store: Object.fromEntries([['page:page', { id: 'page:page', typeName: 'page' }], ...ids.map((id) => [id, { id, typeName: 'shape', type: 'draw', parentId: 'page:page', x: 300, y: 300, rotation: 0, props: { segments: [{ type: 'free', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }] }] } }])]),
  schema: { schemaVersion: 2 },
});

const WIDTH = 800; // zoom 0.8
function mount(props = {}, { mode = 'light' } = {}) {
  const apiRef = { current: null };
  const handlers = { onChange: vi.fn(), onLasso: vi.fn(), onLassoError: vi.fn(), onTouchDrawsChange: vi.fn() };
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

  it('locks the camera to the page: 1000 page units across the container, and tldraw gets a Box', () => {
    const { editor } = mount();
    act(() => { vi.advanceTimersByTime(250); });
    expect(editor.cameraOptions).toMatchObject({ isLocked: true, wheelBehavior: 'none' });
    expect(editor.camera).toEqual({ x: 0, y: 0, z: 0.8 });
    expect(editor.updateViewportScreenBounds).toHaveBeenCalled();
    // An unforced move (a pan, a zoom) is refused by the lock.
    editor.setCamera({ x: 50, y: 50, z: 2 });
    expect(editor.camera).toEqual({ x: 0, y: 0, z: 0.8 });
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
