import { useState, useEffect, useMemo } from 'react';
import { Box, Typography, IconButton, Button } from '@mui/material';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths,
  isSameDay,
} from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useTaskContext } from '../../context/TaskContext';
import { normalizeTasks } from '../../utils/normalizeTasks';
import { colors } from '../../theme/colors';
import { getTaskAge, getAgingColor } from '../../utils/taskAging';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MonthlyCalendar = () => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const { tasks, loading, fetchTasks, LoadingState } = useTaskContext();
  const navigate = useNavigate();

  useEffect(() => {
    fetchTasks('monthly', currentMonth);
  }, [currentMonth, fetchTasks]);

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const handleThisMonth = () => setCurrentMonth(new Date());

  const isCurrentMonth = isSameMonth(currentMonth, new Date());

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  // Group tasks by date with dot info
  const taskDots = useMemo(() => {
    const dots = {};
    const taskArray = normalizeTasks(tasks);
    taskArray.forEach((task) => {
      if (!task.dueDate) return;
      const key = format(new Date(task.dueDate), 'yyyy-MM-dd');
      if (!dots[key]) dots[key] = [];
      const { level } = getTaskAge(task);
      const dotColor = task.status === 'completed' ? colors.aging.fresh : getAgingColor(level);
      dots[key].push(dotColor);
    });
    return dots;
  }, [tasks]);

  const handleDayClick = (day) => {
    // Navigate to today view with that date
    // For now, just navigate to /today — the date param would need state or URL param
    navigate('/today');
  };

  return (
    <Box>
      {/* Month navigation */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h3" sx={{ color: colors.ink[900] }}>
          {format(currentMonth, 'MMMM yyyy')}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton size="small" onClick={handlePrevMonth} sx={{ color: colors.ink[400] }}>
            <ChevronLeft size={20} />
          </IconButton>
          {!isCurrentMonth && (
            <Button
              size="small"
              onClick={handleThisMonth}
              variant="outlined"
              sx={{
                fontSize: '0.7rem', py: 0.25, px: 1, minWidth: 'auto',
                color: colors.primary[500], borderColor: colors.primary[200],
                '&:hover': { borderColor: colors.primary[500], backgroundColor: colors.primary[50], transform: 'none' },
              }}
            >
              This Month
            </Button>
          )}
          <IconButton size="small" onClick={handleNextMonth} sx={{ color: colors.ink[400] }}>
            <ChevronRight size={20} />
          </IconButton>
        </Box>
      </Box>

      {/* Weekday headers */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 0.5,
          mb: 0.5,
        }}
      >
        {WEEKDAYS.map((day) => (
          <Box key={day} sx={{ textAlign: 'center', py: 0.5 }}>
            <Typography
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                color: colors.ink[400],
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {day}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Calendar grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 0.5,
        }}
      >
        {calendarDays.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const dots = taskDots[key] || [];
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);

          return (
            <Box
              key={key}
              onClick={() => handleDayClick(day)}
              sx={{
                aspectRatio: '1',
                minHeight: { xs: 44, sm: 64 },
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                border: today ? `2px solid ${colors.primary[400]}` : `1px solid ${inMonth ? colors.ink[100] : 'transparent'}`,
                backgroundColor: today ? `${colors.primary[50]}80` : inMonth ? colors.parchment.paper : 'transparent',
                cursor: inMonth ? 'pointer' : 'default',
                transition: 'background-color 0.12s ease',
                '&:hover': inMonth ? {
                  backgroundColor: today ? colors.primary[50] : colors.ink[50],
                } : {},
              }}
            >
              <Typography
                sx={{
                  fontSize: { xs: '0.8125rem', sm: '0.875rem' },
                  fontWeight: today ? 700 : inMonth ? 500 : 400,
                  color: today ? colors.primary[600] : inMonth ? colors.ink[800] : colors.ink[300],
                  lineHeight: 1,
                }}
              >
                {format(day, 'd')}
              </Typography>

              {/* Task dots */}
              {dots.length > 0 && (
                <Box sx={{ display: 'flex', gap: 0.375, mt: 0.5 }}>
                  {dots.slice(0, 4).map((dotColor, i) => (
                    <Box
                      key={i}
                      sx={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        backgroundColor: dotColor,
                      }}
                    />
                  ))}
                  {dots.length > 4 && (
                    <Typography sx={{ fontSize: '0.5rem', color: colors.ink[400], lineHeight: 1 }}>
                      +{dots.length - 4}
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default MonthlyCalendar;
