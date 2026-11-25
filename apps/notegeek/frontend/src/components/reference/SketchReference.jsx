import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, useTheme } from '@mui/material';
import { Box as TlBox, Tldraw, loadSnapshot as loadTldrawSnapshot, useEditor, useTldrawUser } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { paperSheetOf } from '@geeksuite/ui';
import EditorErrorBoundary from '../editors/EditorErrorBoundary';
import { PaperBackground } from '../editors/Paper';
import { usePaper } from '../editors/usePaper';
import { surfaces } from '../../theme/tokens';

/**
 * A handwritten note, to be read (DOCS/REFERENCE_PANE_SPEC.md req 4, 7, 9).
 *
 * Its own small tldraw, not HandwrittenEditor: nothing here listens to the
 * document, so there is no path by which showing a note could save it, mark
 * it edited or start a handwriting read. The canvas is read-only with the
 * hand tool, so pen and finger both scroll it and two fingers zoom it. The
 * camera is not remembered.
 *
 * Lazy-loaded by ReferencePane: this file is what pulls tldraw in.
 */

// Stable identities: tldraw rebuilds its editor when these change (see
// HandwrittenEditor.jsx).
const COMPONENTS = {
    Toolbar: null,
    StylePanel: null,
    NavigationPanel: null,
    PageMenu: null,
    ActionsMenu: null,
    HelpMenu: null,
    DebugMenu: null,
    SharePanel: null,
    ContextMenu: null,
    Background: PaperBackground,
};
const OPTIONS = {};
const INSET = 16;
const noop = () => {};

const screenBoundsOf = (el) => {
    const r = el.getBoundingClientRect();
    return new TlBox(r.left, r.top, Math.max(1, r.width), Math.max(1, r.height));
};

/**
 * Fit to width, from the top of the page (decision 9): the template sheet
 * when there is one, else everything drawn. Never past 100%. Camera only.
 */
export function fitWidthFromTop(editor) {
    if (!editor || editor.isDisposed) return false;
    const sheet = paperSheetOf(editor);
    const bounds = (sheet && editor.getShapePageBounds?.(sheet)) || editor.getCurrentPageBounds?.();
    const view = editor.getViewportScreenBounds?.();
    if (!bounds || !(bounds.w > 0) || !(view?.w > INSET * 2)) return false;
    const z = Math.min(1, (view.w - INSET * 2) / bounds.w);
    editor.setCamera?.({ x: -bounds.x + INSET / z, y: -bounds.y + INSET / z, z });
    return true;
}

/**
 * The paper's ground colour and colour scheme, for THIS canvas only. The
 * editor's PaperSync writes the scheme to tldraw's user preferences, which
 * every tldraw on the page shares: a reference on white paper would have
 * turned the dark-theme page being written on to light ink.
 */
function ReferencePaper({ onScheme }) {
    const editor = useEditor();
    const { look } = usePaper();
    useEffect(() => { onScheme(look.colorScheme); }, [look.colorScheme, onScheme]);
    useEffect(() => {
        const el = editor.getContainer?.();
        if (!el) return;
        if (look.background) el.style.setProperty('--color-background', look.background);
        else el.style.removeProperty('--color-background');
    }, [editor, look.background]);
    return null;
}

function SketchReference({ content }) {
    const theme = useTheme();
    const containerRef = useRef(null);
    const editorRef = useRef(null);
    const loadedRef = useRef(null);
    const fitPendingRef = useRef(false);
    const [isLoading, setIsLoading] = useState(true);
    const [scheme, setScheme] = useState('light');
    const user = useTldrawUser({ userPreferences: { id: 'reference', colorScheme: scheme }, setUserPreferences: noop });

    const load = useCallback((editor, serialized) => {
        if (!serialized || loadedRef.current === serialized) return;
        try {
            const snapshot = JSON.parse(serialized);
            editor.store.mergeRemoteChanges(() => loadTldrawSnapshot(editor.store, snapshot));
            loadedRef.current = serialized;
            fitPendingRef.current = true;
        } catch (error) {
            console.warn('SketchReference - invalid snapshot, ignoring.', error);
        }
    }, []);

    const contentRef = useRef(content);
    contentRef.current = content;

    const handleMount = useCallback((editor) => {
        editorRef.current = editor;
        load(editor, contentRef.current);
        // Read-only after the load, with the hand: every pointer scrolls.
        editor.updateInstanceState?.({ isReadonly: true });
        editor.setCurrentTool?.('hand');
        setIsLoading(false);
    }, [load]);

    // The note being shown changed (another note was picked).
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor || !content) return;
        load(editor, content);
        if (fitPendingRef.current && fitWidthFromTop(editor)) fitPendingRef.current = false;
    }, [content, load]);

    // tldraw works pointer positions out from its own bounds, and assumes a
    // 1080x720 viewport until told otherwise: the first fit waits for the
    // real size (HandwrittenEditor has the long version).
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return undefined;
        const update = () => {
            const editor = editorRef.current;
            if (!editor || editor.isDisposed) return;
            editor.updateViewportScreenBounds(screenBoundsOf(container));
            if (fitPendingRef.current && container.getBoundingClientRect().width > 1 && fitWidthFromTop(editor)) {
                fitPendingRef.current = false;
            }
        };
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => requestAnimationFrame(update)) : null;
        observer?.observe(container);
        window.addEventListener('orientationchange', update);
        const first = setTimeout(update, 50);
        const second = setTimeout(update, 200);
        return () => {
            observer?.disconnect();
            window.removeEventListener('orientationchange', update);
            clearTimeout(first);
            clearTimeout(second);
        };
    }, [isLoading]);

    return (
        <EditorErrorBoundary title="This note could not be shown" message="The handwriting failed to load.">
            <Box
                ref={containerRef}
                data-testid="reference-sketch"
                sx={{
                    position: 'absolute',
                    inset: 0,
                    touchAction: 'none',
                    '& .tl-container': { position: 'absolute !important', inset: '0 !important' },
                    '& .tlui-layout__bottom, & .tlui-layout__top': { display: 'none' },
                }}
            >
                {isLoading && (
                    <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: surfaces(theme).elevated, zIndex: 10 }}>
                        <CircularProgress size={28} />
                    </Box>
                )}
                <Tldraw
                    onMount={handleMount}
                    autoFocus={false}
                    user={user}
                    components={COMPONENTS}
                    options={OPTIONS}
                >
                    <ReferencePaper onScheme={setScheme} />
                </Tldraw>
            </Box>
        </EditorErrorBoundary>
    );
}

export default SketchReference;
