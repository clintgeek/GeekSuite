/**
 * InkCanvas.jsx — one day's handwriting page.
 *
 * A trimmed copy of NoteGeek's sketch editor
 * (apps/notegeek/frontend/src/components/editors/HandwrittenEditor.jsx), same
 * library (tldraw 2.4.6), same snapshot format and the same stroke settings,
 * so the day's note opens in NoteGeek as an ordinary sketch. What is kept from
 * it: loading as a remote change, the echo guard and the dirty flag + 400 ms
 * debounce (inkSaver.js), flushing on unmount / hide / pagehide, the viewport
 * bounds update on resize, stable `options`/`components`, the Fine pen, the
 * pen key, the pen button and the two-finger tap.
 *
 * What is different here:
 *   - A tall page, not an infinite canvas (pageCamera.js): 1000 page units
 *     wide, at least three sheets tall, scrolled and zoomed by our own
 *     gestures (pageGestures.js) with tldraw's camera kept locked.
 *   - The paper: ruled lines, dots or a grid, in page space (PagePaper.jsx,
 *     pageTemplate.js). Its id is kept in tldraw's document meta, as NoteGeek
 *     keeps a sketch's paper.
 *   - The template: a layout printed INTO the drawing as one locked image
 *     shape on a white sheet (@geeksuite/ui `placePaperSheet`, shared with
 *     NoteGeek). It is part of the page, not ink: nothing here that asks
 *     "is there writing?" counts it, and the lasso never picks it up.
 *   - Our own pointer rule instead of leaving tldraw's pen mode to itself: the
 *     pen and the mouse always draw; a finger draws only until a pen has been
 *     seen on this device, or when "Finger draws" is on.
 *   - The lasso: a dashed loop in an overlay above tldraw (never a tldraw
 *     shape, so never saved), which hands the circled strokes to the parent as
 *     a PNG (lassoGeometry.js, sketchExport.js).
 *
 * The container is absolutely positioned, inset 0, `touch-action: none`: the
 * parent must be `position: relative` with a definite size and must not put
 * it inside a scrolling element (HANDWRITTEN_EDITOR_MOBILE_FIX.md).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, useTheme } from '@mui/material';
import {
  Box as TlBox, Tldraw, DefaultColorStyle, DefaultSizeStyle,
  exportToBlob, getPointerInfo, loadSnapshot as loadTldrawSnapshot, useEditor, useValue,
} from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import {
  PAPER_SHEET_SHAPE_ID, PAPER_TEMPLATE_META_KEY, isPaperSheetShape, isPaperSheetTemplate, paperSheetOf, paperSheetTemplateOf, placePaperSheet,
  removePaperSheet,
} from '@geeksuite/ui';
import InkToolbar from './InkToolbar';
import { INK_TOOLS } from './inkTools';
import { createInkSaver } from './inkSaver';
import { fineStrokeHandler } from './finePen';
import { attachPenButton } from './penButton';
import { attachPenKey } from './penKey';
import { attachTwoFingerTap } from './twoFingerTap';
import { readFingerDraws, readPenSeen, touchDraws, writeFingerDraws, writePenSeen } from './penPrefs';
import {
  MIN_SHEETS, SHEET_HEIGHT, cameraAfterResize, clampCamera, fitCamera, isZoomedIn, pageBoxToPane, pageHeightFor,
  setPageCamera, topOfPage,
} from './pageCamera';
import { attachPageGestures } from './pageGestures';
import { PagePaper } from './PagePaper';
import { InkPageContext, usePaperColors } from './paperLook';
import {
  NO_SHEET, RULED, paperToKeep, previewSheet, readDevicePaper, readDeviceSheet, resolvePaper, storedTemplate, withPaper,
  writeDevicePaper, writeDeviceSheet,
} from './pageTemplate';
import { lassoSelection, shapeSample, TAP_TOLERANCE } from './lassoGeometry';
import { exportSketchPng, unionBounds, LASSO_MIN_SHORT_EDGE } from './sketchExport';

export const LASSO_EMPTY_HINT = 'Circle some writing to make a task';
export const LASSO_TOO_LONG = 'That is too much writing to read at once. Circle a smaller part.';
export const LASSO_EXPORT_FAILED = 'The circled writing could not be turned into an image. Try again.';
const HINT_MS = 3500;
/** A lasso drag shorter than this many CSS px, end to end, is a tap. */
const TAP_SLOP_PX = 10;
const TOUCH_MARK = 'geekday ink touch';
const SHEET_MARK = 'geekday template';
/** A sheet whose shape carries no template id (it is still a sheet). */
const UNKNOWN_SHEET = 'unknown';

// tldraw 2.4's updateViewportScreenBounds takes a Box and calls .equals() on it.
const screenBoundsOf = (el) => {
  const r = el.getBoundingClientRect();
  return new TlBox(r.left, r.top, Math.max(1, r.width), Math.max(1, r.height));
};

// <Tldraw>'s props must keep their identity across renders: tldraw rebuilds its
// editor when `options` or `components` change.
const TLDRAW_OPTIONS = { maxPointsPerDrawShape: 200 };
const TLDRAW_COMPONENTS = { Background: PagePaper };

/**
 * tldraw's colour scheme follows the app theme: black ink reads light on dark
 * paper. `light`: the page has a template sheet, which is white, so the whole
 * page is light (paperLook.js `usePaperColors`).
 */
function ColorSchemeSync({ light = false }) {
  const editor = useEditor();
  const dark = useTheme().palette.mode === 'dark';
  const mode = dark && !light ? 'dark' : 'light';
  useEffect(() => {
    editor.user.updateUserPreferences({ colorScheme: mode });
  }, [editor, mode]);
  return null;
}

const pathData = (points) => points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');

/** How often the page's height is re-measured while ink is changing. */
const PAGE_SYNC_MS = 200;
const BLANK_PAGE = { paper: RULED, stored: null, hasInk: false, sheet: null, preview: null, pageHeight: SHEET_HEIGHT * MIN_SHEETS };

/** The template id of the page's sheet (the one `placePaperSheet` makes), or null. One lookup. */
function sheetIdOf(editor) {
  const shape = paperSheetOf(editor);
  return shape ? paperSheetTemplateOf(shape) || UNKNOWN_SHEET : null;
}

/**
 * What is on the page: whether it has INK (any shape that is not a template
 * sheet), and its sheet's template id (null when it has none).
 */
function pageContent(editor) {
  const shapes = editor.getCurrentPageShapes?.() || [];
  const sheetShape = paperSheetOf(editor) || shapes.find(isPaperSheetShape) || null;
  return {
    hasInk: shapes.some((shape) => !isPaperSheetShape(shape)),
    sheet: sheetShape ? paperSheetTemplateOf(sheetShape) || UNKNOWN_SHEET : null,
  };
}

/** The writing on the page as lasso samples (lassoGeometry.js). Never the template sheet. */
function pageSamples(editor) {
  const pageId = editor.getCurrentPageId?.();
  return (editor.getCurrentPageShapes?.() || []).filter((shape) => !isPaperSheetShape(shape)).map((shape) => (
    // A stroke directly on the page is its own points. Anything nested in a
    // group or frame (possible if the note was edited in NoteGeek), or any
    // other kind of shape, is the centre of its page bounds.
    shape.parentId === pageId && (shape.type === 'draw' || shape.type === 'highlight')
      ? shapeSample(shape)
      : shapeSample({ id: shape.id }, editor.getShapePageBounds?.(shape.id) || null)
  ));
}

/**
 * The lasso layer: sits above the canvas. While the lasso tool is active it
 * takes the pointer, so tldraw underneath never sees the drag and cannot draw.
 */
function LassoLayer({ active, canDraw, highlight, onFinish, onStart }) {
  const editor = useEditor();
  // The highlight is in page units: it follows the page as it scrolls and zooms.
  const camera = useValue('camera', () => editor.getCamera(), [editor]);
  const layerRef = useRef(null);
  const pathRef = useRef(null);
  const dragRef = useRef(null); // { pointerId, rect, points: [{x, y}] in layer px }

  const setPath = (points) => {
    // The loop is drawn straight to the DOM: no React render per pointer move.
    if (pathRef.current) pathRef.current.setAttribute('d', points.length > 1 ? `${pathData(points)}` : '');
  };
  const pointOf = (e, rect) => ({ x: e.clientX - rect.left, y: e.clientY - rect.top });

  const onPointerDown = (e) => {
    if (!active) return;
    if (dragRef.current) {
      // A second finger: a gesture, not a loop.
      if (e.pointerType === 'touch' && dragRef.current.touch) {
        try { layerRef.current?.releasePointerCapture?.(dragRef.current.pointerId); } catch { /* already released */ }
        dragRef.current = null;
        setPath([]);
      }
      return;
    }
    if (e.pointerType === 'touch' ? !canDraw.touch : e.button !== 0) return;
    const rect = layerRef.current.getBoundingClientRect();
    dragRef.current = { pointerId: e.pointerId, touch: e.pointerType === 'touch', rect, points: [pointOf(e, rect)] };
    try { layerRef.current.setPointerCapture?.(e.pointerId); } catch { /* not capturable: fine */ }
    e.preventDefault();
    e.stopPropagation();
    onStart?.();
    setPath(dragRef.current.points);
  };
  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const p = pointOf(e, drag.rect);
    const last = drag.points[drag.points.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
    drag.points.push(p);
    setPath(drag.points);
  };
  const end = (e, cancelled) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    try { layerRef.current?.releasePointerCapture?.(e.pointerId); } catch { /* already released */ }
    setPath([]);
    if (!cancelled) onFinish(drag.points, drag.rect);
  };

  const pane = highlight?.bounds ? pageBoxToPane(highlight.bounds, camera) : null;
  const box = pane ? { x: pane.x - 6, y: pane.y - 6, w: pane.w + 12, h: pane.h + 12 } : null;

  return (
    <Box
      ref={layerRef}
      data-ink-surface=""
      data-testid="ink-lasso-layer"
      data-active={active ? 'true' : 'false'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => end(e, false)}
      onPointerCancel={(e) => end(e, true)}
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        touchAction: 'none',
        pointerEvents: active ? 'auto' : 'none',
        cursor: active ? 'crosshair' : 'default',
        color: 'primary.main',
      }}
    >
      <svg aria-hidden="true" focusable="false" width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
        {box ? (
          <rect
            data-testid="ink-lasso-highlight"
            x={box.x}
            y={box.y}
            width={Math.max(1, box.w)}
            height={Math.max(1, box.h)}
            rx="8"
            fill="currentColor"
            fillOpacity="0.1"
            stroke="currentColor"
            strokeWidth="2"
          />
        ) : null}
        <path ref={pathRef} d="" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeWidth="2" strokeDasharray="7 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Box>
  );
}

/**
 * @param {object} props
 * @param {string|null} props.content  tldraw snapshot JSON; null or '' is a blank page
 * @param {(content: string) => void} [props.onChange]  debounced, user edits only
 * @param {{current: object|null}} [props.apiRef]  filled with { flush, hasShapes, isReady, exportPage, undo, redo, setTool, clearLasso, setPaper, setSheet, fitPage, view }
 * @param {(lasso: {shapeIds: string[], image: {base64: string, mediaType: 'image/png'}}) => void} [props.onLasso]
 * @param {(message: string) => void} [props.onLassoError]
 * @param {(touchDraws: boolean) => void} [props.onTouchDrawsChange]
 * @param {(state: {zoomed: boolean}) => void} [props.onPanStateChange]  the page is zoomed in (a finger pans it sideways)
 * @param {boolean} [props.readOnly]
 * @param {boolean} [props.autoFocus]  false for a page drawn off-screen to be read (BackgroundReader): it must never take the keyboard
 * @param {string} [props.ariaLabel]
 */
export default function InkCanvas({
  content = null,
  onChange = null,
  apiRef = null,
  onLasso = null,
  onLassoError = null,
  onTouchDrawsChange = null,
  onPanStateChange = null,
  readOnly = false,
  autoFocus = true,
  ariaLabel = 'Handwriting page',
}) {
  // Read live by long-lived listeners, so a new callback never rebuilds anything.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onLassoRef = useRef(onLasso);
  onLassoRef.current = onLasso;
  const onLassoErrorRef = useRef(onLassoError);
  onLassoErrorRef.current = onLassoError;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const initialContentRef = useRef(content);

  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const [editor, setEditor] = useState(null);
  /** The pane's rect when the camera was last fitted to it. */
  const viewportRef = useRef(null);
  const [zoomed, setZoomed] = useState(false);
  const zoomedRef = useRef(false);
  // The page on screen: its paper, its template and its height (PagePaper, the Page menu).
  const [page, setPage] = useState(BLANK_PAGE);
  const pageRef = useRef(page);
  const [deviceDefault, setDeviceDefaultState] = useState(() => ({ paper: readDevicePaper(), sheet: readDeviceSheet() }));
  const deviceDefaultRef = useRef(deviceDefault);
  /** "No template" was chosen on a blank day: the device's template is not previewed on it again. */
  const previewOffRef = useRef(false);
  const pageSyncTimerRef = useRef(null);
  const [tool, setToolState] = useState('pen');
  const [highlight, setHighlight] = useState(null); // { ids, bounds } in page units
  const [hint, setHint] = useState('');
  const hintTimerRef = useRef(null);
  /** Bumped whenever a lasso result must no longer be delivered. */
  const lassoRunRef = useRef(0);
  // The Fine pen is the only pen here: NoteGeek's default line.
  const fineRef = useRef(true);

  const [penSeen, setPenSeen] = useState(() => readPenSeen());
  const [fingerDraws, setFingerDrawsState] = useState(() => readFingerDraws());
  const penSeenRef = useRef(penSeen);
  penSeenRef.current = penSeen;
  const fingerDrawsRef = useRef(fingerDraws);
  fingerDrawsRef.current = fingerDraws;
  const fingerCanDraw = touchDraws({ penSeen, fingerDraws });

  const saverRef = useRef(null);
  if (!saverRef.current) {
    saverRef.current = createInkSaver({
      // A page that has never had a body and has neither ink nor a template
      // sheet is still a blank day: a paper chosen on it (or a stroke that was
      // taken back) must not create a note. The paper is in the document and
      // rides with the first ink. A template PLACED from the menu is in the
      // drawing, so it is saved like ink.
      serialize: () => {
        const { hasInk, sheet } = pageContent(editorRef.current);
        return !hasInk && !sheet && !saverRef.current.hasBody()
          ? ''
          : JSON.stringify(editorRef.current.store.getStoreSnapshot());
      },
      emit: (serialized) => onChangeRef.current?.(serialized),
    });
  }
  const saver = saverRef.current;

  const clearLasso = useCallback(() => {
    lassoRunRef.current += 1;
    setHighlight(null);
  }, []);

  const viewport = useCallback(() => {
    if (viewportRef.current) return viewportRef.current;
    const r = containerRef.current?.getBoundingClientRect();
    return { left: r?.left || 0, top: r?.top || 0, width: r?.width || 0, height: r?.height || 0 };
  }, []);

  /** Every camera move goes through here: tldraw's own camera is locked. */
  const moveCamera = useCallback((camera) => {
    const ed = editorRef.current;
    if (!ed || ed.isDisposed) return;
    setPageCamera(ed, camera);
    const zoomedIn = isZoomedIn(camera, viewport());
    if (zoomedIn !== zoomedRef.current) {
      zoomedRef.current = zoomedIn;
      setZoomed(zoomedIn);
    }
  }, [viewport]);

  /**
   * Read the page back from the document: its paper, its template sheet,
   * whether it has ink, and how tall it is (a sheet counts for the height: it
   * must be reachable wherever NoteGeek put it). The height only grows while a
   * page is open (erasing must not pull the paper out from under the view); a
   * load starts again (`fresh`). `changed`: the caller has already written to
   * `pageRef`, so "same as before" proves nothing; render regardless.
   */
  const syncPage = useCallback((ed, { fresh = false, changed = false } = {}) => {
    if (!ed || ed.isDisposed) return;
    const stored = storedTemplate(ed.getDocumentSettings?.()?.meta);
    const { hasInk, sheet } = pageContent(ed);
    const bounds = hasInk || sheet ? ed.getCurrentPageBounds?.() : null;
    const inkBottom = bounds ? (bounds.maxY ?? (bounds.y || 0) + (bounds.h || 0)) : 0;
    const wanted = pageHeightFor(inkBottom, viewportRef.current);
    const prev = pageRef.current;
    const next = {
      stored,
      hasInk,
      sheet,
      preview: previewSheet({
        hasInk, sheet, hasBody: saverRef.current.hasBody(), dismissed: previewOffRef.current, deviceDefault: deviceDefaultRef.current.sheet,
      }),
      paper: resolvePaper({ stored, hasContent: hasInk || Boolean(sheet), deviceDefault: deviceDefaultRef.current.paper }),
      pageHeight: fresh ? wanted : Math.max(prev.pageHeight, wanted),
    };
    if (!changed && Object.keys(next).every((key) => next[key] === prev[key])) return;
    pageRef.current = next;
    setPage(next);
  }, []);

  /**
   * Tell tldraw where its container is (pointer coordinates), then put the
   * page back in it. `top`: the top of the page, zoomed out (a day opening).
   * Otherwise the pane changed size: keep what was at the top-left there.
   */
  const applyCamera = useCallback(({ top = false } = {}) => {
    const el = containerRef.current;
    const ed = editorRef.current;
    if (!el || !ed || ed.isDisposed) return;
    const r = el.getBoundingClientRect();
    ed.updateViewportScreenBounds(screenBoundsOf(el));
    if (!(r.width > 1)) return;
    const after = { left: r.left, top: r.top, width: r.width, height: r.height };
    const before = viewportRef.current;
    viewportRef.current = after;
    syncPage(ed); // a taller pane may need a taller page
    const height = pageRef.current.pageHeight;
    const camera = top || !before ? topOfPage(after) : cameraAfterResize(ed.getCamera(), before, after, height);
    moveCamera(clampCamera(camera, after, height));
  }, [moveCamera, syncPage]);

  /** Put `body` on the canvas as a load: not an edit, not undoable. */
  const load = useCallback((ed, body) => {
    const blank = () => {
      const ids = ed.store.allRecords().filter((r) => r.typeName === 'shape' || r.typeName === 'asset').map((r) => r.id);
      if (ids.length) ed.store.mergeRemoteChanges(() => ed.store.remove(ids));
      // A blank page has no paper of its own either.
      const meta = ed.getDocumentSettings?.()?.meta;
      if (storedTemplate(meta)) {
        const { [PAPER_TEMPLATE_META_KEY]: _dropped, ...rest } = meta;
        ed.store.mergeRemoteChanges(() => ed.updateDocumentSettings({ meta: rest }));
      }
    };
    try { ed.complete?.(); } catch { /* no stroke in progress */ }
    if (!body) {
      blank();
    } else {
      try {
        const snapshot = JSON.parse(body);
        // As a REMOTE change: the store listener (source 'user') never sees a
        // load, so loading cannot echo back as a save.
        ed.store.mergeRemoteChanges(() => loadTldrawSnapshot(ed.store, snapshot));
      } catch (error) {
        // Never leave another day's ink under a page that failed to load.
        console.warn('InkCanvas - invalid snapshot; showing a blank page.', error);
        blank();
      }
    }
    // Yesterday's strokes must not come back through Undo on today's page.
    ed.history?.clear?.();
    saver.loaded(body);
    previewOffRef.current = false;
    clearLasso();
    clearTimeout(pageSyncTimerRef.current);
    pageSyncTimerRef.current = null;
    syncPage(ed, { fresh: true });
  }, [saver, clearLasso, syncPage]);

  const handleMount = useCallback((ed) => {
    editorRef.current = ed;
    const isReadOnly = readOnlyRef.current;
    ed.updateInstanceState({ isReadonly: isReadOnly });

    // Loading a sketch runs before-create handlers in 2.4.6; fineStrokeHandler
    // only touches a stroke being drawn right now (see finePen.js).
    const offFine = ed.sideEffects.registerBeforeCreateHandler('shape', fineStrokeHandler(ed, fineRef));

    load(ed, initialContentRef.current);

    // Handwriting wants a thin pen: size 's' plus FINE_SCALE on each new
    // stroke, in tldraw's default black, exactly as NoteGeek writes it.
    ed.setCurrentTool(isReadOnly ? 'hand' : 'draw');
    ed.setStyleForNextShapes(DefaultSizeStyle, 's');
    ed.setStyleForNextShapes(DefaultColorStyle, 'black');

    // Document records changed by the user only: not the camera, the pointer
    // or the selection (session), and not a load (remote). It only marks the
    // page dirty; nothing is serialised inside a pointer event.
    const offStore = ed.store.listen(() => {
      if (readOnlyRef.current) return;
      saver.markDirty();
      const was = pageRef.current;
      if (!was.hasInk) {
        const now = pageContent(ed);
        const first = (now.hasInk || now.sheet) && !was.sheet;
        if (first) {
          // Marked first: these writes come straight back through this listener.
          pageRef.current = { ...was, hasInk: now.hasInk, sheet: now.sheet || was.preview, preview: null };
          // The first ink or template: the page keeps the paper it was made
          // on, so a later change of this device's default cannot change it.
          const meta = ed.getDocumentSettings?.()?.meta || {};
          const keep = paperToKeep({ stored: storedTemplate(meta), shown: was.paper });
          if (keep) ed.updateDocumentSettings({ meta: withPaper(meta, keep) });
          // The first ink on a previewed template: print it into the drawing
          // for real, under the stroke, so the saved note has it. No history
          // mark: it belongs to the stroke's own undo step.
          if (now.hasInk && was.preview && !now.sheet) placePaperSheet(ed, was.preview, { x: 0, y: 0 });
        }
        syncPage(ed, { changed: first });
      } else if (sheetIdOf(ed) !== was.sheet) {
        // The template came or went (Undo, Redo): the page changes with it at once.
        syncPage(ed);
      } else if (!pageSyncTimerRef.current) {
        // More ink: the page may need another sheet. Not on every point of a stroke.
        pageSyncTimerRef.current = setTimeout(() => {
          pageSyncTimerRef.current = null;
          syncPage(editorRef.current);
        }, PAGE_SYNC_MS);
      }
    }, { scope: 'document', source: 'user' });

    setEditor(ed);
    applyCamera({ top: true });

    return () => {
      offFine?.();
      offStore?.();
      clearTimeout(pageSyncTimerRef.current);
      pageSyncTimerRef.current = null;
    };
  }, [load, saver, syncPage, applyCamera]);

  // `content` changed. Reload ONLY what came from outside (another day,
  // another device). Our own saves coming back are echoes: reloading one wiped
  // the first stroke of the next word in NoteGeek. Ink still waiting on the
  // debounce belongs to the page being replaced and is dropped here, so the
  // parent flushes (apiRef.flush) before it swaps the page.
  useEffect(() => {
    if (!editor || saver.isOwn(content)) return;
    load(editor, content);
    applyCamera({ top: true });
  }, [content, editor, load, saver, applyCamera]);

  useEffect(() => {
    if (!editor) return;
    editor.updateInstanceState({ isReadonly: readOnly });
    if (readOnly) {
      editor.setCurrentTool('hand');
      setToolState('pen');
    } else if (editor.getCurrentToolId() === 'hand') {
      editor.setCurrentTool('draw');
    }
  }, [editor, readOnly]);

  // The viewport: tldraw must know where its container is, and the page zoom
  // follows the container's width (rotation, split screen, a resized window).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !editor) return undefined;
    let frame = 0;
    const now = () => applyCamera();
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(now);
    };
    const observer = new ResizeObserver(later);
    observer.observe(el);
    window.addEventListener('scroll', now, { passive: true });
    window.addEventListener('orientationchange', later);
    now();
    // Late layout shifts (fonts, a sibling that grows).
    const t1 = setTimeout(now, 50);
    const t2 = setTimeout(now, 200);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', now);
      window.removeEventListener('orientationchange', later);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [editor, applyCamera]);

  // Who draws. A capture-phase listener, so it runs before tldraw's own
  // handler reads `isPenMode` (in pen mode tldraw ignores every non-pen press):
  //   pen    always draws, and is remembered: this device has a pen
  //   mouse  always draws (pen mode is lifted for the press)
  //   touch  draws only when no pen has been seen, or "Finger draws" is on
  // Nothing is stopped: a finger that does not draw still reaches the parent.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !editor || readOnly) return undefined;
    const touches = new Set(); // fingers down on the canvas while a finger draws
    const onDown = (e) => {
      if (e.pointerType === 'pen' && !penSeenRef.current) {
        penSeenRef.current = true;
        writePenSeen();
        setPenSeen(true);
      }
      let want = e.pointerType !== 'mouse' && !touchDraws({ penSeen: penSeenRef.current, fingerDraws: fingerDrawsRef.current });
      // A second finger while the first is drawing is a gesture (a pinch, the
      // two-finger tap), not writing: tldraw keeps a stroke that is being
      // dragged when it is interrupted, so the first finger's mark is taken
      // back here and the second finger's press is ignored.
      if (e.pointerType === 'touch' && !want && e.target?.closest?.('.tl-canvas')) {
        if (touches.size === 0) {
          editor.mark(TOUCH_MARK);
        } else {
          if (touches.size === 1) {
            editor.cancel();
            editor.bailToMark(TOUCH_MARK);
          }
          want = true;
        }
        touches.add(e.pointerId);
      }
      if (Boolean(editor.getInstanceState().isPenMode) !== want) editor.updateInstanceState({ isPenMode: want });
    };
    const onLift = (e) => { touches.delete(e.pointerId); };
    const win = el.ownerDocument?.defaultView || window;
    el.addEventListener('pointerdown', onDown, { capture: true });
    win.addEventListener('pointerup', onLift, { capture: true });
    win.addEventListener('pointercancel', onLift, { capture: true });
    // A pen that does report a held button erases with it; an eraser end erases.
    const detachPen = attachPenButton(el, () => editorRef.current, { getPointerInfo });
    const detachTap = attachTwoFingerTap(el, () => editorRef.current?.undo());
    // The Lenovo pen's button, double-clicked, arrives as a key: undo.
    const detachKey = attachPenKey(el.ownerDocument?.defaultView, () => editorRef.current);
    return () => {
      el.removeEventListener('pointerdown', onDown, { capture: true });
      win.removeEventListener('pointerup', onLift, { capture: true });
      win.removeEventListener('pointercancel', onLift, { capture: true });
      detachPen();
      detachTap();
      detachKey();
    };
  }, [editor, readOnly]);

  // Moving the page: wheel, one finger when fingers do not draw, two fingers always.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !editor) return undefined;
    return attachPageGestures(el, {
      getCamera: () => editor.getCamera(),
      setCamera: moveCamera,
      getViewport: viewport,
      getPageHeight: () => pageRef.current.pageHeight,
      fingerPans: () => readOnlyRef.current || !touchDraws({ penSeen: penSeenRef.current, fingerDraws: fingerDrawsRef.current }),
    });
  }, [editor, moveCamera, viewport]);

  // tldraw gives an image shape's <img> no alt, so a screen reader would
  // announce the sheet as an unnamed picture. It is printed stationery, not
  // content: marked decorative, as the paper is.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !editor || !page.sheet) return undefined;
    const mark = () => {
      el.querySelectorAll(`[id="${PAPER_SHEET_SHAPE_ID}"] img:not([alt])`).forEach((img) => img.setAttribute('alt', ''));
    };
    mark();
    const observer = new MutationObserver(mark);
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [editor, page.sheet]);

  const onPanStateChangeRef = useRef(onPanStateChange);
  onPanStateChangeRef.current = onPanStateChange;
  useEffect(() => {
    onPanStateChangeRef.current?.({ zoomed });
  }, [zoomed]);

  const fitPage = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    moveCamera(fitCamera(ed.getCamera(), viewport(), pageRef.current.pageHeight));
  }, [moveCamera, viewport]);

  /** Choose this page's paper. Stored with the page, like NoteGeek's paper. Never touches a template. */
  const setPaper = useCallback((id) => {
    const ed = editorRef.current;
    if (!ed || readOnlyRef.current) return;
    // Already the paper on screen (which may be how an id from another build
    // is drawn): nothing to write.
    if (id !== pageRef.current.paper || !pageRef.current.stored) {
      const meta = ed.getDocumentSettings?.()?.meta || {};
      const next = withPaper(meta, id);
      if (storedTemplate(meta) !== storedTemplate(next)) ed.updateDocumentSettings({ meta: next });
    }
    syncPage(ed);
  }, [syncPage]);

  /**
   * Choose this page's template: print its sheet into the drawing, or (for
   * NO_SHEET) take the sheet off. One undo step, saved like ink. A sheet that
   * is replaced keeps its place; a new one is the first sheet of the page.
   */
  const setSheet = useCallback((id) => {
    const ed = editorRef.current;
    if (!ed || readOnlyRef.current) return;
    const current = paperSheetOf(ed);
    if (id === NO_SHEET) {
      // On a blank day there is only a preview to put away; nothing is saved.
      previewOffRef.current = true;
      if (current) {
        try { ed.complete?.(); } catch { /* nothing in progress */ }
        ed.mark(SHEET_MARK);
        removePaperSheet(ed);
      }
    } else if (isPaperSheetTemplate(id) && paperSheetTemplateOf(current) !== id) {
      try { ed.complete?.(); } catch { /* nothing in progress */ }
      ed.mark(SHEET_MARK);
      placePaperSheet(ed, id, current ? { x: current.x, y: current.y } : { x: 0, y: 0 });
    }
    syncPage(ed);
  }, [syncPage]);

  /** This device's page for new days (and for this one, while it is blank and never chose). */
  const setDeviceDefault = useCallback(({ paper, sheet }) => {
    writeDevicePaper(paper);
    writeDeviceSheet(sheet);
    const now = { paper: readDevicePaper(), sheet: readDeviceSheet() };
    deviceDefaultRef.current = now;
    setDeviceDefaultState(now);
    syncPage(editorRef.current);
  }, [syncPage]);

  const onTouchDrawsChangeRef = useRef(onTouchDrawsChange);
  onTouchDrawsChangeRef.current = onTouchDrawsChange;
  useEffect(() => {
    onTouchDrawsChangeRef.current?.(fingerCanDraw && !readOnly);
  }, [fingerCanDraw, readOnly]);

  const setFingerDraws = useCallback((on) => {
    writeFingerDraws(on);
    setFingerDrawsState(Boolean(on));
  }, []);

  const setTool = useCallback((next) => {
    const ed = editorRef.current;
    if (!ed || readOnlyRef.current || !INK_TOOLS.includes(next)) return;
    try { ed.complete?.(); } catch { /* nothing in progress */ }
    // Under the lasso the tldraw tool stays what it was; the layer above
    // takes the pointer, so it cannot draw.
    if (next !== 'lasso') ed.setCurrentTool(next === 'eraser' ? 'eraser' : 'draw');
    setToolState(next);
  }, []);

  const showHint = useCallback((message) => {
    setHint(message);
    clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setHint(''), HINT_MS);
  }, []);
  useEffect(() => () => clearTimeout(hintTimerRef.current), []);

  const finishLasso = useCallback(async (points) => {
    const ed = editorRef.current;
    if (!ed) return;
    // Layer px to page units, with the camera as it is now: the page may be
    // scrolled and zoomed. (The layer fills the container, as the canvas does.)
    const camera = ed.getCamera();
    const z = camera.z || 1;
    const path = points.map((p) => ({ x: p.x / z - camera.x, y: p.y / z - camera.y }));
    // The template sheet is not among the samples, so it is never circled,
    // never tapped, and never in the crop that is sent to be read.
    const ids = lassoSelection(pageSamples(ed), path, {
      tapSlop: TAP_SLOP_PX / z,
      tapTolerance: Math.max(TAP_TOLERANCE, 16 / z),
    });
    if (!ids.length) {
      showHint(LASSO_EMPTY_HINT);
      return;
    }
    const bounds = unionBounds(ids.map((id) => ed.getShapePageBounds(id)));
    lassoRunRef.current += 1;
    const run = lassoRunRef.current;
    setHint('');
    setHighlight({ ids, bounds });
    setTool('pen');
    try {
      const out = await exportSketchPng(ed, { exportToBlob, ids, minShortEdge: LASSO_MIN_SHORT_EDGE });
      if (run !== lassoRunRef.current) return; // cleared, or the page changed, while exporting
      if (out.tooLong || !out.base64) {
        setHighlight(null);
        onLassoErrorRef.current?.(out.tooLong ? LASSO_TOO_LONG : LASSO_EXPORT_FAILED);
        return;
      }
      onLassoRef.current?.({ shapeIds: ids, image: { base64: out.base64, mediaType: 'image/png' } });
    } catch (error) {
      if (run !== lassoRunRef.current) return;
      setHighlight(null);
      onLassoErrorRef.current?.(error?.name === 'SketchExportError' && error.message ? error.message : LASSO_EXPORT_FAILED);
    }
  }, [setTool, showHint]);

  const api = useMemo(() => ({
    /** Serialise pending ink now. Calls onChange with it AND returns it; null when nothing was pending. */
    flush: () => (editorRef.current ? saver.flush() : null),
    /** Is there any writing? A template sheet is not writing. */
    hasShapes: () => Boolean(editorRef.current && pageContent(editorRef.current).hasInk),
    /** Has tldraw mounted and loaded the page? */
    isReady: () => Boolean(editorRef.current),
    /**
     * The whole page's writing as the image a model reads (the background
     * reader): never the template sheet, whose printed words are not the
     * writer's. Null when there is no writing.
     */
    exportPage: async () => {
      const ed = editorRef.current;
      if (!ed) return null;
      const ids = [...ed.getCurrentPageShapeIds()].filter((id) => !isPaperSheetShape(ed.getShape(id)));
      if (!ids.length) return null;
      return exportSketchPng(ed, { exportToBlob, ids });
    },
    undo: () => { editorRef.current?.undo(); },
    redo: () => { editorRef.current?.redo(); },
    setTool,
    clearLasso,
    setPaper,
    setSheet,
    fitPage,
    /** Where the page is: `{ x, y, z, zoomed, pageHeight }` (page units; see pageCamera.js). */
    view: () => {
      const camera = editorRef.current?.getCamera();
      return camera ? { x: camera.x, y: camera.y, z: camera.z, zoomed: zoomedRef.current, pageHeight: pageRef.current.pageHeight } : null;
    },
  }), [saver, setTool, clearLasso, setPaper, setSheet, fitPage]);

  useEffect(() => {
    if (!apiRef) return undefined;
    apiRef.current = api;
    return () => { if (apiRef.current === api) apiRef.current = null; };
  }, [apiRef, api]);

  // The app is hidden or the page is going away: save the pending strokes
  // now, not 400 ms from now — Android may freeze the PWA first.
  useEffect(() => {
    const flush = () => { if (editorRef.current) saver.flush(); };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      // Unmount: the pending strokes are handed over, never dropped.
      flush();
      saver.dispose();
    };
  }, [saver]);

  // The template on screen, placed or previewed; and with one, the page is light (paperLook.js).
  const sheetShown = page.sheet || page.preview || NO_SHEET;
  const light = sheetShown !== NO_SHEET;
  const paperColors = usePaperColors(light);
  const pageContext = useMemo(
    () => ({ paper: page.paper, preview: page.preview, light, pageHeight: page.pageHeight }),
    [page.paper, page.preview, light, page.pageHeight],
  );

  return (
    <Box
      ref={containerRef}
      role="group"
      aria-label={ariaLabel}
      data-testid="ink-canvas"
      data-ink-tool={tool}
      data-ink-ready={editor ? 'true' : 'false'}
      data-ink-zoomed={zoomed ? 'true' : 'false'}
      data-ink-paper={page.paper}
      data-ink-sheet={sheetShown}
      data-ink-sheet-state={page.sheet ? 'placed' : page.preview ? 'preview' : 'none'}
      data-ink-light={light ? 'true' : 'false'}
      sx={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        touchAction: 'none',
        bgcolor: paperColors.paper,
        '& .tl-container': { position: 'absolute !important', inset: '0 !important' },
      }}
    >
      <InkPageContext.Provider value={pageContext}>
      <Tldraw onMount={handleMount} hideUi autoFocus={autoFocus} components={TLDRAW_COMPONENTS} options={TLDRAW_OPTIONS}>
        <ColorSchemeSync light={light} />
        {!readOnly && editor ? (
          <>
            <LassoLayer
              active={tool === 'lasso'}
              canDraw={{ touch: fingerCanDraw }}
              highlight={highlight}
              onStart={clearLasso}
              onFinish={finishLasso}
            />
            <Box
              role="status"
              aria-live="polite"
              data-testid="ink-hint"
              sx={{
                position: 'absolute',
                left: '50%',
                bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))',
                transform: 'translateX(-50%)',
                zIndex: 100,
                pointerEvents: 'none',
                maxWidth: 'calc(100% - 32px)',
                ...(hint
                  ? {
                    px: 1.5,
                    py: 0.75,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    color: 'text.primary',
                    typography: 'body2',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
                  }
                  : null),
              }}
            >
              {hint}
            </Box>
            <InkToolbar
              tool={tool}
              onTool={setTool}
              fingerDraws={fingerDraws}
              onFingerDrawsChange={setFingerDraws}
              penMode={!fingerCanDraw}
              paper={page.paper}
              sheet={sheetShown}
              deviceDefault={deviceDefault}
              onPaper={setPaper}
              onSheet={setSheet}
              onDeviceDefault={setDeviceDefault}
              zoomed={zoomed}
              onFit={fitPage}
            />
          </>
        ) : null}
      </Tldraw>
      </InkPageContext.Provider>
    </Box>
  );
}
