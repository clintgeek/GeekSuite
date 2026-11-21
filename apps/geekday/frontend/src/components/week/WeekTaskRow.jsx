/**
 * One task on the week spread: tick it (W5), drag it by its words to another
 * day, or open its move menu (W4 — the menu is also the keyboard's way).
 * Every row is exactly ROW_PX tall, so a cell can count how many fit.
 */
import React from 'react';
import { Box, ButtonBase, IconButton, Typography } from '@mui/material';
import CheckRounded from '@mui/icons-material/CheckRounded';
import EastRounded from '@mui/icons-material/EastRounded';
import { isDone } from '../../lib/tasks.js';

export const ROW_PX = 44;

function Tick({ task, onToggle }) {
  const done = isDone(task);
  return (
    <ButtonBase
      onClick={() => onToggle(task)}
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Mark "${task.content}" not done` : `Mark "${task.content}" done`}
      data-testid="week-task-tick"
      sx={{
        width: ROW_PX,
        height: ROW_PX,
        flex: 'none',
        borderRadius: '50%',
        '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -4 },
      }}
    >
      <Box
        aria-hidden
        sx={(theme) => ({
          width: 20,
          height: 20,
          borderRadius: '6px',
          border: '2px solid',
          borderColor: done ? 'primary.main' : theme.palette.day.border,
          bgcolor: done ? 'primary.main' : 'transparent',
          color: 'primary.contrastText',
          display: 'grid',
          placeItems: 'center',
        })}
      >
        {done ? <CheckRounded sx={{ fontSize: 16 }} /> : null}
      </Box>
    </ButtonBase>
  );
}

/**
 * @param {object} props
 * @param {object} props.task
 * @param {string} [props.lead]      what goes before the words: a time ("2:00 PM") or, for an overdue row, its date
 * @param {'overdue'} [props.tone]
 * @param {boolean} [props.lifted]   this row is the one being dragged
 * @param {object} [props.dragProps] pointer handlers from useWeekDrag; absent when rows are not draggable
 */
export default function WeekTaskRow({ task, lead = '', tone, lifted = false, dragProps, onToggle, onMenu }) {
  const done = isDone(task);
  const draggable = Boolean(dragProps) && !done;
  return (
    <Box
      component="li"
      data-testid="week-task"
      data-task-id={task.id}
      data-task-state={done ? 'done' : 'open'}
      data-task-tone={tone || undefined}
      {...(draggable ? dragProps : null)}
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'center',
        height: ROW_PX,
        pr: 0.25,
        borderTop: `1px solid ${theme.palette.day.rule}`,
        // The row being dragged stays readable where it was, marked as lifted.
        ...(lifted ? { bgcolor: 'action.selected', outline: `1px dashed ${theme.palette.day.border}`, outlineOffset: -3 } : null),
        ...(draggable ? { touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', cursor: 'grab' } : null),
      })}
    >
      <Tick task={task} onToggle={onToggle} />
      <Typography
        sx={{
          flex: 1,
          minWidth: 0,
          fontSize: '0.875rem',
          lineHeight: 1.25,
          overflowWrap: 'anywhere',
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: 2,
          overflow: 'hidden',
          color: done ? 'text.secondary' : 'text.primary',
          textDecoration: done ? 'line-through' : 'none',
        }}
      >
        {lead ? (
          <Box
            component="span"
            data-testid="week-task-lead"
            sx={{
              mr: 0.75,
              fontSize: '0.75rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
              display: 'inline-block',
              textDecoration: 'none',
              color: tone === 'overdue' && !done ? 'secondary.main' : 'text.secondary',
            }}
          >
            {lead}
          </Box>
        ) : null}
        {task.content}
      </Typography>
      {!done ? (
        <IconButton
          onClick={(event) => onMenu(task, event.currentTarget)}
          aria-label={`Move “${task.content}” to…`}
          aria-haspopup="menu"
          data-testid="week-task-move"
          sx={{ width: ROW_PX, height: ROW_PX, flex: 'none', color: 'text.secondary' }}
        >
          <EastRounded sx={{ fontSize: 18 }} />
        </IconButton>
      ) : null}
    </Box>
  );
}
