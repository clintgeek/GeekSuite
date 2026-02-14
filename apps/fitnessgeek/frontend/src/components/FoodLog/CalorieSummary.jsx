import React from 'react';
import { Box, Typography, IconButton, Tooltip, LinearProgress } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { LocalFireDepartment as CaloriesIcon, Settings as SettingsIcon } from '@mui/icons-material';

const DEFAULT_RDA = 2000;

const CalorieSummary = ({ calories = 0, goal = 0, base = 0, add = 0, onSettings, embedded = false }) => {
  const theme = useTheme();
  const effectiveGoal = goal > 0 ? goal : DEFAULT_RDA;
  const usingRda = goal === 0;
  const progress = Math.min((calories / effectiveGoal) * 100, 100);
  return (
    <Box sx={{
      backgroundColor: embedded ? 'transparent' : theme.palette.background.paper,
      borderRadius: embedded ? 0 : 2,
      p: embedded ? 0 : { xs: 1.5, sm: 2 },
      boxShadow: embedded ? 'none' : theme.shadows[1],
      border: 'none',
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      gridTemplateRows: 'auto auto',
      rowGap: 0.5,
      columnGap: 1
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CaloriesIcon sx={{ color: theme.palette.success.main }} />
        <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600 }}>
          Calories
        </Typography>
      </Box>
      {onSettings && (
        <Tooltip title="Calorie goal settings">
          <IconButton size="small" onClick={onSettings} aria-label="calorie-goal-settings">
            <SettingsIcon fontSize="inherit" />
          </IconButton>
        </Tooltip>
      )}

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1 }}>
          {Math.round(calories)}
        </Typography>
        <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>cal</Typography>
      </Box>
      <Typography variant="caption" sx={{ color: theme.palette.text.secondary, justifySelf: 'end' }}>
        {Math.round(progress)}%
      </Typography>

      <Box sx={{ gridColumn: '1 / span 2' }}>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            height: 4,
            borderRadius: 2,
            backgroundColor: embedded ? theme.palette.grey[300] : theme.palette.grey[200],
            '& .MuiLinearProgress-bar': { backgroundColor: theme.palette.success.main }
          }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.25 }}>
          <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
            {usingRda ? 'RDA' : 'Goal'}: {effectiveGoal} cal {(!usingRda && base && add > 0) ? ` (${Math.round(base)} +${Math.round(add)})` : ''}
          </Typography>
          <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
            {Math.max(0, effectiveGoal - Math.round(calories))} left
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default CalorieSummary;


