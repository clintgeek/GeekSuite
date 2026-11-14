/**
 * Sketch paper components (see paperModel.js for the model):
 *   - PaperBackground: tldraw's `Background` component — the ground colour and
 *     the ruling, which pans and zooms with the camera.
 *   - PaperSync: keeps tldraw's colour scheme and --color-background (text
 *     outlines use it) in step with the paper and the app theme.
 *   - PaperPicker: the toolbar's Paper button and menu.
 * All three live inside <Tldraw> (they use the editor context).
 */
import React, { useEffect, useState } from 'react';
import { Box, IconButton, Popover, Tooltip, Typography, useTheme } from '@mui/material';
import { useEditor, useValue } from '@tldraw/tldraw';
import { PAPER_COLORS, PAPER_PATTERNS, rulingStyle } from './paperModel';
import { usePaper, setPaper } from './usePaper';

export function PaperBackground() {
    const editor = useEditor();
    const { look } = usePaper();
    const camera = useValue('camera', () => editor.getCamera(), [editor]);
    return (
        <div
            className="tl-background"
            data-paper-pattern={look.pattern}
            style={{
                ...(look.background ? { backgroundColor: look.background } : null),
                ...rulingStyle(look.pattern, look.line, camera),
            }}
        />
    );
}

export function PaperSync() {
    const editor = useEditor();
    const { look } = usePaper();
    useEffect(() => {
        editor.user.updateUserPreferences({ colorScheme: look.colorScheme });
    }, [editor, look.colorScheme]);
    useEffect(() => {
        const el = editor.getContainer?.();
        if (!el) return;
        if (look.background) el.style.setProperty('--color-background', look.background);
        else el.style.removeProperty('--color-background');
    }, [editor, look.background]);
    return null;
}

const swatchSx = { width: 44, height: 44, minWidth: 44, borderRadius: 2, border: '2px solid transparent' };

/** A small square of paper, with its ruling drawn at a fixed scale. */
function PaperChip({ background, line, pattern, size = 24 }) {
    const theme = useTheme();
    const ground = background || theme.palette.background.paper;
    return (
        <Box
            aria-hidden
            sx={{
                width: size,
                height: size,
                borderRadius: 1,
                boxShadow: `0 0 0 1px ${theme.palette.divider}`,
                backgroundColor: ground,
                ...rulingStyle(pattern, line, { x: 0, y: 0, z: 0.4 }),
            }}
        />
    );
}

export function PaperPicker() {
    const editor = useEditor();
    const { paper, look } = usePaper();
    const [anchor, setAnchor] = useState(null);
    const lineFor = (colorId) => (PAPER_COLORS.find((c) => c.id === colorId) || PAPER_COLORS[0]).line;

    return (
        <>
            <Tooltip title="Paper" placement="top">
                <IconButton
                    aria-label="Paper"
                    aria-haspopup="dialog"
                    aria-expanded={anchor ? 'true' : 'false'}
                    size="small"
                    onClick={(e) => setAnchor(e.currentTarget)}
                >
                    <PaperChip background={look.background} line={look.line} pattern={paper.pattern} size={20} />
                </IconButton>
            </Tooltip>
            <Popover
                open={Boolean(anchor)}
                anchorEl={anchor}
                onClose={() => setAnchor(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
                transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                slotProps={{ paper: { role: 'dialog', 'aria-label': 'Paper', sx: { p: 3, mb: 2 } } }}
            >
                <Typography component="h2" variant="caption" sx={{ display: 'block', mb: 1, color: 'text.secondary' }}>
                    Colour
                </Typography>
                <Box role="group" aria-label="Paper colour" sx={{ display: 'flex', gap: 1, mb: 3 }}>
                    {PAPER_COLORS.map((c) => (
                        <Tooltip key={c.id} title={c.label} placement="top">
                            <IconButton
                                aria-label={`Paper: ${c.label}`}
                                aria-pressed={paper.color === c.id ? 'true' : 'false'}
                                onClick={() => setPaper(editor, { color: c.id })}
                                sx={{ ...swatchSx, borderColor: paper.color === c.id ? 'primary.main' : 'transparent' }}
                            >
                                <PaperChip background={c.background} line={c.line} pattern="plain" />
                            </IconButton>
                        </Tooltip>
                    ))}
                </Box>
                <Typography component="h2" variant="caption" sx={{ display: 'block', mb: 1, color: 'text.secondary' }}>
                    Lines
                </Typography>
                <Box role="group" aria-label="Paper lines" sx={{ display: 'flex', gap: 1 }}>
                    {PAPER_PATTERNS.map((p) => (
                        <Tooltip key={p.id} title={p.label} placement="top">
                            <IconButton
                                aria-label={`Lines: ${p.label}`}
                                aria-pressed={paper.pattern === p.id ? 'true' : 'false'}
                                onClick={() => setPaper(editor, { pattern: p.id })}
                                sx={{ ...swatchSx, borderColor: paper.pattern === p.id ? 'primary.main' : 'transparent' }}
                            >
                                <PaperChip background={look.background} line={lineFor(paper.color)} pattern={p.id} />
                            </IconButton>
                        </Tooltip>
                    ))}
                </Box>
            </Popover>
        </>
    );
}
