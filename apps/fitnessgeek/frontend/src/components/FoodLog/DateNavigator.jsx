import React from 'react';
import {
  Box,
  Typography,
  IconButton,
  useMediaQuery
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
  const isNarrow = useMediaQuery('(max-width:400px)');

  // Format date with shorter format for narrow screens
  const displayDate = React.useMemo(() => {
    if (typeof formatDate === 'function') {
      return formatDate(selectedDate, isNarrow);
    }
    return selectedDate;
  }, [selectedDate, formatDate, isNarrow]);

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
        borderRadius: 2,
        p: { xs: 1.5, sm: 3 },
        boxShadow: theme.shadows[1],
        border: 'none'
      }}>
        <IconButton
          onClick={onPreviousDay}
          sx={{
            color: theme.palette.primary.main,
            p: { xs: 0.5, sm: 1 },
            '&:hover': {
              backgroundColor: theme.palette.primary.light + '20'
            }
          }}
        >
          <ChevronLeftIcon />
        </IconButton>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifySelf: 'center' }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              fontSize: { xs: '0.875rem', sm: '1.25rem' },
              color: theme.palette.text.primary,
              textAlign: 'center'
            }}
          >
            {displayDate}
          </Typography>
          <CalendarIcon sx={{ color: theme.palette.primary.main, fontSize: { xs: 18, sm: 24 } }} />
        </Box>

        <IconButton
          onClick={onNextDay}
          sx={{
            color: theme.palette.primary.main,
            p: { xs: 0.5, sm: 1 },
            '&:hover': {
              backgroundColor: theme.palette.primary.light + '20'
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