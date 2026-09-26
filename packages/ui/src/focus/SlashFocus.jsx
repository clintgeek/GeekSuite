/**
 * React side of slash focus (see `slashFocus.js` for the rules).
 *
 * `GeekShell` calls `useSlashFocus()` itself, so apps on the shell get `/` for
 * free. Apps whose layout does not use the shell call the hook once near the
 * root, or wrap the tree in `<SlashFocusProvider>`.
 *
 * `GeekSlashHint` is the little `/` keycap a marked search box can show at its
 * end. Desktop (hover + fine pointer) only, `aria-hidden`, text tokens only.
 */
import { useEffect } from 'react';
import Box from '@mui/material/Box';
import { geekTypography } from '../designTokens.js';
import { installSlashFocus } from './slashFocus.js';

export function useSlashFocus(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined;
    return installSlashFocus(document);
  }, [enabled]);
}

export function SlashFocusProvider({ enabled = true, children }) {
  useSlashFocus(enabled);
  return children ?? null;
}

export function GeekSlashHint({ sx, ...props }) {
  return (
    <Box
      component="kbd"
      aria-hidden="true"
      data-geek-slash-hint=""
      sx={{
        display: 'none',
        '@media (hover: hover) and (pointer: fine)': { display: 'inline-flex' },
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        minWidth: 18,
        height: 18,
        px: 0.5,
        ml: 0.5,
        borderRadius: '4px',
        border: 1,
        borderColor: 'divider',
        fontFamily: (theme) => theme.typography.fontFamilyMono ?? geekTypography.monoFontFamily,
        fontSize: '0.75rem',
        fontWeight: 600,
        lineHeight: 1,
        color: 'text.secondary',
        userSelect: 'none',
        pointerEvents: 'none',
        // Once the box has focus the hint has done its job.
        '.Mui-focused &': { display: 'none' },
        ...sx,
      }}
      {...props}
    >
      /
    </Box>
  );
}
