import { Box, Typography, IconButton, Button, useTheme } from '@mui/material';
import { ChevronLeft, ChevronRight, CalendarCheck } from 'lucide-react';
import { format, isToday } from 'date-fns';
import { colors } from '../../theme/colors';

const PageHeader = ({ date, onDateChange, stats }) => {
  const theme = useTheme();
  const handlePrev = () => {
    const prev = new Date(date);
    prev.setDate(prev.getDate() - 1);
    onDateChange(prev);
  };

  const handleNext = () => {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    onDateChange(next);
  };

  const handleToday = () => {
    onDateChange(new Date());
  };

  const isTodayDate = isToday(date);

  const isDark = theme.palette.mode === 'dark';

  // Gentle time-of-day greeting — only shown for today's date
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, pt: { xs: 2.5, sm: 3.5 }, pb: 0.5 }}>
      {/* Greeting — only for today */}
      {isTodayDate && (
        <Typography
          sx={{
            fontFamily: '"Fraunces", serif',
            fontSize: '0.8125rem',
            fontWeight: 400,
            fontStyle: 'italic',
            color: isDark ? 'rgba(255,255,255,0.3)' : colors.ink[300],
            mb: 0.5,
            letterSpacing: '0.01em',
          }}
        >
          {getGreeting()}
        </Typography>
      )}

      {/* Date headline */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography
          variant="h1"
          sx={{
            fontSize: { xs: '1.75rem', sm: '2.25rem' },
            color: theme.palette.text.primary,
            lineHeight: 1.2,
          }}
        >
          {format(date, 'EEEE, MMMM d')}
        </Typography>

        {/* Date navigation */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton
            size="small"
            onClick={handlePrev}
            sx={{ color: theme.palette.text.secondary }}
            aria-label="Previous day"
          >
            <ChevronLeft size={20} />
          </IconButton>

          {!isTodayDate && (
            <Button
              size="small"
              onClick={handleToday}
              variant="outlined"
              sx={{
                fontSize: '0.7rem',
                py: 0.25,
                px: 1,
                minWidth: 'auto',
                color: colors.primary[500],
                borderColor: colors.primary[200],
                '&:hover': {
                  borderColor: colors.primary[500],
                  backgroundColor: colors.primary[50],
                  transform: 'none',
                },
              }}
            >
              Today
            </Button>
          )}

          <IconButton
            size="small"
            onClick={handleNext}
            sx={{ color: theme.palette.text.secondary }}
            aria-label="Next day"
          >
            <ChevronRight size={20} />
          </IconButton>
        </Box>
      </Box>

      {/* Stats line — softer phrasing */}
      {stats && stats.total > 0 && (
        <Typography
          variant="body2"
          sx={{
            color: isDark ? 'rgba(255,255,255,0.3)' : colors.ink[300],
            mt: 0.75,
            fontSize: '0.8125rem',
          }}
        >
          {stats.total} {stats.total === 1 ? 'task' : 'tasks'} on the page
          {stats.completed > 0 && (
            <Box component="span" sx={{ color: colors.aging.fresh }}>
              {' · '}{stats.completed} done
            </Box>
          )}
        </Typography>
      )}
    </Box>
  );
};

export default PageHeader;
