import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Stack,
  Divider,
  Badge,
  Tooltip,
  Grid,
  useTheme,
  useMediaQuery,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Today as TodayIcon,
  CalendarToday as CalendarIcon,
  MoreHoriz as MoreIcon,
  PriorityHigh as PriorityHighIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isToday,
  isSameMonth,
  getWeek,
  startOfWeek,
  endOfWeek,
  isWeekend,
} from 'date-fns';
import { useTaskContext, LoadingState } from '../../context/TaskContext';
import TaskCard from '../tasks/TaskCard';
import TaskList from '../tasks/TaskList';

{/* Task Creation Form - Temporarily Hidden
<Box sx={{ mb: 3 }}>
  <Paper
    elevation={0}
    sx={{
      p: 2,
      borderRadius: 2,
      border: '1px solid',
      borderColor: 'divider'
    }}
  >
    <Typography variant="h6" sx={{ mb: 2 }}>
      Create Task with Custom Dates
    </Typography>
    <Stack spacing={2}>
      <TextField
        fullWidth
        label="Task Content"
        required
      />
      <TextField
        fullWidth
        label="Created Date"
        type="datetime-local"
        defaultValue={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
        InputLabelProps={{
          shrink: true,
        }}
      />
      <TextField
        fullWidth
        label="Due Date"
        type="datetime-local"
        InputLabelProps={{
          shrink: true,
        }}
      />
      <TextField
        fullWidth
        label="Completed Date"
        type="datetime-local"
        InputLabelProps={{
          shrink: true,
        }}
      />
      <Button
        fullWidth
        variant="contained"
        color="primary"
      >
        Create Task
      </Button>
    </Stack>
  </Paper>
</Box>
*/}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DayCell = ({ day, tasks = [], isCurrentMonth, onClick }) => {
  const theme = useTheme();
  // Count different types of tasks
  const scheduledEvents = tasks.filter(task => task.signifier === '@');
  const highPriorityTasks = tasks.filter(task => task.priority === 1);
  const mediumPriorityTasks = tasks.filter(task => task.priority === 2).length;
  const highPriorityEvents = highPriorityTasks.filter(task => task.signifier === '@');

  return (
    <Paper
      onClick={() => onClick(day, tasks)}
      sx={{
        height: '100%',
        p: 1,
        cursor: 'pointer',
        bgcolor: theme => {
          if (!isCurrentMonth) return theme.palette.grey[50];
          if (isWeekend(day)) return theme.palette.grey[100];
          if (isToday(day)) return theme.palette.primary[50];
          return theme.palette.background.paper;
        },
        border: theme => isToday(day) ? `2px solid ${ theme.palette.primary.main }` : '1px solid',
        borderColor: 'divider',
        opacity: isCurrentMonth ? 1 : 0.5,
        transition: 'all 0.2s',
        '&:hover': {
          transform: 'scale(1.02)',
          boxShadow: 1,
        },
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        overflow: 'hidden',
      }}
    >
      {/* Header row with date and counts */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography
          variant="h6"
          sx={{
            fontWeight: isToday(day) ? 700 : 500,
            color: isToday(day) ? 'primary.main' : 'text.primary',
            fontSize: '1.1rem',
            minWidth: 'auto',
          }}
        >
          {format(day, 'd')}
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', ml: 'auto' }}>
          {/* Priority indicators */}
          {highPriorityTasks.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'error.main' }} />
              <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 'bold', fontSize: '0.7rem' }}>
                {highPriorityTasks.length}
              </Typography>
            </Box>
          )}
          {mediumPriorityTasks > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#FFD700' }} />
              <Typography variant="caption" sx={{ color: '#DAA520', fontWeight: 'bold', fontSize: '0.7rem' }}>
                {mediumPriorityTasks}
              </Typography>
            </Box>
          )}
          {/* Scheduled events count */}
          {scheduledEvents.length > 0 && (
            <Typography
              variant="caption"
              sx={{
                color: 'primary.main',
                fontWeight: 'bold',
                fontSize: '0.7rem'
              }}
            >
              @{scheduledEvents.length}
            </Typography>
          )}
        </Box>
      </Box>

      {/* High Priority Event titles */}
      {highPriorityEvents.length > 0 && (
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
          overflow: 'hidden',
          flex: 1
        }}>
          {highPriorityEvents.map((event) => (
            <Typography
              key={event._id}
              variant="caption"
              noWrap
              title={event.content}
              sx={{
                color: 'error.main',
                fontSize: '0.7rem',
                lineHeight: 1.2,
                textOverflow: 'ellipsis',
                fontWeight: 500
              }}
            >
              {event.content}
            </Typography>
          ))}
        </Box>
      )}
    </Paper>
  );
};

const MonthlyLog = ({ date, onDateChange }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedDayTasks, setSelectedDayTasks] = useState([]);
  const { tasks, loading, fetchTasks, LoadingState } = useTaskContext();
  const lastFetchRef = useRef(null);

  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const daysInCalendar = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Memoize the date range to prevent unnecessary re-renders
  const dateRange = useMemo(() => {
    const start = startOfMonth(date);
    const end = endOfMonth(date);
    return { start, end };
  }, [date]);

  useEffect(() => {
    const fetchKey = `${dateRange.start.toISOString()}-${dateRange.end.toISOString()}`;

    // Only fetch if we're not already loading and haven't fetched this range
    if (loading !== LoadingState.FETCHING && lastFetchRef.current !== fetchKey) {
      lastFetchRef.current = fetchKey;
      fetchTasks('monthly', date);
    }
  }, [dateRange, fetchTasks, loading, date]);

  const handlePreviousMonth = () => {
    onDateChange(subMonths(date, 1));
  };

  const handleNextMonth = () => {
    onDateChange(addMonths(date, 1));
  };

  const handleToday = () => {
    onDateChange(new Date());
  };

  const handleDateChange = (event) => {
    const newDate = new Date(event.target.value);
    if (!isNaN(newDate)) {
      onDateChange(newDate);
    }
  };

  const getTasksForDay = (date) => {
    // If tasks is an array, filter tasks for this day
    if (Array.isArray(tasks)) {
      return tasks.filter(task => {
        const taskDate = task.dueDate ? new Date(task.dueDate) : null;
        return taskDate &&
          taskDate.getFullYear() === date.getFullYear() &&
          taskDate.getMonth() === date.getMonth() &&
          taskDate.getDate() === date.getDate();
      });
    }

    // If tasks is an object indexed by date
    const dateKey = format(date, 'yyyy-MM-dd');
    return tasks[dateKey] || [];
  };

  const handleDayClick = (day, dayTasks) => {
    setSelectedDay(day);
    setSelectedDayTasks(dayTasks);
  };

  const handleCloseDialog = () => {
    setSelectedDay(null);
    setSelectedDayTasks([]);
  };

  // Group days into weeks for the grid
  const weeks = [];
  let currentWeek = [];
  daysInCalendar.forEach(day => {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });

  return (
    <Box sx={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Calendar Grid */}
      <Grid container columns={7} sx={{
        border: '1px solid',
        flex: 1,
        p: 2,
        borderRadius: 2,
        borderColor: 'divider',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Weekday Headers */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))',
            gap: 1,
            mb: 1,
            px: '1px',
            width: '100%',
            maxWidth: '100%',
            margin: '0 auto',
          }}
        >
          {WEEKDAYS.map((day) => (
            <Box
              key={day}
              sx={{
                textAlign: 'center',
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 600,
                  color: day === 'Sun' || day === 'Sat' ? 'text.secondary' : 'text.primary',
                  fontSize: '0.875rem',
                  py: 1,
                  borderRadius: 1,
                  bgcolor: theme => theme.palette.grey[50],
                  width: '100%',
                  display: 'block',
                  textAlign: 'center',
                }}
              >
                {day}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Calendar Days */}
        <Box sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          margin: '0 auto',
        }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))',
              gap: 1,
              width: '100%',
              maxWidth: '100%',
              margin: '0 auto',
              mt: 1,
            }}
          >
            {weeks.map((week) => (
              week.map((day) => (
                <Box
                  key={day.toISOString()}
                  sx={{
                    aspectRatio: isMobile ? 'auto' : '1',
                    minHeight: isMobile ? 100 : 'auto',
                  }}
                >
                  <DayCell
                    day={day}
                    tasks={getTasksForDay(day)}
                    isCurrentMonth={isSameMonth(day, date)}
                    onClick={handleDayClick}
                  />
                </Box>
              ))
            ))}
          </Box>
        </Box>
      </Grid>

      {/* Day Detail Dialog */}
      <Dialog
        open={Boolean(selectedDay)}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {selectedDay && format(selectedDay, 'EEEE, MMMM d, yyyy')}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{
            '& .css-1bg2tgm': {
              border: 'none !important'
            }
          }}>
            {selectedDayTasks.length > 0 ? (
              <TaskList
                tasks={selectedDayTasks}
                showMigrationActions={true}
                viewType="monthly"
              />
            ) : (
              <Typography color="text.secondary">
                No tasks scheduled for this day
              </Typography>
            )}
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default MonthlyLog;