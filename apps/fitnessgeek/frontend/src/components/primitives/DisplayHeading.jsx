import React from 'react';
import { Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

const SIZE_MAP = {
  page: {
    fontSize: { xs: '2rem', sm: '2.625rem', md: '3rem' },
    lineHeight: 1.05,
    letterSpacing: '-0.02em',
  },
  section: {
    fontSize: { xs: '1.5rem', sm: '1.875rem' },
    lineHeight: 1.1,
    letterSpacing: '-0.015em',
  },
  card: {
    fontSize: { xs: '1.25rem', sm: '1.5rem' },
    lineHeight: 1.15,
    letterSpacing: '-0.01em',
  },
  inline: {
    fontSize: '1.125rem',
    lineHeight: 1.2,
    letterSpacing: '-0.005em',
  },
};

/**
 * DisplayHeading — DM Serif Display title type.
 *
 * Use for editorial headings: page titles, surface titles, anywhere you want
 * the "human" voice to contrast with JetBrains Mono for numbers.
 */
const DisplayHeading = ({
  children,
  size = 'section',
  component,
  color,
  sx,
  ...rest
}) => {
  const theme = useTheme();
  const sizeStyles = SIZE_MAP[size] || SIZE_MAP.section;

  const asComponent =
    component || (size === 'page' ? 'h1' : size === 'section' ? 'h2' : 'h3');

  return (
    <Typography
      component={asComponent}
      sx={{
        fontFamily: "'DM Serif Display', Georgia, serif",
        fontWeight: 400,
        color: color || theme.palette.text.primary,
        ...sizeStyles,
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Typography>
  );
};

export default DisplayHeading;
