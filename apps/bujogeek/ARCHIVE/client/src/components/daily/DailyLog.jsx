import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Stack,
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Today as TodayIcon
} from '@mui/icons-material';
import { format, addDays, subDays, isToday } from 'date-fns';
import { useTaskContext } from '../../context/TaskContext';
import TaskList from '../tasks/TaskList';
import QuickEntry from '../tasks/QuickEntry';

const DailyLog = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { tasks, fetchDailyTasks } = useTaskContext();

  useEffect(() => {
    fetchDailyTasks(selectedDate);
  }, [selectedDate, fetchDailyTasks]);

  const handlePreviousDay = () => {
    setSelectedDate(prev => subDays(prev, 1));
  };

  const handleNextDay = () => {
    setSelectedDate(prev => addDays(prev, 1));
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  return (
    <Box sx={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      p: 0.5,
      display: 'flex',
      flexDirection: 'column'
    }}>
      <Paper
        elevation={0}
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          minHeight: 0 // Important for proper flex behavior
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={2}
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper'
          }}
        >
          <IconButton onClick={handlePreviousDay} size="small">
            <ChevronLeftIcon />
          </IconButton>

          <Typography
            variant="h6"
            component="div"
            sx={{
              flex: 1,
              textAlign: 'center',
              fontFamily: '"Roboto Mono", monospace',
              fontWeight: 500,
              fontSize: '1rem'
            }}
          >
            {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            {isToday(selectedDate) && (
              <Typography
                component="span"
                variant="caption"
                sx={{
                  ml: 1,
                  color: 'primary.main',
                  fontWeight: 'bold'
                }}
              >
                TODAY
              </Typography>
            )}
          </Typography>

          <IconButton onClick={handleNextDay} size="small">
            <ChevronRightIcon />
          </IconButton>

          {!isToday(selectedDate) && (
            <IconButton
              onClick={handleToday}
              size="small"
              color="primary"
            >
              <TodayIcon />
            </IconButton>
          )}
        </Stack>

        <Box sx={{
          flex: 1,
          overflowY: 'auto',
          px: 2,
          py: 2,
          minHeight: 0 // Important for proper flex behavior
        }}>
          <TaskList
            tasks={tasks}
            showMigrationActions={true}
            selectedDate={selectedDate}
            viewType="daily"
          />
        </Box>
      </Paper>
    </Box>
  );
};

export default DailyLog;