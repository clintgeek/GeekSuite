import { Box, Typography, LinearProgress } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';

export default function CalorieBar({ consumed = 0, goal = 2000, remaining = 2000 }) {
  const theme = useTheme();
  const percentage = Math.min((consumed / goal) * 100, 100);
  const isOverGoal = consumed > goal;
  const isDark = theme.palette.mode === 'dark';

  const consumedDisplay = Math.round(consumed || 0);
  const goalDisplay = Math.round(goal || 0);
  const remainingDisplay = Math.round(Math.abs(remaining) || 0);

  const barColor = isOverGoal ? theme.palette.error.main : theme.palette.primary.main;
  const trackColor = isDark
    ? alpha(theme.palette.primary.main, 0.12)
    : alpha(theme.palette.primary.main, 0.08);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {/* Left: value cluster */}
      <Box sx={{ flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
          <Typography
            sx={{
              fontWeight: 800,
              color: theme.palette.text.primary,
              lineHeight: 1,
              letterSpacing: '-0.02em',
              fontSize: { xs: '1.5rem', sm: '1.75rem' },
            }}
          >
            {consumedDisplay.toLocaleString()}
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: theme.palette.text.secondary, fontWeight: 500, fontSize: '0.6875rem' }}
          >
            / {goalDisplay.toLocaleString()} cal
          </Typography>
        </Box>
      </Box>

      {/* Center: bar */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <LinearProgress
          variant="determinate"
          value={percentage}
          sx={{
            height: 10,
            borderRadius: 99,
            backgroundColor: trackColor,
            '& .MuiLinearProgress-bar': {
              borderRadius: 99,
              backgroundColor: barColor,
              transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            },
          }}
        />
      </Box>

      {/* Right: remaining */}
      <Typography
        sx={{
          fontWeight: 700,
          color: isOverGoal ? theme.palette.error.main : theme.palette.success.main,
          fontSize: '0.75rem',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {isOverGoal ? `+${remainingDisplay}` : remainingDisplay} {isOverGoal ? 'over' : 'left'}
      </Typography>
    </Box>
  );
}
