import React, { useContext, useEffect, useRef } from 'react';
import { Box, Button, IconButton, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
// Deep imports (see MarkdownEditor.jsx for why) instead of the barrel.
import KeyboardArrowUp from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import CloseIcon from '@mui/icons-material/Close';
import { graphiteTokens, surfaces } from '../../theme/tokens';
import { FindHighlightContext } from './findHighlight';

/**
 * A search hit on a handwritten page (DOCS/HANDWRITING.md §5): the
 * highlight drawn on the canvas, and the find bar.
 *
 * The highlight is NOT a tldraw shape. It is tldraw's `OnTheCanvas`
 * component, which tldraw 2.4.6 renders inside the camera-transformed shape
 * layer (DefaultCanvas: `.tl-html-layer.tl-shapes`, before the shapes), so
 * it is placed in page units, moves with the camera and sits under the ink.
 * It is never in the store: never saved, exported, printed, transcribed or
 * undone, and it works on a read-only note.
 */
export function FindHighlight() {
    const value = useContext(FindHighlightContext);
    const theme = useTheme();
    if (!value?.rects?.length) return null;
    const g = graphiteTokens(theme);
    return (
        <div data-find-highlight="" aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
            {value.rects.map((r, i) => (
                <div
                    key={i}
                    data-find-rect=""
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: r.w,
                        height: r.h,
                        transform: `translate(${r.x}px, ${r.y}px)`,
                        background: alpha(g.hl, 0.55),
                        borderRadius: Math.min(6, r.h / 4),
                        pointerEvents: 'none',
                    }}
                />
            ))}
        </div>
    );
}

const UNPLACED = "Found in the text read from this page; its place on the page isn't known";

/**
 * The find bar. `state`: { status: 'placed' | 'unplaced', hits, index }.
 * "2 of 5", Previous, Next, Close; Enter and Shift+Enter step, Esc closes
 * (the editor listens for Esc). An aria-live line reads the matched line.
 * `side`: which edge of the canvas it sits on ('top' or 'bottom').
 */
export function FindBar({ state, onPrev, onNext, onClose, onViewText, side = 'top', inset = {} }) {
    const theme = useTheme();
    const g = graphiteTokens(theme);
    const barRef = useRef(null);
    const placed = state.status === 'placed';
    const hit = placed ? state.hits[state.index] : null;
    const many = placed && state.hits.length > 1;

    // Focus comes to the bar when it opens, so Enter steps straight away.
    useEffect(() => {
        barRef.current?.focus?.({ preventScroll: true });
    }, [state.status]);

    const onKeyDown = (e) => {
        if (e.key !== 'Enter' || !placed) return;
        if (e.target?.closest?.('[data-find-keep-enter]')) return;
        e.preventDefault();
        if (e.shiftKey) onPrev();
        else onNext();
    };

    let live = '';
    if (hit) {
        const where = hit.page ? `Page ${hit.page}: ` : '';
        live = `${where}${hit.lineText}${hit.approximate ? ', approximate' : ''}`;
    }
    const mono = { fontFamily: theme.typography.fontFamilyMono, wordSpacing: 'normal' };
    const iconSx = { width: 44, height: 44, flexShrink: 0, color: 'text.secondary', '&:hover': { color: 'text.primary' } };

    return (
        <Box
            ref={barRef}
            tabIndex={-1}
            role="region"
            aria-label="Search hit on this page"
            data-find-bar={state.status}
            onKeyDown={onKeyDown}
            sx={{
                position: 'absolute',
                [side]: 8,
                left: inset.left ?? 8,
                right: inset.right ?? 8,
                mx: 'auto',
                maxWidth: 560,
                zIndex: 101,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                minHeight: 48,
                pl: '12px',
                pr: '2px',
                py: '2px',
                bgcolor: surfaces(theme).paper,
                border: `1px solid ${g.rule}`,
                borderLeft: `4px solid ${g.hl}`,
                borderRadius: '6px',
                boxShadow: theme.shadows[2],
                outline: 'none',
                '&:focus-visible': { outline: `2px solid ${g.ink}`, outlineOffset: 2 },
                '@media print': { display: 'none' },
            }}
        >
            {placed ? (
                <>
                    <Typography component="span" data-find-count="" sx={{ ...mono, fontSize: '0.8125rem', color: 'text.primary', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {`${state.index + 1} of ${state.hits.length}`}
                    </Typography>
                    <Typography
                        component="span"
                        aria-live="polite"
                        data-find-line=""
                        sx={{ flex: 1, minWidth: 0, fontSize: '0.8125rem', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ml: '8px' }}
                    >
                        {live}
                    </Typography>
                    <IconButton aria-label="Previous match" onClick={onPrev} disabled={!many} sx={iconSx}>
                        <KeyboardArrowUp fontSize="small" />
                    </IconButton>
                    <IconButton aria-label="Next match" onClick={onNext} disabled={!many} sx={iconSx}>
                        <KeyboardArrowDown fontSize="small" />
                    </IconButton>
                </>
            ) : (
                <>
                    <Typography component="span" aria-live="polite" data-find-line="" sx={{ flex: 1, minWidth: 0, fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.35, py: '6px' }}>
                        {UNPLACED}
                    </Typography>
                    {onViewText ? (
                        <Button data-find-keep-enter="" onClick={onViewText} sx={{ textTransform: 'none', minHeight: 44, flexShrink: 0, whiteSpace: 'nowrap' }}>
                            View text
                        </Button>
                    ) : null}
                </>
            )}
            <IconButton aria-label="Close find" data-find-keep-enter="" onClick={onClose} sx={iconSx}>
                <CloseIcon fontSize="small" />
            </IconButton>
        </Box>
    );
}
