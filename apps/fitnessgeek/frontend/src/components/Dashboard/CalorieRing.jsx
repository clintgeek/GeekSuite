import { Box, Typography, CircularProgress, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { LocalFireDepartment } from '@mui/icons-material';

export default function CalorieRing({ consumed = 0, goal = 2000, remaining = 2000, size }) {
  const theme = useTheme();
  const isNarrow = useMediaQuery('(max-width:374px)');
  const defaultSize = isNarrow ? 160 : 200;
  const ringSize = size || defaultSize;
  const percentage = Math.min((consumed / goal) * 100, 100);
  const isOverGoal = consumed > goal;

  // Display calories as whole numbers
  const consumedDisplay = Math.round(consumed || 0);
  const goalDisplay = Math.round(goal || 0);
  const remainingDisplay = Math.round(remaining || 0);
  const overDisplay = Math.round((consumed - goal) || 0);

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Circular Progress */}
      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
        {/* Background circle */}
        <CircularProgress
          variant="determinate"
          value={100}
          size={ringSize}
          thickness={6}
          sx={{
            color: theme.palette.mode === 'dark' ? 'rgba(45, 212, 191, 0.1)' : 'rgba(13, 148, 136, 0.1)',
            position: 'absolute',
          }}
        />
        {/* Progress circle */}
        <CircularProgress
          variant="determinate"
          value={percentage}
          size={ringSize}
          thickness={6}
          sx={{
            color: isOverGoal ? theme.palette.error.main : theme.palette.primary.main,
            '& .MuiCircularProgress-circle': {
              strokeLinecap: 'round',
            },
          }}
        />
        {/* Center content */}
        <Box
          sx={{
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            position: 'absolute',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
          }}
        >
          <LocalFireDepartment sx={{ fontSize: isNarrow ? 24 : 32, color: theme.palette.primary.main, mb: 0.5 }} />
          <Typography variant="h3" component="div" sx={{ fontWeight: 700, color: theme.palette.text.primary, fontSize: isNarrow ? '1.75rem' : '3rem' }}>
            {consumedDisplay.toLocaleString()}
          </Typography>
          <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 500, fontSize: isNarrow ? '0.65rem' : '0.75rem' }}>
            of {goalDisplay.toLocaleString()} cal
          </Typography>
        </Box>
      </Box>

      {/* Remaining calories */}
      <Box sx={{ mt: 2, textAlign: 'center' }}>
        <Typography variant="h6" sx={{ fontWeight: 600, color: isOverGoal ? theme.palette.error.main : theme.palette.success.main }}>
          {isOverGoal
            ? `+${overDisplay.toLocaleString()}`
            : remainingDisplay.toLocaleString()}
        </Typography>
        <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
          {isOverGoal ? 'over goal' : 'remaining'}
        </Typography>
      </Box>
    </Box>
  );
}
