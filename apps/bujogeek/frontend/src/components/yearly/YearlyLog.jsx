import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Badge,
  Dialog,
  DialogTitle,
  DialogContent,
  Stack
} from '@mui/material';
import {
  format,
  startOfYear,
  endOfYear,
  eachMonthOfInterval,
  isSameMonth,
  isThisMonth,
  isSameYear
} from 'date-fns';
import { useTaskContext } from '../../context/TaskContext';
import TaskList from '../tasks/TaskList';

const YearlyLog = ({ date = new Date() }) => {
  const [selectedYear, setSelectedYear] = useState(startOfYear(date));
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedMonthTasks, setSelectedMonthTasks] = useState([]);
  const { tasks, fetchYearlyTasks, currentView, currentDate } = useTaskContext();

  const yearStart = startOfYear(selectedYear);
  const yearEnd = endOfYear(selectedYear);
  const monthsInYear = eachMonthOfInterval({ start: yearStart, end: yearEnd });

  useEffect(() => {
    if (!isSameYear(currentDate, selectedYear) || currentView !== 'year') {
      fetchYearlyTasks(selectedYear);
    }
  }, [selectedYear, currentView, currentDate, fetchYearlyTasks]);

  const getTasksForMonth = (date) => {
    if (!tasks || (!Array.isArray(tasks) && !Object.values(tasks).length)) {
      return [];
    }

    const tasksArray = Array.isArray(tasks)
      ? tasks
      : Object.values(tasks).flat();

    const monthTasks = tasksArray.filter(task => {
      if (!task) return false;
      const taskDate = task.dueDate ? new Date(task.dueDate) : null;
      return taskDate && isSameMonth(taskDate, date);
    });

    return monthTasks;
  };

  const getMonthStyle = (month) => {
    const monthTasks = getTasksForMonth(month);
    return {
      p: 2,
      height: '100%',
      minHeight: 120,
      bgcolor: isThisMonth(month) ? 'primary.50' : monthTasks.length > 0 ? 'action.hover' : 'background.paper',
      borderRadius: 2,
      border: '1px solid',
      borderColor: isThisMonth(month) ? 'primary.main' : monthTasks.length > 0 ? 'primary.light' : 'divider',
      transition: 'all 0.2s',
      '&:hover': {
        transform: 'scale(1.02)',
        boxShadow: 1,
      }
    };
  };

  const handleMonthClick = (month, monthTasks) => {
    setSelectedMonth(month);
    setSelectedMonthTasks(monthTasks);
  };

  const handleCloseDialog = () => {
    setSelectedMonth(null);
    setSelectedMonthTasks([]);
  };

  return (
    <Box sx={{
      maxWidth: 1200,
      mx: 'auto',
      py: 0,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100%'
    }}>
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 3,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          width: '100%'
        }}
      >
        <Grid
          container
          spacing={2}
          sx={{
            justifyContent: 'center',
            alignItems: 'stretch'
          }}
        >
          {monthsInYear.map((month) => {
            const monthTasks = getTasksForMonth(month);
            const highPriorityTasks = monthTasks.filter(task => task.priority === 1);
            const scheduledEvents = monthTasks.filter(task => task.signifier === '@');

            return (
              <Grid
                item
                xs={6}
                sm={4}
                md={2}
                key={month.toISOString()}
                sx={{
                  display: 'flex',
                  justifyContent: 'center'
                }}
              >
                <Paper
                  variant="outlined"
                  onClick={() => handleMonthClick(month, monthTasks)}
                  sx={{
                    ...getMonthStyle(month),
                    cursor: 'pointer',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 160,
                    aspectRatio: '1.5',
                    width: '100%'
                  }}
                >
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: 2 }}
                  >
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: isThisMonth(month) ? 700 : 500,
                        color: isThisMonth(month) ? 'primary.main' : 'text.primary'
                      }}
                    >
                      {format(month, 'MMM').toUpperCase()}
                    </Typography>
                    {monthTasks.length > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        {monthTasks.length}
                      </Typography>
                    )}
                  </Stack>

                  <Stack spacing={1} sx={{ flex: 1 }}>
                    {highPriorityTasks.length > 0 && (
                      <Badge
                        color="error"
                        variant="dot"
                        sx={{ alignSelf: 'flex-start' }}
                      >
                        <Typography variant="caption" sx={{ ml: 1 }}>
                          {highPriorityTasks.length} High Priority
                        </Typography>
                      </Badge>
                    )}
                    {scheduledEvents.length > 0 && (
                      <Badge
                        color="primary"
                        variant="dot"
                        sx={{ alignSelf: 'flex-start' }}
                      >
                        <Typography variant="caption" sx={{ ml: 1 }}>
                          {scheduledEvents.length} Scheduled
                        </Typography>
                      </Badge>
                    )}
                  </Stack>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      </Paper>

      <Dialog
        open={Boolean(selectedMonth)}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">
              {selectedMonth ? format(selectedMonth, 'MMMM yyyy') : ''}
            </Typography>
            <Typography variant="subtitle2" color="text.secondary">
              {selectedMonthTasks.length} tasks
            </Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{
            mt: 1,
            '& .css-1bg2tgm': {
              border: 'none !important'
            }
          }}>
            {selectedMonthTasks.length > 0 ? (
              <TaskList
                tasks={selectedMonthTasks}
                viewType="yearly"
              />
            ) : (
              <Typography color="text.secondary">
                No tasks scheduled for this month
              </Typography>
            )}
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default YearlyLog;