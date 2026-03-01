import React, { useState, useMemo, useRef, useEffect } from 'react';
import { toLocalDateString } from '../../utils/dateUtils';
import {
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Check as CheckIcon,
  ArrowForward as ArrowForwardIcon
} from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useTaskContext } from '../../context/TaskContext';
import { format } from 'date-fns';
import TaskEditor from '../tasks/TaskEditor';

const TaskList = ({ tasks = [], viewType = 'daily' }) => {
  const { updateTaskStatus, deleteTask, migrateTask, updateTask, filters, saveDailyOrder, currentDate } = useTaskContext();
  const [selectedTask, setSelectedTask] = useState(null);
  const [futureDate, setFutureDate] = useState(null);
  const [migrationDialogOpen, setMigrationDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editedTask, setEditedTask] = useState(null);

  // Ensure tasks is an array
  const taskArray = Array.isArray(tasks) ? tasks : [];

  // Filter tasks based on the filters from TaskStore
  const filteredTasks = taskArray.filter(task => {
    // Only apply filters if they are explicitly set
    if (filters.search || filters.status || filters.priority || filters.type || (filters.tags && filters.tags.length > 0)) {
      const matchesSearch = !filters.search ||
        task.content.toLowerCase().includes(filters.search.toLowerCase()) ||
        (task.tags && task.tags.some(tag => tag.toLowerCase().includes(filters.search.toLowerCase())));

      const matchesStatus = !filters.status || task.status === filters.status;
      const matchesPriority = !filters.priority || task.priority === Number(filters.priority);
      const matchesType = !filters.type || task.signifier === filters.type;
      const matchesTags = !filters.tags?.length ||
        (task.tags && filters.tags.every(tag => task.tags.includes(tag)));

      return matchesSearch && matchesStatus && matchesPriority && matchesType && matchesTags;
    }

    // If no filters are set, return all tasks
    return true;
  });

  // Get unique tags and types from tasks
  const { uniqueTags, uniqueTypes } = useMemo(() => {
    const tags = new Set();
    const types = new Set();
    taskArray.forEach(task => {
      if (task.tags) {
        task.tags.forEach(tag => tags.add(tag));
      }
      if (task.signifier) {
        types.add(task.signifier);
      }
    });
    return {
      uniqueTags: Array.from(tags).sort(),
      uniqueTypes: Array.from(types).sort()
    };
  }, [taskArray]);

  // Helper to get local date string
  const getLocalDate = (dateString) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return getLocalDate(new Date().toISOString()); // fallback to today if invalid
      }
      // Use UTC accessors since calendar dates are stored as UTC midnight
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    } catch (error) {
      console.warn('Invalid date:', dateString);
      return getLocalDate(new Date().toISOString()); // fallback to today if error
    }
  };

  // Group tasks by date for weekly view
  const groupWeeklyTasks = (tasks) => {
    return tasks.reduce((acc, task) => {
      try {
        // Use due date if it exists, otherwise creation date
        let dateToUse = task.dueDate ? getLocalDate(task.dueDate) : getLocalDate(task.createdAt);

        // Fallback to today if needed
        if (!dateToUse) {
          console.warn('No valid date found for task:', task);
          dateToUse = getLocalDate(new Date());
        }

        if (!acc[dateToUse]) {
          acc[dateToUse] = [];
        }
        acc[dateToUse].push(task);
        return acc;
      } catch (error) {
        console.error('Error processing task:', task, error);
        return acc;
      }
    }, {});
  };

  // Group tasks by date (for non-daily views)
  const groupTasksByDate = (tasks) => {
    if (viewType === 'weekly') {
      return groupWeeklyTasks(tasks);
    }

    return tasks.reduce((acc, task) => {
      try {
        // Use due date if it exists, otherwise creation date
        let dateToUse = task.dueDate ? getLocalDate(task.dueDate) : getLocalDate(task.createdAt);

        // Fallback to today if needed
        if (!dateToUse) {
          console.warn('No valid date found for task:', task);
          dateToUse = getLocalDate(new Date());
        }

        if (!acc[dateToUse]) {
          acc[dateToUse] = [];
        }
        acc[dateToUse].push(task);
        return acc;
      } catch (error) {
        console.error('Error processing task:', task, error);
        return acc;
      }
    }, {});
  };

  // Sort tasks: pending first (scheduled, then unscheduled), completed at the bottom; within each, sort by priority (high to low), then by creation date (newest first)
  const sortTasks = (tasks) => {
    return tasks.sort((a, b) => {
      // Completed tasks always at the bottom
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;

      // Scheduled tasks (with dueDate) at top
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;

      // Within each group, sort by priority (high to low)
      if ((b.priority || 0) !== (a.priority || 0)) {
        return (b.priority || 0) - (a.priority || 0);
      }

      // Then by creation date (newest first)
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  };

  const baselineTasks = viewType === 'daily' ? [...filteredTasks] : sortTasks([...filteredTasks]);

  // Local order for optimistic UI reordering (daily only)
  const [localOrder, setLocalOrder] = useState([]);

  useEffect(() => {
    // Reset local order when source tasks change
    setLocalOrder(baselineTasks.map(t => t._id));
  }, [baselineTasks.map(t => t._id).join('|')]);

  const displayTasks = useMemo(() => {
    if (viewType !== 'daily' || !localOrder.length) return baselineTasks;
    const idToTask = new Map(baselineTasks.map(t => [String(t._id), t]));
    const inOrder = localOrder.filter(id => idToTask.has(String(id))).map(id => idToTask.get(String(id)));
    const remaining = baselineTasks.filter(t => !localOrder.includes(t._id));
    return [...inOrder, ...remaining];
  }, [viewType, localOrder, baselineTasks]);

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await updateTaskStatus(taskId, newStatus);
    } catch (error) {
      console.error('Error updating task status:', error);
    }
  };

  // DnD state/handlers (HTML5 drag-and-drop)
  const dragItemIdRef = useRef(null);

  const handleDragStart = (e, taskId) => {
    dragItemIdRef.current = taskId;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (e, dropTargetId) => {
    e.preventDefault();
    const draggedId = dragItemIdRef.current;
    if (!draggedId || draggedId === dropTargetId) return;

    const current = [...baselineTasks];
    const fromIndex = current.findIndex(t => t._id === draggedId);
    const toIndex = current.findIndex(t => t._id === dropTargetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const updated = [...current];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);

    // Persist order for daily only
    try {
      const dateKey = toLocalDateString(currentDate || new Date());
      setLocalOrder(updated.map(t => t._id));
      await saveDailyOrder(dateKey, updated.map(t => t._id));
    } catch (err) {
      console.error('Failed to save order', err);
    }
  };

  const handleDelete = async (taskId) => {
    try {
      await deleteTask(taskId);
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const handleMigrateToFuture = async (taskId, date) => {
    try {
      await migrateTask(taskId, date);
      setMigrationDialogOpen(false);
      setSelectedTask(null);
      setFutureDate(null);
    } catch (error) {
      console.error('Error migrating task:', error);
    }
  };

  const handleTaskClick = (task) => {
    setEditedTask(task);
    setEditDialogOpen(true);
  };

  const renderTask = (task) => {
    // Helper to format due date/time
    const formatDueDate = (dueDate) => {
      if (!dueDate) return null;
      const dateObj = new Date(dueDate);
      // Show time if not midnight, otherwise just date
      if (dateObj.getHours() !== 0 || dateObj.getMinutes() !== 0) {
        return `Scheduled: ${format(dateObj, 'EEEE, MMMM d, yyyy, h:mm a')}`;
      }
      return `Scheduled: ${format(dateObj, 'EEEE, MMMM d, yyyy')}`;
    };

    // Priority color
    const priorityColor =
      task.priority === 1 ? 'error.main' :
      task.priority === 2 ? 'warning.main' :
      task.priority === 3 ? 'info.main' : 'grey.300';

    // Completed color
    const completedColor = 'success.main';

    // Double border for completed + priority
    const isCompleted = task.status === 'completed';
    const hasPriority = !!task.priority;

    // Determine if task is carried over (pending, unscheduled, created before today)
    let isCarriedOver = false;
    let isOverdue = false;
    if (!task.dueDate && task.status === 'pending') {
      const created = new Date(task.createdAt);
      const now = new Date();
      // Set both to local midnight for comparison
      created.setHours(0, 0, 0, 0);
      now.setHours(0, 0, 0, 0);
      if (created < now) {
        isCarriedOver = true;
        // Check if carried over more than 7 days
        const msInDay = 24 * 60 * 60 * 1000;
        const daysCarried = Math.floor((now - created) / msInDay);
        if (daysCarried > 7) {
          isOverdue = true;
        }
      }
    }

    return (
      <Box
        sx={isCompleted && hasPriority ? {
          borderLeft: '6px solid',
          borderColor: completedColor,
          pl: 0,
          ml: 0,
          // To visually separate the double border
          position: 'relative',
        } : {}}
        key={task._id}
      >
        <ListItem
          onClick={() => handleTaskClick(task)}
          sx={{
            borderLeft: '4px solid',
            borderColor: priorityColor,
            mb: 1,
            bgcolor: 'background.paper',
            borderRadius: 1,
            cursor: 'pointer',
            position: 'relative',
            '&:hover': {
              bgcolor: 'action.hover'
            }
          }}
        >
          {/* Right edge bar for completion/carry-over status */}
          {isCompleted && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: 0,
                width: '6px',
                borderRadius: '0 4px 4px 0',
                bgcolor: 'success.main',
                zIndex: 2
              }}
            />
          )}
          {isCarriedOver && !isCompleted && !isOverdue && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: 0,
                width: '6px',
                borderRadius: '0 4px 4px 0',
                bgcolor: 'warning.main',
                zIndex: 2
              }}
            />
          )}
          {isCarriedOver && !isCompleted && isOverdue && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: 0,
                width: '6px',
                borderRadius: '0 4px 4px 0',
                bgcolor: 'error.main',
                zIndex: 2
              }}
            />
          )}
          <ListItemText
            primary={
              <Box component="span" sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography
                  component="span"
                  sx={{
                    fontFamily: 'monospace',
                    mr: 1,
                    color: 'text.secondary',
                    fontSize: '1.1rem'
                  }}
                >
                  {task.signifier || '*'}
                </Typography>
                {task.content}
              </Box>
            }
            secondary={
              <Box component="span" sx={{ display: 'flex', flexDirection: 'column' }}>
                {task.dueDate && (
                  <Typography variant="caption" color="text.secondary">
                    {formatDueDate(task.dueDate)}
                  </Typography>
                )}
                {task.tags && task.tags.length > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    Tags: {task.tags.join(', ')}
                  </Typography>
                )}
              </Box>
            }
          />
          <ListItemSecondaryAction sx={{ mt: { xs: 2.5, sm: 1 } }}>
            <IconButton
              edge="end"
              onClick={(e) => {
                e.stopPropagation();
                handleMigrateToFuture(task._id, futureDate);
              }}
              sx={{ mr: 1 }}
              title="Schedule Task"
            >
              <ArrowForwardIcon />
            </IconButton>
            <IconButton
              edge="end"
              onClick={(e) => {
                e.stopPropagation();
                handleStatusChange(task._id, task.status === 'completed' ? 'pending' : 'completed');
              }}
              sx={{ mr: 1 }}
              title={task.status === 'completed' ? 'Mark as Pending' : 'Mark as Completed'}
            >
              <CheckIcon color={task.status === 'completed' ? 'success' : 'action'} />
            </IconButton>
            <IconButton
              edge="end"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(task._id);
              }}
              title="Delete Task"
            >
              <DeleteIcon />
            </IconButton>
          </ListItemSecondaryAction>
        </ListItem>
      </Box>
    );
  };

  if (viewType === 'daily') {
    return (
      <Box>
        <List>
          {displayTasks.map(task => (
            <div
              key={task._id}
              draggable
              onDragStart={(e) => handleDragStart(e, task._id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, task._id)}
            >
              {renderTask(task)}
            </div>
          ))}
        </List>
        {taskArray.length === 0 && (
          <Typography
            variant="body1"
            color="text.secondary"
            align="center"
            py={{ xs: 1, sm: 3 }}
          >
            No tasks found
          </Typography>
        )}
        {/* Future Date Dialog */}
        <Dialog open={migrationDialogOpen} onClose={() => setMigrationDialogOpen(false)}>
          <DialogTitle>Select Date</DialogTitle>
          <DialogContent>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DateTimePicker
                label="Date and Time"
                value={futureDate}
                onChange={(newDate) => setFutureDate(newDate)}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    margin: 'normal'
                  }
                }}
              />
            </LocalizationProvider>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setMigrationDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => handleMigrateToFuture(selectedTask, futureDate)} color="primary" disabled={!futureDate}>
              Confirm
            </Button>
          </DialogActions>
        </Dialog>
        {/* Edit Task Dialog */}
        <TaskEditor
          open={editDialogOpen}
          onClose={() => {
            setEditDialogOpen(false);
            setEditedTask(null);
          }}
          task={editedTask}
        />
      </Box>
    );
  } else {
    // Group and sort tasks by date
    const tasksByDate = groupTasksByDate(filteredTasks);
    const sortedDates = Object.keys(tasksByDate)
      .filter(date => {
        try {
          // Validate each date before sorting
          const testDate = new Date(date + 'T00:00:00');
          return !isNaN(testDate.getTime());
        } catch (error) {
          console.warn('Invalid date in sorting:', date);
          return false;
        }
      })
      .sort((a, b) => {
        try {
          return new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00');
        } catch (error) {
          console.warn('Error sorting dates:', a, b);
          return 0;
        }
      });

    Object.keys(tasksByDate).forEach(date => {
      try {
        tasksByDate[date] = sortTasks(tasksByDate[date]);
      } catch (error) {
        console.warn('Error sorting tasks for date:', date, error);
        tasksByDate[date] = tasksByDate[date] || [];
      }
    });

    return (
      <Box>
        {sortedDates.map((date) => (
          <Box key={date} mb={{ xs: 1, sm: 3 }}>
            <Typography
              variant="subtitle1"
              sx={{
                px: 2,
                py: { xs: 0.5, sm: 1 },
                bgcolor: 'background.paper',
                borderBottom: '1px solid',
                borderColor: 'divider',
                position: 'sticky',
                top: 0,
                zIndex: 1
              }}
            >
              {(() => {
                try {
                  return format(new Date(date + 'T00:00:00'), 'EEEE, MMMM d, yyyy');
                } catch (error) {
                  console.warn('Error formatting date:', date);
                  return 'Invalid Date';
                }
              })()}
            </Typography>
            <List>
              {tasksByDate[date].map(renderTask)}
            </List>
          </Box>
        ))}
        {filteredTasks.length === 0 && (
          <Typography
            variant="body1"
            color="text.secondary"
            align="center"
            py={{ xs: 1, sm: 3 }}
          >
            No tasks found
          </Typography>
        )}
        {/* Future Date Dialog */}
        <Dialog open={migrationDialogOpen} onClose={() => setMigrationDialogOpen(false)}>
          <DialogTitle>Select Date</DialogTitle>
          <DialogContent>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DateTimePicker
                label="Date and Time"
                value={futureDate}
                onChange={(newDate) => setFutureDate(newDate)}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    margin: 'normal'
                  }
                }}
              />
            </LocalizationProvider>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setMigrationDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => handleMigrateToFuture(selectedTask, futureDate)} color="primary" disabled={!futureDate}>
              Confirm
            </Button>
          </DialogActions>
        </Dialog>
        {/* Edit Task Dialog */}
        <TaskEditor
          open={editDialogOpen}
          onClose={() => {
            setEditDialogOpen(false);
            setEditedTask(null);
          }}
          task={editedTask}
        />
      </Box>
    );
  }
};

export default TaskList;