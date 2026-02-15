import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import axios from 'axios';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

const API_URL = '/api';

const AUTH_CONFIG = { withCredentials: true };

// Error types for better error handling
const TaskError = {
  NETWORK: 'NETWORK_ERROR',
  AUTH: 'AUTH_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
  SERVER: 'SERVER_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR'
};

// Loading states for different operations
export const LoadingState = {
  IDLE: 'idle',
  FETCHING: 'fetching',
  CREATING: 'creating',
  UPDATING: 'updating',
  DELETING: 'deleting',
  MIGRATING: 'migrating',
  ERROR: 'error'
};

const TaskContext = createContext();

export const useTaskContext = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTaskContext must be used within a TaskProvider');
  }
  return context;
};

const TaskProvider = ({ children }) => {
  // Main state
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState('IDLE');
  const [error, setError] = useState(null);
  const fetchTimeoutRef = useRef(null);
  const lastFetchRef = useRef(null);
  const [currentView, setCurrentView] = useState('daily');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Filter state
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    priority: '',
    signifier: '',
    tags: []
  });

  // Add this utility function near the top of the file, after imports
  const sortTasks = (tasks) => {
    if (!Array.isArray(tasks)) return tasks;

    return [...tasks].sort((a, b) => {
      // First sort by completion status (pending before completed)
      if (a.status !== b.status) {
        return a.status === 'completed' ? 1 : -1;
      }

      // Then sort by priority (high to none)
      const priorityA = a.priority || 999;
      const priorityB = b.priority || 999;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // Then sort by due date (past to future then none)
      const dateA = a.dueDate ? new Date(a.dueDate) : null;
      const dateB = b.dueDate ? new Date(b.dueDate) : null;

      // Handle cases where one or both dates are null
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;

      return dateA - dateB;
    });
  };

  // Helper function to handle API errors
  const handleApiError = useCallback((error) => {
    let errorType = TaskError.UNKNOWN;
    let errorMessage = 'An unexpected error occurred';

    if (error.response) {
      switch (error.response.status) {
        case 401:
          errorType = TaskError.AUTH;
          errorMessage = 'Authentication failed';
          break;
        case 400:
          errorType = TaskError.VALIDATION;
          errorMessage = error.response.data.message || 'Invalid request';
          break;
        case 500:
          errorType = TaskError.SERVER;
          errorMessage = 'Server error occurred';
          break;
        default:
          errorType = TaskError.SERVER;
          errorMessage = error.response.data.message || 'Server error occurred';
      }
    } else if (error.request) {
      errorType = TaskError.NETWORK;
      errorMessage = 'Network error occurred';
    }

    setError({ type: errorType, message: errorMessage });
    throw error;
  }, []);

  // Filter management
  const updateFilters = useCallback((newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      search: '',
      status: '',
      priority: '',
      signifier: '',
      tags: []
    });
  }, []);

  // Task fetching with debouncing and cache
  // NOTE: Backend does not implement /tasks/range; use /tasks with startDate/endDate query params.
  const fetchTasksForDateRange = useCallback(async (startDate, endDate, fetchKey) => {
    // Generate fetch key if not provided
    const key = fetchKey || `${startDate.toISOString()}-${endDate.toISOString()}`;

    // Skip if already fetching this range
    if (loading === LoadingState.FETCHING && lastFetchRef.current === key) {
      return;
    }

    try {
      setLoading(LoadingState.FETCHING);
      setError(null);
      lastFetchRef.current = key;

      // Format dates as YYYY-MM-DD
      const formattedStartDate = format(startDate, 'yyyy-MM-dd');
      const formattedEndDate = format(endDate, 'yyyy-MM-dd');

      const response = await axios.get(`${API_URL}/tasks`, {
        params: {
          viewType: 'all',
          startDate: formattedStartDate,
          endDate: formattedEndDate
        },
        ...AUTH_CONFIG
      });

      const newTasks = response.data;
      setTasks(prevTasks => {
        if (JSON.stringify(prevTasks) !== JSON.stringify(newTasks)) {
          return newTasks;
        }
        return prevTasks;
      });

      setLoading(LoadingState.IDLE);
      setError(null);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      handleApiError(error);
    }
  }, [handleApiError, loading]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, []);

  // Task fetching
  const fetchTasks = useCallback(async (viewType, date) => {
    setLoading(LoadingState.FETCHING);
    setError(null);
    try {
      let endpoint = '/tasks';
      let params = {};

      switch (viewType) {
        case 'daily':
          endpoint = '/tasks/daily';
          params = { date: format(date || new Date(), 'yyyy-MM-dd') };
          break;
        case 'weekly':
          const startDate = startOfWeek(date || new Date());
          const endDate = endOfWeek(date || new Date());
          endpoint = '/tasks/weekly';
          params = {
            startDate: format(startDate, 'yyyy-MM-dd'),
            endDate: format(endDate, 'yyyy-MM-dd')
          };
          break;
        case 'monthly':
          const monthStart = startOfMonth(date || new Date());
          const monthEnd = endOfMonth(date || new Date());
          endpoint = '/tasks/monthly';
          params = {
            startDate: format(monthStart, 'yyyy-MM-dd'),
            endDate: format(monthEnd, 'yyyy-MM-dd')
          };
          break;
        case 'year':
          endpoint = '/tasks/yearly';
          params = { year: (date || new Date()).getFullYear() };
          break;
        default:
          endpoint = '/tasks';
          params = { viewType, date: date ? format(date, 'yyyy-MM-dd') : undefined };
      }

      const response = await axios.get(`${API_URL}${endpoint}`, {
        params,
        ...AUTH_CONFIG
      });
      setTasks(response.data);
      setCurrentView(viewType);
      setCurrentDate(date || new Date());
      setLoading(LoadingState.IDLE);
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError(err.response?.data?.message || 'Failed to fetch tasks');
      setLoading(LoadingState.IDLE);
    }
  }, []);

  const fetchAllTasks = useCallback(async () => {
    // Skip if already fetching
    if (loading === LoadingState.FETCHING) {
      return;
    }

    // Generate a unique request ID
    const requestId = Date.now();
    lastFetchRef.current = requestId;

    try {
      setLoading(LoadingState.FETCHING);
      setError(null);

      const response = await axios.get(`${API_URL}/tasks/all`, {
        ...AUTH_CONFIG
      });

      // Check if this is still the most recent request
      if (lastFetchRef.current !== requestId) {
        return;
      }

      const newTasks = response.data;

      // Only update state if the data has actually changed
      setTasks(prevTasks => {
        const prevString = JSON.stringify(prevTasks);
        const newString = JSON.stringify(newTasks);
        if (prevString !== newString) {
          return newTasks;
        }
        return prevTasks;
      });

      setLoading(LoadingState.IDLE);
      setError(null);
    } catch (error) {
      // Only set error if this is still the most recent request
      if (lastFetchRef.current === requestId) {
        console.error('Error fetching all tasks:', error);
        handleApiError(error);
      }
    }
  }, [handleApiError]);

  // Remove the effect that watches filters for 'all' view
  // Instead, add a debounced filter effect
  const debouncedFetchRef = useRef(null);

  useEffect(() => {
    // Only run this effect if we're in the 'all' view
    const path = window.location.pathname;
    const view = path.split('/')[2] || 'daily';

    if (view === 'all' && loading === LoadingState.IDLE) {
      // Clear any existing timeout
      if (debouncedFetchRef.current) {
        clearTimeout(debouncedFetchRef.current);
      }

      // Set a new timeout
      debouncedFetchRef.current = setTimeout(() => {
        fetchAllTasks();
      }, 300); // Debounce for 300ms
    }

    // Cleanup
    return () => {
      if (debouncedFetchRef.current) {
        clearTimeout(debouncedFetchRef.current);
      }
    };
  }, [filters, fetchAllTasks]); // Remove loading from dependencies

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      if (debouncedFetchRef.current) {
        clearTimeout(debouncedFetchRef.current);
      }
    };
  }, []);

  // Task operations
  const createTask = useCallback(async (taskData) => {
    console.log('Creating task with data:', taskData);
    setLoading('CREATING');
    setError(null);
    try {
      const response = await axios.post(`${API_URL}/tasks`, taskData, {
        ...AUTH_CONFIG
      });
      console.log('Task created successfully:', response.data);
      setTasks(prevTasks => {
        const newTasks = Array.isArray(prevTasks) ? [...prevTasks, response.data] : [response.data];
        console.log('Updated tasks array:', newTasks);
        return newTasks;
      });
      return response.data;
    } catch (err) {
      console.error('Error creating task:', err);
      setError(err.response?.data?.message || 'Failed to create task');
      throw err;
    } finally {
      console.log('Setting loading to IDLE after task creation');
      setLoading('IDLE');
    }
  }, []);

  const updateTask = useCallback(async (taskId, updates) => {
    try {
      setLoading(LoadingState.UPDATING);
      const response = await axios.put(`${API_URL}/tasks/${taskId}`, updates, {
        ...AUTH_CONFIG
      });
      const updatedTask = response.data;

      setTasks(prevTasks => {
        // Handle array format (daily view)
        if (Array.isArray(prevTasks)) {
          return prevTasks
            .map(task => task._id === taskId ? updatedTask : task)
            .sort((a, b) => {
              const priorityOrder = { high: 0, medium: 1, low: 2, none: 3 };
              const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
              if (priorityDiff !== 0) return priorityDiff;

              const aDate = a.dueDate ? new Date(a.dueDate) : new Date(9999, 11, 31);
              const bDate = b.dueDate ? new Date(b.dueDate) : new Date(9999, 11, 31);
              return aDate - bDate;
            });
        }

        // Handle object format (all/other views)
        const oldDateKey = Object.keys(prevTasks).find(date =>
          prevTasks[date].some(task => task._id === taskId)
        );

        const newDateKey = updatedTask.dueDate ?
          new Date(updatedTask.dueDate).toISOString().split('T')[0] :
          'no-date';

        const newTasks = { ...prevTasks };

        // Remove from old date if it exists
        if (oldDateKey) {
          newTasks[oldDateKey] = newTasks[oldDateKey]
            .filter(task => task._id !== taskId)
            .sort((a, b) => {
              const priorityOrder = { high: 0, medium: 1, low: 2, none: 3 };
              const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
              if (priorityDiff !== 0) return priorityDiff;

              const aDate = a.dueDate ? new Date(a.dueDate) : new Date(9999, 11, 31);
              const bDate = b.dueDate ? new Date(b.dueDate) : new Date(9999, 11, 31);
              return aDate - bDate;
            });

          // Clean up empty dates
          if (newTasks[oldDateKey].length === 0) {
            delete newTasks[oldDateKey];
          }
        }

        // Add to new date
        newTasks[newDateKey] = [
          ...(newTasks[newDateKey] || []),
          updatedTask
        ].sort((a, b) => {
          const priorityOrder = { high: 0, medium: 1, low: 2, none: 3 };
          const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
          if (priorityDiff !== 0) return priorityDiff;

          const aDate = a.dueDate ? new Date(a.dueDate) : new Date(9999, 11, 31);
          const bDate = b.dueDate ? new Date(b.dueDate) : new Date(9999, 11, 31);
          return aDate - bDate;
        });

        return newTasks;
      });

      setLoading(LoadingState.IDLE);
      return updatedTask;
    } catch (err) {
      console.error('Error updating task:', err);
      setError(err.response?.data?.message || 'Failed to update task');
      setLoading(LoadingState.ERROR);
      throw err;
    }
  }, []);

  // Add updateTaskStatus function
  const updateTaskStatus = useCallback(async (taskId, newStatus) => {
    try {
      setLoading(LoadingState.UPDATING);
      setError(null);
      const response = await axios.put(`${API_URL}/tasks/${taskId}`, { status: newStatus }, {
        ...AUTH_CONFIG
      });

      setTasks(prev => {
        // If prev is an array (daily, weekly views)
        if (Array.isArray(prev)) {
          return sortTasks(prev.map(task =>
            task._id === taskId ? response.data : task
          ));
        }

        // If prev is an object (all, monthly views)
        const newTasks = { ...prev };
        Object.entries(newTasks).forEach(([date, tasks]) => {
          if (Array.isArray(tasks)) {
            newTasks[date] = sortTasks(tasks.map(task =>
              task._id === taskId ? response.data : task
            ));
          }
        });
        return newTasks;
      });

      return response.data;
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoading(LoadingState.IDLE);
    }
  }, [handleApiError, sortTasks]);

  const deleteTask = useCallback(async (taskId) => {
    try {
      setLoading(LoadingState.DELETING);
      setError(null);
      await axios.delete(`${API_URL}/tasks/${taskId}`, {
        ...AUTH_CONFIG
      });

      setTasks(prev => {
        // If prev is an array (daily view)
        if (Array.isArray(prev)) {
          return prev.filter(task => task._id !== taskId);
        }

        // If prev is an object (grouped by dates)
        const newTasks = {};
        Object.entries(prev).forEach(([date, dateTasks]) => {
          if (!Array.isArray(dateTasks)) return;
          const filteredTasks = dateTasks.filter(task => task._id !== taskId);
          if (filteredTasks.length > 0) {
            newTasks[date] = filteredTasks;
          }
        });
        return newTasks;
      });
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoading(LoadingState.IDLE);
    }
  }, [handleApiError]);

  // Migration operations
  const migrateTask = useCallback(async (taskId, targetDate) => {
    try {
      setLoading(LoadingState.MIGRATING);
      setError(null);
      const response = await axios.post(
        `${API_URL}/tasks/${taskId}/migrate-future`,
        { futureDate: targetDate.toISOString() },
        { ...AUTH_CONFIG }
      );

      setTasks(prev => {
        const newTasks = {};
        Object.entries(prev).forEach(([date, tasks]) => {
          const filteredTasks = tasks.filter(task => task._id !== taskId);
          if (filteredTasks.length > 0) {
            newTasks[date] = filteredTasks;
          }
        });

        const newDate = format(new Date(targetDate), 'yyyy-MM-dd');
        if (!newTasks[newDate]) {
          newTasks[newDate] = [];
        }
        newTasks[newDate].push(response.data);

        return newTasks;
      });

      return response.data;
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoading(LoadingState.IDLE);
    }
  }, [handleApiError]);

  const value = useMemo(() => ({
    // State
    tasks,
    loading,
    error,
    filters,
    currentView,
    currentDate,

    // Filter management
    updateFilters,
    clearFilters,

    // Task operations
    fetchTasks,
    fetchAllTasks,
    createTask,
    updateTask,
    updateTaskStatus,
    deleteTask,
    migrateTask,
    saveDailyOrder: async (dateKey, orderedTaskIds) => {
      try {
        await axios.post(`${API_URL}/tasks/daily/order`, { dateKey, orderedTaskIds }, {
          ...AUTH_CONFIG
        });
      } catch (error) {
        handleApiError(error);
      }
    },

    // Constants
    TaskError,
    LoadingState
  }), [
    tasks,
    loading,
    error,
    filters,
    currentView,
    currentDate,
    updateFilters,
    clearFilters,
    fetchTasks,
    fetchAllTasks,
    createTask,
    updateTask,
    updateTaskStatus,
    deleteTask,
    migrateTask
  ]);

  return (
    <TaskContext.Provider value={value}>
      {children}
    </TaskContext.Provider>
  );
};

export { TaskProvider };