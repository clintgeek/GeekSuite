/**
 * The boxes of the planner spread (W1–W3, W6): seven day cells and the
 * eighth, "Not scheduled". A cell does not scroll. It counts how many rows
 * fit and ends with a "+N more" line that opens the day.
 */
import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, ButtonBase, Typography } from '@mui/material';
import { dayOfMonth, monthDay, shortDay, weekdayName } from '../../lib/days.js';
import { clockLabel, dueDayKey } from '../../lib/tasks.js';
import { fitRows } from '../../lib/week.js';
import { DISPLAY_FONT } from '../../theme/theme.js';
import InkThumb from './InkThumb.jsx';
import WeekTaskRow, { ROW_PX } from './WeekTaskRow.jsx';

/** The drop target id of the eighth cell (a drop there is not a move). */
export const UNSCHEDULED_CELL = 'unscheduled';

/** Every box's heading is this tall, with or without an ink picture, so rows line up across the spread. */
const HEADER_PX = 60;

const focusRing = { '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 } };

const dayHref = (key, today) => (key === today ? '/' : `/day/${key}`);

/** How many whole rows fit in the list area; Infinity until it has been measured (and wherever cells grow instead). */
function useCapacity(fit) {
  const ref = useRef(null);
  const [capacity, setCapacity] = useState(Infinity);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!fit || !node) {
      setCapacity(Infinity);
      return undefined;
    }
    const measure = () => {
      const height = node.clientHeight;
      setCapacity(height > 0 ? Math.max(1, Math.floor(height / ROW_PX)) : Infinity);
    };
    measure();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [fit]);
  return [ref, capacity];
}

const lineSx = (theme) => ({
  height: ROW_PX,
  display: 'flex',
  alignItems: 'center',
  pl: 1.75,
  pr: 1,
  fontSize: '0.8125rem',
  color: 'text.secondary',
  borderTop: `1px solid ${theme.palette.day.rule}`,
});

function CellShell({ cellKey, labelledBy, testId, isToday, dropOver, fit, header, children, ...rest }) {
  return (
    <Box
      component="section"
      aria-labelledby={labelledBy}
      data-testid={testId}
      data-week-cell={cellKey}
      data-today={isToday ? 'true' : undefined}
      data-drop-over={dropOver ? 'true' : undefined}
      sx={(theme) => ({
        display: 'flex',
        flexDirection: 'column',
        minHeight: fit ? 0 : 96,
        minWidth: 0,
        bgcolor: theme.palette.day.page,
        border: `1px solid ${theme.palette.day.divider}`,
        borderRadius: 3,
        overflow: 'hidden',
        // The day a dragged task would land on.
        ...(dropOver ? { borderColor: 'primary.main', boxShadow: `inset 0 0 0 2px ${theme.palette.primary.main}` } : null),
      })}
      {...rest}
    >
      {header}
      {children}
    </Box>
  );
}

function Rows({ fit, open, done, capacity: capacityProp, moreHref, moreLabel, rowFor, empty }) {
  const [ref, measured] = useCapacity(fit);
  const shown = fitRows(open, done, capacityProp ?? measured);
  return (
    <Box ref={ref} sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {!open.length && !done.length ? empty : null}
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {shown.open.map(rowFor)}
        {shown.done.map(rowFor)}
        {shown.more ? (
          <Box component="li">
            <ButtonBase
              component={RouterLink}
              to={moreHref}
              data-testid="week-more"
              aria-label={moreLabel(shown.more)}
              sx={[lineSx, focusRing, { width: '100%', justifyContent: 'flex-start', color: 'primary.main', fontWeight: 600 }]}
            >
              +{shown.more} more
              {shown.doneCollapsed ? (
                <Box component="span" sx={{ ml: 0.75, fontWeight: 400, color: 'text.secondary' }}>
                  · {shown.doneCollapsed} done
                </Box>
              ) : null}
            </ButtonBase>
          </Box>
        ) : shown.doneCollapsed ? (
          <Box component="li" data-testid="week-done-line" sx={lineSx}>
            {shown.doneCollapsed} done
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

const countText = (open) => (open === 0 ? 'all clear' : `${open} to do`);

function Count({ ready, open }) {
  if (!ready) return null;
  return (
    <Typography data-testid="week-count" sx={{ flex: 'none', alignSelf: 'center', pr: 1.5, fontSize: '0.8125rem', color: 'text.secondary' }}>
      {countText(open)}
    </Typography>
  );
}

/**
 * One day. The heading and the ink picture are both links to the day's page (W6).
 *
 * @param {object} props
 * @param {string} props.dayKey
 * @param {{ timed: object[], untimed: object[], done: object[], open: number }} props.group
 * @param {{ paths: string[], top: number }} [props.thumb]
 * @param {boolean} props.ready     the tasks have loaded (until then there is no count to show)
 * @param {boolean} props.fit       the cell has a fixed height and must not overflow it
 * @param {number} [props.capacity] rows that fit, when the caller knows (tests); measured otherwise
 */
export function DayCell({ dayKey, today, group, thumb, ready, fit, capacity, dropOver, liftedId, rowDragProps, onToggle, onMenu }) {
  const headingId = useId();
  const isToday = dayKey === today;
  const weekday = weekdayName(dayKey);
  const href = dayHref(dayKey, today);
  const open = [...group.timed, ...group.untimed];

  const rowFor = (task) => (
    <WeekTaskRow
      key={task.id}
      task={task}
      lead={clockLabel(task)}
      lifted={task.id === liftedId}
      dragProps={rowDragProps?.(task)}
      onToggle={onToggle}
      onMenu={onMenu}
    />
  );

  return (
    <CellShell
      cellKey={dayKey}
      labelledBy={headingId}
      testId="week-day"
      data-day={dayKey}
      isToday={isToday}
      dropOver={dropOver}
      fit={fit}
      header={
        <Box sx={{ display: 'flex', alignItems: 'stretch', flex: 'none', height: HEADER_PX }}>
          <Box component="h2" id={headingId} sx={{ m: 0, flex: 1, minWidth: 0, display: 'flex', font: 'inherit' }}>
            <ButtonBase
              component={RouterLink}
              to={href}
              data-testid="week-day-open"
              aria-label={`Open ${weekday}, ${monthDay(dayKey)}${isToday ? ', today' : ''}`}
              sx={[focusRing, { flex: 1, minWidth: 0, justifyContent: 'flex-start', alignItems: 'center', pl: 1.75, pr: 1 }]}
            >
              <Box component="span" sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
              <Box
                component="span"
                sx={{
                  fontFamily: DISPLAY_FONT,
                  fontWeight: 600,
                  fontSize: '1.625rem',
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                  color: isToday ? 'secondary.main' : 'text.primary',
                }}
              >
                {dayOfMonth(dayKey)}
              </Box>
              <Box
                component="span"
                sx={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  color: isToday ? 'secondary.main' : 'text.secondary',
                }}
              >
                {weekday}
              </Box>
              {isToday ? (
                <Box
                  component="span"
                  data-testid="week-today-mark"
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: '0.75rem', fontWeight: 700, color: 'secondary.main', whiteSpace: 'nowrap' }}
                >
                  <Box aria-hidden component="span" sx={{ width: 14, height: 3, borderRadius: 2, bgcolor: 'secondary.main', alignSelf: 'center' }} />
                  Today
                </Box>
              ) : null}
              </Box>
            </ButtonBase>
          </Box>
          <Count ready={ready} open={group.open} />
          {thumb ? (
            <ButtonBase
              component={RouterLink}
              to={href}
              data-testid="week-day-ink"
              aria-label={`Open ${weekday}’s page`}
              sx={(theme) => ({
                flex: 'none',
                width: 72,
                height: 50,
                alignSelf: 'center',
                mr: 0.75,
                borderRadius: 1.5,
                overflow: 'hidden',
                border: `1px solid ${theme.palette.day.border}`,
                bgcolor: 'background.paper',
                '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 1 },
              })}
            >
              <InkThumb thumb={thumb} />
            </ButtonBase>
          ) : null}
        </Box>
      }
    >
      <Rows
        fit={fit}
        open={open}
        done={group.done}
        capacity={capacity}
        moreHref={href}
        moreLabel={(n) => `${n} more on ${weekday}. Open the day`}
        rowFor={rowFor}
        empty={null}
      />
    </CellShell>
  );
}

/**
 * The eighth cell (W3): open tasks that are overdue or have no date, waiting
 * to be given a day. Not a drop target — a task is never moved to "no day".
 */
export function UnscheduledCell({ group, today, now, ready, fit, capacity, liftedId, rowDragProps, onToggle, onMenu }) {
  const headingId = useId();
  const open = [...group.overdue, ...group.undated];

  const rowFor = (task) => {
    const due = dueDayKey(task);
    return (
      <WeekTaskRow
        key={task.id}
        task={task}
        // An overdue row says which day it was due; its date is never changed for it.
        lead={due ? shortDay(due, now) : ''}
        tone={due ? 'overdue' : undefined}
        lifted={task.id === liftedId}
        dragProps={rowDragProps?.(task)}
        onToggle={onToggle}
        onMenu={onMenu}
      />
    );
  };

  return (
    <CellShell
      cellKey={UNSCHEDULED_CELL}
      labelledBy={headingId}
      testId="week-unscheduled"
      fit={fit}
      header={
        <Box sx={{ display: 'flex', alignItems: 'stretch', flex: 'none', height: HEADER_PX }}>
          <Typography
            component="h2"
            id={headingId}
            sx={{ flex: 1, minWidth: 0, alignSelf: 'center', pl: 1.75, fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: '1.125rem', lineHeight: 1.2 }}
          >
            Not scheduled
          </Typography>
          <Count ready={ready} open={group.open} />
        </Box>
      }
    >
      <Rows
        fit={fit}
        open={open}
        done={[]}
        capacity={capacity}
        moreHref={dayHref(today, today)}
        moreLabel={(n) => `${n} more not scheduled. Open today`}
        rowFor={rowFor}
        empty={
          ready ? (
            <Typography data-testid="week-unscheduled-empty" sx={{ px: 1.5, pt: 0.5, fontSize: '0.875rem', lineHeight: 1.45, color: 'text.secondary' }}>
              Nothing overdue, and nothing waiting for a day.
            </Typography>
          ) : null
        }
      />
    </CellShell>
  );
}
