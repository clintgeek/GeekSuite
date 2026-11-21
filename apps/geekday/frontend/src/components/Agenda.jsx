/**
 * The agenda strip: the day's TodoGeek tasks beside the ink page
 * (spec reqs 1–4, 13). Overdue, then timed, then untimed, then what is done.
 */
import React, { useId, useMemo, useState } from 'react';
import { Box, ButtonBase, CircularProgress, IconButton, InputBase, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import EastRounded from '@mui/icons-material/EastRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ReplayRounded from '@mui/icons-material/ReplayRounded';
import { GeekLoadError } from '@geeksuite/ui';
import { describeReading, readTask } from '../lib/capture.js';
import { relativeName, shortDay } from '../lib/days.js';
import { clockLabel, dueDayKey, isDone, nextDayKey, openCount } from '../lib/tasks.js';
import { DISPLAY_FONT } from '../theme/theme.js';

const TARGET = 44;

function Tick({ task, onToggle, busy }) {
  const done = isDone(task);
  return (
    <ButtonBase
      onClick={() => onToggle(task)}
      disabled={busy}
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Mark "${task.content}" not done` : `Mark "${task.content}" done`}
      data-testid="task-tick"
      sx={{
        width: TARGET,
        height: TARGET,
        flex: 'none',
        borderRadius: '50%',
        '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -4 },
      }}
    >
      <Box
        aria-hidden
        sx={(theme) => ({
          width: 22,
          height: 22,
          borderRadius: '6px',
          border: '2px solid',
          borderColor: done ? 'primary.main' : theme.palette.day.border,
          bgcolor: done ? 'primary.main' : 'transparent',
          color: 'primary.contrastText',
          display: 'grid',
          placeItems: 'center',
          transition: theme.transitions.create(['background-color', 'border-color'], { duration: 120 }),
        })}
      >
        {done ? <CheckRounded sx={{ fontSize: 18 }} /> : null}
      </Box>
    </ButtonBase>
  );
}

function TaskRow({ task, dayKey, tone, onToggle, onMove, now }) {
  const done = isDone(task);
  const time = clockLabel(task);
  const dueKey = dueDayKey(task);
  // An overdue row says which day it was due; its date is never changed for it.
  const from = tone === 'overdue' && dueKey ? relativeName(dueKey, now) || shortDay(dueKey, now) : '';
  const meta = [from, time, task.priority === 1 ? 'High' : '', task.recurrenceRule || task.seriesId ? 'Repeats' : '']
    .filter(Boolean)
    .join(' · ');
  const target = nextDayKey(dayKey);
  const moveLabel = `Move "${task.content}" to ${relativeName(target, now).toLowerCase() || shortDay(target, now)}`;

  return (
    <Box
      component="li"
      data-testid="task-row"
      data-task-tone={tone}
      sx={{ display: 'flex', alignItems: 'center', minHeight: 48, gap: 0.25, pl: 0.25, pr: 0.25 }}
    >
      <Tick task={task} onToggle={onToggle} />
      <Box sx={{ flex: 1, minWidth: 0, py: 0.75 }}>
        <Typography
          sx={{
            fontSize: '0.9375rem',
            lineHeight: 1.3,
            overflowWrap: 'anywhere',
            color: done ? 'text.secondary' : 'text.primary',
            textDecoration: done ? 'line-through' : 'none',
          }}
        >
          {task.content}
        </Typography>
        {meta ? (
          <Typography
            sx={{
              fontSize: '0.75rem',
              lineHeight: 1.35,
              mt: 0.125,
              fontWeight: tone === 'overdue' ? 600 : 500,
              color: tone === 'overdue' && !done ? 'secondary.main' : 'text.secondary',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {meta}
          </Typography>
        ) : null}
      </Box>
      {!done ? (
        <Tooltip title={moveLabel.replace(`"${task.content}" `, '')} placement="left">
          <IconButton
            onClick={() => onMove(task)}
            aria-label={moveLabel}
            data-testid="task-move"
            sx={{ width: TARGET, height: TARGET, flex: 'none', color: 'text.secondary' }}
          >
            <EastRounded sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      ) : null}
    </Box>
  );
}

function Section({ title, tone, tasks, ...rowProps }) {
  const headingId = useId();
  if (!tasks.length) return null;
  return (
    <Box component="section" aria-labelledby={headingId} sx={{ mb: 1.5 }}>
      <Typography
        id={headingId}
        component="h2"
        sx={{
          px: 1.5,
          pb: 0.25,
          fontSize: '0.75rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: tone === 'overdue' ? 'secondary.main' : 'text.secondary',
        }}
      >
        {title}
        <Box component="span" sx={{ ml: 0.75, fontWeight: 500, letterSpacing: 0 }}>
          {tasks.length}
        </Box>
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} tone={tone} {...rowProps} />
        ))}
      </Box>
    </Box>
  );
}

function DoneSection({ tasks, ...rowProps }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (!tasks.length) return null;
  return (
    <Box component="section" sx={{ mb: 1 }}>
      <ButtonBase
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={listId}
        data-testid="done-toggle"
        sx={{
          width: '100%',
          minHeight: TARGET,
          px: 1.5,
          justifyContent: 'flex-start',
          gap: 0.5,
          color: 'text.secondary',
          fontSize: '0.75rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
        }}
      >
        Done
        <Box component="span" sx={{ fontWeight: 500, letterSpacing: 0 }}>
          {tasks.length}
        </Box>
        <ExpandMoreRounded sx={{ fontSize: 20, ml: 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
      </ButtonBase>
      <Box component="ul" id={listId} hidden={!open} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {open ? tasks.map((task) => <TaskRow key={task.id} task={task} tone="done" {...rowProps} />) : null}
      </Box>
    </Box>
  );
}

/** Type a task; the line under the box says how it was read before you commit. */
export function AddBox({ dayKey, onAdd, now }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const hintId = useId();
  const reading = useMemo(() => readTask(text, dayKey, now), [text, dayKey, now]);
  const parts = describeReading(reading, now);

  const submit = async (event) => {
    event.preventDefault();
    if (!reading.input || busy) return;
    setBusy(true);
    const ok = await onAdd(reading, text);
    setBusy(false);
    if (ok) setText('');
  };

  return (
    <Box component="form" onSubmit={submit} sx={(theme) => ({ borderTop: `1px solid ${theme.palette.day.divider}`, p: 1 })}>
      <Box
        sx={(theme) => ({
          display: 'flex',
          alignItems: 'center',
          minHeight: 48,
          pl: 1.5,
          pr: 0.25,
          borderRadius: 2,
          border: `1px solid ${theme.palette.day.border}`,
          bgcolor: 'background.paper',
          '&:focus-within': { borderColor: 'primary.main', boxShadow: `0 0 0 1px ${theme.palette.primary.main}` },
        })}
      >
        <InputBase
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Add a task…"
          inputProps={{
            'aria-label': 'Add a task',
            'aria-describedby': hintId,
            'data-testid': 'add-task-input',
            enterKeyHint: 'done',
            autoComplete: 'off',
            maxLength: 2000,
          }}
          sx={{
            flex: 1,
            fontSize: '0.9375rem',
            // The whole 46px row is the field: a finger does not aim for a 31px line of text.
            '& input': { height: TARGET + 2, boxSizing: 'border-box', py: 0 },
            '& input::placeholder': { color: 'text.secondary', opacity: 1 },
          }}
        />
        <IconButton
          type="submit"
          disabled={!reading.input || busy}
          aria-label="Add task"
          data-testid="add-task-submit"
          sx={{ width: TARGET, height: TARGET, color: 'primary.main' }}
        >
          {busy ? <CircularProgress size={18} aria-label="Adding" /> : <AddRounded />}
        </IconButton>
      </Box>
      <Typography
        id={hintId}
        data-testid="add-task-hint"
        sx={{ minHeight: '1.35em', px: 1.5, pt: 0.5, fontSize: '0.75rem', lineHeight: 1.35, color: 'text.secondary' }}
      >
        {reading.input ? parts.join(' · ') : 'Try “call vet fri 2pm”'}
      </Typography>
    </Box>
  );
}

export default function Agenda({ dayKey, today, tasks, onToggle, onMove, onAdd, now }) {
  const { groups, status, stale, retry } = tasks;
  const rowProps = { dayKey, onToggle, onMove, now };
  const open = openCount(groups);
  const empty = status === 'ready' && open === 0 && groups.done.length === 0;

  return (
    <Box
      component="aside"
      aria-label="Tasks for this day"
      data-testid="agenda"
      sx={(theme) => ({
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        bgcolor: theme.palette.day.page,
        border: `1px solid ${theme.palette.day.divider}`,
        borderRadius: 3,
        overflow: 'hidden',
      })}
    >
      <Box sx={{ px: 1.5, pt: 1.5, pb: 1, display: 'flex', alignItems: 'baseline', gap: 1 }}>
        <Typography component="h2" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: '1.25rem', lineHeight: 1.2 }}>
          Tasks
        </Typography>
        {status === 'ready' ? (
          <Typography data-testid="agenda-count" sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
            {open === 0 ? 'all clear' : `${open} to do`}
          </Typography>
        ) : null}
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', pb: 1 }} tabIndex={-1}>
        {status === 'loading' ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
            <CircularProgress size={22} aria-label="Loading tasks" />
          </Box>
        ) : null}

        {status === 'error' ? (
          <Box data-testid="agenda-error" sx={{ px: 1 }}>
            <GeekLoadError what="your tasks" onRetry={retry} />
          </Box>
        ) : null}

        {stale ? (
          <Box
            role="status"
            data-testid="agenda-stale"
            sx={{ mx: 1.5, mb: 1, display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', fontSize: '0.8125rem' }}
          >
            <Box sx={{ flex: 1 }}>Couldn’t refresh. This list may be out of date.</Box>
            <IconButton onClick={retry} aria-label="Refresh tasks" sx={{ width: TARGET, height: TARGET }}>
              <ReplayRounded sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>
        ) : null}

        {empty ? (
          <Box data-testid="agenda-empty" sx={{ px: 1.5, py: 3 }}>
            <Typography sx={{ fontFamily: DISPLAY_FONT, fontSize: '1.125rem', lineHeight: 1.3, mb: 0.75 }}>
              {dayKey === today ? 'Nothing on the list today.' : 'Nothing planned for this day.'}
            </Typography>
            <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', lineHeight: 1.45 }}>
              Type a task below, or write it on the page and circle it.
            </Typography>
          </Box>
        ) : null}

        {status === 'ready' ? (
          <>
            <Section title="Overdue" tone="overdue" tasks={groups.overdue} {...rowProps} />
            <Section title="Scheduled" tone="timed" tasks={groups.timed} {...rowProps} />
            <Section title="To do" tone="untimed" tasks={groups.untimed} {...rowProps} />
            <DoneSection tasks={groups.done} {...rowProps} />
          </>
        ) : null}
      </Box>

      <AddBox dayKey={dayKey} onAdd={onAdd} now={now} />
    </Box>
  );
}
