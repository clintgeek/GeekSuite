import { useState } from 'react';
import { Box, Typography, Chip, IconButton, Tooltip, useTheme } from '@mui/material';
import { Pencil, Trash2 } from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import TaskCheckbox from './TaskCheckbox';
import { getTaskAge, getAgingColor, getAgingLabel } from '../../utils/taskAging';
import { colors } from '../../theme/colors';
import { SIGNIFIERS } from '../../utils/constants';

const priorityDotColors = {
  1: colors.priority.high,
  2: colors.priority.medium,
  3: colors.priority.low,
};

const TaskRow = ({ task, onStatusToggle, onEdit, onDelete }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [hovered, setHovered] = useState(false);
  const isCompleted = task.status === 'completed';
  const { level, days } = getTaskAge(task);
  const agingColor = isCompleted ? colors.ink[200] : getAgingColor(level);
  const agingLabel = getAgingLabel(days);

  const cleanContent = (content) => {
    if (!content) return '';
    return content
      .replace(/#\w+/g, '')
      .replace(/!(high|medium|low)/i, '')
      .trim();
  };

  const getDueBadge = () => {
    if (!task.dueDate) return null;
    const due = new Date(task.dueDate);
    const now = new Date();
    const diffMs = due.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let label;
    let badgeColor;

    if (diffDays < -1) {
      label = `${Math.abs(diffDays)} days overdue`;
      badgeColor = colors.aging.overdue;
    } else if (diffDays === -1) {
      label = 'yesterday';
      badgeColor = colors.aging.warning;
    } else if (diffDays === 0) {
      label = format(due, 'h:mm a');
      badgeColor = colors.aging.fresh;
    } else if (diffDays === 1) {
      label = 'tomorrow';
      badgeColor = colors.ink[500];
    } else {
      label = format(due, 'MMM d');
      badgeColor = colors.ink[400];
    }

    return { label, color: badgeColor };
  };

  const dueBadge = getDueBadge();

  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: { xs: 0.5, sm: 1 },
        py: { xs: 1.25, sm: 1 },
        px: { xs: 1, sm: 2 },
        borderLeft: `3px solid ${agingColor}`,
        backgroundColor: hovered ? (isDark ? 'rgba(255,255,255,0.04)' : `${colors.ink[100]}60`) : 'transparent',
        transition: 'background-color 0.12s ease',
        cursor: 'default',
        position: 'relative',
      }}
    >
      {/* Checkbox */}
      <TaskCheckbox
        checked={isCompleted}
        onChange={() => onStatusToggle?.(task)}
        color={colors.aging.fresh}
      />

      {/* Content area */}
      <Box sx={{ flex: 1, minWidth: 0, py: 0.75 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {/* Signifier badge */}
          {task.signifier && task.signifier !== '-' && (
            <Box
              sx={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '0.7rem',
                fontWeight: 500,
                backgroundColor: colors.ink[100],
                color: colors.ink[600],
                px: 0.75,
                py: 0.125,
                borderRadius: '4px',
                lineHeight: 1.4,
              }}
            >
              {task.signifier}
            </Box>
          )}

          {/* Task content */}
          <Typography
            sx={{
              fontSize: { xs: '0.9375rem', sm: '0.9375rem' },
              fontWeight: isCompleted ? 400 : 500,
              color: isCompleted ? theme.palette.text.disabled : theme.palette.text.primary,
              textDecoration: isCompleted ? 'line-through' : 'none',
              lineHeight: 1.5,
              flex: 1,
              minWidth: 0,
            }}
          >
            {cleanContent(task.content)}
          </Typography>

          {/* Due badge */}
          {dueBadge && !isCompleted && (
            <Typography
              sx={{
                fontSize: '0.7rem',
                fontWeight: 500,
                color: dueBadge.color,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {dueBadge.label}
            </Typography>
          )}

          {/* Priority dot */}
          {task.priority && !isCompleted && (
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: priorityDotColors[task.priority] || colors.ink[300],
                flexShrink: 0,
              }}
            />
          )}
        </Box>

        {/* Note */}
        {task.note && (
          <Typography
            sx={{
              fontSize: '0.8125rem',
              fontStyle: 'italic',
              color: theme.palette.text.secondary,
              mt: 0.25,
              lineHeight: 1.4,
            }}
          >
            {task.note}
          </Typography>
        )}

        {/* Tags */}
        {task.tags?.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
            {task.tags.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.6875rem',
                  fontWeight: 500,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.ink[100],
                  color: theme.palette.text.secondary,
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : colors.ink[200]}`,
                  '& .MuiChip-label': { px: 0.75 },
                }}
              />
            ))}
          </Box>
        )}

        {/* Aging label */}
        {agingLabel && !isCompleted && (
          <Typography
            sx={{
              fontSize: '0.6875rem',
              color: agingColor,
              mt: 0.25,
              fontWeight: 500,
            }}
          >
            {agingLabel}
          </Typography>
        )}
      </Box>

      {/* Hover actions (desktop) */}
      {hovered && (
        <Box
          sx={{
            display: { xs: 'none', sm: 'flex' },
            alignItems: 'center',
            gap: 0.25,
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        >
          {onEdit && (
            <Tooltip title="Edit" placement="top">
              <IconButton
                size="small"
                onClick={() => onEdit(task)}
                sx={{ color: colors.ink[400], '&:hover': { color: colors.primary[500] } }}
              >
                <Pencil size={16} />
              </IconButton>
            </Tooltip>
          )}
          {onDelete && (
            <Tooltip title="Delete" placement="top">
              <IconButton
                size="small"
                onClick={() => onDelete(task)}
                sx={{ color: colors.ink[400], '&:hover': { color: colors.aging.overdue } }}
              >
                <Trash2 size={16} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}
    </Box>
  );
};

export default TaskRow;
