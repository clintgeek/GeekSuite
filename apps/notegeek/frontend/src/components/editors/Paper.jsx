/**
 * Sketch paper components (see paperModel.js for the model):
 *   - PaperBackground: tldraw's `Background` component — the ground colour and
 *     the ruling, which pans and zooms with the camera. Paper only: a
 *     template is not drawn here, it is a shape in the drawing.
 *   - PaperSync: keeps tldraw's colour scheme and --color-background (text
 *     outlines use it) in step with the paper and the app theme.
 *   - PaperPicker: the toolbar's Paper button and menu: colour and lines
 *     (the paper), and, separately, the template sheet printed into the
 *     sketch (DOCS/TEMPLATES_SPEC.md T1–T8).
 * All three live inside <Tldraw> (they use the editor context).
 */
import React, { useEffect, useState } from 'react';
import { Box, ButtonBase, IconButton, Popover, Tooltip, Typography, useTheme } from '@mui/material';
import { useEditor, useValue } from '@tldraw/tldraw';
import { PAPER_SHEET_TEMPLATES } from '@geeksuite/ui';
import { PAPER_COLORS, PAPER_PATTERNS, rulingStyle } from './paperModel';
import { usePaper, setPaper, setPaperTemplate } from './usePaper';
import { popoverOrigins, tooltipPlacement, useSketchPortal } from './sketchPortal';

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

/**
 * A template drawn small: the sheet's outline and the few lines that make it
 * recognisable. The real sheet at this size is a grey block.
 */
const TEMPLATE_GLYPHS = {
    none: '',
    schedule: 'M7 2v24M2 7h5M2 12h5M2 17h5M2 22h5',
    top3: 'M4 5h3v3H4zM4 10h3v3H4zM4 15h3v3H4zM9 6.5h7M9 11.5h7M9 16.5h7M4 22h12',
    meeting: 'M2 9h16M10 2v7M13 9v17M15 13h1.5M15 17h1.5M15 21h1.5',
    cornell: 'M7 2v18M2 20h16',
};

function TemplateGlyph({ id }) {
    return (
        <Box
            component="svg"
            viewBox="0 0 20 28"
            aria-hidden="true"
            focusable="false"
            sx={{ width: 20, height: 28, flexShrink: 0, fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' }}
        >
            <rect x="1.5" y="1.5" width="17" height="25" rx="1.5" strokeWidth="1.25" />
            <path d={TEMPLATE_GLYPHS[id] || ''} strokeWidth={0.9} opacity={0.8} />
        </Box>
    );
}

const TEMPLATE_CHOICES = [{ id: null, key: 'none', label: 'None' }, ...PAPER_SHEET_TEMPLATES.map((t) => ({ id: t.id, key: t.id, label: t.label }))];

export function PaperPicker() {
    const editor = useEditor();
    const theme = useTheme();
    const { paper, look, template, hasSheet } = usePaper();
    const [anchor, setAnchor] = useState(null);
    // Into the sketch's container (visible in fullscreen), opening away from the bar.
    const { container, position } = useSketchPortal();
    const origins = popoverOrigins(position);
    const tip = { placement: tooltipPlacement(position), slotProps: { popper: { container } } };
    const lineFor = (colorId) => (PAPER_COLORS.find((c) => c.id === colorId) || PAPER_COLORS[0]).line;

    return (
        <>
            <Tooltip title="Paper" {...tip}>
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
                container={container}
                onClose={() => setAnchor(null)}
                anchorOrigin={origins.anchorOrigin}
                transformOrigin={origins.transformOrigin}
                slotProps={{ paper: { role: 'dialog', 'aria-label': 'Paper', sx: { p: 3, ...origins.gap } } }}
            >
                <Typography component="h2" variant="caption" sx={{ display: 'block', mb: 1, color: 'text.secondary' }}>
                    Colour
                </Typography>
                <Box role="group" aria-label="Paper colour" sx={{ display: 'flex', gap: 1, mb: 3 }}>
                    {PAPER_COLORS.map((c) => (
                        <Tooltip key={c.id} title={c.label} {...tip}>
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
                        <Tooltip key={p.id} title={p.label} {...tip}>
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
                {/* Not paper: a white sheet printed into the sketch itself
                    (DOCS/TEMPLATES_SPEC.md T1–T5). Colour and lines above
                    never change it. Named buttons, not swatches: sheets
                    drawn 24px wide all look alike. */}
                <Typography component="h2" variant="caption" sx={{ display: 'block', mt: 3, mb: 1, color: 'text.secondary' }}>
                    Template
                </Typography>
                <Box
                    role="group"
                    aria-label="Paper template"
                    sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1, width: 252 }}
                >
                    {TEMPLATE_CHOICES.map((t) => {
                        const on = t.id ? template === t.id : !hasSheet;
                        return (
                            <ButtonBase
                                key={t.key}
                                aria-label={`Template: ${t.label}`}
                                aria-pressed={on ? 'true' : 'false'}
                                data-paper-template-choice={t.key}
                                onClick={() => setPaperTemplate(editor, t.id)}
                                sx={{
                                    justifyContent: 'flex-start',
                                    gap: 1,
                                    minHeight: 44,
                                    px: 1,
                                    borderRadius: 2,
                                    border: '2px solid',
                                    borderColor: on ? 'primary.main' : 'transparent',
                                    color: 'text.primary',
                                    fontSize: '0.8125rem',
                                    fontWeight: on ? 600 : 500,
                                    textAlign: 'left',
                                    '&:hover': { bgcolor: 'action.hover' },
                                    '&:focus-visible': { outline: `2px solid ${theme.palette.text.primary}`, outlineOffset: 2 },
                                }}
                            >
                                <TemplateGlyph id={t.key} />
                                {t.label}
                            </ButtonBase>
                        );
                    })}
                </Box>
                <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary', maxWidth: 252 }}>
                    {hasSheet
                        ? 'Printed into this sketch on a white sheet. Your paper carries on around it. None takes it off.'
                        : 'Prints a white sheet into this sketch. Your paper carries on around it.'}
                </Typography>
            </Popover>
        </>
    );
}
