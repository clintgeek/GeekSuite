import React, { useEffect, useState } from 'react';
import { Box, ButtonBase, Tooltip, useTheme, keyframes } from '@mui/material';
import CloudOffOutlined from '@mui/icons-material/CloudOffOutlined';
import ErrorOutline from '@mui/icons-material/ErrorOutline';
import { saveStampState } from '../../utils/saveStamp';
import { graphiteTokens, tapTarget44 } from '../../theme/tokens';

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
`;

/** Re-render twice a minute so "saved · just now" ages honestly. */
function useAgingNow(lastSavedAt) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!lastSavedAt) return undefined;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, [lastSavedAt]);
  return now;
}

/**
 * SaveStatus — the editor's save state, QUIET.
 *
 * Small lowercase mono in secondary ink, under the title, beside the type:
 * "saved · 3m ago", "editing", "saving…". It is always there and always the
 * one `role="status"` on the page, so a screen reader hears every change
 * without focus moving. When a save has failed it says so here too ("not
 * saved", in the error ink) — and `SaveAlert` puts the loud version in the
 * header.
 */
export function SaveStatus({ saving, error, empty, dirty, offline, lastSavedAt, sx }) {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const now = useAgingNow(lastSavedAt);
  const { tone, label, loud } = saveStampState({ saving, error, empty, dirty, offline, lastSavedAt, now });

  return (
    <Box
      component="span"
      role="status"
      aria-live="polite"
      data-save-state={tone}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontFamily: theme.typography.fontFamilyMono,
        wordSpacing: 'normal',
        fontSize: '0.75rem',
        lineHeight: 1.3,
        color: loud ? g.error : 'text.secondary',
        whiteSpace: 'nowrap',
        ...sx,
      }}
    >
      {tone === 'saving' && (
        <Box
          component="span"
          aria-hidden
          sx={{
            width: 5,
            height: 5,
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
}

/**
 * SaveAlert — the save state, LOUD, and only when it has to be: a failed
 * save, or unsaved work while offline. Error ink on its own tint, an icon,
 * and a Retry. Renders nothing when things are fine, so the header's prime
 * spot is empty on a good day.
 *
 * The detail (the gateway's message) is in the tooltip and was already
 * raised as a toast.
 */
export function SaveAlert({ saving, error, empty, dirty, offline, lastSavedAt, onRetry, compact = false, sx }) {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const { tone, label, loud } = saveStampState({ saving, error, empty, dirty, offline, lastSavedAt });
  if (!loud) return null;

  const Icon = tone === 'offline' ? CloudOffOutlined : ErrorOutline;
  const pill = (
    <Box
      data-save-alert={tone}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        minHeight: 32,
        pl: '10px',
        pr: onRetry ? '2px' : '10px',
        borderRadius: '999px',
        bgcolor: g.errorFill,
        color: g.error,
        fontSize: '0.8125rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        ...sx,
      }}
    >
      <Icon aria-hidden sx={{ fontSize: 16 }} />
      <span>{compact && tone === 'offline' ? 'offline' : label}</span>
      {onRetry && (
        <ButtonBase
          onClick={onRetry}
          disabled={saving}
          sx={{
            ...tapTarget44,
            px: '10px',
            borderRadius: '999px',
            fontSize: '0.8125rem',
            fontWeight: 650,
            color: g.error,
            textDecoration: 'underline',
            textUnderlineOffset: '3px',
            '&:hover': { textDecorationThickness: '2px' },
            '&:focus-visible': { outline: `2px solid ${g.error}`, outlineOffset: -4 },
          }}
        >
          Retry
        </ButtonBase>
      )}
    </Box>
  );

  if (typeof error === 'string' && error) {
    return <Tooltip title={error} arrow>{pill}</Tooltip>;
  }
  return pill;
}

export default SaveStatus;
