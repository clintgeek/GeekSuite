import React, { useEffect, useId, useRef, useState } from 'react';
import { Box, Button, useTheme } from '@mui/material';
import { renderMermaid, mermaidErrorText } from '../../utils/mermaidLoader';
import { diagramLabel } from '../../utils/mermaidText';
import { TOUCH_TARGET_MEDIA } from '../../hooks/useNoteFormFactor';

/** How long typing must pause before a changed diagram is drawn again. */
export const MERMAID_DEBOUNCE_MS = 300;

/**
 * MermaidBlock — a ```mermaid fence, drawn (DOCS/HANDWRITING.md "Turn into a
 * diagram", DOCS/CONTEXT.md §26).
 *
 * Drawn only once it is on screen (IntersectionObserver), so a long note
 * with diagrams near the end does not load Mermaid for nothing. Until then,
 * and while drawing, the source shows with "Drawing diagram…". A diagram that
 * cannot be drawn shows its source and why, never a blank. Drawn, it is a
 * `figure` with `role="img"` named by its labels, and "Show source" opens the
 * text. A wide drawing scrolls inside its own box; the page never scrolls
 * sideways.
 *
 * @param {object} props
 * @param {string} props.source
 * @param {boolean} [props.immediate]  draw now, visible or not (print)
 * @param {'light'|'dark'} [props.mode]  else the app's mode
 * @param {boolean} [props.print]  the paper copy: no toggle, no scroller
 * @param {boolean} [props.keepLastGood]  on a failed redraw keep showing the
 *   last good drawing (the review dialog, while its source is being edited)
 * @param {boolean} [props.sourceToggle]  "Show source" under a drawing (the dialog has its own editor)
 * @param {(r: { ok: boolean, error?: string }) => void} [props.onResult]
 */
export default function MermaidBlock({ source, immediate = false, mode = null, print = false, keepLastGood = false, sourceToggle = true, onResult = null }) {
    const theme = useTheme();
    const themeMode = mode || (theme.palette.mode === 'dark' ? 'dark' : 'light');
    const boxRef = useRef(null);
    const [visible, setVisible] = useState(immediate);
    const [state, setState] = useState({ status: 'loading', svg: null, error: null, drawn: null });
    const [showSource, setShowSource] = useState(false);
    const firstDraw = useRef(true);
    const onResultRef = useRef(onResult);
    onResultRef.current = onResult;
    const sourceId = useId();

    useEffect(() => {
        if (visible) return undefined;
        const el = boxRef.current;
        if (!el || typeof IntersectionObserver !== 'function') {
            setVisible(true);
            return undefined;
        }
        const io = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) {
                setVisible(true);
                io.disconnect();
            }
        }, { rootMargin: '200px' });
        io.observe(el);
        return () => io.disconnect();
    }, [visible]);

    useEffect(() => {
        if (!visible) return undefined;
        let cancelled = false;
        const text = String(source ?? '');
        const draw = async () => {
            try {
                const svg = await renderMermaid(text, { mode: themeMode });
                if (cancelled) return;
                setState({ status: 'ready', svg, error: null, drawn: text });
                onResultRef.current?.({ ok: true });
            } catch (err) {
                if (cancelled) return;
                const error = mermaidErrorText(err);
                setState((prev) => (keepLastGood && prev.svg
                    ? { ...prev, status: 'ready', error }
                    : { status: 'error', svg: null, error, drawn: null }));
                onResultRef.current?.({ ok: false, error });
            }
        };
        // The first drawing at once; a changed source after a pause in typing.
        const wait = firstDraw.current ? 0 : MERMAID_DEBOUNCE_MS;
        firstDraw.current = false;
        const timer = setTimeout(draw, wait);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [visible, source, themeMode, keepLastGood]);

    const pending = state.status === 'loading';
    const mono = { fontFamily: theme.typography.fontFamilyMono, fontSize: '0.8125rem' };
    const sourceBox = (
        <Box
            component="pre"
            id={sourceId}
            role="region"
            aria-label="Diagram source"
            tabIndex={0}
            sx={{ m: 0, ...mono, whiteSpace: 'pre', overflowX: 'auto', maxWidth: '100%' }}
        >
            {source}
        </Box>
    );

    return (
        <Box
            ref={boxRef}
            className="ng-mermaid"
            data-mermaid={state.status}
            data-mermaid-pending={pending ? '' : undefined}
            sx={{ my: 3, minWidth: 0, maxWidth: '100%' }}
        >
            {state.status === 'ready' ? (
                <Box
                    component="figure"
                    role="img"
                    aria-label={diagramLabel(state.drawn ?? source)}
                    tabIndex={print ? undefined : 0}
                    className="ng-mermaid-figure"
                    sx={{
                        m: 0,
                        maxWidth: '100%',
                        overflowX: print ? 'visible' : 'auto',
                        overflowY: 'hidden',
                        overscrollBehaviorX: 'contain',
                        // A hairline frame on screen, so a clipped wide drawing reads as a box that scrolls.
                        ...(print ? {} : { border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }),
                        '& svg': print ? { maxWidth: '100%', height: 'auto' } : { display: 'block', maxWidth: 'none' },
                        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                    }}
                    // Mermaid's own SVG, drawn with securityLevel 'strict' and no HTML labels.
                    dangerouslySetInnerHTML={{ __html: state.svg }}
                />
            ) : null}

            {state.status !== 'ready' ? (
                <>
                    {sourceBox}
                    <Box
                        component="p"
                        role="status"
                        sx={{ m: 0, mt: 1, ...mono, color: state.status === 'error' ? 'error.main' : 'text.secondary', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                    >
                        {state.status === 'error' ? `This diagram could not be drawn: ${state.error}` : 'Drawing diagram…'}
                    </Box>
                </>
            ) : null}

            {state.status === 'ready' && !print && sourceToggle ? (
                <>
                    <Button
                        size="small"
                        onClick={() => setShowSource((v) => !v)}
                        aria-expanded={showSource}
                        aria-controls={showSource ? sourceId : undefined}
                        sx={{ mt: 1, textTransform: 'none', color: 'text.secondary', [TOUCH_TARGET_MEDIA]: { minHeight: 44 } }}
                    >
                        {showSource ? 'Hide source' : 'Show source'}
                    </Button>
                    {showSource ? sourceBox : null}
                </>
            ) : null}
        </Box>
    );
}
