import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Stack,
  Divider,
  Badge,
  Tooltip
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Today as TodayIcon,
  CalendarToday as CalendarIcon
} from '@mui/icons-material';
import {
  format,
  addWeeks,
  subWeeks,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isToday,
  getWeek
} from 'date-fns';
import { useTaskContext } from '../../context/TaskContext.jsx';
import TaskList from '../tasks/TaskList';
import TaskCard from '../tasks/TaskCard';

const WeeklyLog = () => {
  const [selectedWeek, setSelectedWeek] = useState(new Date());
  const { tasks, loading, fetchWeeklyTasks } = useTaskContext();

  const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 1 }); // Start on Monday
  const weekEnd = endOfWeek(selectedWeek, { weekStartsOn: 1 });
  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const weekNumber = getWeek(selectedWeek, { weekStartsOn: 1 });

  useEffect(() => {
    fetchWeeklyTasks(weekStart, weekEnd);
  }, [selectedWeek, fetchWeeklyTasks]);

  const handlePreviousWeek = () => {
    setSelectedWeek(prev => subWeeks(prev, 1));
  };

  const handleNextWeek = () => {
    setSelectedWeek(prev => addWeeks(prev, 1));
  };

  const handleToday = () => {
    setSelectedWeek(new Date());
  };

  const handleDateChange = (event) => {
    const newDate = new Date(event.target.value);
    setSelectedWeek(newDate);
  };

  const getTasksForDay = (date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    return tasks[dateKey] || [];
  };

  return (
    <Box sx={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      p: 2
    }}>
      {/* Week Header */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider'
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={2}
        >
          <IconButton onClick={handlePreviousWeek} size="small">
            <ChevronLeftIcon />
          </IconButton>

          <Typography
            variant="h6"
            component="div"
            sx={{
              flex: 1,
              textAlign: 'center',
              fontFamily: '"Roboto Mono", monospace',
              fontWeight: 500
            }}
          >
            Week {weekNumber} - {format(weekStart, 'MMMM d')} to {format(weekEnd, 'MMMM d, yyyy')}
          </Typography>

          <Stack direction="row" spacing={1}>
            <Tooltip title="Today">
              <IconButton onClick={handleToday} size="small">
                <TodayIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Select date">
              <IconButton component="label" size="small">
                <CalendarIcon />
                <input
                  type="date"
                  value={format(selectedWeek, 'yyyy-MM-dd')}
                  onChange={handleDateChange}
                  style={{ display: 'none' }}
                />
              </IconButton>
            </Tooltip>
            <IconButton onClick={handleNextWeek} size="small">
              <ChevronRightIcon />
            </IconButton>
          </Stack>
        </Stack>
      </Paper>

      {/* Days Stack */}
      <Stack spacing={2} sx={{ flex: 1, overflowY: 'auto' }}>
        {daysInWeek.map((day) => {
          const dayTasks = getTasksForDay(day);
          const hasHighPriorityTasks = dayTasks.some(task => task.priority === 1);
          const hasScheduledItems = dayTasks.some(task => task.signifier === '@');

          return (
            <Paper
              key={day.toISOString()}
              variant="outlined"
              sx={{
                p: 2,
                bgcolor: isToday(day) ? 'primary.50' : 'background.paper',
                borderColor: isToday(day) ? 'primary.main' : 'divider'
              }}
            >
              <Stack spacing={2}>
                {/* Day Header */}
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={2}
                >
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: isToday(day) ? 700 : 500,
                      color: isToday(day) ? 'primary.main' : 'text.primary',
                      minWidth: 200
                    }}
                  >
                    {format(day, 'EEEE')}
                    <Typography
                      component="span"
                      variant="body1"
                      sx={{
                        ml: 2,
                        color: 'text.secondary'
                      }}
                    >
                      {format(day, 'MMMM d')}
                    </Typography>
                  </Typography>

                  <Stack direction="row" spacing={1}>
                    {hasHighPriorityTasks && (
                      <Badge
                        color="error"
                        variant="dot"
                        sx={{ alignSelf: 'center' }}
                      >
                        <Typography variant="caption" sx={{ ml: 1 }}>
                          {dayTasks.filter(task => task.priority === 1).length} High Priority
                        </Typography>
                      </Badge>
                    )}
                    {hasScheduledItems && (
                      <Badge
                        color="primary"
                        variant="dot"
                        sx={{ alignSelf: 'center' }}
                      >
                        <Typography variant="caption" sx={{ ml: 1 }}>
                          {dayTasks.filter(task => task.signifier === '@').length} Scheduled
                        </Typography>
                      </Badge>
                    )}
                  </Stack>

                  {isToday(day) && (
                    <Typography
                      variant="caption"
                      sx={{
                        ml: 'auto',
                        color: 'primary.main',
                        fontWeight: 'bold'
                      }}
                    >
                      TODAY
                    </Typography>
                  )}
                </Stack>

                <Divider />

                {/* Tasks */}
                {dayTasks.length > 0 ? (
                  <TaskList tasks={dayTasks} showMigrationActions={true} viewType="weekly" />
                ) : (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ py: 2 }}
                  >
                    No tasks scheduled
                  </Typography>
                )}
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
};

export default WeeklyLog;