import React from 'react';
import { Box } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';

/**
 * Surface — the single card primitive for FitnessGeek.
 *
 * The Label (theme/theme.jsx): a panel is a white box with a 2px ink border
 * and square corners. Nothing has a shadow and nothing lifts on hover.
 *
 * Variants:
 *  - "card"    : a label panel (2px ink border)
 *  - "inset"   : a subordinate block INSIDE a panel: no border, a faint wash.
 *                Never nest a "card" in a "card"; use rules (Label.jsx) first.
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
  // Night cards need a firmer edge than the divider to lift off the walnut
  // (review A10); the theme's `cardBorder` is the divider in the morning.
  const edge = theme.palette.cardBorder || theme.palette.divider;

  const base = {
    position: 'relative',
    borderRadius: 0,
    backgroundColor: canvas,
    border: `2px solid ${edge}`,
    boxShadow: 'none',
    padding: padded ? { xs: 1.5, sm: 2 } : 0,
    transition: 'background-color 150ms ease, border-color 150ms ease',
  };

  const variantStyles = {
    card: {},
    inset: {
      backgroundColor: alpha(ink, isDark ? 0.06 : 0.04),
      border: 'none',
    },
    ticket: {},
    ghost: {
      border: `2px dashed ${alpha(ink, 0.35)}`,
      backgroundColor: 'transparent',
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
