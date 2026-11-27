import React from 'react';
import { Box } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';

/**
 * Surface — the single card primitive for FitnessGeek.
 *
 * Daylight (theme/theme.jsx): a card is white paper with 16px corners, a
 * hairline edge and the faintest shadow. Nothing lifts on hover.
 *
 * Variants:
 *  - "card"    : the card
 *  - "inset"   : a subordinate block INSIDE a card: no border, a faint wash.
 *                Never nest a "card" in a "card"; use spacing or a hairline.
 *  - "ticket"  : kept as a name for older call sites; draws as "card"
 *  - "ghost"   : dashed border (empty states, placeholders)
 */
const Surface = React.forwardRef(function Surface(
  {
    variant = 'card',
    interactive = false,
    padded = true,
    children,
    sx,
    onClick,
    component = 'div',
    ...rest
  },
  ref
) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const ink = theme.palette.text.primary;
  const canvas = theme.palette.background.paper;
  const edge = theme.palette.cardBorder || theme.palette.divider;

  const base = {
    position: 'relative',
    borderRadius: '16px',
    backgroundColor: canvas,
    border: `1px solid ${edge}`,
    boxShadow: theme.palette.cardShadow || 'none',
    padding: padded ? { xs: 4, sm: 5 } : 0,
    transition: 'background-color 150ms ease, border-color 150ms ease',
  };

  const variantStyles = {
    card: {},
    inset: {
      backgroundColor: alpha(ink, isDark ? 0.06 : 0.04),
      border: 'none',
      boxShadow: 'none',
      borderRadius: '12px',
    },
    ticket: {},
    ghost: {
      border: `1.5px dashed ${alpha(ink, 0.3)}`,
      backgroundColor: 'transparent',
      boxShadow: 'none',
    },
  };

  const interactiveStyles = interactive
    ? {
        cursor: 'pointer',
        '@media (hover: hover)': {
          '&:hover': { backgroundColor: alpha(theme.palette.primary.main, isDark ? 0.12 : 0.06) },
        },
        '&:focus-visible': {
          outline: `2px solid ${theme.palette.primary.main}`,
          outlineOffset: 2,
        },
      }
    : {};

  return (
    <Box
      ref={ref}
      component={component}
      data-fg-panel={variant}
      onClick={onClick}
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? 'button' : undefined}
      onKeyDown={
        interactive && onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(e);
              }
            }
          : undefined
      }
      sx={{
        ...base,
        ...variantStyles[variant],
        ...interactiveStyles,
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
});

export default Surface;
