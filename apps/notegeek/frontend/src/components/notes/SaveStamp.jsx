import React, { useEffect, useState } from 'react';
import { Box, Tooltip, useTheme, alpha, keyframes } from '@mui/material';
import { saveStampState } from '../../utils/saveStamp';
import { stampFill, stampInk } from '../../theme/tokens';

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
`;

/**
 * SaveStamp — the editor's save status, set like a rubber stamp.
 *
 * Replaces the Save button: the page autosaves 2s after the last edit, so
 * the only thing the writer needs is to *see* where that stands. Explicit
 * saving still exists (Cmd/Ctrl+S, "Save now" in the ⋯ menu, and Back).
 *
 * "Saved" is the one state in brick, slightly rotated — the stamp has come
 * down on the page. Error is red and stays up until a save succeeds; its
 * detail is in the tooltip and was already raised as a toast. Every label is
 * 12px mono on the stamp's own tint and clears 4.5:1 against it (see
 * createAppTheme.js `stamp`).
 *
 * `role="status"` so a screen reader hears "Saved" without focus moving.
 */
function SaveStamp({ saving, error, empty, dirty, lastSavedAt }) {
  const theme = useTheme();
  const inks = stampInk(theme);

  // Re-render once a minute so "Saved · just now" ages honestly.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!lastSavedAt) return undefined;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, [lastSavedAt]);

  const { tone, label } = saveStampState({ saving, error, empty, dirty, lastSavedAt, now });

  const ink = tone === 'saved' ? inks.ink : tone === 'error' ? inks.error : inks.muted;
  const isSaved = tone === 'saved';
  const isQuiet = tone === 'dirty' || tone === 'draft' || tone === 'empty';

  const stamp = (
    <Box
      role="status"
      aria-live="polite"
      data-save-state={tone}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        height: 24,
        px: '8px',
        borderRadius: '3px',
        border: `1.5px ${isQuiet ? 'dashed' : 'solid'} ${alpha(ink, isQuiet ? 0.5 : 0.75)}`,
        bgcolor: isQuiet ? 'transparent' : stampFill(theme, ink),
        color: ink,
        fontFamily: theme.typography.fontFamilyMono,
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        flexShrink: 0,
        // The stamp has come down: a hair off square. Only for "Saved" —
        // the in-between states are pencil, not ink.
        transform: isSaved ? 'rotate(-1.5deg)' : 'none',
        transition: 'transform 160ms ease, color 160ms ease, border-color 160ms ease',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      {tone === 'saving' && (
        <Box
          component="span"
          aria-hidden
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: 'currentColor',
            animation: `${pulse} 1s ease-in-out infinite`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        />
      )}
      {label}
    </Box>
  );

  if (tone === 'error' && typeof error === 'string' && error) {
    return (
      <Tooltip title={error} arrow>
        {stamp}
      </Tooltip>
    );
  }
  return stamp;
}

export default SaveStamp;
