import React from 'react';
import { Box, LinearProgress, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ketoStatus } from '../../utils/ketoMath';
import KetoStatusChip from './KetoStatusChip';

/**
 * NetCarbMeter — the keto-mode dashboard hero.
 *
 * Replaces the calorie bar when the user is in keto mode.
 * Shows net carbs consumed vs the daily cap with a color-ramping
 * progress bar and a KetoStatusChip.
 *
 * Props:
 *   consumed  — net carbs consumed today (number, default 0)
 *   limitG    — daily net-carb cap in grams (number, default 20)
 *   sx        — optional MUI sx override for the root Box
 */
const NetCarbMeter = ({ consumed = 0, limitG = 20, sx }) => {
  const theme = useTheme();

  const clampedPct = limitG > 0 ? Math.min(consumed / limitG, 1) * 100 : 0;
  const status = ketoStatus(consumed, limitG);

  const barColor =
    status === 'over'
      ? theme.palette.error.main
      : status === 'approaching'
      ? theme.palette.warning.main
      : theme.palette.primary.main;

  return (
    <Box sx={{ width: '100%', ...sx }}>
      {/* Label row */}
      <Typography
        sx={{
          fontSize: '0.7rem',
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: theme.palette.text.secondary,
          mb: 0.75,
        }}
      >
        Net Carbs Today
      </Typography>

      {/* Large numeric display */}
      <Typography
        sx={{
          fontFamily: "'JetBrains Mono', monospace",
          fontVariantNumeric: 'tabular-nums',
          fontSize: '2rem',
          fontWeight: 700,
          lineHeight: 1,
          color: theme.palette.warning.main,
          mb: 1,
        }}
      >
        {Math.round(consumed)}g
        <Typography
          component="span"
          sx={{
            fontFamily: "'JetBrains Mono', monospace",
            fontVariantNumeric: 'tabular-nums',
            fontSize: '1rem',
            fontWeight: 400,
            color: theme.palette.text.secondary,
            ml: 0.75,
          }}
        >
          / {limitG}g
        </Typography>
      </Typography>

      {/* Color-ramping progress bar */}
      <LinearProgress
        variant="determinate"
        value={clampedPct}
        sx={{
          height: 10,
          borderRadius: 5,
          mb: 1,
          backgroundColor:
            theme.palette.mode === 'dark'
              ? 'rgba(255,255,255,0.08)'
              : 'rgba(0,0,0,0.06)',
          '& .MuiLinearProgress-bar': {
            borderRadius: 5,
            backgroundColor: barColor,
            transition: 'transform 800ms cubic-bezier(0.22, 1, 0.36, 1), background-color 400ms ease',
          },
        }}
      />

      {/* Status chip */}
      <KetoStatusChip netCarbsConsumed={consumed} limitG={limitG} />
    </Box>
  );
};

export default NetCarbMeter;
