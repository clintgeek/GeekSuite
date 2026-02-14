import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  NavigateBefore as NavigateBeforeIcon,
  NavigateNext as NavigateNextIcon,
  CalendarToday as CalendarIcon
} from '@mui/icons-material';
import { format, addDays } from 'date-fns';
import TaskEditor from './TaskEditor';

const DateNavigation = ({ currentDate, onDateChange }) => {
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const handleDateChange = (event) => {
    const newDate = new Date(event.target.value);
    onDateChange(newDate);
  };

  const handlePreviousDay = () => {
    const newDate = addDays(currentDate, -1);
    onDateChange(newDate);
  };

  const handleNextDay = () => {
    const newDate = addDays(currentDate, 1);
    onDateChange(newDate);
  };

  return (
    <>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <IconButton onClick={handlePreviousDay}>
                <NavigateBeforeIcon />
              </IconButton>

              <Typography variant="h6" component="div">
                {format(currentDate, 'EEEE, MMMM d, yyyy')}
              </Typography>

              <Tooltip title="Select date">
                <IconButton component="label">
                  <CalendarIcon />
                  <input
                    type="date"
                    value={format(currentDate, 'yyyy-MM-dd')}
                    onChange={handleDateChange}
                    style={{ display: 'none' }}
                  />
                </IconButton>
              </Tooltip>

              <IconButton onClick={handleNextDay}>
                <NavigateNextIcon />
              </IconButton>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <TaskEditor
        open={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        task={null}
      />
    </>
  );
};

export default DateNavigation;