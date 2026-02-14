import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Stack,
  Divider,
  Grid,
  Badge,
  Dialog,
  DialogTitle,
  DialogContent,
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon
} from '@mui/icons-material';
import {
  format,
  addYears,
  subYears,
  startOfYear,
  endOfYear,
  eachMonthOfInterval,
  isSameMonth,
  isThisMonth
} from 'date-fns';
import { useTaskContext } from '../../context/TaskContext.jsx';
import TaskCard from '../tasks/TaskCard';

const YearlyLog = () => {
  const [selectedYear, setSelectedYear] = useState(new Date());
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedMonthTasks, setSelectedMonthTasks] = useState([]);
  const { tasks, fetchYearlyTasks } = useTaskContext();

  const yearStart = startOfYear(selectedYear);
  const yearEnd = endOfYear(selectedYear);
  const monthsInYear = eachMonthOfInterval({ start: yearStart, end: yearEnd });

  useEffect(() => {
    fetchYearlyTasks(yearStart, yearEnd);
  }, [selectedYear, fetchYearlyTasks]);

  const handlePreviousYear = () => {
    setSelectedYear(prev => subYears(prev, 1));
  };

  const handleNextYear = () => {
    setSelectedYear(prev => addYears(prev, 1));
  };

  const getTasksForMonth = (date) => {
    if (!tasks || (!Array.isArray(tasks) && !Object.values(tasks).length)) {
      return [];
    }

    // If tasks is an object (grouped by dates), flatten it into an array
    const tasksArray = Array.isArray(tasks)
      ? tasks
      : Object.values(tasks).flat();

    // Filter tasks for this month, including those with due dates
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

  // Get total tasks count
  const totalTasks = Array.isArray(tasks) ? tasks.length : 0;
  const tasksWithDueDate = Array.isArray(tasks)
    ? tasks.filter(task => task.dueDate).length
    : 0;

  const handleMonthClick = (month, monthTasks) => {
    setSelectedMonth(month);
    setSelectedMonthTasks(monthTasks);
  };

  const handleCloseDialog = () => {
    setSelectedMonth(null);
    setSelectedMonthTasks([]);
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', py: 3 }}>
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 3,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider'
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={2}
          sx={{ mb: 2 }}
        >
          <IconButton onClick={handlePreviousYear} size="small">
            <ChevronLeftIcon />
          </IconButton>

          <Stack flex={1} alignItems="center" spacing={1}>
            <Typography
              variant="h6"
              component="div"
              sx={{
                textAlign: 'center',
                fontFamily: '"Roboto Mono", monospace',
                fontWeight: 500
              }}
            >
              {format(selectedYear, 'yyyy')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {totalTasks} total tasks • {tasksWithDueDate} scheduled
            </Typography>
          </Stack>

          <IconButton onClick={handleNextYear} size="small">
            <ChevronRightIcon />
          </IconButton>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        <Grid container spacing={2}>
          {monthsInYear.map((month) => {
            const monthTasks = getTasksForMonth(month);
            const hasHighPriorityTasks = monthTasks.some(task => task.priority === 1);
            const hasScheduledItems = monthTasks.some(task => task.signifier === '@');
            const totalMonthTasks = monthTasks.length;

            return (
              <Grid item xs={12} sm={6} md={4} key={month.toISOString()}>
                <Paper
                  variant="outlined"
                  onClick={() => handleMonthClick(month, monthTasks)}
                  sx={{
                    ...getMonthStyle(month),
                    cursor: 'pointer',
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
                      {format(month, 'MMMM')}
                    </Typography>
                    {totalMonthTasks > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        {totalMonthTasks} tasks
                      </Typography>
                    )}
                  </Stack>

                  <Stack spacing={1}>
                    {hasHighPriorityTasks && (
                      <Badge
                        color="error"
                        variant="dot"
                        sx={{ alignSelf: 'flex-start' }}
                      >
                        <Typography variant="caption" sx={{ ml: 1 }}>
                          {monthTasks.filter(task => task.priority === 1).length} High Priority
                        </Typography>
                      </Badge>
                    )}
                    {hasScheduledItems && (
                      <Badge
                        color="primary"
                        variant="dot"
                        sx={{ alignSelf: 'flex-start' }}
                      >
                        <Typography variant="caption" sx={{ ml: 1 }}>
                          {monthTasks.filter(task => task.signifier === '@').length} Scheduled
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

      {/* Month Detail Dialog */}
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
          <Stack spacing={2} sx={{ mt: 1 }}>
            {selectedMonthTasks.length > 0 ? (
              selectedMonthTasks.map(task => (
                <TaskCard
                  key={task._id}
                  task={task}
                  showMigrationActions={true}
                />
              ))
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