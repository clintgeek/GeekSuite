import { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Stack,
  Typography,
  Paper
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useTaskContext } from '../../context/TaskContext';

const TaskCreatorWithDates = () => {
  const { createTask } = useTaskContext();
  const [content, setContent] = useState('');
  const [createdDate, setCreatedDate] = useState(new Date());
  const [dueDate, setDueDate] = useState(null);
  const [completedDate, setCompletedDate] = useState(null);
  const [status, setStatus] = useState('pending');

  const handleSubmit = async (e) => {
    e.preventDefault();

    const taskData = {
      content,
      createdAt: createdDate,
      dueDate: dueDate,
      status: status,
      updatedAt: completedDate || createdDate
    };

    try {
      await createTask(taskData);
      // Reset form
      setContent('');
      setCreatedDate(new Date());
      setDueDate(null);
      setCompletedDate(null);
      setStatus('pending');
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  return (
    <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Create Task with Custom Dates
      </Typography>
      <form onSubmit={handleSubmit}>
        <Stack spacing={3}>
          <TextField
            label="Task Content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            fullWidth
          />

          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <DateTimePicker
              label="Created Date"
              value={createdDate}
              onChange={setCreatedDate}
              renderInput={(params) => <TextField {...params} fullWidth />}
            />

            <DateTimePicker
              label="Due Date"
              value={dueDate}
              onChange={setDueDate}
              renderInput={(params) => <TextField {...params} fullWidth />}
            />

            <DateTimePicker
              label="Completed Date"
              value={completedDate}
              onChange={(date) => {
                setCompletedDate(date);
                if (date) {
                  setStatus('completed');
                } else {
                  setStatus('pending');
                }
              }}
              renderInput={(params) => <TextField {...params} fullWidth />}
            />
          </LocalizationProvider>

          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
          >
            Create Task
          </Button>
        </Stack>
      </form>
    </Paper>
  );
};

export default TaskCreatorWithDates;