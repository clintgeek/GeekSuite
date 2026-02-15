import React, { useEffect } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useTaskContext } from '../../context/TaskContext';
import TaskList from './TaskList';
import MonthlyLog from '../monthly/MonthlyLog';
import YearlyLog from '../yearly/YearlyLog';

const TaskView = ({ viewType, date, onDateChange }) => {
  const { tasks, loading, error, fetchTasks, LoadingState } = useTaskContext();

  useEffect(() => {
    if (viewType === 'monthly' || viewType === 'year') {
      return;
    }
    fetchTasks(viewType, date);
  }, [viewType, date, fetchTasks]);

  if (loading === LoadingState.FETCHING && viewType !== 'monthly' && viewType !== 'year') {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={2}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (viewType === 'monthly') {
    return (
      <Box>
        <MonthlyLog date={date} onDateChange={onDateChange} />
      </Box>
    );
  }

  if (viewType === 'year') {
    return (
      <Box>
        <YearlyLog date={date} onDateChange={onDateChange} />
      </Box>
    );
  }

  return (
    <Box sx={{
      '& .css-1bg2tgm': {
        border: 'none !important'
      }
    }}>
      <TaskList tasks={tasks} viewType={viewType} />
    </Box>
  );
};

export default TaskView;