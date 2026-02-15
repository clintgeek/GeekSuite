import React, { useState } from 'react';
import {
  Box,
  IconButton,
  Typography,
  Stack,
  useTheme,
  useMediaQuery,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  CalendarToday as CalendarIcon
} from '@mui/icons-material';
import {
  format,
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  startOfWeek
} from 'date-fns';
import { StaticDatePicker } from '@mui/x-date-pickers/StaticDatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import TaskFilters, { FiltersButton } from './tasks/TaskFilters';
import { useLocation } from 'react-router-dom';

const DateNavigation = ({ currentDate, onDateChange }) => {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false);
  const location = useLocation();
  const isDailyView = !location.pathname.split('/')[2] || location.pathname.split('/')[2] === 'daily';
  const isWeeklyView = !location.pathname.split('/')[2] || location.pathname.split('/')[2] === 'weekly';
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const handlePrevious = () => {
    let newDate;
    switch (window.location.pathname.split('/')[2]) {
      case 'weekly':
        newDate = subWeeks(currentDate, 1);
        break;
      case 'monthly':
        newDate = subMonths(currentDate, 1);
        break;
      default:
        newDate = subDays(currentDate, 1);
    }
    onDateChange(newDate);
  };

  const handleNext = () => {
    let newDate;
    switch (window.location.pathname.split('/')[2]) {
      case 'weekly':
        newDate = addWeeks(currentDate, 1);
        break;
      case 'monthly':
        newDate = addMonths(currentDate, 1);
        break;
      default:
        newDate = addDays(currentDate, 1);
    }
    onDateChange(newDate);
  };

  const formatDate = () => {
    const dayFormat = isMobile ? 'EEE' : 'EEEE';
    switch (window.location.pathname.split('/')[2]) {
      case 'weekly':
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 }); // 0 = Sunday
        return `Week of ${format(weekStart, `${dayFormat}, MMMM d, yyyy`)}`;
      case 'monthly':
        return format(currentDate, 'MMMM yyyy');
      default:
        return format(currentDate, `${dayFormat}, MMMM d, yyyy`);
    }
  };

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          flexDirection: isDailyView && !isMobile ? 'row' : 'column',
          gap: { xs: 1, sm: 2 },
          px: 2,
          py: { xs: 0.5, sm: 2 },
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          width: '100%',
          minWidth: 0,
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={isMobile ? 1 : 2}
          sx={{
            minWidth: 0,
            justifyContent: 'space-between',
            width: '100%'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 }, width: '100%', minWidth: 0 }}>
            <IconButton onClick={handlePrevious}>
              <ChevronLeftIcon />
            </IconButton>

            <Typography variant="h6" component="div" noWrap sx={{ minWidth: 0, flexShrink: 1, flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {formatDate()}
            </Typography>

            <IconButton onClick={() => setIsCalendarOpen(true)}>
              <CalendarIcon />
            </IconButton>

            <IconButton onClick={handleNext}>
              <ChevronRightIcon />
            </IconButton>

            {isMobile && <FiltersButton onClick={() => setFiltersDrawerOpen(true)} />}
          </Box>
        </Stack>

        {(isDailyView || isWeeklyView) && isMobile && <TaskFilters openDrawer={filtersDrawerOpen} setDrawerOpen={setFiltersDrawerOpen} />}
      </Box>

      <Dialog
        open={isCalendarOpen}
        onClose={() => setIsCalendarOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Select Date</DialogTitle>
        <DialogContent>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <StaticDatePicker
              displayStaticWrapperAs="desktop"
              value={currentDate}
              onChange={(newDate) => {
                onDateChange(newDate);
                setIsCalendarOpen(false);
              }}
              slotProps={{
                actionBar: {
                  actions: []
                }
              }}
            />
          </LocalizationProvider>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsCalendarOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default DateNavigation;