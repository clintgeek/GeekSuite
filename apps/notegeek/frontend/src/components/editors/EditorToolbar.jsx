import React from 'react';
import { Box, IconButton, Portal, Tooltip, useMediaQuery, useTheme } from '@mui/material';
import useKeyboardInset from '../../hooks/useKeyboardInset';
import useEditorChrome from '../../store/editorChromeStore';
import { SaveAlert } from '../notes/SaveStatus';
import { graphiteTokens, tapTarget44 } from '../../theme/tokens';

/** The docked bar's height on a phone, without the safe-area inset. */
export const DOCKED_TOOLBAR_HEIGHT = 52;

/**
 * EditorToolbar — the one formatting strip every page-type editor uses.
 *
 * Desktop: a slim row on the text column's left edge, `position: sticky`
 * against NoteShell's page scroller, so it stays in reach while the title
 * scrolls away.
 *
 * Phone: docked to the bottom of the screen and riding on top of the
 * on-screen keyboard (useKeyboardInset, visualViewport), one row that
 * scrolls sideways if it has to, 44px targets. It is portalled to <body>:
 * the frame's route transition is a transformed element, and a transformed
 * ancestor turns `position: fixed` into "fixed to that element". NoteShell
 * pads the page so the last line is never under it.
 *
 * Tapping a button must not take the caret out of the text (that would close
 * the keyboard and bring the top bar back), so the bar swallows `mousedown`.
 * A LOUD save status (SaveAlert via editorChromeStore) rides at the start of
 * the docked bar, because by the time you are typing the note's own head has
 * scrolled away.
 */
function EditorToolbar({ label, children, trailing = null, docked: dockedProp }) {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const isPhone = useMediaQuery(theme.breakpoints.down('md'));
  const docked = dockedProp ?? isPhone;
  const inset = useKeyboardInset();
  const saveAlert = useEditorChrome((s) => s.saveAlert);
  const retrySave = useEditorChrome((s) => s.retrySave);

  const keepCaret = (e) => {
    // Buttons only: a <select> or input inside the bar still takes focus.
    if (e.target.closest('button')) e.preventDefault();
  };

  if (!docked) {
    return (
      <Box
        role="toolbar"
        aria-label={label}
        data-editor-toolbar="inline"
        onMouseDown={keepCaret}
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '2px',
          py: '4px',
          mb: '16px',
          ml: '-7px',
          bgcolor: g.sheet,
          borderBottom: `1px solid ${g.rule}`,
          flexShrink: 0,
        }}
      >
        {children}
        {trailing && <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center' }}>{trailing}</Box>}
      </Box>
    );
  }

  return (
    <Portal>
      <Box
        role="toolbar"
        aria-label={label}
        data-editor-toolbar="docked"
        onMouseDown={keepCaret}
        sx={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: `${inset}px`,
          zIndex: theme.zIndex.appBar,
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          minHeight: DOCKED_TOOLBAR_HEIGHT,
          px: '4px',
          // Only the keyboard-less bar sits on the home indicator.
          pb: inset ? 0 : 'env(safe-area-inset-bottom, 0px)',
          bgcolor: g.paper,
          borderTop: `1px solid ${g.rule}`,
        }}
      >
        {saveAlert && (
          <SaveAlert
            error={saveAlert.tone === 'error' ? saveAlert.detail || 'not saved' : null}
            offline={saveAlert.tone === 'offline'}
            dirty={saveAlert.tone === 'offline'}
            onRetry={retrySave || undefined}
            compact
            sx={{ ml: '4px', mr: '4px' }}
          />
        )}
        {/* The tools scroll sideways if they must; the trailing mode switch
            stays put at the right edge. */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {children}
        </Box>
        {trailing && (
          <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, pl: '4px', borderLeft: `1px solid ${g.rule}` }}>
            {trailing}
          </Box>
        )}
      </Box>
    </Portal>
  );
}

/** A toolbar button: 32px on desktop, 44px on a phone; active = highlighter. */
export function ToolButton({ label, active, onClick, children }) {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  return (
    <Tooltip title={label}>
        <IconButton
          aria-label={label}
          // Marks (bold…) are toggles; one-shot edits are plain buttons.
          aria-pressed={typeof active === 'boolean' ? active : undefined}
          onClick={onClick}
          sx={{
            flexShrink: 0,
            width: 32,
            height: 32,
            // The suite theme floors every IconButton at 44px; the desktop
            // strip opts down to 32 above `md` only.
            minWidth: 32,
            minHeight: 32,
            borderRadius: '6px',
            color: active ? g.onHl : 'text.secondary',
            bgcolor: active ? g.hl : 'transparent',
            [theme.breakpoints.down('md')]: { ...tapTarget44 },
            '&:hover': { bgcolor: active ? g.hl : g.paper, color: active ? g.onHl : 'text.primary' },
            '& svg': { fontSize: 19 },
          }}
        >
          {children}
        </IconButton>
    </Tooltip>
  );
}

/** A thin rule between groups (desktop only). */
export function ToolSeparator() {
  return (
    <Box
      aria-hidden
      sx={{ width: '1px', height: 16, bgcolor: 'divider', mx: '6px', flexShrink: 0, display: { xs: 'none', md: 'block' } }}
    />
  );
}

export default EditorToolbar;
