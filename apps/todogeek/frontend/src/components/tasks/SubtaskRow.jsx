import { useMemo, useState } from 'react';
import {
  Box,
  ButtonBase,
  IconButton,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { motion } from 'framer-motion';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';
import { GeekSheet } from '@geeksuite/ui';
import TaskCheckbox from './TaskCheckbox';
import { colors } from '../../theme/colors';
import { dueDayStart } from '../../utils/dueDate';
import { domainInk } from '../../theme/inks';

/**
 * SubtaskRow — one step of an entry, rendered inside its parent's expanded row.
 *
 * Deliberately *not* a smaller `TaskRow`. A step has no aging border, no
 * "3 days ago" label, no blocked stamp and no recurrence — it is a line item
 * under something that already carries all of that, and repeating the parent's
 * signals on every child turns a five-step task into a wall of colour. What it
 * keeps is the family resemblance: the same warm ink, the same monospace
 * metadata, the same 44px targets, and the same completed treatment (a
 * strikethrough that draws itself in).
 *
 * The indent is drawn as a real rule rather than padding, so a long list of
 * steps reads as one bracketed group rather than a paragraph that happens to
 * start further in.
 */
const SubtaskRow = ({
  subtask,
  onStatusToggle,
  onEdit,
  onDelete,
  isLast = false,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [hovered, setHovered] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const isCompleted = subtask.status === 'completed';
  const isCancelled = subtask.status === 'cancelled';
  const isSunk = isCompleted || isCancelled;

  const idleInk = theme.palette.text.secondary;
  const ruleInk = isDark ? 'rgba(255,245,220,0.14)' : colors.ink[200];
  // The tick colour is the one aging cue a step keeps: green when it is on
  // time, amber once its own due date has passed. Anything more would compete
  // with the parent's border.
  // `dueDayStart` (utils/dueDate.js) resolves the dual-natured `dueDate` to
  // the local midnight of the day it actually means, which is what
  // `differenceInCalendarDays` — a local-calendar helper — needs. Passing the
  // raw value marked every date-only step amber a day early.
  const tickColor = useMemo(() => {
    const due = dueDayStart(subtask.dueDate);
    if (!due) return colors.aging.fresh;
    return differenceInCalendarDays(due, new Date()) < 0
      ? colors.aging.warning
      : colors.aging.fresh;
  }, [subtask.dueDate]);
  // The tick is a drawn glyph (3:1 is the floor for a non-text graphic); the
  // due label beside it is 11px text and needs the full 4.5.
  const dueInk = domainInk(tickColor, theme);

  const dueLabel = useMemo(() => {
    if (isSunk) return null;
    const due = dueDayStart(subtask.dueDate);
    if (!due) return null;
    const diff = differenceInCalendarDays(due, new Date());
    if (diff === 0) return 'today';
    if (diff === 1) return 'tomorrow';
    if (diff < 0) return `${Math.abs(diff)}d overdue`;
    return format(due, 'MMM d');
  }, [subtask.dueDate, isSunk]);

  const actionItems = useMemo(() => {
    const items = [];
    if (onEdit) {
      items.push({ key: 'edit', label: 'Edit step', icon: Pencil, onClick: () => onEdit(subtask) });
    }
    if (onDelete) {
      items.push({
        key: 'delete',
        label: 'Remove step',
        icon: Trash2,
        onClick: () => onDelete(subtask),
        destructive: true,
      });
    }
    return items;
  }, [onEdit, onDelete, subtask]);

  const content = String(subtask.content ?? '').trim();

  return (
    <Box
      data-subtask-id={subtask.id || subtask._id}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.25,
        position: 'relative',
        minHeight: 44,
        // The bracket: a rule down the left of the whole group, stopping at
        // the last child so the list closes rather than trailing off.
        pl: { xs: 2.25, sm: 3 },
        pr: { xs: 0.5, sm: 1 },
        '&::before': {
          content: '""',
          position: 'absolute',
          left: { xs: 18, sm: 26 },
          top: 0,
          bottom: isLast ? '50%' : 0,
          width: '1px',
          backgroundColor: ruleInk,
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          left: { xs: 18, sm: 26 },
          top: '50%',
          width: { xs: 8, sm: 10 },
          height: '1px',
          backgroundColor: ruleInk,
        },
        backgroundColor: hovered
          ? (isDark ? 'rgba(255,245,220,0.025)' : `${colors.ink[100]}40`)
          : 'transparent',
        transition: 'background-color 0.12s ease',
      }}
    >
      <Box sx={{ flexShrink: 0, ml: { xs: 0.5, sm: 0.75 } }}>
        <TaskCheckbox
          checked={isCompleted}
          glyph={18}
          color={tickColor}
          label={`${isCompleted ? 'Mark step incomplete' : 'Complete step'}: ${content}`}
          onChange={() => onStatusToggle?.(subtask)}
        />
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.75, py: 0.5 }}>
        <Box sx={{ position: 'relative', minWidth: 0, flex: 1 }}>
          <Typography
            sx={{
              fontSize: '0.875rem',
              fontWeight: isSunk ? 400 : 450,
              fontStyle: isCancelled ? 'italic' : 'normal',
              color: isCancelled
                ? domainInk(colors.aging.stale, theme)
                : isCompleted
                ? theme.palette.text.muted
                : theme.palette.text.secondary,
              lineHeight: 1.45,
              transition: 'color 260ms ease',
              letterSpacing: '-0.003em',
              textDecoration: isCancelled ? 'line-through' : 'none',
              textDecorationStyle: 'dashed',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {content}
          </Typography>
          <motion.div
            initial={false}
            animate={{ scaleX: isCompleted ? 1 : 0, opacity: isCompleted ? 0.5 : 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '50%',
              height: '1px',
              backgroundColor: isDark ? 'rgba(255,245,220,0.35)' : colors.ink[400],
              pointerEvents: 'none',
              transformOrigin: 'left center',
              transform: 'translateY(-50%)',
            }}
            aria-hidden="true"
          />
        </Box>

        {dueLabel && (
          <Typography
            sx={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: dueInk,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              letterSpacing: '0.01em',
            }}
          >
            {dueLabel}
          </Typography>
        )}
      </Box>

      {/* Same two surfaces as the parent row: hover cluster at `md`+, one
          44px ⋯ below it. */}
      {actionItems.length > 0 && isMobile && (
        <IconButton
          onClick={(e) => { e.stopPropagation(); setSheetOpen(true); }}
          aria-label={`Actions for step ${content}`}
          sx={{ flexShrink: 0, width: 44, height: 44, color: idleInk }}
        >
          <MoreHorizontal size={16} strokeWidth={1.75} />
        </IconButton>
      )}

      {!isMobile && actionItems.length > 0 && (
        <Box
          data-geek-hover-reveal=""
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            flexShrink: 0,
            opacity: hovered ? 1 : 0,
            pointerEvents: hovered ? 'auto' : 'none',
            transition: 'opacity 0.1s ease',
          }}
        >
          {actionItems.map((action) => (
            <Tooltip key={action.key} title={action.label} placement="top">
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); action.onClick(); }}
                aria-label={action.label}
                sx={{
                  color: idleInk,
                  width: 26,
                  height: 26,
                  '&:hover': {
                    color: action.destructive ? colors.aging.overdue : colors.primary[500],
                  },
                }}
              >
                <action.icon size={13} strokeWidth={1.75} />
              </IconButton>
            </Tooltip>
          ))}
        </Box>
      )}

      {isMobile && (
        <GeekSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={content || 'Step'}
          bodySx={{ px: 1, pt: 0.5 }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', pb: 1 }}>
            {actionItems.map((action) => (
              <ButtonBase
                key={action.key}
                onClick={(e) => { e.stopPropagation(); setSheetOpen(false); action.onClick(); }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: 1.75,
                  minHeight: 44,
                  px: 1.5,
                  borderRadius: '8px',
                  textAlign: 'left',
                  color: action.destructive ? 'error.main' : 'text.primary',
                }}
              >
                <action.icon size={18} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                <Typography sx={{ fontSize: '0.9375rem', fontWeight: 450 }}>
                  {action.label}
                </Typography>
              </ButtonBase>
            ))}
          </Box>
        </GeekSheet>
      )}
    </Box>
  );
};

export default SubtaskRow;
