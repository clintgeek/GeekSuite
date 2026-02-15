import {
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Chip,
  Box,
  Typography,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import {
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as UncheckedIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Schedule as ScheduleIcon,
  Flag as FlagIcon,
  KeyboardReturn as BacklogIcon,
  KeyboardTab as ForwardIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { useTaskContext } from '../../context/TaskContext';
import { useState } from 'react';
import TaskEditor from './TaskEditor';

const signifierIcons = {
  '*': '*',
  '@': '@',
  'x': 'x',
  '<': '<',
  '>': '>',
  '-': '-',
  '!': '!',
  '?': '?',
  '#': '#'
};

const priorityColors = {
  1: 'error',
  2: 'warning',
  3: 'info'
};

const TaskCard = ({ task, onEdit }) => {
  const { updateTaskStatus, deleteTask, updateTask } = useTaskContext();
  const [isEditing, setIsEditing] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(null);

  const handleStatusToggle = async () => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await updateTaskStatus(task._id, newStatus);
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      await deleteTask(task._id);
    }
  };

  const handleMoveToBacklog = async () => {
    if (window.confirm('Move this task to the backlog?')) {
      await updateTask(task._id, { ...task, status: 'migrated_back', dueDate: null });
    }
  };

  const handleScheduleForward = () => {
    setScheduledDate(task.dueDate ? new Date(task.dueDate) : new Date());
    setIsScheduling(true);
  };

  const handleScheduleSubmit = async () => {
    await updateTask(task._id, {
      ...task,
      status: 'migrated_future',
      dueDate: scheduledDate
    });
    setIsScheduling(false);
  };

  // Clean the content by removing tags and priority markers
  const cleanContent = (content) => {
    return content
      .replace(/#\w+/g, '') // Remove tags
      .replace(/!(high|medium|low)/i, '') // Remove priority
      .trim();
  };

  return (
    <>
      <ListItem
        sx={{
          borderRadius: 1,
          mb: 1,
          bgcolor: 'background.paper',
          px: { xs: 1, sm: 2 },
          py: { xs: 1.5, sm: 1 },
          minHeight: { xs: 64, sm: 48 },
        }}
      >
        <ListItemIcon
          onClick={handleStatusToggle}
          sx={{
            cursor: 'pointer',
            minWidth: { xs: 44, sm: 40 },
            minHeight: { xs: 44, sm: 40 },
            mr: { xs: 1, sm: 2 },
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
            {task.status === 'completed' ? (
              <CheckCircleIcon color="success" sx={{ fontSize: { xs: 32, sm: 24 } }} />
            ) : (
              <UncheckedIcon sx={{ fontSize: { xs: 32, sm: 24 } }} />
            )}
        </ListItemIcon>

        <ListItemText
          primary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                component="span"
                sx={{
                  textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                  fontSize: { xs: '1.1rem', sm: '1rem' },
                  fontWeight: 500,
                }}
              >
                {cleanContent(task.content)}
              </Typography>
              {task.priority && (
                <FlagIcon color={priorityColors[task.priority]} fontSize="small" sx={{ fontSize: { xs: 20, sm: 16 } }} />
              )}
            </Box>
          }
          secondary={
            <Box sx={{ mt: 0.5, }}>
              {task.dueDate && (
                <Typography variant="body2" color="text.secondary" component="span" sx={{ fontSize: { xs: '0.95rem', sm: '0.875rem' } }}>
                  Due: {format(new Date(task.dueDate), 'MMM d, yyyy h:mm a')}
                </Typography>
              )}
              {task.note && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    mt: 0.5,
                    fontStyle: 'italic',
                    display: 'block',
                    fontSize: { xs: '0.95rem', sm: '0.875rem' }
                  }}
                >
                  Note: {task.note}
                </Typography>
              )}
              {task.tags?.length > 0 && (
                <Box sx={{ mt: 0.5 }}>
                  {task.tags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    sx={{ mr: 0.5, fontSize: { xs: '0.85rem', sm: '0.75rem' }, height: { xs: 24, sm: 20 } }}
                  />
                ))}
                </Box>
              )}
            </Box>
          }
        />
      </ListItem>

      <TaskEditor
        open={isEditing}
        onClose={() => setIsEditing(false)}
        task={task}
      />

      <Dialog open={isScheduling} onClose={() => setIsScheduling(false)}>
        <DialogTitle>Schedule Task</DialogTitle>
        <DialogContent>
          <DateTimePicker
            label="Due Date & Time"
            value={scheduledDate}
            onChange={setScheduledDate}
            slotProps={{ textField: { fullWidth: true, sx: { mt: 2 } } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsScheduling(false)}>Cancel</Button>
          <Button onClick={handleScheduleSubmit} variant="contained">
            Schedule
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default TaskCard;