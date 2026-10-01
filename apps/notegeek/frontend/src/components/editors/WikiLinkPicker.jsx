import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, Paper, Typography, useMediaQuery, useTheme } from '@mui/material';
import { PICKER_LISTBOX_ID, pickerOptionId } from '../../hooks/useTitleOptions';
import { caretRect } from '../../utils/caretPosition';
import useKeyboardInset from '../../hooks/useKeyboardInset';
import { DOCKED_TOOLBAR_HEIGHT } from './EditorToolbar';
import { border, graphiteTokens, surfaces } from '../../theme/tokens';
import TypeIcon from '../notes/TypeIcon';

/**
 * The list itself. Presentational: the editor owns the open state, the
 * active row and the keys (↑ ↓ Enter Tab Esc) — the caret never leaves the
 * textarea, which points at the active row with aria-activedescendant.
 *
 * Phone: docked full-width just above the formatting toolbar, which is
 * docked above the keyboard — one-handed, never under the keyboard. From
 * `md` up: floats under the caret.
 *
 * Rows swallow `mousedown` so a tap does not blur the textarea, then choose
 * on click.
 */
function WikiLinkPicker({ options, activeIndex, onChoose, onHover, textarea, caretIndex }) {
    const theme = useTheme();
    const g = graphiteTokens(theme);
    const phone = useMediaQuery(theme.breakpoints.down('md'));
    const keyboardInset = useKeyboardInset();
    const [pos, setPos] = useState(null);

    useEffect(() => {
        if (phone || !textarea) return;
        const r = caretRect(textarea, caretIndex);
        if (!r) return;
        const left = Math.max(8, Math.min(r.left, window.innerWidth - 328));
        // Under the caret, unless that runs off the bottom of the window
        // (a caret on the last visible line): then above it.
        const room = window.innerHeight - (r.top + r.height + 4);
        setPos(room >= 240
            ? { top: r.top + r.height + 4, left }
            : { bottom: window.innerHeight - r.top + 4, left });
    }, [phone, textarea, caretIndex, options.length]);

    if (!options.length) return null;
    const placement = phone
        ? { left: 0, right: 0, bottom: keyboardInset + DOCKED_TOOLBAR_HEIGHT, borderRadius: '8px 8px 0 0' }
        : pos ? { ...pos, width: 320, borderRadius: '6px' } : null;
    if (!placement) return null;

    return createPortal(
        <Paper
            elevation={0}
            data-wikilink-picker
            sx={{
                position: 'fixed',
                zIndex: theme.zIndex.modal + 1,
                ...placement,
                bgcolor: surfaces(theme).elevated,
                border: `1px solid ${ border(theme) }`,
                boxShadow: theme.palette.mode === 'dark' ? '0 6px 24px rgba(0,0,0,0.5)' : '0 6px 24px rgba(47,46,43,0.14)',
                maxHeight: phone ? '40vh' : 320,
                overflowY: 'auto',
                py: '4px',
            }}
        >
            <Typography
                component="div"
                id={`${ PICKER_LISTBOX_ID }-label`}
                sx={{ px: '12px', py: '4px', fontSize: '0.75rem', color: 'text.secondary' }}
            >
                Link to a note
            </Typography>
            <Box
                component="ul"
                role="listbox"
                id={PICKER_LISTBOX_ID}
                aria-labelledby={`${ PICKER_LISTBOX_ID }-label`}
                sx={{ listStyle: 'none', m: 0, p: 0 }}
            >
                {options.map((opt, i) => {
                    const active = i === activeIndex;
                    return (
                        <Box
                            component="li"
                            key={opt.id || `new:${ opt.title }`}
                            id={pickerOptionId(i)}
                            role="option"
                            aria-selected={active}
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => onHover?.(i)}
                            onClick={() => onChoose(opt)}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                minHeight: 44,
                                px: '12px',
                                cursor: 'pointer',
                                bgcolor: active ? g.hl : 'transparent',
                                color: active ? g.onHl : 'text.primary',
                            }}
                        >
                            {opt.isNew ? (
                                <Typography component="span" sx={{ fontSize: '0.875rem', color: active ? g.onHl : 'text.secondary' }}>
                                    New note “<Box component="span" sx={{ fontWeight: 600, color: active ? g.onHl : 'text.primary' }}>{opt.title}</Box>”
                                </Typography>
                            ) : (
                                <>
                                    <TypeIcon type={opt.type} size={15} sx={active ? { color: g.onHl } : undefined} />
                                    <Typography
                                        component="span"
                                        sx={{ fontSize: '0.875rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'inherit' }}
                                    >
                                        {opt.title}
                                    </Typography>
                                </>
                            )}
                        </Box>
                    );
                })}
            </Box>
        </Paper>,
        document.body,
    );
}

export default WikiLinkPicker;
