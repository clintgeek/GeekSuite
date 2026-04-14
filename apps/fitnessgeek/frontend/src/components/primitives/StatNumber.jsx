import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

// ─── Odometer-style count-up hook ───
const useCountUp = (target, duration = 420, enabled = true) => {
  const [display, setDisplay] = useState(enabled ? 0 : target);
  const prev = useRef(enabled ? 0 : target);

  useEffect(() => {
    if (!enabled) {
      setDisplay(target);
      prev.current = target;
      return undefined;
    }
    const from = prev.current;
    const to = Number.isFinite(target) ? target : 0;
    if (from === to) return undefined;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = from + (to - from) * eased;
      setDisplay(value);
      if (t < 1) raf = requestAnimationFrame(tick);
      else {
        prev.current = to;
        setDisplay(to);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, enabled]);

  return display;
};

const SIZE_MAP = {
  hero: {
    fontSize: { xs: '3rem', sm: '3.75rem', md: '4.25rem' },
    lineHeight: 0.95,
    letterSpacing: '-0.035em',
    fontWeight: 600,
  },
  display: {
    fontSize: { xs: '1.75rem', sm: '2rem' },
    lineHeight: 1,
    letterSpacing: '-0.02em',
    fontWeight: 600,
  },
  body: {
    fontSize: '1rem',
    lineHeight: 1.2,
    letterSpacing: '-0.01em',
    fontWeight: 600,
  },
  small: {
    fontSize: '0.8125rem',
    lineHeight: 1.2,
    letterSpacing: 0,
    fontWeight: 600,
  },
};

/**
 * StatNumber — monospaced, tabular-nums numeric display.
 *
 * Every metric number in the app should use this. It:
 *  - Applies JetBrains Mono with font-variant-numeric: tabular-nums (digits don't jitter)
 *  - Supports animated count-up (opt-in via `animate` prop)
 *  - Takes a `unit` prop that renders smaller + muted next to the number
 *  - Has size variants that match the app's typographic scale
 */
const StatNumber = ({
  value,
  unit,
  size = 'display',
  decimals = 0,
  prefix = '',
  animate = false,
  color,
  align = 'left',
  sx,
  ...rest
}) => {
  const theme = useTheme();
  const numericValue = typeof value === 'number' ? value : parseFloat(value);
  const isNumeric = Number.isFinite(numericValue);

  const animated = useCountUp(isNumeric ? numericValue : 0, 420, animate && isNumeric);

  const displayValue = isNumeric
    ? (animate ? animated : numericValue).toFixed(decimals)
    : value ?? '--';

  const sizeStyles = SIZE_MAP[size] || SIZE_MAP.display;
  const textColor = color || theme.palette.text.primary;

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 0.5,
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        ...sx,
      }}
      {...rest}
    >
      <Typography
        component="span"
        sx={{
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontVariantNumeric: 'tabular-nums',
          color: textColor,
          ...sizeStyles,
        }}
      >
        {prefix}
        {displayValue}
      </Typography>
      {unit && (
        <Typography
          component="span"
          sx={{
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize:
              size === 'hero'
                ? '0.875rem'
                : size === 'display'
                ? '0.75rem'
                : '0.6875rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: theme.palette.text.secondary,
            alignSelf: size === 'hero' ? 'flex-end' : 'baseline',
            mb: size === 'hero' ? '0.6em' : 0,
          }}
        >
          {unit}
        </Typography>
      )}
    </Box>
  );
};

export default StatNumber;
