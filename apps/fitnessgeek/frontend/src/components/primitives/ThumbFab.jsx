import React from 'react';
import { createPortal } from 'react-dom';
import { Fab } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useGeekShell, useFocusMode } from '@geeksuite/ui';

/**
 * A page's main action in the thumb zone, with its words ("Log weight",
 * "Add BP").
 *
 * The shell's own FAB (`useGeekPrimaryAction`) collapses to an icon-only "+"
 * below `sm` — on a phone, exactly where this page is used, it was an
 * unlabelled plus (review Phase 1.8). The shared registry doesn't pass
 * `extended` through, so this page draws its own: same spot (right 16px,
 * above the bottom nav and the safe area, like `GeekFab`), MUI's extended Fab,
 * label always visible.
 *
 * Portalled to `document.body` for the reason `GeekFab` lives outside the
 * frame: the route transition is a transformed element, and a transformed
 * ancestor becomes the containing block for `position: fixed`.
 */
const ThumbFab = ({ onClick, label, testId }) => {
  const { bottomInset = 0 } = useGeekShell() || {};
  const { focusMode } = useFocusMode() || {};
  if (focusMode || typeof document === 'undefined') return null;

  return createPortal(
    <Fab
      variant="extended"
      color="primary"
      onClick={onClick}
      data-testid={testId}
      sx={(theme) => ({
        position: 'fixed',
        right: '16px',
        bottom: `calc(16px + ${bottomInset}px + env(safe-area-inset-bottom))`,
        height: 56,
        minHeight: 56,
        px: 2.5,
        gap: 1,
        borderRadius: '16px',
        fontSize: '1rem',
        fontWeight: 700,
        textTransform: 'none',
        boxShadow: theme.shadows[6],
        zIndex: theme.zIndex.speedDial,
        // The desktop card is the action at md+.
        display: { xs: 'inline-flex', md: 'none' },
      })}
    >
      <AddIcon />
      {label}
    </Fab>,
    document.body
  );
};

export default ThumbFab;
