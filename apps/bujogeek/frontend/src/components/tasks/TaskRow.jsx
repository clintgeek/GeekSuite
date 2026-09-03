import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Chip, IconButton, Tooltip, useTheme, useMediaQuery } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, Trash2, StickyNote, Repeat, Ban, RotateCcw, PauseCircle, Play } from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';
import TaskCheckbox from './TaskCheckbox';
import { getTaskAge, getAgingColor, getAgingLabel } from '../../utils/taskAging';
import { toneForMode } from '@geeksuite/ui';
import { colors } from '../../theme/colors';

const priorityDotColors = {
  1: colors.priority.high,
  2: colors.priority.medium,
  3: colors.priority.low,
};

// Aging left-border gets a two-tone treatment:
// — a muted fill-color for the background tint
// — the solid accent for the left border
const getAgingTint = (agingColor, isDark) => {
  if (!agingColor || agingColor === colors.ink[200]) return 'transparent';
  return isDark ? `${agingColor}10` : `${agingColor}08`;
};

const TaskRow = ({
  task,
  onStatusToggle,
  onEdit,
  onDelete,
  onSaveAsNote,
  onCancel,
  onBlock,
  onUnblock,
  focused = false,
}) => {
  const theme     = useTheme();
  const navigate  = useNavigate();
  const isDark    = theme.palette.mode === 'dark';
  // Plum reads ~2.5:1 on dark paper; lift it when used as text/icon color.
  // Light mode keeps the authored hue, hence `darkenBy: 0`.
  const staleInk  = toneForMode(colors.aging.stale, theme, { darkenBy: 0 });
  const isMobile  = useMediaQuery(theme.breakpoints.down('sm'));
  const [hovered, setHovered] = useState(false);
  const [tapped,  setTapped]  = useState(false);

  const isCompleted = task.status === 'completed';
  const isCancelled = task.status === 'cancelled';
  const isBlocked   = task.status === 'blocked';
  const isSunk       = isCompleted || isCancelled;
  const { level, days } = getTaskAge(task);
  // A parked task keeps its due date but has left the log, so the aging
  // signals (overdue border, "3 days ago" label, due badge) would be lying:
  // it is not late, it is waiting. Muted ink, plum "Blocked" chip instead.
  const parkedSince = isBlocked && task.blockedAt ? new Date(task.blockedAt) : null;
  const parkedDays = parkedSince && !isNaN(parkedSince.getTime())
    ? Math.max(0, differenceInCalendarDays(new Date(), parkedSince))
    : null;
  const parkedLabel = parkedDays === null
    ? null
    : parkedDays === 0
    ? 'parked today'
    : `parked ${parkedDays} ${parkedDays === 1 ? 'day' : 'days'}`;
  // Cancelled gets its own muted tone (plum, from the aging palette's "stale"
  // slot) rather than sharing completed's neutral ink — a struck-as-irrelevant
  // task should read distinctly from a finished one.
  const agingColor  = isCancelled
    ? (isDark ? colors.aging.stale : `${colors.aging.stale}cc`)
    : (isCompleted || isBlocked)
    ? (isDark ? colors.dark[500] : colors.ink[200])
    : getAgingColor(level);
  const agingLabel  = getAgingLabel(days);
  const agingTint   = (isSunk || isBlocked) ? 'transparent' : getAgingTint(agingColor, isDark);

  // Mobile: tap the row to reveal action buttons
  const handleRowClick = useCallback((e) => {
    if (!isMobile) return;
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
    const now      = new Date();
    const diffDays = differenceInCalendarDays(due, now);

    let label, badgeColor;

    if (diffDays < -1) {
      label      = `${Math.abs(diffDays)}d overdue`;
      badgeColor = colors.aging.overdue;
    } else if (diffDays === -1) {
      label      = 'yesterday';
      badgeColor = colors.aging.warning;
    } else if (diffDays === 0) {
      const hours = due.getHours();
      const mins  = due.getMinutes();
      label      = (hours === 0 && mins === 0) ? 'today' : format(due, 'h:mm a');
      badgeColor = colors.aging.fresh;
    } else if (diffDays === 1) {
      label      = 'tomorrow';
      badgeColor = isDark ? colors.dark[700] : colors.ink[500];
    } else {
      label      = format(due, 'MMM d');
      badgeColor = isDark ? colors.dark[700] : colors.ink[400];
    }

    return { label, color: badgeColor };
  };

  const dueBadge = getDueBadge();
  const taskId   = task.id || task._id;

  // Focus state background
  const focusBg = isDark
    ? `${colors.primary[900]}50`
    : `${colors.primary[50]}`;

  // Hover background — warmer than default
  const hoverBg = isDark
    ? 'rgba(255, 245, 220, 0.03)'
    : `${colors.ink[100]}50`;

  return (
    <Box
      data-task-id={taskId}
      onClick={handleRowClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        display:         'flex',
        alignItems:      'flex-start',
        gap:             { xs: 0.5, sm: 0.75 },
        py:              { xs: 1.125, sm: 0.875 },
        px:              { xs: 1.25, sm: 1.75 },
        borderLeft:      `2.5px solid ${agingColor}`,
        backgroundColor: focused
          ? focusBg
          : (hovered || tapped) ? hoverBg : agingTint,
        // Focus ring — precise, inset
        outline:         focused ? `1.5px solid ${colors.primary[400]}50` : 'none',
        outlineOffset:   -1,
        borderRadius:    focused ? '5px' : 0,
        transition:      'background-color 0.12s ease, outline 0.1s ease',
        cursor:          'default',
        position:        'relative',
      }}
    >
      {/* Checkbox */}
      <Box sx={{ pt: '2px', flexShrink: 0 }}>
        <TaskCheckbox
          checked={isCompleted}
          onChange={() => onStatusToggle?.(task)}
          color={agingColor}
        />
      </Box>

      {/* ─── Content area ─────────────────────────────────────── */}
      <Box sx={{ flex: 1, minWidth: 0, py: 0.5 }}>

        {/* Primary line: signifier + text + inline badges */}
        <Box
          sx={{
            display:    'flex',
            alignItems: 'center',
            gap:        0.625,
            flexWrap:   'wrap',
            minWidth:   0,
          }}
        >
          {/* Signifier badge */}
          {task.signifier && task.signifier !== '-' && (
            <Box
              sx={{
                fontFamily:      '"IBM Plex Mono", monospace',
                fontSize:        '0.625rem',
                fontWeight:      600,
                backgroundColor: isDark ? 'rgba(255,245,220,0.08)' : colors.ink[100],
                color:           isDark ? 'rgba(255,245,220,0.6)' : colors.ink[500],
                px:              0.625,
                py:              0.125,
                borderRadius:    '3px',
                lineHeight:      1.5,
                flexShrink:      0,
                border:          `1px solid ${isDark ? 'rgba(255,245,220,0.1)' : colors.ink[200]}`,
              }}
            >
              {task.signifier}
            </Box>
          )}

          {/* Task content — animated strikethrough on completion, dashed
              italic strike on cancellation (a distinct "struck as
              irrelevant" signifier, not just a duller version of done) */}
          <Box
            sx={{
              position:      'relative',
              flex:          1,
              minWidth:      0,
              display:       'inline-block',
            }}
          >
            <Typography
              sx={{
                fontSize:    { xs: '0.9375rem', sm: '0.9375rem' },
                fontWeight:  isSunk ? 400 : 500,
                fontStyle:   isCancelled ? 'italic' : 'normal',
                color:       isCancelled
                               ? (isDark ? `${colors.aging.stale}99` : `${colors.aging.stale}bb`)
                               : isCompleted
                               ? (isDark ? 'rgba(255,245,220,0.28)' : colors.ink[400])
                               : isBlocked
                               ? (isDark ? 'rgba(255,245,220,0.55)' : colors.ink[500])
                               : theme.palette.text.primary,
                lineHeight:  1.5,
                transition:  'color 260ms ease',
                display:     'inline',
                letterSpacing: '-0.005em',
                textDecoration:      isCancelled ? 'line-through' : 'none',
                textDecorationStyle: 'dashed',
                textDecorationColor: isDark ? 'rgba(122,68,98,0.65)' : `${colors.aging.stale}90`,
              }}
            >
              {cleanContent(task.content)}
            </Typography>
            {/* Draw-in strikethrough — grows from left on completion */}
            <motion.div
              initial={false}
              animate={{
                scaleX:  isCompleted ? 1 : 0,
                opacity: isCompleted ? 0.5 : 0,
              }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position:        'absolute',
                left:            0,
                right:           0,
                top:             '50%',
                height:          '1px',
                backgroundColor: isDark ? 'rgba(255,245,220,0.35)' : colors.ink[400],
                pointerEvents:   'none',
                transformOrigin: 'left center',
                transform:       'translateY(-50%)',
              }}
              aria-hidden="true"
            />
          </Box>

          {/* Cancelled signifier — small, quiet "voided" stamp */}
          {isCancelled && (
            <Tooltip title="Cancelled" placement="top">
              <Box
                component="span"
                sx={{
                  display:    'inline-flex',
                  alignItems: 'center',
                  flexShrink: 0,
                  color:      staleInk,
                  opacity:    0.7,
                }}
              >
                <Ban size={12} strokeWidth={1.75} />
              </Box>
            </Tooltip>
          )}

          {/* Blocked stamp — a parked task is waiting, not late */}
          {isBlocked && (
            <Tooltip title={task.blockedReason ? `Blocked — ${task.blockedReason}` : 'Blocked'} placement="top">
              <Box
                component="span"
                sx={{
                  display:         'inline-flex',
                  alignItems:      'center',
                  gap:             0.375,
                  flexShrink:      0,
                  fontFamily:      '"IBM Plex Mono", monospace',
                  fontSize:        '0.5625rem',
                  fontWeight:      700,
                  letterSpacing:   '0.08em',
                  textTransform:   'uppercase',
                  color:           staleInk,
                  backgroundColor: isDark ? 'rgba(122,68,98,0.18)' : `${colors.aging.stale}12`,
                  border:          `1px solid ${isDark ? 'rgba(122,68,98,0.45)' : `${colors.aging.stale}33`}`,
                  borderRadius:    '3px',
                  px:              0.5,
                  py:              '1px',
                  lineHeight:      1.5,
                }}
              >
                <PauseCircle size={10} strokeWidth={2} />
                Blocked
              </Box>
            </Tooltip>
          )}

          {/* Inline metadata — due date */}
          {dueBadge && !isSunk && !isBlocked && (
            <Typography
              sx={{
                fontFamily:   '"IBM Plex Mono", monospace',
                fontSize:     '0.625rem',
                fontWeight:   600,
                color:        dueBadge.color,
                whiteSpace:   'nowrap',
                flexShrink:   0,
                letterSpacing:'0.01em',
              }}
            >
              {dueBadge.label}
            </Typography>
          )}

          {/* Priority dot — small, not screaming */}
          {task.priority && !isSunk && !isBlocked && (
            <Box
              sx={{
                width:           6,
                height:          6,
                borderRadius:    '50%',
                backgroundColor: priorityDotColors[task.priority] || colors.ink[300],
                flexShrink:      0,
                opacity:         0.85,
              }}
              title={
                task.priority === 1
                  ? 'High priority'
                  : task.priority === 2
                  ? 'Medium priority'
                  : 'Low priority'
              }
            />
          )}

          {/* Recurrence icon */}
          {((task.recurrencePattern && task.recurrencePattern !== 'none') || task.recurrenceRule || task.isSeriesMaster || task.seriesId) && (
            <Tooltip title={task.recurrencePattern && task.recurrencePattern !== 'none' ? `Repeats ${task.recurrencePattern}` : 'Recurring task'} placement="top">
              <Box
                component="span"
                sx={{
                  display:    'inline-flex',
                  alignItems: 'center',
                  flexShrink: 0,
                  color:      isDark ? 'rgba(255,245,220,0.3)' : colors.ink[300],
                }}
              >
                <Repeat size={12} strokeWidth={1.75} />
              </Box>
            </Tooltip>
          )}
        </Box>

        {/* Note — italic, below the content line */}
        {task.note && (
          <Typography
            sx={{
              fontSize:    '0.8125rem',
              fontStyle:   'italic',
              fontFamily:  '"Fraunces", serif',
              color:       isDark ? 'rgba(255,245,220,0.38)' : colors.ink[400],
              mt:          0.375,
              lineHeight:  1.45,
            }}
          >
            {task.note}
          </Typography>
        )}

        {/* Why it is parked — muted secondary line, the reason in the writer's
            own words. Reads below the note when a task has both. */}
        {isBlocked && task.blockedReason && (
          <Typography
            sx={{
              fontSize:   '0.8125rem',
              fontStyle:  'italic',
              fontFamily: '"Fraunces", serif',
              color:      isDark ? 'rgba(255,245,220,0.42)' : colors.ink[400],
              mt:         0.375,
              lineHeight: 1.45,
            }}
          >
            — {task.blockedReason}
          </Typography>
        )}

        {/* Tags */}
        {task.tags?.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
            {task.tags.map((tag) => (
              <Chip
                key={tag}
                label={`#${tag}`}
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/tags?tag=${encodeURIComponent(tag)}`);
                }}
                sx={{
                  height:          18,
                  fontSize:        '0.625rem',
                  fontFamily:      '"IBM Plex Mono", monospace',
                  fontWeight:      500,
                  letterSpacing:   '0.02em',
                  cursor:          'pointer',
                  backgroundColor: isDark ? 'rgba(255,245,220,0.06)' : colors.ink[100],
                  color:           isDark ? 'rgba(255,245,220,0.45)' : colors.ink[400],
                  border:          `1px solid ${isDark ? 'rgba(255,245,220,0.1)' : colors.ink[200]}`,
                  borderRadius:    '3px',
                  '&:hover': {
                    backgroundColor: isDark ? 'rgba(255,245,220,0.1)' : colors.ink[200],
                    color:           isDark ? 'rgba(255,245,220,0.65)' : colors.ink[600],
                  },
                  '& .MuiChip-label': { px: 0.625 },
                }}
              />
            ))}
          </Box>
        )}

        {/* Parked-since label — the blocked row's answer to the aging label */}
        {isBlocked && parkedLabel && (
          <Typography
            sx={{
              fontFamily:   '"IBM Plex Mono", monospace',
              fontSize:     '0.5625rem',
              letterSpacing:'0.08em',
              textTransform:'uppercase',
              color:        staleInk,
              mt:           0.375,
              fontWeight:   600,
              opacity:      0.85,
            }}
          >
            {parkedLabel}
          </Typography>
        )}

        {/* Aging label — only for significantly aged tasks */}
        {agingLabel && !isSunk && !isBlocked && days > 1 && (
          <Typography
            sx={{
              fontFamily:   '"IBM Plex Mono", monospace',
              fontSize:     '0.5625rem',
              letterSpacing:'0.08em',
              textTransform:'uppercase',
              color:        `${agingColor}99`,
              mt:           0.375,
              fontWeight:   600,
            }}
          >
            {agingLabel}
          </Typography>
        )}
      </Box>

      {/* ─── Action buttons — desktop hover / mobile tap ──────── */}
      <AnimatePresence>
        {showActions && (onEdit || onDelete || onSaveAsNote || onCancel || onBlock || onUnblock) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.1, ease: 'easeOut' }}
            style={{
              display:  'flex',
              alignItems: 'center',
              gap: 2,
              // Desktop: absolute right overlay
              ...(!isMobile && {
                position:  'absolute',
                right:     8,
                top:       '50%',
                transform: 'translateY(-50%)',
              }),
              // Mobile: inline, aligned center
              ...(isMobile && {
                flexShrink: 0,
                alignSelf:  'center',
              }),
            }}
          >
            {/* Backdrop blur on desktop for legibility */}
            {!isMobile && (
              <Box
                sx={{
                  position:        'absolute',
                  inset:           '-4px -4px -4px -12px',
                  backgroundColor: isDark
                    ? `${colors.dark[200]}e0`
                    : `${colors.parchment.paper}e0`,
                  backdropFilter:  'blur(4px)',
                  borderRadius:    '6px',
                  zIndex:          -1,
                }}
              />
            )}

            {onEdit && (
              <Tooltip title="Edit" placement="top">
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); onEdit(task); }}
                  sx={{
                    color:   isDark ? 'rgba(255,245,220,0.35)' : colors.ink[400],
                    width:   28,
                    height:  28,
                    '&:hover': { color: colors.primary[500] },
                  }}
                >
                  <Pencil size={14} strokeWidth={1.75} />
                </IconButton>
              </Tooltip>
            )}
            {onSaveAsNote && (
              <Tooltip title="Save as note" placement="top">
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); onSaveAsNote(task); }}
                  sx={{
                    color:   isDark ? 'rgba(255,245,220,0.35)' : colors.ink[400],
                    width:   28,
                    height:  28,
                    '&:hover': { color: colors.primary[500] },
                  }}
                >
                  <StickyNote size={14} strokeWidth={1.75} />
                </IconButton>
              </Tooltip>
            )}
            {onCancel && (
              <Tooltip title={isCancelled ? 'Restore' : 'Cancel — mark irrelevant'} placement="top">
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); onCancel(task); }}
                  sx={{
                    color:   isCancelled
                               ? staleInk
                               : (isDark ? 'rgba(255,245,220,0.35)' : colors.ink[400]),
                    width:   28,
                    height:  28,
                    '&:hover': { color: staleInk },
                  }}
                >
                  {isCancelled ? <RotateCcw size={14} strokeWidth={1.75} /> : <Ban size={14} strokeWidth={1.75} />}
                </IconButton>
              </Tooltip>
            )}
            {isBlocked && onUnblock && (
              <Tooltip title="Unblock — put it back in play" placement="top">
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); onUnblock(task); }}
                  sx={{
                    color:   staleInk,
                    width:   28,
                    height:  28,
                    '&:hover': { color: colors.aging.fresh },
                  }}
                >
                  <Play size={14} strokeWidth={1.75} />
                </IconButton>
              </Tooltip>
            )}
            {!isBlocked && !isSunk && onBlock && (
              <Tooltip title="Block… — park it, waiting on something" placement="top">
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); onBlock(task); }}
                  sx={{
                    color:   isDark ? 'rgba(255,245,220,0.35)' : colors.ink[400],
                    width:   28,
                    height:  28,
                    '&:hover': { color: staleInk },
                  }}
                >
                  <PauseCircle size={14} strokeWidth={1.75} />
                </IconButton>
              </Tooltip>
            )}
            {onDelete && (
              <Tooltip title="Delete" placement="top">
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); onDelete(task); }}
                  sx={{
                    color:   isDark ? 'rgba(255,245,220,0.35)' : colors.ink[400],
                    width:   28,
                    height:  28,
                    '&:hover': { color: colors.aging.overdue },
                  }}
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                </IconButton>
              </Tooltip>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
};

export default TaskRow;
