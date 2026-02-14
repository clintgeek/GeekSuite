import React from 'react';
import { Card, CardContent, Typography, Box, Fade, Grid } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { DirectionsWalk as StepsIcon, LocalFireDepartment as FireIcon, Bedtime as SleepIcon, Favorite as HeartIcon } from '@mui/icons-material';

const Metric = ({ value, label, color }) => {
  const theme = useTheme();
  return (
    <Box sx={{ textAlign: 'center' }}>
      <Typography variant="h5" sx={{ fontWeight: 600, color, mb: 0.5 }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 500 }}>
        {label}
      </Typography>
    </Box>
  );
};

const GarminSummaryCard = ({ steps, activeCalories, sleepMinutes, restingHR, fetchedAt, lastSyncAt, title = "Today's Activity", timeout = 700 }) => {
  const theme = useTheme();
  const sleepText = sleepMinutes != null ? `${Math.floor(sleepMinutes / 60)}h ${sleepMinutes % 60}m` : '—';
  const timeText = fetchedAt ? new Date(fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <Fade in timeout={timeout}>
      <Box sx={{
        backgroundColor: theme.palette.background.paper,
        borderRadius: 2,
        p: { xs: 2, sm: 3 },
        boxShadow: theme.shadows[1],
        border: 'none'
      }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: { xs: 1.5, sm: 2 } }}>
          {[{
            label: 'Resting HR', value: restingHR ?? '—', color: theme.palette.info.main, Icon: HeartIcon
          }, {
            label: 'Steps', value: steps ?? '—', color: theme.palette.primary.main, Icon: StepsIcon
          }, {
            label: 'Active kcal', value: activeCalories != null ? `${activeCalories}` : '—', color: theme.palette.success.main, Icon: FireIcon
          }, {
            label: 'Sleep', value: sleepText, color: theme.palette.secondary.main, Icon: SleepIcon
          }].map((item) => (
            <Box key={item.label} sx={{ textAlign: 'center', p: 1.5, borderRadius: 1, backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : theme.palette.grey[50], border: 'none', position: 'relative' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
                <Box sx={{ bgcolor: item.color, color: '#fff', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', mr: 0.75 }}>
                  <item.Icon sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }} />
                </Box>
                <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 500, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                  {item.label}
                </Typography>
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: { xs: '1rem', sm: '1.25rem' }, color: theme.palette.text.primary, mb: 0.5 }}>
                {item.value}
                {item.label === 'Steps' ? null : (
                  <Typography component="span" variant="caption" sx={{ color: theme.palette.text.secondary, ml: 0.5, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                    {item.label === 'Resting HR' ? '' : (item.label === 'Active kcal' ? 'kcal' : '')}
                  </Typography>
                )}
              </Typography>
            </Box>
          ))}
        </Box>
        {(timeText || lastSyncAt) && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
            <Box sx={{ textAlign: 'right' }}>
              {timeText && (
                <Typography variant="caption" sx={{ color: theme.palette.text.secondary, display: 'block' }}>
                  Updated {timeText}
                </Typography>
              )}
              {lastSyncAt && (
                <Typography variant="caption" sx={{ color: theme.palette.text.disabled, display: 'block' }}>
                  Last sync {new Date(lastSyncAt).toLocaleDateString()}
                </Typography>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Fade>
  );
};

export default GarminSummaryCard;


