import React from 'react';
import { Box, Typography, Skeleton } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import Sparkline from './Sparkline';

/**
 * LedgerCard — the core widget chassis for dashgeek's "Ledger" design.
 *
 * Replaces EditorialCard. The domain-color 3px left-border is the
 * signature; everything else recedes. Numbers and metadata in mono
 * (via theme h6 / caption variants); structure in Geist.
 *
 * Props:
 *   domain      – 'notegeek'|'bujogeek'|'bookgeek'|'fitnessgeek'|'flockgeek'
 *                 Drives the 3px left-border accent. Omit for no accent.
 *   title       – Section header (rendered as h6 — mono caps, themed).
 *   kicker      – Optional mono caption below the title.
 *   trend       – Optional number[] (7 values) → mini sparkline in header right slot.
 *   action      – Optional { label, href } → mono pill in header right slot.
 *                 If both trend and action are given, trend takes priority.
 *   index       – Optional tiny mono index number (e.g., 1, 2) shown
 *                 above the title in top-left. Preserved from EditorialCard.
 *   loading     – When true, renders 3 skeleton rows.
 *   error       – When truthy, renders a compact error block.
 *   sx          – Pass-through for layout overrides.
 *   children    – Widget body content.
 */
export default function LedgerCard({
  domain,
  title,
  kicker,
  trend,
  action,
  index,
  loading = false,
  error = null,
  sx = {},
  children,
}) {
  const theme = useTheme();
  const domainColor = domain ? theme.palette.domains?.[domain] : null;

  const cardSx = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: theme.palette.surfaces?.paper ?? theme.palette.background.paper,
    border: `1px solid ${theme.palette.border ?? theme.palette.divider}`,
    borderRadius: '10px',
    // Domain-color left-border: accomplished via box-shadow on the left
    // edge so it overlays the existing 1px border without affecting layout.
    ...(domainColor && {
      borderLeft: `3px solid ${domainColor}`,
    }),
    padding: { xs: '14px', md: '20px' },
    minHeight: 220,
    overflow: 'hidden',
    ...sx,
  };

  // Loading state
  if (loading) {
    return (
      <Box sx={cardSx}>
        {title && (
          <Box sx={{ mb: '12px' }}>
            <Typography variant="h6" color="text.secondary">
              {title}
            </Typography>
          </Box>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
          <Skeleton variant="text" width="80%" height={20} />
          <Skeleton variant="text" width="60%" height={16} />
          <Skeleton variant="text" width="40%" height={16} />
        </Box>
      </Box>
    );
  }

  // Error state — calm, not alarmist
  if (error) {
    const errorMsg = typeof error === 'string' ? error : (error?.message ?? 'Something went wrong');
    return (
      <Box sx={cardSx}>
        {title && (
          <Box sx={{ mb: '12px' }}>
            <Typography variant="h6" color="text.secondary">
              {title}
            </Typography>
          </Box>
        )}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Typography
            variant="caption"
            sx={{ display: 'block', mb: 0.5, color: 'text.disabled', letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            department unreachable
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {errorMsg}
          </Typography>
        </Box>
      </Box>
    );
  }

  // Right-slot: trend takes priority over action
  const showTrend = Array.isArray(trend) && trend.length >= 2;
  const showAction = !showTrend && action?.label;

  return (
    <Box sx={cardSx}>
      {/* Index number — tiny mono, muted, above title */}
      {index != null && (
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            color: 'text.disabled',
            letterSpacing: '0.14em',
            lineHeight: 1,
            mb: '4px',
            fontSize: '0.6rem',
          }}
        >
          {String(index).padStart(2, '0')}
        </Typography>
      )}

      {/* Header row: title + optional right slot */}
      {(title || showTrend || showAction) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 1,
            mb: '12px',
          }}
        >
          {/* Left: title + kicker */}
          <Box sx={{ minWidth: 0 }}>
            {title && (
              <Typography variant="h6" color="text.primary">
                {title}
              </Typography>
            )}
            {kicker && (
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  mt: '3px',
                  color: 'text.secondary',
                  lineHeight: 1.3,
                }}
              >
                {kicker}
              </Typography>
            )}
          </Box>

          {/* Right: sparkline OR action pill */}
          {showTrend && (
            <Box sx={{ flexShrink: 0, pt: '2px' }}>
              <Sparkline
                values={trend}
                color={domainColor ?? undefined}
                width={48}
                height={16}
              />
            </Box>
          )}
          {showAction && (
            <Box
              component={action.href ? 'a' : 'span'}
              href={action.href}
              target={action.href ? '_blank' : undefined}
              rel={action.href ? 'noreferrer' : undefined}
              sx={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                fontFamily: theme.typography.fontFamilyMono
                  ?? '"JetBrains Mono", ui-monospace, monospace',
                fontWeight: 500,
                fontSize: '0.6rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: domainColor ?? 'text.secondary',
                border: `1px solid ${theme.palette.border ?? theme.palette.divider}`,
                borderRadius: '4px',
                px: '8px',
                py: '3px',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                transition: 'background-color 120ms ease',
                '&:hover': {
                  backgroundColor: theme.palette.glow?.soft ?? 'action.hover',
                },
              }}
            >
              {action.label}
            </Box>
          )}
        </Box>
      )}

      {/* Body */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </Box>
    </Box>
  );
}
