import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Chip, IconButton, Tooltip, useTheme, useMediaQuery } from '@mui/material';
import { motion } from 'framer-motion';
import { Pencil, Trash2, StickyNote } from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';
import TaskCheckbox from './TaskCheckbox';
import { getTaskAge, getAgingColor, getAgingLabel } from '../../utils/taskAging';
import { colors } from '../../theme/colors';
import { SIGNIFIERS } from '../../utils/constants';

const priorityDotColors = {
  1: colors.priority.high,
  2: colors.priority.medium,
  3: colors.priority.low,
};

const TaskRow = ({ task, onStatusToggle, onEdit, onDelete, onSaveAsNote, focused = false }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [hovered, setHovered] = useState(false);
  const [tapped, setTapped] = useState(false);
  const isCompleted = task.status === 'completed';
  const { level, days } = getTaskAge(task);
  const agingColor = isCompleted ? colors.ink[200] : getAgingColor(level);
  const agingLabel = getAgingLabel(days);

  // On mobile, tap the row to toggle action buttons; tap again or tap elsewhere to dismiss.
  const handleRowClick = useCallback((e) => {
    if (!isMobile) return;
    // Don't toggle if the tap was on an interactive element (checkbox, button, chip)
    if (e.target.closest('button, input, [role="button"], .MuiChip-root')) return;
    setTapped((prev) => !prev);
  }, [isMobile]);

  const showActions = isMobile ? tapped : hovered;

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
    if (isNaN(due.getTime())) return null;
    const now = new Date();

    // Use differenceInCalendarDays to avoid Math.floor/negative rounding issues
    const diffDays = differenceInCalendarDays(due, now);

    let label;
    let badgeColor;

    if (diffDays < -1) {
      label = `${ Math.abs(diffDays) } days overdue`;
      badgeColor = colors.aging.overdue;
    } else if (diffDays === -1) {
      label = 'yesterday';
      badgeColor = colors.aging.warning;
    } else if (diffDays === 0) {
      // If it's today, show the time if it's significant (not midnight/9am default)
      const hours = due.getHours();
      const mins = due.getMinutes();
      if (hours === 0 && mins === 0) {
        label = 'today';
      } else {
        label = format(due, 'h:mm a');
      }
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

  const taskId = task.id || task._id;

  return (
    <Box
      data-task-id={taskId}
      onClick={handleRowClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: { xs: 0.5, sm: 1 },
        py: { xs: 1.25, sm: 1 },
        px: { xs: 1, sm: 2 },
        borderLeft: `3px solid ${ agingColor }`,
        backgroundColor: focused
          ? (isDark ? 'rgba(96, 152, 204, 0.1)' : `${colors.primary[50]}`)
          : (hovered || tapped) ? (isDark ? 'rgba(255,255,255,0.04)' : `${ colors.ink[100] }60`) : 'transparent',
        // Focused ring — visible, not competing with content
        outline: focused ? `2px solid ${colors.primary[400]}` : 'none',
        outlineOffset: -2,
        borderRadius: focused ? '6px' : 0,
        transition: 'background-color 0.12s ease, outline 0.12s ease',
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
                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.ink[100],
                color: isDark ? 'rgba(255,255,255,0.7)' : colors.ink[600],
                px: 0.75,
                py: 0.125,
                borderRadius: '4px',
                lineHeight: 1.4,
              }}
            >
              {task.signifier}
            </Box>
          )}

          {/* Task content — with animated strikethrough overlay */}
          <Box
            sx={{
              position: 'relative',
              flex: 1,
              minWidth: 0,
              display: 'inline-block',
            }}
          >
            <Typography
              sx={{
                fontSize: { xs: '0.9375rem', sm: '0.9375rem' },
                fontWeight: isCompleted ? 400 : 500,
                color: isCompleted ? theme.palette.text.disabled : theme.palette.text.primary,
                lineHeight: 1.5,
                transition: 'color 280ms ease, font-weight 280ms ease',
                display: 'inline',
              }}
            >
              {cleanContent(task.content)}
            </Typography>
            {/* Draw-in strikethrough — grows from 0 to full width when completed */}
            <motion.div
              initial={false}
              animate={{
                scaleX: isCompleted ? 1 : 0,
                opacity: isCompleted ? 0.65 : 0,
              }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: '50%',
                height: '1.5px',
                backgroundColor: theme.palette.text.disabled,
                pointerEvents: 'none',
                transformOrigin: 'left center',
                transform: 'translateY(-50%)',
              }}
              aria-hidden="true"
            />
          </Box>

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
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/tags?tag=${ encodeURIComponent(tag) }`);
                }}
                sx={{
                  height: 20,
                  fontSize: '0.6875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.ink[100],
                  color: theme.palette.text.secondary,
                  border: `1px solid ${ isDark ? 'rgba(255,255,255,0.12)' : colors.ink[200] }`,
                  '&:hover': {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : colors.ink[200],
                  },
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

      {/* Actions — hover on desktop, tap on mobile */}
      {showActions && (onEdit || onDelete || onSaveAsNote) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            // Desktop: absolute overlay
            ...(!isMobile && {
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
            }),
            // Mobile: inline, push in from the right
            ...(isMobile && {
              flexShrink: 0,
              alignSelf: 'center',
              ml: 0.5,
            }),
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
          {onSaveAsNote && (
            <Tooltip title="Save as Note" placement="top">
              <IconButton
                size="small"
                onClick={() => onSaveAsNote(task)}
                sx={{ color: colors.ink[400], '&:hover': { color: colors.primary[500] } }}
              >
                <StickyNote size={16} />
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
