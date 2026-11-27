import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

/**
 * SectionLabel — the small heading over a group of things.
 *
 * Daylight: bold Figtree, sentence case, tight line. A label is a word to
 * read, not a stamp, and has no ornament.
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
            borderRadius: 999,
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
          fontWeight: 700,
          letterSpacing: '-0.005em',
          color,
          lineHeight: 1.2,
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
