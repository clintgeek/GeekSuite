import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

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
      typical: '~2,100 cal a day',
    },
    {
      mode: 'keto',
      // Basil for both: the chosen card is the app's one selected look
      // (visual review B2), and warning ochre isn't a mode.
      accentColor: theme.palette.primary.main,
      title: 'Keto',
      subtitle: 'Hard carb cap. Fat as fuel.',
      typical: '~20g net carbs a day',
    },
  ];

  return (
    <Box
      role="radiogroup"
      aria-label="Tracking style"
      sx={{
        display: 'flex',
        gap: 1.75,
        flexDirection: { xs: 'column', sm: 'row' },
      }}
    >
      {cards.map(({ mode, accentColor, title, subtitle, typical }) => {
        const isSelected = value === mode;
        const choose = () => onChange(mode);
        return (
          <Box
            key={mode}
            role="radio"
            aria-checked={isSelected}
            tabIndex={0}
            onClick={choose}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                choose();
              }
            }}
            sx={{
              position: 'relative',
              flex: 1,
              minHeight: 44,
              p: 2,
              cursor: 'pointer',
              // The Label: a square panel with an ink edge; the chosen one
              // wears the blue edge and a filled blue square, not a tint.
              border: `2px solid ${isSelected ? accentColor : theme.palette.text.primary}`,
              bgcolor: 'background.paper',
              userSelect: 'none',
              '&:focus-visible': { outline: `3px solid ${accentColor}`, outlineOffset: 2 },
            }}
          >
            {/* Selection indicator: a filled square, only when selected */}
            {isSelected && (
              <Box
                aria-hidden
                sx={{ position: 'absolute', top: 12, right: 12, width: 12, height: 12, bgcolor: accentColor }}
              />
            )}

            <Typography
              component="div"
              sx={{
                fontSize: '1.5rem',
                fontWeight: 900,
                lineHeight: 1.1,
                mb: 0.75,
                color: isSelected ? accentColor : 'text.primary',
              }}
            >
              {title}
            </Typography>

            <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary', mb: 1.5 }}>
              {subtitle}
            </Typography>

            <Box sx={{ borderTop: `1px solid ${theme.palette.text.primary}`, pt: 1 }}>
              <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700 }}>{typical}</Typography>
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                typical
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};

export default ModeSelector;
