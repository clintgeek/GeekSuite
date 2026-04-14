import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { alpha } from '@mui/material/styles';

/**
 * ModeSelector — Step 0 of the goal wizard.
 * Lets the user choose between Standard (calorie-first) and Keto (net-carb-first) tracking modes.
 *
 * Props:
 *   value    — 'standard' | 'keto'
 *   onChange — (newValue: string) => void
 */
const ModeSelector = ({ value, onChange }) => {
  const theme = useTheme();

  const cards = [
    {
      mode: 'standard',
      accentColor: theme.palette.primary.main,
      title: 'Standard',
      subtitle: 'Count calories. Flexible macros.',
      typical: '~2,100 kcal / day',
    },
    {
      mode: 'keto',
      accentColor: theme.palette.warning.main,
      title: 'Keto',
      subtitle: 'Hard carb cap. Fat as fuel.',
      typical: '~20g net carbs / day',
    },
  ];

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 2,
        flexDirection: { xs: 'column', sm: 'row' },
      }}
    >
      {cards.map(({ mode, accentColor, title, subtitle, typical }) => {
        const isSelected = value === mode;
        return (
          <Box
            key={mode}
            onClick={() => onChange(mode)}
            sx={{
              position: 'relative',
              flex: 1,
              p: 3,
              borderRadius: 2,
              cursor: 'pointer',
              border: isSelected
                ? `2px solid ${accentColor}`
                : `1px solid ${theme.palette.divider}`,
              background: isSelected
                ? alpha(accentColor, 0.06)
                : theme.palette.background.paper,
              boxShadow: isSelected
                ? `inset 0 0 0 1px ${alpha(accentColor, 0.3)}`
                : 'none',
              transition: 'all 180ms ease-out',
              userSelect: 'none',
            }}
          >
            {/* Selection indicator — filled dot at top-right, visible only when selected */}
            {isSelected && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: accentColor,
                }}
              />
            )}

            {/* Card title */}
            <Typography
              variant="h5"
              sx={{
                fontFamily: '"DM Serif Display", serif',
                fontSize: '1.5rem',
                mb: 0.75,
                color: isSelected ? accentColor : 'text.primary',
                transition: 'color 180ms ease-out',
              }}
            >
              {title}
            </Typography>

            {/* Subtitle */}
            <Typography
              variant="body2"
              sx={{
                fontFamily: '"DM Sans", sans-serif',
                fontSize: '0.9375rem',
                color: 'text.secondary',
                mb: 2,
              }}
            >
              {subtitle}
            </Typography>

            <Box
              sx={{
                borderTop: `1px solid ${theme.palette.divider}`,
                pt: 1.5,
              }}
            />

            {/* Typical value */}
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                fontFamily: '"JetBrains Mono", monospace',
                color: isSelected ? accentColor : 'text.secondary',
                mt: 1.5,
                transition: 'color 180ms ease-out',
              }}
            >
              {typical}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                fontFamily: '"DM Sans", sans-serif',
                color: 'text.disabled',
                mt: 0.25,
              }}
            >
              typical
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
};

export default ModeSelector;
