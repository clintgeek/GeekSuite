import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CircularProgress, Box, useTheme } from '@mui/material';
import {
    Box as TlBox, Tldraw, DefaultSizeStyle,
    exportToBlob, getPointerInfo,
} from '@tldraw/tldraw';
import { attachPenButton } from '../../utils/penButton';
import { exportSketchPng, exportSketchForPrint } from '../../utils/sketchExport';
import { fineStrokeHandler } from '../../utils/finePen';

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

const SAVE_DEBOUNCE_MS = 400;

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
const firstPhotoShape = (editor) => (editor.getCurrentPageShapesSorted?.() || []).find((s) => s.type === 'image');

function fitFirstPhotoPage(editor) {
    if (!editor || editor.isDisposed) return false;
    const shape = firstPhotoShape(editor);
    const bounds = shape && editor.getShapePageBounds?.(shape);
    if (!bounds) return false;
    editor.zoomToBounds?.(bounds, { targetZoom: 1, inset: 32 });
    return true;
}

/**
 * `sketchApiRef` (optional): filled with `{ exportPng, exportForPrint, hasShapes }` once the
 * editor mounts, so the page can export this sketch for "Convert handwriting
 * to text" without importing tldraw itself (this file is lazy-loaded; the
 * page is not). Cleared on unmount.
 */
const HandwrittenEditor = ({ content, setContent, readOnly = false, sketchApiRef = null }) => {
    const editorRef = useRef(null);
    const unsubscribeRef = useRef(null);
    const isApplyingSnapshot = useRef(false);
    const lastSavedSnapshot = useRef(content || '');
    const saveTimeoutRef = useRef(null);
    const containerRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    // The Fine pen: a ref the side effect reads live, and state for the
    // picker. Editor state only — it never goes into the saved document.
    // Off by default: new sketches start on Small (Chef, 2026-11-14); Fine is
    // one choice away in the pen picker.
    const fineRef = useRef(false);
    const [penFine, setPenFineState] = useState(false);
    const setPenFine = useCallback((value) => {
        fineRef.current = value;
        setPenFineState(value);
    }, []);
    const fineHandlerOffRef = useRef(null);
    const photoFitPendingRef = useRef(false);
    const theme = useTheme();

    const loadSnapshot = useCallback((serialized, editor) => {
        if (!serialized) return;
        try {
            const snapshot = JSON.parse(serialized);
            isApplyingSnapshot.current = true;
            editor.store.loadSnapshot(snapshot);
            lastSavedSnapshot.current = serialized;
        } catch (error) {
            console.warn('HandwrittenEditor - Invalid snapshot, ignoring.', error);
        } finally {
            isApplyingSnapshot.current = false;
        }
    }, []);

    const debouncedSave = useCallback((serialized) => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
            setContent(serialized);
        }, SAVE_DEBOUNCE_MS);
    }, [setContent]);

    const handleMount = useCallback((editor) => {
        editorRef.current = editor;
        setIsLoading(false);
        if (sketchApiRef) {
            sketchApiRef.current = {
                exportPng: () => exportSketchPng(editor, { exportToBlob }),
                // Print / Save as PDF (utils/printNote.js): bigger, uncapped,
                // one image per photographed page.
                exportForPrint: () => exportSketchForPrint(editor, { exportToBlob }),
                hasShapes: () => editor.getCurrentPageShapeIds().size > 0,
            };
        }

        // Set initial tool to draw for better mobile experience
        editor.setCurrentTool('draw');
        // Handwriting wants a thin pen: tldraw's default (m) wrote fat lines
        // (Chef, 2026-09-27). New sketches start on Small ('s'); Fine (size
        // 's' plus FINE_SCALE on each new stroke) was the default until
        // 2026-11-14.
        editor.setStyleForNextShapes(DefaultSizeStyle, 's');
        // The same no-stacking rule as the store listener below: a remount
        // drops the previous editor's handler before registering this one.
        if (fineHandlerOffRef.current) {
            fineHandlerOffRef.current();
            fineHandlerOffRef.current = null;
        }
        if (!readOnly) {
            fineHandlerOffRef.current = editor.sideEffects.registerBeforeCreateHandler('shape', fineStrokeHandler(editor, fineRef));
        }

        // Apply dark mode preference based on MUI theme mode
        const isDark = theme.palette.mode === 'dark';
        // tldraw 2.4 renamed isDarkMode to colorScheme, and its validator rejects
        // the old key, so every theme sync used to throw.
        editor.user.updateUserPreferences({ colorScheme: isDark ? 'dark' : 'light' });

        if (content) {
            loadSnapshot(content, editor);
            // Done by the bounds update below, once the viewport is measured.
            photoFitPendingRef.current = Boolean(firstPhotoShape(editor));
        }

        // If onMount runs again, the previous editor's listener must go first,
        // or listeners stack up (one per mount) on stores that are gone.
        if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = null;
        }

        if (!readOnly) {
            unsubscribeRef.current = editor.store.listen(() => {
                if (isApplyingSnapshot.current) return;

                const snapshot = editor.store.getSnapshot();
                const serialized = JSON.stringify(snapshot);

                if (serialized !== lastSavedSnapshot.current) {
                    lastSavedSnapshot.current = serialized;
                    debouncedSave(serialized);
                }
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- content intentionally excluded; initial load only
    }, [loadSnapshot, readOnly, debouncedSave, theme.palette.mode, sketchApiRef]);

    // Hold the S Pen's side button to scroll the page; an eraser end erases
    // (DOCS/HANDWRITING.md §1). A capture-phase listener on the container, so
    // it runs before tldraw's own handlers; see utils/penButton.js.
    useEffect(() => {
        const container = containerRef.current;
        if (!container || readOnly || isLoading) return undefined;
        return attachPenButton(container, () => editorRef.current, { getPointerInfo });
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
                // A photo sketch note's first-open fit, now that the viewport is real.
                if (photoFitPendingRef.current && container.getBoundingClientRect().width > 1) {
                    photoFitPendingRef.current = false;
                    fitFirstPhotoPage(editorRef.current);
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


    useEffect(() => {
        if (!editorRef.current) return;
        if (!content || content === lastSavedSnapshot.current) return;
        loadSnapshot(content, editorRef.current);
    }, [content, loadSnapshot]);

    // Sync dark mode preference with Tldraw when theme changes
    useEffect(() => {
        if (editorRef.current) {
            const isDark = theme.palette.mode === 'dark';
            editorRef.current.user.updateUserPreferences({ colorScheme: isDark ? 'dark' : 'light' });
        }
    }, [theme.palette.mode, isLoading]);

    useEffect(() => {
        return () => {
            if (sketchApiRef) sketchApiRef.current = null;
            if (fineHandlerOffRef.current) fineHandlerOffRef.current();
            if (unsubscribeRef.current) {
                unsubscribeRef.current();
            }
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only
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
                <Tldraw
                    onMount={handleMount}
                    readOnly={readOnly}
                    components={HIDDEN_TLDRAW_COMPONENTS}
                    options={TLDRAW_OPTIONS}
                >
                {/* The drawing toolbar. It must render INSIDE <Tldraw>: it calls
                    useEditor(), which only resolves within tldraw's context. As a
                    sibling it threw on every phone and the error boundary took
                    the whole sketch editor down. */}
                {!readOnly && !isLoading && (
                    <DrawingToolbar
                        containerRef={containerRef}
                        fine={penFine}
                        onFineChange={setPenFine}
                        onFullscreenChange={() => {
                            // Update tldraw bounds after fullscreen change
                            setTimeout(() => {
                                if (editorRef.current && containerRef.current) {
                                    editorRef.current.updateViewportScreenBounds(screenBoundsOf(containerRef.current));
                                }
                            }, 100);
                        }}
                    />
                )}
                </Tldraw>
            </Box>
        </EditorErrorBoundary>
    );
};

export default HandwrittenEditor;
