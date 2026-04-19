import React from 'react';
import { Box, useTheme } from '@mui/material';

/**
 * NoteShell — Unified layout wrapper for all note types.
 *
 * Three vertical zones:
 *   1. Sticky header (NoteMetaBar) — paper bg, hairline bottom border
 *   2. Content area (editor) — elevated bg (whitest white), 4px corners
 *   3. Sticky footer (NoteActions) — visible on mobile, thumb-reachable
 *
 * The elevated background on the content zone is intentionally brighter
 * than the surrounding chrome — it reads as "this is a sheet of paper."
 * No shadows, no gradient. A 4px border-radius signals "content, not chrome."
 */
function NoteShell({
  header,
  children,
  actions,
  toolbar,
  fullHeight = true,
  disableContentScroll = false,
}) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: fullHeight ? '100%' : 'auto',
        width: '100%',
        maxWidth: '100%',
        overflow: 'hidden',
        bgcolor: 'background.default',
      }}
    >
      {/* ── Header zone: NoteMetaBar ──────────────────────────────────── */}
      {header && (
        <Box
          data-note-header
          sx={{
            flexShrink: 0,
            bgcolor: theme.palette.surfaces.paper,
            borderBottom: `1px solid ${theme.palette.divider}`,
            zIndex: 1,
          }}
        >
          {header}
        </Box>
      )}

      {/* ── Toolbar zone (formatting bar, etc.) ──────────────────────── */}
      {toolbar && (
        <Box
          sx={{
            flexShrink: 0,
            bgcolor: theme.palette.surfaces.paper,
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}
        >
          {toolbar}
        </Box>
      )}

      {/* ── Content zone: the writing surface ────────────────────────── */}
      <Box
        sx={{
          flexGrow: 1,
          overflow: disableContentScroll ? 'hidden' : 'auto',
          position: 'relative',
          minHeight: 0,
          // The elevated bg is enough to read as "lifted" — no shadow needed
          bgcolor: theme.palette.surfaces.elevated,
          // 4px corners on the inner surface (sharper than chrome)
          // Only bottom corners get radius when header is present
          borderRadius: header ? '0 0 4px 4px' : '4px',
          // Padding: generous on desktop, comfortable on mobile
          '& > *': {
            // pass-through: editors handle their own internal padding
          },
          // Thin scrollbar matching the cream surface
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: theme.palette.border,
            borderRadius: 3,
            '&:hover': { bgcolor: theme.palette.text.disabled },
          },
        }}
      >
        {children}
      </Box>

      {/* ── Footer zone: NoteActions (always on mobile) ───────────────── */}
      {actions && (
        <Box
          data-mobile-actions
          sx={{
            flexShrink: 0,
            display: { xs: 'block', sm: 'none' },
            bgcolor: theme.palette.surfaces.paper,
            borderTop: `1px solid ${theme.palette.divider}`,
            pb: 'env(safe-area-inset-bottom)',
          }}
        >
          {actions}
        </Box>
      )}
    </Box>
  );
}

export default NoteShell;
