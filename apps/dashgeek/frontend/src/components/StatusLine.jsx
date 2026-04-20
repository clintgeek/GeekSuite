import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

/**
 * StatusLine — compact dashboard header strip.
 *
 * Replaces the editorial masthead on Dashboard.jsx.
 * Left: today's date in mono caps. Right: domain pills.
 *
 * Props:
 *   date   – Date object. Defaults to today.
 *   pills  – Array of { domain, label, onClick? }
 *            Each pill gets a 6px domain-color dot + mono-caps label.
 */
export default function StatusLine({ date, pills = [] }) {
  const theme = useTheme();
  const d = date instanceof Date ? date : new Date();

  const shortDate = d
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase()
    .replace(',', ' ·')   // "MON, APR 21" → "MON · APR 21"
    .replace(/\s+/g, ' ');

  const longDate = d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        gap: { xs: 1.5, sm: 1 },
        py: { xs: 1.5, md: 2 },
        px: 0,
      }}
    >
      {/* Left: date */}
      <Box>
        <Typography
          variant="h6"
          sx={{
            color: 'text.primary',
            lineHeight: 1,
          }}
        >
          {shortDate}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mt: '4px',
            color: 'text.secondary',
            lineHeight: 1.3,
          }}
        >
          {longDate}
        </Typography>
      </Box>

      {/* Right: domain pills */}
      {pills.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
          }}
        >
          {pills.map((pill, i) => {
            const dotColor = pill.domain
              ? (theme.palette.domains?.[pill.domain] ?? theme.palette.text.disabled)
              : theme.palette.text.disabled;

            return (
              <Box
                key={i}
                component={pill.onClick ? 'button' : 'span'}
                onClick={pill.onClick}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontFamily: theme.typography.fontFamilyMono
                    ?? '"JetBrains Mono", ui-monospace, monospace',
                  fontWeight: 500,
                  fontSize: '0.625rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'text.secondary',
                  border: `1px solid ${theme.palette.border ?? theme.palette.divider}`,
                  borderRadius: '4px',
                  px: '8px',
                  py: '4px',
                  background: 'transparent',
                  cursor: pill.onClick ? 'pointer' : 'default',
                  transition: 'background-color 120ms ease',
                  lineHeight: 1,
                  // Reset button defaults
                  outline: 'none',
                  fontStyle: 'normal',
                  '&:hover': pill.onClick
                    ? { backgroundColor: theme.palette.glow?.soft ?? 'action.hover' }
                    : {},
                  '&:focus-visible': pill.onClick
                    ? { boxShadow: `0 0 0 2px ${theme.palette.glow?.ring ?? 'currentColor'}` }
                    : {},
                }}
              >
                {/* Domain color dot */}
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: dotColor,
                    flexShrink: 0,
                  }}
                />
                {pill.label}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
