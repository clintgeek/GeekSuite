import { Box, Typography, LinearProgress } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';

export default function MacroBar({ label, current = 0, goal = 100, unit = 'g', color = '#0D9488' }) {
  const theme = useTheme();
  const percentage = Math.min((current / goal) * 100, 100);
  const remaining = Math.round(Math.max(goal - current, 0));
  const displayCurrent = Math.round(current);
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box>
      {/* Label row */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
        <Typography
          sx={{
            fontWeight: 600,
            color: theme.palette.text.secondary,
            fontSize: '0.625rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {label}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
          <Typography sx={{ fontWeight: 800, color, fontSize: '1.25rem', lineHeight: 1 }}>
            {displayCurrent}
          </Typography>
          <Typography sx={{ color: theme.palette.text.secondary, fontSize: '0.625rem' }}>
            / {goal}{unit}
          </Typography>
        </Box>
      </Box>

      {/* Progress bar */}
      <LinearProgress
        variant="determinate"
        value={percentage}
        sx={{
          height: 8,
          borderRadius: 99,
          backgroundColor: isDark ? alpha(color, 0.2) : alpha(color, 0.15),
          '& .MuiLinearProgress-bar': {
            borderRadius: 99,
            backgroundColor: color,
          },
        }}
      />

      {/* Remaining */}
      <Typography
        sx={{
          color: theme.palette.text.secondary,
          mt: 0.375,
          display: 'block',
          fontSize: '0.625rem',
        }}
      >
        {remaining}{unit} left
      </Typography>
    </Box>
  );
}
