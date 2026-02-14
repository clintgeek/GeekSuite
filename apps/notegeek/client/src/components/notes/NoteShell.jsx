import React from 'react';
import { Box, alpha, useTheme } from '@mui/material';

/**
 * NoteShell - Unified layout wrapper for all note types
 * Provides consistent structure: header area, content area, action area
 * Responsive by design, mobile-first
 */
function NoteShell({
  header,      // NoteMetaBar or custom header
  children,    // Editor/Viewer content
  actions,     // NoteActions or custom actions
  toolbar,     // Optional toolbar (formatting, etc.)
  fullHeight = true,
  disableContentScroll = false
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
        bgcolor: 'background.paper',
        // Subtle warm gradient background
        background: theme.palette.mode === 'light'
          ? `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.02)} 0%, ${theme.palette.background.paper} 100px)`
          : `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, ${theme.palette.background.paper} 100px)`,
      }}
    >
      {/* Header: title, type badge, tags */}
      {header && (
        <Box
          data-note-header
          sx={{
            flexShrink: 0,
            borderBottom: 1,
            borderColor: alpha(theme.palette.divider, 0.6),
            bgcolor: alpha(theme.palette.background.paper, 0.8),
            backdropFilter: 'blur(8px)',
            zIndex: 1,
          }}
        >
          {header}
        </Box>
      )}

      {/* Toolbar: formatting buttons, etc. */}
      {toolbar && (
        <Box
          sx={{
            flexShrink: 0,
            borderBottom: 1,
            borderColor: alpha(theme.palette.divider, 0.6),
            bgcolor: alpha(theme.palette.background.default, 0.8),
            backdropFilter: 'blur(8px)',
          }}
        >
          {toolbar}
        </Box>
      )}

      {/* Content: editor or viewer */}
      <Box
        sx={{
          flexGrow: 1,
          overflow: disableContentScroll ? 'hidden' : 'auto',
          position: 'relative',
          minHeight: 0,
          // Smooth scrolling
          scrollBehavior: 'smooth',
          '&::-webkit-scrollbar': {
            width: 8,
          },
          '&::-webkit-scrollbar-track': {
            bgcolor: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: alpha(theme.palette.text.primary, 0.15),
            borderRadius: 4,
            '&:hover': {
              bgcolor: alpha(theme.palette.text.primary, 0.25),
            },
          },
        }}
      >
        {children}
      </Box>

      {/* Actions: save, delete, etc. - mobile bottom bar */}
      {actions && (
        <Box
          data-mobile-actions
          sx={{
            flexShrink: 0,
            display: { xs: 'block', sm: 'none' },
            borderTop: 1,
            borderColor: alpha(theme.palette.divider, 0.6),
            bgcolor: alpha(theme.palette.background.paper, 0.9),
            backdropFilter: 'blur(12px)',
            // Safe area for notched devices
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
