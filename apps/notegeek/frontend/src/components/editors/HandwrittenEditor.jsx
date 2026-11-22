import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircularProgress, Box, Snackbar, useTheme } from '@mui/material';
import {
    Box as TlBox, Tldraw, DefaultSizeStyle, AssetRecordType,
    exportToBlob, getPointerInfo, loadSnapshot as loadTldrawSnapshot, useEditor, useValue,
} from '@tldraw/tldraw';
import { attachPenButton } from '../../utils/penButton';
import { attachPenKey } from '../../utils/penKey';
import { exportSketchPng, exportSketchForPrint, PRINT_MAX_EDGE } from '../../utils/sketchExport';
import { fineStrokeHandler } from '../../utils/finePen';
import { isInkEdit } from '../../utils/inkEdit';
import { attachTwoFingerTap } from '../../utils/twoFingerTap';
import {
    readBarPosition, writeBarPosition, readCamera, writeCamera,
    readFingerDraws, writeFingerDraws, readPenSeen, writePenSeen,
} from '../../utils/penPrefs';
import { SKETCH_IMAGE_INPUT_MAX_BYTES, SKETCH_IMAGE_MAX_EDGE, sketchImageHandler } from '../../utils/sketchImages';
import { isPaperSheetShape, isPaperSheetTemplate, placePaperSheet } from '@geeksuite/ui';
import { paperFromMeta, readDevicePaper } from './paperModel';
import { hasInk as pageHasInk, guardTemplateSheet, showTemplateSheet } from './usePaper';
import { SketchPortalContext } from './sketchPortal';

// tldraw 2.4's updateViewportScreenBounds takes a Box and calls .equals() on
// it. Passed the container element, as this file used to, it threw on every
// resize and scroll, so the viewport's bounds were never updated.
const screenBoundsOf = (el) => {
    const r = el.getBoundingClientRect();
    return new TlBox(r.left, r.top, Math.max(1, r.width), Math.max(1, r.height));
};
import '@tldraw/tldraw/tldraw.css';
import EditorErrorBoundary from './EditorErrorBoundary';
import { surfaces } from '../../theme/tokens';
import DrawingToolbar from './DrawingToolbar';
import { PaperBackground, PaperSync } from './Paper';

const SAVE_DEBOUNCE_MS = 400;
/** How long the camera must rest before it is remembered for this sketch. */
const CAMERA_SAVE_MS = 600;
/** Our own recent saves, recognised when they come back as `content`. */
const ECHOES_KEPT = 3;

// <Tldraw>'s props must keep their identity across renders. tldraw rebuilds
// its editor when `options` or `components` change, so objects built inline
// made every re-render (each autosave marks the page dirty) re-create the
// canvas and run onMount again. That stacked another store listener each time
// and left the strokes the writer was drawing with no listener that saved them.
const TLDRAW_OPTIONS = {
    // Improve touch responsiveness
    maxPointsPerDrawShape: 200,
};
// tldraw's own UI is hidden at every size: the sketch uses our DrawingToolbar
// (./DrawingToolbar.jsx) — the phone's short bar, and on tablet/desktop the
// same single bar with every tool (Chef, 2026-11-14).
const HIDDEN_TLDRAW_COMPONENTS = {
    Toolbar: null,           // Hide default toolbar (we have custom)
    StylePanel: null,        // Hide style panel
    NavigationPanel: null,   // Hide navigation/zoom
    PageMenu: null,          // Hide page menu
    ActionsMenu: null,       // Hide actions menu
    HelpMenu: null,          // Hide help menu
    DebugMenu: null,         // Hide debug menu
    SharePanel: null,        // Hide share panel
    Background: PaperBackground, // the sketch's paper colour and ruling (Paper.jsx)
};

/**
 * A photo sketch note (DOCS/HANDWRITING.md §3) opens with its first page in
 * view, instead of the camera's default of 100% at the page's top-left
 * corner (a third of a photo on a phone). Camera only: the camera is session
 * state, never in the saved document, so this cannot mark the sketch dirty.
 * Ordinary sketches (no image shapes) are left exactly as before.
 *
 * It must run AFTER the viewport has its real size: until our first
 * `updateViewportScreenBounds`, tldraw assumes a 1080×720 viewport, and a
 * fit computed then lands at 100% and off to one side once the real bounds
 * arrive (seen in the harness). So loading only marks the fit as pending, and
 * the bounds update performs it, once.
 */
// A template sheet is an image shape too, and is not a photo.
const firstPhotoShape = (editor) => (editor.getCurrentPageShapesSorted?.() || []).find((s) => s.type === 'image' && !isPaperSheetShape(s));

function fitFirstPhotoPage(editor) {
    if (!editor || editor.isDisposed) return false;
    const shape = firstPhotoShape(editor);
    const bounds = shape && editor.getShapePageBounds?.(shape);
    if (!bounds) return false;
    editor.zoomToBounds?.(bounds, { targetZoom: 1, inset: 32 });
    return true;
}

/**
 * The first view of a saved sketch (review 2.11): where the writer left it on
 * this device, or else the whole page in view (never past 100%). A photo
 * note's first page as before; a sketch with a page template, its sheet.
 * Camera only — never the document.
 */
function applyFirstView(editor, noteId) {
    if (!editor || editor.isDisposed) return;
    const saved = readCamera(noteId);
    if (saved && editor.setCamera) {
        editor.setCamera(saved);
        return;
    }
    if (fitFirstPhotoPage(editor)) return;
    // A sketch with a template sheet (DOCS/TEMPLATES_SPEC.md T7) opens on
    // it, full width from the top, not zoomed in on the ink alone.
    if (showTemplateSheet(editor)) return;
    const bounds = editor.getCurrentPageBounds?.();
    if (bounds) editor.zoomToBounds?.(bounds, { targetZoom: 1, inset: 32 });
}

/**
 * Pen mode (tldraw's palm rejection: the pen draws, fingers pan) from the
 * first touch on a device that has had a pen, instead of from the first pen
 * stroke of every visit (review 2.3). "Finger draws" keeps it off.
 */
function PenModeSync({ fingerDraws }) {
    const editor = useEditor();
    const penMode = useValue('pen mode', () => Boolean(editor.getInstanceState?.()?.isPenMode), [editor]);
    useEffect(() => {
        if (fingerDraws && penMode) editor.updateInstanceState?.({ isPenMode: false });
        else if (!fingerDraws && !penMode && readPenSeen()) editor.updateInstanceState?.({ isPenMode: true });
    }, [editor, fingerDraws, penMode]);
    return null;
}

/**
 * `sketchApiRef` (optional): filled with `{ exportPng, exportForPrint,
 * hasShapes, flush }` once the editor mounts, so the page can export this
 * sketch for "Convert handwriting to text" without importing tldraw itself
 * (this file is lazy-loaded; the page is not). Cleared on unmount.
 *
 * `flush()` serialises any strokes still waiting on the 400 ms debounce,
 * hands them to `setContent`, and returns the string (or null when nothing
 * was pending) — for the page's own save on hide/unmount (review 1.2).
 *
 * `noteId` (optional): the camera is remembered per sketch on this device.
 */
const HandwrittenEditor = ({ content, setContent, readOnly = false, sketchApiRef = null, onInkEdit = null, noteId = null, startSheet = null, autoFocus = true }) => {
    // `autoFocus={false}`: a sketch drawn off-screen to be read (BackgroundReader) must never take the keyboard.
    // The sheet a brand-new sketch starts on (a 1:1, DOCS/ONE_ON_ONE_SPEC.md req 2).
    const startSheetRef = useRef(startSheet);
    startSheetRef.current = startSheet;
    // Read live by the store listener, so a new callback never rebuilds anything.
    const onInkEditRef = useRef(onInkEdit);
    onInkEditRef.current = onInkEdit;
    const setContentRef = useRef(setContent);
    setContentRef.current = setContent;
    const noteIdRef = useRef(noteId);
    noteIdRef.current = noteId;
    const editorRef = useRef(null);
    const unsubscribeRef = useRef(null);
    const cameraUnsubscribeRef = useRef(null);
    const cameraTimerRef = useRef(null);
    // Saving (review 2.1): the store listener only marks the sketch dirty;
    // the snapshot is serialised once, when the 400 ms debounce fires.
    const dirtyRef = useRef(false);
    // The last body known to match the canvas (loaded, or handed to setContent).
    const lastKnownRef = useRef(content || '');
    // Our own recent saves: when one of them comes back as `content`, it is
    // an echo, never a reason to reload (review 1.17).
    const emittedRef = useRef([]);
    const saveTimeoutRef = useRef(null);
    const containerRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    // The Fine pen: a ref the side effect reads live, and state for the
    // picker. Editor state only — it never goes into the saved document.
    // On by default: new sketches start on Fine, the smallest line (Chef,
    // 2026-11-16 — Small was the default for two days and wrote too fat).
    const fineRef = useRef(true);
    const [penFine, setPenFineState] = useState(true);
    const setPenFine = useCallback((value) => {
        fineRef.current = value;
        setPenFineState(value);
    }, []);
    const fineHandlerOffRef = useRef(null);
    const firstViewPendingRef = useRef(false);
    // A saved sketch opens to be looked at (the hand tool); the pen's first
    // touch arms it (review 2.11). Any tool chosen by hand disarms this.
    const armOnPenRef = useRef(false);
    const paperWrittenRef = useRef(false);
    const [fingerDraws, setFingerDrawsState] = useState(() => readFingerDraws());
    const [barPosition, setBarPositionState] = useState(() => readBarPosition());
    const [notice, setNotice] = useState(null);
    const theme = useTheme();

    const setFingerDraws = useCallback((on) => {
        writeFingerDraws(on);
        setFingerDrawsState(on);
    }, []);
    const setBarPosition = useCallback((pos) => {
        writeBarPosition(pos);
        setBarPositionState(pos);
    }, []);

    const loadSnapshot = useCallback((serialized, editor) => {
        if (!serialized) return;
        try {
            const snapshot = JSON.parse(serialized);
            // As a REMOTE change: the store listener (source 'user') never
            // sees a load, so loading can't echo back as a save, and it is
            // not on the undo stack. tldraw's listeners run a frame later, so
            // the old "applying" flag never covered them.
            editor.store.mergeRemoteChanges(() => loadTldrawSnapshot(editor.store, snapshot));
            lastKnownRef.current = serialized;
        } catch (error) {
            console.warn('HandwrittenEditor - Invalid snapshot, ignoring.', error);
        }
    }, []);

    /** Serialise now if anything is pending; hand it to the page. */
    const flush = useCallback(() => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        const editor = editorRef.current;
        if (!dirtyRef.current || !editor) return null;
        dirtyRef.current = false;
        let serialized;
        try {
            serialized = JSON.stringify(editor.store.getStoreSnapshot());
        } catch (error) {
            console.warn('HandwrittenEditor - could not serialise the sketch.', error);
            return null;
        }
        if (serialized === lastKnownRef.current) return null;
        lastKnownRef.current = serialized;
        emittedRef.current = [serialized, ...emittedRef.current].slice(0, ECHOES_KEPT);
        setContentRef.current?.(serialized);
        return serialized;
    }, []);

    const scheduleSave = useCallback(() => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            saveTimeoutRef.current = null;
            flush();
        }, SAVE_DEBOUNCE_MS);
    }, [flush]);

    /** D8: on the first ink, the sketch keeps the paper it was written on. */
    const keepPaperOnFirstInk = (editor) => {
        if (paperWrittenRef.current) return;
        paperWrittenRef.current = true;
        const meta = editor.getDocumentSettings?.()?.meta || {};
        if (meta.paperColor && meta.paperPattern) return;
        const paper = paperFromMeta(meta, readDevicePaper());
        editor.updateDocumentSettings?.({ meta: { ...meta, paperColor: paper.color, paperPattern: paper.pattern } });
    };

    const shareImage = useCallback(async () => {
        const editor = editorRef.current;
        if (!editor) return;
        try {
            const { blob } = await exportSketchPng(editor, { exportToBlob, sheet: true, maxEdge: PRINT_MAX_EDGE, maxBytes: Infinity, base64: false });
            const file = typeof File === 'function' ? new File([blob], 'sketch.png', { type: 'image/png' }) : null;
            if (file && navigator.canShare?.({ files: [file] }) && navigator.share) {
                await navigator.share({ files: [file], title: 'Sketch' });
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'sketch.png';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
        } catch (err) {
            if (err?.name === 'AbortError') return; // the share sheet was closed
            setNotice(err?.message || 'The sketch could not be turned into an image.');
        }
    }, []);

    const handleMount = useCallback((editor) => {
        editorRef.current = editor;
        setIsLoading(false);
        if (sketchApiRef) {
            sketchApiRef.current = {
                exportPng: () => exportSketchPng(editor, { exportToBlob }),
                // Print / Save as PDF (utils/printNote.js): bigger, uncapped,
                // one image per photographed page.
                exportForPrint: () => exportSketchForPrint(editor, { exportToBlob }),
                // Ink, not a template sheet alone: there is nothing to read on a blank form.
                hasShapes: () => pageHasInk(editor),
                flush,
            };
        }

        // The same no-stacking rule as the store listener below: a remount
        // drops the previous editor's handler before registering this one.
        if (fineHandlerOffRef.current) {
            fineHandlerOffRef.current();
            fineHandlerOffRef.current = null;
        }
        if (!readOnly) {
            const fineOff = editor.sideEffects.registerBeforeCreateHandler('shape', fineStrokeHandler(editor, fineRef));
            // A template sheet stays locked (DOCS/TEMPLATES_SPEC.md T3).
            const sheetOff = guardTemplateSheet(editor);
            fineHandlerOffRef.current = () => { fineOff(); sheetOff(); };
            // An inserted or pasted image is shrunk, and refused by name if
            // it would make the sketch unsaveable (review 1.18).
            editor.registerExternalAssetHandler?.('file', sketchImageHandler({
                currentChars: () => (lastKnownRef.current || '').length,
                onRefuse: setNotice,
                AssetRecordType,
            }));
            // A device that has had a pen starts in pen mode (review 2.3).
            if (readPenSeen() && !readFingerDraws()) editor.updateInstanceState?.({ isPenMode: true });
        }

        // tldraw's colour scheme follows the paper and the app theme: PaperSync.

        let hasInk = false;
        if (content) {
            loadSnapshot(content, editor);
            hasInk = pageHasInk(editor);
            // Done by the bounds update below, once the viewport is measured.
            firstViewPendingRef.current = true;
        } else if (!readOnly && isPaperSheetTemplate(startSheetRef.current)) {
            // A new sketch that starts on a sheet. Placed as a REMOTE change,
            // like a load: it is not a save (leaving without writing creates
            // no note) and not an undo step. The first stroke saves it with
            // the page.
            try {
                editor.store.mergeRemoteChanges(() => placePaperSheet(editor, startSheetRef.current, { x: 0, y: 0 }));
                firstViewPendingRef.current = true;
            } catch (error) {
                console.warn('HandwrittenEditor - could not place the starting sheet.', error);
            }
        }

        // A saved sketch opens to be read, an empty one to be written on.
        // Handwriting wants a thin pen: tldraw's default (m) wrote fat lines
        // (Chef, 2026-09-27). New sketches start on Fine, the smallest line:
        // size 's' here plus FINE_SCALE on each new stroke (fineRef, above).
        // Small was the default 2026-11-14 to 11-16.
        armOnPenRef.current = hasInk && !readOnly;
        editor.setCurrentTool(hasInk ? 'hand' : 'draw');
        editor.setStyleForNextShapes(DefaultSizeStyle, 's');

        // If onMount runs again, the previous editor's listener must go first,
        // or listeners stack up (one per mount) on stores that are gone.
        if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = null;
        }
        if (cameraUnsubscribeRef.current) {
            cameraUnsubscribeRef.current();
            cameraUnsubscribeRef.current = null;
        }

        if (!readOnly) {
            // Document records changed by the user only: not the camera, the
            // pointer or the selection (session), and not a load (remote). The
            // whole sketch used to be serialised and compared on every
            // pointer frame, hover included (review 2.1).
            unsubscribeRef.current = editor.store.listen((entry) => {
                dirtyRef.current = true;
                if (isInkEdit(entry)) {
                    keepPaperOnFirstInk(editor);
                    onInkEditRef.current?.();
                }
                scheduleSave();
            }, { scope: 'document', source: 'user' });
        }

        // The camera, remembered per sketch on this device (review 2.11).
        cameraUnsubscribeRef.current = editor.store.listen((entry) => {
            const touched = Object.keys({ ...entry?.changes?.updated, ...entry?.changes?.added }).some((id) => id.startsWith('camera:'));
            if (!touched || !noteIdRef.current) return;
            if (cameraTimerRef.current) clearTimeout(cameraTimerRef.current);
            cameraTimerRef.current = setTimeout(() => {
                cameraTimerRef.current = null;
                writeCamera(noteIdRef.current, editor.getCamera?.());
            }, CAMERA_SAVE_MS);
        }, { scope: 'session' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- content intentionally excluded; initial load only
    }, [loadSnapshot, readOnly, scheduleSave, flush, sketchApiRef]);

    // Hold the S Pen's side button to erase; an eraser end erases
    // (DOCS/HANDWRITING.md §1). A capture-phase listener on the container, so
    // it runs before tldraw's own handlers; see utils/penButton.js. Also: a
    // pen's first press remembers this device has a pen, and arms a sketch
    // that opened to be looked at; two fingers tapped together undo.
    useEffect(() => {
        const container = containerRef.current;
        if (!container || readOnly || isLoading) return undefined;
        const onPenDown = (e) => {
            if (e.pointerType !== 'pen') return;
            writePenSeen();
            const editor = editorRef.current;
            if (!armOnPenRef.current || !editor || !e.target?.closest?.('.tl-canvas')) return;
            if (e.button !== 0 || (e.buttons & ~1) !== 0) return; // a button press: penButton's
            armOnPenRef.current = false;
            if (editor.getCurrentToolId() === 'hand') editor.setCurrentTool('draw');
        };
        container.addEventListener('pointerdown', onPenDown, { capture: true });
        const detachPen = attachPenButton(container, () => editorRef.current, { getPointerInfo });
        const detachTap = attachTwoFingerTap(container, () => editorRef.current?.undo());
        // The Lenovo pen's button, double-clicked, arrives as a key: undo
        // (utils/penKey.js).
        const detachKey = attachPenKey(container.ownerDocument?.defaultView, () => editorRef.current);
        return () => {
            container.removeEventListener('pointerdown', onPenDown, { capture: true });
            detachPen();
            detachTap();
            detachKey();
        };
    }, [readOnly, isLoading]);

    // Use ResizeObserver for reliable viewport bounds updates
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const updateBounds = () => {
            if (editorRef.current) {
                // This tells tldraw exactly where its container is on screen
                // Critical for correct touch/mouse coordinate calculation
                editorRef.current.updateViewportScreenBounds(screenBoundsOf(container));
                // A saved sketch's first view, now that the viewport is real.
                if (firstViewPendingRef.current && container.getBoundingClientRect().width > 1) {
                    firstViewPendingRef.current = false;
                    applyFirstView(editorRef.current, noteIdRef.current);
                }
            }
        };

        // ResizeObserver is more reliable than window resize for container changes
        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(updateBounds);
        });

        resizeObserver.observe(container);

        // Also listen for scroll and orientation changes
        window.addEventListener('scroll', updateBounds, { passive: true });
        window.addEventListener('orientationchange', updateBounds);

        // Initial update after mount
        const initialTimeout = setTimeout(updateBounds, 50);
        // Secondary update to catch late layout shifts
        const secondaryTimeout = setTimeout(updateBounds, 200);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('scroll', updateBounds);
            window.removeEventListener('orientationchange', updateBounds);
            clearTimeout(initialTimeout);
            clearTimeout(secondaryTimeout);
        };
    }, [isLoading]); // Re-run when loading completes

    // `content` changed. Reload ONLY what came from outside — a History
    // restore, a conflict resolved in favour of the other device. Our own
    // saves coming back (possibly after the writer has drawn more) are
    // echoes: reloading one wiped the first stroke of the next word (1.17).
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor || !content) return;
        if (content === lastKnownRef.current || emittedRef.current.includes(content)) return;
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        dirtyRef.current = false;
        loadSnapshot(content, editor);
    }, [content, loadSnapshot]);

    // The app is hidden or the page is going away: save the pending strokes
    // now, not 400 ms from now — Android may freeze the PWA first (1.2).
    useEffect(() => {
        if (readOnly) return undefined;
        const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
        document.addEventListener('visibilitychange', onHide);
        window.addEventListener('pagehide', flush);
        return () => {
            document.removeEventListener('visibilitychange', onHide);
            window.removeEventListener('pagehide', flush);
        };
    }, [readOnly, flush]);

    useEffect(() => {
        return () => {
            // Unmount: the pending strokes are handed over, never dropped (1.2).
            flush();
            if (sketchApiRef) sketchApiRef.current = null;
            if (fineHandlerOffRef.current) fineHandlerOffRef.current();
            if (unsubscribeRef.current) {
                unsubscribeRef.current();
            }
            if (cameraUnsubscribeRef.current) cameraUnsubscribeRef.current();
            if (cameraTimerRef.current) {
                clearTimeout(cameraTimerRef.current);
                if (noteIdRef.current && editorRef.current) writeCamera(noteIdRef.current, editorRef.current.getCamera?.());
            }
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only
    }, []);

    // Pickers and tooltips portal into the container (visible in fullscreen).
    const portal = useMemo(() => ({ container: () => containerRef.current, position: barPosition }), [barPosition]);
    const disarm = useCallback(() => { armOnPenRef.current = false; }, []);
    const onFullscreenChange = useCallback(() => {
        // Update tldraw bounds after fullscreen change
        setTimeout(() => {
            if (editorRef.current && containerRef.current) {
                editorRef.current.updateViewportScreenBounds(screenBoundsOf(containerRef.current));
            }
        }, 100);
    }, []);

    return (
        <EditorErrorBoundary title="Drawing canvas failed to load" message="The handwritten editor encountered an error.">
            {/* Container uses absolute positioning within the flex layout */}
            <Box
                ref={containerRef}
                sx={{
                    position: 'absolute',
                    inset: 0,
                    '& .tl-container': {
                        // Ensure tldraw fills container
                        position: 'absolute !important',
                        inset: '0 !important',
                    },
                    // tldraw's own top and bottom bars are hidden at every
                    // size; DrawingToolbar replaces them.
                    '& .tlui-layout__bottom': {
                        display: 'none',
                    },
                    '& .tlui-layout__top': {
                        display: 'none',
                    },
                }}
            >
                {isLoading && (
                    <Box
                        sx={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: surfaces(theme).elevated,
                            zIndex: 10,
                        }}
                    >
                        <CircularProgress />
                    </Box>
                )}
                <SketchPortalContext.Provider value={portal}>
                    <Tldraw
                        onMount={handleMount}
                        readOnly={readOnly}
                        autoFocus={autoFocus}
                        components={HIDDEN_TLDRAW_COMPONENTS}
                        options={TLDRAW_OPTIONS}
                        maxImageDimension={SKETCH_IMAGE_MAX_EDGE}
                        maxAssetSize={SKETCH_IMAGE_INPUT_MAX_BYTES}
                    >
                    {/* Paper colour + tldraw's colour scheme (light on any paper, so
                        black ink stays black; the app's theme on "Match theme"). */}
                    <PaperSync />
                    {!readOnly && <PenModeSync fingerDraws={fingerDraws} />}
                    {/* The drawing toolbar. It must render INSIDE <Tldraw>: it calls
                        useEditor(), which only resolves within tldraw's context. As a
                        sibling it threw on every phone and the error boundary took
                        the whole sketch editor down. */}
                    {!readOnly && !isLoading && (
                        <DrawingToolbar
                            containerRef={containerRef}
                            fine={penFine}
                            onFineChange={setPenFine}
                            position={barPosition}
                            onPositionChange={setBarPosition}
                            fingerDraws={fingerDraws}
                            onFingerDrawsChange={setFingerDraws}
                            onToolPicked={disarm}
                            onShareImage={shareImage}
                            onFullscreenChange={onFullscreenChange}
                        />
                    )}
                    </Tldraw>
                </SketchPortalContext.Provider>
                <Snackbar
                    open={Boolean(notice)}
                    message={notice || ''}
                    autoHideDuration={8000}
                    onClose={(_e, reason) => { if (reason !== 'clickaway') setNotice(null); }}
                    anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
                    sx={{ position: 'absolute' }}
                />
            </Box>
        </EditorErrorBoundary>
    );
};

export default HandwrittenEditor;
