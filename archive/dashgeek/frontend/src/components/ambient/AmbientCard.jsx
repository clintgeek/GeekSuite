import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';

/**
 * AmbientCard — glass chassis used on the Ambient (`/`) screen.
 *
 * Differs from LedgerCard: no domain-color left border, lightly
 * translucent glass surface, a 6px domain-color dot next to the
 * mono uppercase title, and a single quiet "Not connected" /
 * "Reconnect {Provider}" empty row that replaces the big chip.
 *
 * Props:
 *   domain           – 'notegeek' | 'bujogeek' | 'bookgeek' | ... or
 *                      'primary' (falls back to palette.primary.main).
 *                      Drives only the 6px title-prefix dot color.
 *   title            – Uppercase label, e.g. "SPOTIFY". Rendered mono.
 *   onClick          – Whole-card click. Not rendered when empty.
 *   loading          – Shows a small dim "Loading…" line.
 *   empty            – Renders the single quiet "Not connected →" row.
 *   emptyLabel       – Optional copy override for the empty row.
 *   emptyHref        – Router path the empty row links to.
 *   expiredProvider  – Provider name (e.g. 'google'). Renders
 *                      "Reconnect {Provider} →" and takes precedence
 *                      over `empty`.
 *   children         – Card body (visible when not loading / empty /
 *                      expired).
 */
const PROVIDER_LABEL = {
  google:  'Google',
  spotify: 'Spotify',
};

export default function AmbientCard({
  domain,
  title,
  onClick,
  loading = false,
  empty = false,
  emptyLabel = 'Not connected',
  emptyHref = '/settings/connections',
  expiredProvider = null,
  children,
}) {
  const theme = useTheme();
  const navigate = useNavigate();
  const isLight = theme.palette.mode === 'light';

  const domainColor =
    domain === 'primary'
      ? theme.palette.primary.main
      : domain
        ? theme.palette.domains?.[domain] ?? theme.palette.primary.main
        : theme.palette.primary.main;

  const glassBg = isLight
    ? 'rgba(0, 0, 0, 0.03)'
    : 'rgba(255, 255, 255, 0.03)';
  const glassBgHover = isLight
    ? 'rgba(0, 0, 0, 0.05)'
    : 'rgba(255, 255, 255, 0.05)';
  const glassBorder = isLight
    ? 'rgba(0, 0, 0, 0.06)'
    : 'rgba(255, 255, 255, 0.06)';

  const showExpired = !!expiredProvider;
  const showEmpty = !showExpired && empty;
  const showLoading = !showExpired && !showEmpty && loading;
  const isInteractive = showExpired || showEmpty || !!onClick;

  const handleClick = () => {
    if (showExpired || showEmpty) {
      navigate(emptyHref);
      return;
    }
    if (onClick) onClick();
  };

  const emptyRowLabel = showExpired
    ? `Reconnect ${PROVIDER_LABEL[expiredProvider] ?? expiredProvider}`
    : emptyLabel;

  return (
    <Box
      component={isInteractive ? 'button' : 'div'}
      type={isInteractive ? 'button' : undefined}
      onClick={isInteractive ? handleClick : undefined}
      aria-label={isInteractive ? title : undefined}
      sx={{
        // reset button
        appearance: 'none',
        border: `1px solid ${glassBorder}`,
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
        // visual
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        flexShrink: 0, // don't compress on short viewports
        p: 3,
        borderRadius: '16px',
        backgroundColor: glassBg,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        cursor: isInteractive ? 'pointer' : 'default',
        transition: 'background-color 160ms ease, border-color 160ms ease',
        '&:hover': isInteractive
          ? {
              backgroundColor: glassBgHover,
            }
          : undefined,
        '&:focus-visible': {
          outline: 'none',
          boxShadow: `0 0 0 2px ${theme.palette.glow?.ring ?? theme.palette.primary.main}`,
        },
      }}
    >
      {/* Title row: dot + mono uppercase */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 1.5,
        }}
      >
        <Box
          aria-hidden="true"
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            flexShrink: 0,
            backgroundColor: domainColor,
          }}
        />
        <Typography
          component="span"
          sx={{
            fontFamily:
              theme.typography.fontFamilyMono ??
              '"JetBrains Mono", "Geist Mono", ui-monospace, monospace',
            fontWeight: 600,
            fontSize: '0.75rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'text.secondary',
            lineHeight: 1,
          }}
        >
          {title}
        </Typography>
      </Box>

      {/* Body */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        {showExpired || showEmpty ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              color: 'text.disabled',
            }}
          >
            <Typography
              variant="body2"
              sx={{
                color: 'text.disabled',
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {emptyRowLabel}
            </Typography>
            <Box
              component="span"
              aria-hidden="true"
              sx={{ color: 'text.disabled', flexShrink: 0 }}
            >
              →
            </Box>
          </Box>
        ) : showLoading ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 32,
            }}
          >
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
              Loading…
            </Typography>
          </Box>
        ) : (
          children
        )}
      </Box>
    </Box>
  );
}
