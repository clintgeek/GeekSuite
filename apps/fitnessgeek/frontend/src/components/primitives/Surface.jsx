import React from 'react';
import { Box } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';

/**
 * Surface — the single card primitive for FitnessGeek.
 *
 * Variants:
 *  - "card"    : standard content card (subtle border, rest state)
 *  - "inset"   : subordinate surface, tinted background, no border
 *  - "ticket"  : the editorial "receipt stub" — perforated top edge, heavy border
 *  - "ghost"   : dashed border, muted background (empty states, placeholders)
 *
 * Replaces the ad-hoc Card + borderRadius + border styling across the app.
 * Adopt this and everything inherits the same radii/shadows/colors automatically.
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

  const base = {
    position: 'relative',
    borderRadius: variant === 'ticket' ? '20px' : '16px',
    backgroundColor: canvas,
    border: `1px solid ${theme.palette.divider}`,
    boxShadow: 'none',
    padding: padded ? { xs: 2, sm: 2.5 } : 0,
    transition:
      'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), border-color 180ms ease, box-shadow 220ms ease',
  };

  const variantStyles = {
    card: {},
    inset: {
      backgroundColor: alpha(ink, isDark ? 0.04 : 0.025),
      border: 'none',
    },
    ticket: {
      // Receipt aesthetic told by the perforation alone — no heavy border.
      // Subtle warmth on light mode, canvas on dark.
      backgroundColor: isDark ? canvas : '#FDFCFB',
      border: `1px solid ${theme.palette.divider}`,
      boxShadow: isDark
        ? '0 12px 32px -16px rgba(0, 0, 0, 0.5)'
        : '0 12px 32px -20px rgba(28, 25, 23, 0.14)',
      // Leave room at the top for the perforation to sit inside the card
      paddingTop: 0,
      // Dashed "tear" line — now sits INSIDE the card at the top,
      // using the divider color so it doesn't fight anything.
      '&::before': {
        content: '""',
        position: 'absolute',
        top: 10,
        left: 20,
        right: 20,
        height: 0,
        borderTop: `1.5px dashed ${alpha(ink, isDark ? 0.3 : 0.22)}`,
        pointerEvents: 'none',
      },
      // Tiny circular notches at each end of the perforation — binder-hole feel
      '&::after': {
        content: '""',
        position: 'absolute',
        top: 6,
        left: 14,
        right: 14,
        height: 9,
        background: `radial-gradient(circle 4px at 0 50%, ${theme.palette.background.default} 4px, transparent 4.5px), radial-gradient(circle 4px at 100% 50%, ${theme.palette.background.default} 4px, transparent 4.5px)`,
        pointerEvents: 'none',
      },
    },
    ghost: {
      border: `1px dashed ${alpha(ink, 0.18)}`,
      backgroundColor: alpha(ink, isDark ? 0.04 : 0.02),
      boxShadow: 'none',
    },
  };

  const interactiveStyles = interactive
    ? {
        cursor: 'pointer',
        '&:hover': {
          transform: 'translateY(-2px)',
          borderColor: variant === 'ghost' ? theme.palette.primary.main : alpha(ink, 0.28),
          boxShadow: isDark
            ? '0 10px 24px -10px rgba(0, 0, 0, 0.5)'
            : '0 10px 24px -14px rgba(28, 25, 23, 0.22)',
        },
        '&:active': {
          transform: 'translateY(0)',
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
