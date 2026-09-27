import React from 'react';
import {
  Box,
  Typography,
  IconButton
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  CalendarToday as CalendarIcon
} from '@mui/icons-material';

const DateNavigator = ({
  selectedDate,
  onPreviousDay,
  onNextDay,
  formatDate,
  calorieCard = null,
  ...props
}) => {
  const theme = useTheme();
  // The day in words, never truncated: it wraps before it clips.
  const displayDate = React.useMemo(() => {
    if (typeof formatDate === 'function') {
      return formatDate(selectedDate);
    }
    return selectedDate;
  }, [selectedDate, formatDate]);

  return (
    <Box sx={{
      mb: 3,
      ...props.sx
    }}
      {...props}
    >
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gridTemplateRows: 'auto auto',
        rowGap: 1,
        alignItems: 'center',
        backgroundColor: theme.palette.background.paper,
        borderRadius: '24px',
        p: { xs: 2, sm: 3 },
        boxShadow: 'none',
        border: `1px solid ${theme.palette.divider}`
      }}>
        <IconButton
          onClick={onPreviousDay}
          aria-label="Previous day"
          sx={{
            color: theme.palette.primary.main,
            width: 48,
            height: 48,
            '@media (hover: hover)': {
              '&:hover': { backgroundColor: theme.palette.primary.light + '20' }
            }
          }}
        >
          <ChevronLeftIcon />
        </IconButton>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifySelf: 'center' }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 800,
              fontSize: { xs: '1.1875rem', sm: '1.375rem' },
              color: theme.palette.text.primary,
              textAlign: 'center'
            }}
          >
            {displayDate}
          </Typography>
          <CalendarIcon aria-hidden sx={{ color: theme.palette.primary.main, fontSize: { xs: 20, sm: 24 } }} />
        </Box>

        <IconButton
          onClick={onNextDay}
          aria-label="Next day"
          sx={{
            color: theme.palette.primary.main,
            width: 48,
            height: 48,
            '@media (hover: hover)': {
              '&:hover': { backgroundColor: theme.palette.primary.light + '20' }
            }
          }}
        >
          <ChevronRightIcon />
        </IconButton>

        {/* Calorie summary spans full width below date row when provided */}
        {calorieCard && (
          <Box sx={{ gridColumn: '1 / span 3', pt: 0.5 }}>
            {calorieCard}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default DateNavigator;