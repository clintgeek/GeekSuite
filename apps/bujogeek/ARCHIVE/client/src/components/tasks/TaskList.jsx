import React from 'react';
import { List, Box, Typography } from '@mui/material';
import TaskCard from '../TaskCard';
import { useTaskContext } from '../../../context/TaskContext';
import { useLocation } from 'react-router-dom';
import { format, isValid } from 'date-fns';

const TaskList = ({ onEdit, currentDate }) => {
  const { tasks, loading, error } = useTaskContext();
  const location = useLocation();
  const view = location.pathname.split('/')[2] || 'daily';

  // Only show loading state when actually fetching
  if (loading === 'fetching') {
    return (
      <Box sx={{ p: 2 }}>
        <Typography>Loading tasks...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="error">Error loading tasks: {error.message}</Typography>
      </Box>
    );
  }

  // Handle case when tasks data hasn't been loaded yet
  if (!tasks) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography>No tasks found</Typography>
      </Box>
    );
  }

  // Handle different task formats based on view
  if (view === 'all') {
    // For 'all' view, tasks should be an object with dates as keys
    if (typeof tasks !== 'object') {
      return (
        <Box sx={{ p: 2 }}>
          <Typography>Invalid tasks data format</Typography>
        </Box>
      );
    }

    if (Object.keys(tasks).length === 0) {
      return (
        <Box sx={{ p: 2 }}>
          <Typography>No tasks found</Typography>
        </Box>
      );
    }

    // Sort dates in reverse chronological order (future dates first)
    const sortedDates = Object.keys(tasks).sort((a, b) => {
      // Handle the special case where 'Unscheduled' might still exist in the data
      if (a === 'Unscheduled') return 1;
      if (b === 'Unscheduled') return -1;

      // Parse dates properly to avoid timezone issues
      const parseLocalDate = (dateKey) => {
        const [year, month, day] = dateKey.split('-').map(Number);
        return new Date(year, month - 1, day);
      };

      // Sort in reverse chronological order (newest/future dates first)
      return parseLocalDate(b) - parseLocalDate(a);
    });

    // Filter out dates with no tasks
    const datesWithTasks = sortedDates.filter(dateKey =>
      Array.isArray(tasks[dateKey]) && tasks[dateKey].length > 0
    );

    if (datesWithTasks.length === 0) {
      return (
        <Box sx={{ p: 2 }}>
          <Typography>No tasks found</Typography>
        </Box>
      );
    }

    return (
      <List
        disablePadding
        sx={{
          flex: 1,
          overflowY: 'auto',
          '&::-webkit-scrollbar': {
            width: '8px',
            bgcolor: 'transparent'
          },
          '&::-webkit-scrollbar-thumb': {
            borderRadius: '4px',
            bgcolor: 'rgba(0, 0, 0, 0.1)'
          },
          '&::-webkit-scrollbar-track': {
            bgcolor: 'transparent'
          }
        }}
      >
        {datesWithTasks.map((dateKey) => (
          <Box key={dateKey}>
            <Typography
              variant="subtitle2"
              sx={{
                px: 2,
                py: 1,
                fontFamily: '"Roboto Mono", monospace',
                fontWeight: 500,
                fontSize: '0.75rem',
                color: 'text.secondary',
                position: 'sticky',
                top: 0,
                bgcolor: 'background.paper',
                zIndex: 1
              }}
            >
              {dateKey === 'Unscheduled'
                ? 'Unscheduled'
                : format(new Date(dateKey), 'EEEE, MMMM d, yyyy')}
            </Typography>
            {tasks[dateKey].map((task) => (
              <TaskCard
                key={task._id}
                task={task}
                onEdit={onEdit}
              />
            ))}
          </Box>
        ))}
      </List>
    );
  } else {
    // For other views, tasks should be an array
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return (
        <Box sx={{ p: 2 }}>
          <Typography>No tasks found</Typography>
        </Box>
      );
    }

    return (
      <List
        disablePadding
        sx={{
          flex: 1,
          overflowY: 'auto',
          '&::-webkit-scrollbar': {
            width: '8px',
            bgcolor: 'transparent'
          },
          '&::-webkit-scrollbar-thumb': {
            borderRadius: '4px',
            bgcolor: 'rgba(0, 0, 0, 0.1)'
          },
          '&::-webkit-scrollbar-track': {
            bgcolor: 'transparent'
          }
        }}
      >
        {tasks.map((task) => (
          <TaskCard
            key={task._id}
            task={task}
            onEdit={onEdit}
          />
        ))}
      </List>
    );
  }
};

export default TaskList;