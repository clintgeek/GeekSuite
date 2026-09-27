import React from 'react';
import { Box, useTheme } from '@mui/material';
import { border, dotGridBackground, layout, surfaces } from '../../theme/tokens';

/**
 * NoteShell — the page every note is written on.
 *
 * Two shapes, one chrome:
 *
 *   variant="page"   (rich text, markdown, code)
 *     A sheet of warm paper, centred on the dot-grid desk at desktop and
 *     edge to edge on a phone, as tall as the viewport at least. The WHOLE
 *     sheet scrolls — head, toolbar and body together — so the title
 *     scrolls away like a page and a sticky toolbar (the editor's own) pins
 *     to the top of this scroller. Everything inside shares one text column
 *     of `layout.measure` (~70ch), so the title, the toolbar and the first
 *     line of the body all start on the same edge.
 *
 *   variant="canvas" (mind map, sketch)
 *     The same head, on the same column, above a full-bleed canvas that
 *     does NOT scroll: tldraw computes pointer positions off its own
 *     bounding box, and a scrolling ancestor put strokes an inch below the
 *     stylus (DOCS/HANDWRITTEN_EDITOR_MOBILE_FIX.md). `disableContentScroll`
 *     keeps that promise explicitly.
 *
 * `actions` is still honoured as a phone-only footer for any caller that
 * wants one; the editor page no longer passes it (its controls live in the
 * head: Back, the save stamp and the ⋯ menu).
 */
function NoteShell({
  header,
  children,
  actions,
  toolbar,
  variant = 'page',
  fullHeight = true,
  disableContentScroll = false,
}) {
  const theme = useTheme();
  const { elevated } = surfaces(theme);
  const gutter = layout.sheetGutter;

  // The text column: measure wide, centred in the sheet.
  const column = {
    width: '100%',
    maxWidth: layout.measure,
    mx: 'auto',
  };

  if (variant === 'canvas') {
    return (
      <Box
        data-note-shell="canvas"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: fullHeight ? '100%' : 'auto',
          flex: fullHeight ? 1 : undefined,
          minHeight: 0,
          width: '100%',
          overflow: 'hidden',
          bgcolor: 'background.default',
        }}
      >
        {header && (
          <Box
            data-note-header
            sx={{
              flexShrink: 0,
              bgcolor: elevated,
              borderBottom: `1px solid ${border(theme)}`,
              px: { xs: `${gutter.xs}px`, sm: `${gutter.sm}px`, md: `${gutter.md}px` },
              zIndex: 1,
            }}
          >
            <Box sx={column}>{header}</Box>
          </Box>
        )}
        {toolbar && <Box sx={{ flexShrink: 0 }}>{toolbar}</Box>}
        <Box
          data-note-canvas
          sx={{
            flexGrow: 1,
            minHeight: 0,
            position: 'relative',
            overflow: 'hidden',
            ...(disableContentScroll ? { touchAction: 'none' } : null),
          }}
        >
          {children}
        </Box>
        {actions && <MobileFooter>{actions}</MobileFooter>}
      </Box>
    );
  }

  return (
    <Box
      data-note-shell="page"
      data-note-scroll
      sx={{
        height: fullHeight ? '100%' : 'auto',
        flex: fullHeight ? 1 : undefined,
        minHeight: 0,
        width: '100%',
        overflowY: disableContentScroll ? 'hidden' : 'auto',
        overflowX: 'hidden',
        bgcolor: 'background.default',
        // The desk: dot grid, visible around the sheet from `md` up. On a
        // phone the sheet is edge to edge and the grid would only sit under
        // text, so it is not drawn at all.
        [theme.breakpoints.up('md')]: dotGridBackground(theme),
        scrollbarWidth: 'thin',
        '&::-webkit-scrollbar': { width: 8 },
        '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
        '&::-webkit-scrollbar-thumb': { bgcolor: border(theme), borderRadius: 4 },
      }}
    >
      <Box
        data-note-sheet
        sx={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          maxWidth: layout.measure + 2 * gutter.md,
          mx: 'auto',
          minHeight: '100%',
          bgcolor: elevated,
          px: { xs: `${gutter.xs}px`, sm: `${gutter.sm}px`, md: `${gutter.md}px` },
          [theme.breakpoints.up('md')]: {
            // Paper lying on the desk: a margin of desk above it, hairline
            // edges, and the faintest contact shadow — no offset, no drama.
            mt: '24px',
            minHeight: 'calc(100% - 24px)',
            borderLeft: `1px solid ${border(theme)}`,
            borderRight: `1px solid ${border(theme)}`,
            borderTop: `1px solid ${border(theme)}`,
            borderRadius: '4px 4px 0 0',
            boxShadow: theme.palette.mode === 'dark'
              ? '0 1px 3px rgba(0, 0, 0, 0.35)'
              : '0 1px 3px rgba(31, 28, 22, 0.06)',
          },
        }}
      >
        {header && (
          <Box data-note-header sx={{ ...column, flexShrink: 0 }}>
            {header}
          </Box>
        )}
        {toolbar && <Box sx={{ ...column, flexShrink: 0 }}>{toolbar}</Box>}
        <Box
          data-note-body
          sx={{
            ...column,
            flex: '1 0 auto',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            pb: { xs: '32px', md: '64px' },
          }}
        >
          {children}
        </Box>
      </Box>
      {actions && <MobileFooter>{actions}</MobileFooter>}
    </Box>
  );
}

function MobileFooter({ children }) {
  const theme = useTheme();
  return (
    <Box
      data-mobile-actions
      sx={{
        flexShrink: 0,
        display: { xs: 'block', md: 'none' },
        bgcolor: surfaces(theme).paper,
        borderTop: `1px solid ${theme.palette.divider}`,
        pb: 'env(safe-area-inset-bottom)',
      }}
    >
      {children}
    </Box>
  );
}

export default NoteShell;
