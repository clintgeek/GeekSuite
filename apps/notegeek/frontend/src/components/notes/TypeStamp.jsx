import React from 'react';
import { Box, ButtonBase, useTheme, alpha } from '@mui/material';
import { NOTE_TYPE_META, noteTypeMeta } from './noteTypeMeta';
import { noteTypeInk, stampFill, tapTarget44 } from '../../theme/tokens';

/**
 * TypeStamp — a note type as an ink stamp: glyph + typewritten label, in the
 * type's ink, outlined, on an 8–12% wash of the same ink.
 *
 * Contrast: the label is 12px, so it must clear 4.5:1 against the stamp's
 * own fill (not the page behind it). `noteTypeInk` is tuned for exactly
 * that — see createAppTheme.js for the numbers.
 *
 * Props:
 *   type      note type key
 *   size      'sm' (22px, rows/header) | 'md' (28px, chips/filters)
 *   onClick   renders a button instead of a span
 *   selected  filter state: solid ink border + stronger wash
 *   label     override the label text (e.g. "New text")
 *   iconOnly  glyph only, label kept for assistive tech
 *   meta      an entry that is not a type (PHOTO_ENTRY): its label and glyph,
 *             in the ink of `meta.inkType`
 */
function TypeStamp({
  type,
  size = 'sm',
  onClick,
  selected,
  label,
  iconOnly = false,
  meta: metaOverride = null,
  sx,
  ...rest
}) {
  const theme = useTheme();
  const meta = metaOverride || noteTypeMeta(type);
  const inkKey = metaOverride?.inkType || type;
  const ink = noteTypeInk(theme, inkKey in NOTE_TYPE_META ? inkKey : 'text');
  const Icon = meta.Icon;
  const isMd = size === 'md';
  const text = label ?? meta.label;

  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: isMd ? '6px' : '4px',
    height: isMd ? 28 : 22,
    px: isMd ? '10px' : '6px',
    borderRadius: '3px',
    border: `1px solid ${alpha(ink, selected ? 0.9 : 0.42)}`,
    bgcolor: selected ? alpha(ink, theme.palette.mode === 'dark' ? 0.18 : 0.13) : stampFill(theme, ink),
    color: ink,
    fontFamily: theme.typography.fontFamilyMono,
    fontSize: '0.75rem',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    userSelect: 'none',
    verticalAlign: 'middle',
  };

  const content = (
    <>
      <Icon aria-hidden sx={{ fontSize: isMd ? 16 : 14, flexShrink: 0 }} />
      {iconOnly ? (
        <Box component="span" sx={visuallyHidden}>{text}</Box>
      ) : (
        <Box component="span">{text}</Box>
      )}
    </>
  );

  if (onClick) {
    // The ink lives on an inner span so the stamp keeps its 28px look while
    // the button grows to the 44px phone floor (MOBILE_UI_PLAN §2) around it.
    return (
      <ButtonBase
        onClick={onClick}
        // Only filters are toggles; a "new note" chip is a plain button.
        aria-pressed={typeof selected === "boolean" ? selected : undefined}
        data-note-type={type}
        sx={{
          borderRadius: '4px',
          flexShrink: 0,
          [theme.breakpoints.down('md')]: { ...tapTarget44 },
          '&:hover .type-stamp': {
            borderColor: alpha(ink, 0.9),
            bgcolor: alpha(ink, theme.palette.mode === 'dark' ? 0.18 : 0.12),
          },
          '&:focus-visible': { outline: `2px solid ${ink}`, outlineOffset: 2 },
          ...sx,
        }}
        {...rest}
      >
        <Box
          component="span"
          className="type-stamp"
          sx={{
            ...base,
            transition: 'background-color 120ms ease, border-color 120ms ease',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        >
          {content}
        </Box>
      </ButtonBase>
    );
  }

  return (
    <Box component="span" className="type-stamp" data-note-type={type} sx={{ ...base, ...sx }} {...rest}>
      {content}
    </Box>
  );
}

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

export default TypeStamp;
