import React from 'react';
import { Box, ButtonBase, Typography, useTheme } from '@mui/material';
import { graphiteTokens, tapTarget44 } from '../../theme/tokens';

/**
 * A list header's select control (spec COMPOSE_MANY_AND_ARCHIVE U1).
 *
 *   not selecting → a quiet "Select" button (every size; a phone can also
 *                   long-press a row)
 *   selecting     → "N selected" and Cancel (Esc does the same)
 *
 * The count is a polite live region, so a screen reader hears each toggle.
 */
export function SelectButton({ selection, label = 'Select', sx }) {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  return (
    <ButtonBase
      onClick={() => selection.enter()}
      data-select-enter=""
      sx={{
        ...tapTarget44,
        px: '8px',
        borderRadius: '8px',
        fontSize: '0.8125rem',
        fontWeight: 500,
        color: 'text.secondary',
        flexShrink: 0,
        '&:hover': { color: 'text.primary' },
        '&:focus-visible': { outline: `2px solid ${g.ink}`, outlineOffset: -2 },
        ...sx,
      }}
    >
      {label}
    </ButtonBase>
  );
}

export function SelectedCount({ selection, sx }) {
  return (
    <Typography
      component="h2"
      variant="h6"
      aria-live="polite"
      data-select-count=""
      sx={{ color: 'text.primary', fontWeight: 600, m: 0, mr: 'auto', whiteSpace: 'nowrap', ...sx }}
    >
      {selection.count} selected
    </Typography>
  );
}

export function CancelSelect({ selection, sx }) {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  return (
    <ButtonBase
      onClick={selection.exit}
      data-select-cancel=""
      sx={{
        ...tapTarget44,
        px: '12px',
        borderRadius: '8px',
        fontSize: '0.875rem',
        fontWeight: 600,
        color: 'text.primary',
        flexShrink: 0,
        '&:hover': { bgcolor: g.paper },
        '&:focus-visible': { outline: `2px solid ${g.ink}`, outlineOffset: -2 },
        ...sx,
      }}
    >
      Cancel
    </ButtonBase>
  );
}

/**
 * The header row while selecting: "N selected" on the left, Cancel on the
 * right. Sticky, so it stays in reach while the list scrolls under it.
 */
export function SelectingHeader({ selection, sx }) {
  const theme = useTheme();
  return (
    <Box
      data-selecting-header=""
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 2,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        px: '8px',
        py: '2px',
        mb: '4px',
        bgcolor: 'background.default',
        borderBottom: `1px solid ${theme.palette.divider}`,
        ...sx,
      }}
    >
      <SelectedCount selection={selection} />
      <CancelSelect selection={selection} />
    </Box>
  );
}
