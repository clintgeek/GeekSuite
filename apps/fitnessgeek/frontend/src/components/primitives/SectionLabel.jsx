import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

/**
 * SectionLabel — the editorial tick label used across surfaces.
 *
 * Uppercase, 0.14em letter-spacing, muted color. One source of truth
 * for the "small-caps tag" pattern that was appearing inconsistently.
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
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.6875rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          color,
          lineHeight: 1,
        }}
      >
        {children}
        {typeof count === 'number' && (
          <Typography
            component="span"
            sx={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.6875rem',
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
