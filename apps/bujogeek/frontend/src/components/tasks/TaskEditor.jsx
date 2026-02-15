import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Box,
  IconButton,
  Chip
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { Close as CloseIcon } from '@mui/icons-material';
import { useTaskContext } from '../../context/TaskContext.jsx';

const signifierOptions = [
  { value: '*', label: 'Task (*)' },
  { value: '@', label: 'Event (@)' },
  { value: '-', label: 'Note (-)' },
  { value: '?', label: 'Question (?)' }
];

const priorityOptions = [
  { value: null, label: 'Normal' },
  { value: 1, label: 'High' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Low' }
];

const TaskEditor = ({ open, onClose, task = null }) => {
  const { createTask, updateTask } = useTaskContext();
  const [formData, setFormData] = useState({
    content: '',
    signifier: '*',
    status: 'pending',
    priority: null,
    dueDate: null,
    createdAt: new Date(),
    tags: [],
    note: ''
  });
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (task) {
      setFormData({
        content: task.content,
        signifier: task.signifier,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate ? new Date(task.dueDate) : null,
        createdAt: task.createdAt ? new Date(task.createdAt) : new Date(),
        tags: task.tags || [],
        note: task.note || ''
      });
    }
  }, [task]);

  const handleChange = (field) => (event) => {
    setFormData({ ...formData, [field]: event.target.value });
  };

  const handleTagInputKeyPress = (event) => {
    if (event.key === 'Enter' && tagInput.trim()) {
      event.preventDefault();
      const newTag = tagInput.trim();
      if (!formData.tags.includes(newTag)) {
        setFormData({
          ...formData,
          tags: [...formData.tags, newTag]
        });
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter(tag => tag !== tagToRemove)
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);

    try {
      if (task) {
        await updateTask(task._id, formData);
      } else {
        await createTask(formData);
      }
      onClose();
    } catch (error) {
      console.error('Error saving task:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ m: 0, p: 2 }}>
          {task ? 'Edit Task' : 'New Task'}
          <IconButton
            aria-label="close"
            onClick={onClose}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
              color: (theme) => theme.palette.grey[500]
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              label="Task Content"
              value={formData.content}
              onChange={handleChange('content')}
              multiline
              rows={3}
              required
              fullWidth
            />

            <TextField
              fullWidth
              label="Note"
              value={formData.note}
              onChange={handleChange('note')}
              multiline
              rows={3}
            />

            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                value={formData.signifier}
                onChange={handleChange('signifier')}
                label="Type"
              >
                {signifierOptions.map(option => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel id="priority-label">Priority</InputLabel>
              <Select
                labelId="priority-label"
                value={formData.priority ?? ''}
                onChange={handleChange('priority')}
                label="Priority"
              >
                {priorityOptions.map(option => (
                  <MenuItem key={option.value ?? 'normal'} value={option.value ?? ''}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <DateTimePicker
              label="Created Date & Time"
              value={formData.createdAt}
              onChange={(newDate) => setFormData({ ...formData, createdAt: newDate })}
              slotProps={{ textField: { fullWidth: true } }}
            />

            <DateTimePicker
              label="Due Date & Time"
              value={formData.dueDate}
              onChange={(newDate) => setFormData({ ...formData, dueDate: newDate })}
              slotProps={{ textField: { fullWidth: true } }}
              clearable
            />

            <Box>
              <TextField
                label="Add Tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={handleTagInputKeyPress}
                placeholder="Press Enter to add tags"
                fullWidth
                size="small"
              />
              <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {formData.tags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    onDelete={() => handleRemoveTag(tag)}
                    size="small"
                  />
                ))}
              </Box>
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
          >
            {task ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default TaskEditor;