import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

/**
 * SectionLabel — the small heading over a group of things.
 *
 * Sentence case, bold, muted. Market Morning retired the ALL-CAPS tracked
 * tick labels (SIMPLE_AND_FULL_PLAN.md: "All-caps monospace labels"): a
 * label is a word to read, not a stamp.
 *
 * Variants:
 *  - "default" : muted text color, used for minor hints
 *  - "emphasis": text primary, used when the label is the surface's only title
 */
const SectionLabel = ({
  children,
  variant = 'default',
  count,
  dot,
  sx,
  ...rest
}) => {
  const theme = useTheme();
  const color =
    variant === 'emphasis' ? theme.palette.text.primary : theme.palette.text.secondary;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        ...sx,
      }}
      {...rest}
    >
      {dot && (
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: dot === true ? theme.palette.primary.main : dot,
            flexShrink: 0,
          }}
        />
      )}
      <Typography
        component="span"
        sx={{
          fontFamily: "inherit",
          fontSize: '0.9375rem',
          fontWeight: 800,
          letterSpacing: 0,
          color,
          lineHeight: 1.3,
        }}
      >
        {children}
        {typeof count === 'number' && (
          <Typography
            component="span"
            sx={{
              fontFamily: "inherit",
              fontSize: '0.875rem',
              fontWeight: 700,
              color: theme.palette.text.secondary,
              ml: 1,
              letterSpacing: 0,
            }}
          >
            {count}
          </Typography>
        )}
      </Typography>
    </Box>
  );
};

export default SectionLabel;
