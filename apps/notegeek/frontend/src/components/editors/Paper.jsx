/**
 * Sketch paper components (see paperModel.js for the model):
 *   - PaperBackground: tldraw's `Background` component — the ground colour and
 *     the ruling, which pans and zooms with the camera; and the sketch's page
 *     template, if it has one (DOCS/TEMPLATES_SPEC.md P2, P5), as a picture
 *     of one sheet at page (0, 0). It is part of the background, never of
 *     the drawing: no shape, so nothing can select, erase or export it.
 *   - PaperSync: keeps tldraw's colour scheme and --color-background (text
 *     outlines use it) in step with the paper and the app theme.
 *   - PaperPicker: the toolbar's Paper button and menu (colour, lines, template).
 * All three live inside <Tldraw> (they use the editor context).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Box, ButtonBase, IconButton, Popover, Tooltip, Typography, useTheme } from '@mui/material';
import { useEditor, useValue } from '@tldraw/tldraw';
import { PAPER_TEMPLATES, paperTemplateDataUri } from '@geeksuite/ui';
import { PAPER_COLORS, PAPER_PATTERNS, rulingStyle, templateColors, templateSheetBox } from './paperModel';
import { usePaper, setPaper, setPaperTemplate } from './usePaper';
import { popoverOrigins, tooltipPlacement, useSketchPortal } from './sketchPortal';

export function PaperBackground() {
    const editor = useEditor();
    const { look, template } = usePaper();
    const camera = useValue('camera', () => editor.getCamera(), [editor]);
    const { ink, line, accent } = templateColors(look);
    const sheetSrc = useMemo(
        () => (template ? paperTemplateDataUri(template, { ink, line, accent }) : null),
        [template, ink, line, accent],
    );
    // No template (never chosen, None, or an id this build does not know):
    // exactly the element this always was.
    if (!sheetSrc) {
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
    // A template replaces the ruling: two sets of lines at different pitches
    // fight each other, and the sheet has its own. The sketch keeps its
    // `paperPattern`, so the ruling is back when the template is set to None.
    const sheet = templateSheetBox(camera);
    return (
        <div
            className="tl-background"
            data-paper-pattern={look.pattern}
            data-paper-template={template}
            style={{
                ...(look.background ? { backgroundColor: look.background } : null),
                overflow: 'hidden',
            }}
        >
            {sheet ? (
                <img
                    src={sheetSrc}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    data-paper-template-sheet={template}
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: sheet.width,
                        height: sheet.height,
                        maxWidth: 'none',
                        transform: `translate(${sheet.left}px, ${sheet.top}px)`,
                        transformOrigin: '0 0',
                        pointerEvents: 'none',
                        userSelect: 'none',
                    }}
                />
            ) : null}
        </div>
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
    dots: 'M5 6h.01M10 6h.01M15 6h.01M5 11h.01M10 11h.01M15 11h.01M5 16h.01M10 16h.01M15 16h.01M5 21h.01M10 21h.01M15 21h.01',
    grid: 'M6 2v24M10 2v24M14 2v24M2 6h16M2 10h16M2 14h16M2 18h16M2 22h16',
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
            <path d={TEMPLATE_GLYPHS[id] || ''} strokeWidth={id === 'dots' ? 1.6 : 0.9} opacity={id === 'dots' ? 1 : 0.8} />
        </Box>
    );
}

const TEMPLATE_CHOICES = [{ id: null, key: 'none', label: 'None' }, ...PAPER_TEMPLATES.map((t) => ({ id: t.id, key: t.id, label: t.label }))];

export function PaperPicker() {
    const editor = useEditor();
    const theme = useTheme();
    const { paper, look, template } = usePaper();
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
                {/* A printed layout behind the ink, for this sketch only
                    (DOCS/TEMPLATES_SPEC.md P5). Named buttons, not swatches:
                    seven sheets drawn 24px wide all look alike. */}
                <Typography component="h2" variant="caption" sx={{ display: 'block', mt: 3, mb: 1, color: 'text.secondary' }}>
                    Template
                </Typography>
                <Box
                    role="group"
                    aria-label="Paper template"
                    sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1, width: 252 }}
                >
                    {TEMPLATE_CHOICES.map((t) => {
                        const on = template === t.id;
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
                {template ? (
                    <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary', maxWidth: 252 }}>
                        A template takes the place of the lines.
                    </Typography>
                ) : null}
            </Popover>
        </>
    );
}
