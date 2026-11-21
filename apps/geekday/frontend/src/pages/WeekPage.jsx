/**
 * The week spread: the facing page of the diary (DOCS/GEEKDAY_SPEC.md §6).
 * Seven days as a planner's two columns of four boxes, the eighth box for
 * what has no day yet. `/week` is this week and follows the calendar;
 * `/week/<key>` is the week that day falls in.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Box, Button, CircularProgress, IconButton, useMediaQuery } from '@mui/material';
import ReplayRounded from '@mui/icons-material/ReplayRounded';
import { GeekLoadError, useToast } from '@geeksuite/ui';
import MoveMenu from '../components/week/MoveMenu.jsx';
import { DayCell, UNSCHEDULED_CELL, UnscheduledCell } from '../components/week/WeekCell.jsx';
import WeekHeader from '../components/week/WeekHeader.jsx';
import { useMinuteClock, useSwipe, useToday } from '../hooks/useDevice.js';
import { useWeekDrag } from '../hooks/useWeekDrag.js';
import { useWeekNotes } from '../hooks/useWeekNotes.js';
import { useWeekTasks } from '../hooks/useWeekTasks.js';
import { addWeeks, isDayKey, relativeName, shortDay, weekRangeLabel, weekStart } from '../lib/days.js';
import { dueDayKey, isDone } from '../lib/tasks.js';

/**
 * The spread is a fixed sheet (no page scroll) only where there is room for
 * four rows of boxes; anywhere smaller the boxes grow and the page scrolls.
 */
const SPREAD_QUERY = '(min-width:600px) and (min-height:640px)';

const isTyping = (target) => Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));

const dayName = (key, now) => relativeName(key, now).toLowerCase() || shortDay(key, now);

export default function WeekPage() {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const today = useToday();
  const now = useMinuteClock(true);
  const { notify, dismiss } = useToast();
  const fit = useMediaQuery(SPREAD_QUERY, { noSsr: true });

  const routeKey = params.dayKey;
  const validRoute = !routeKey || isDayKey(routeKey);
  const thisMonday = weekStart(today);
  const monday = routeKey && validRoute ? weekStart(routeKey) : thisMonday;
  const isThisWeek = monday === thisMonday;

  const go = useCallback((key) => navigate(weekStart(key) === thisMonday ? '/week' : `/week/${weekStart(key)}`), [navigate, thisMonday]);
  const goPrev = useCallback(() => go(addWeeks(monday, -1)), [go, monday]);
  const goNext = useCallback(() => go(addWeeks(monday, 1)), [go, monday]);
  const goThisWeek = useCallback(() => go(today), [go, today]);

  const week = useWeekTasks(monday, today);
  const { keys, groups, status, stale, retry } = week;
  const ready = status === 'ready';
  const thumbs = useWeekNotes(keys, ready);

  // "Day" goes back to the day this page was opened from when that day is in
  // the week on screen; else to today, or to the Monday of another week (W8).
  const fromDay = location.state?.fromDay;
  const backKey = isDayKey(fromDay) && keys.includes(fromDay) ? fromDay : isThisWeek ? today : monday;
  const dayHref = backKey === today ? '/' : `/day/${backKey}`;
  const goDay = useCallback(() => navigate(dayHref), [navigate, dayHref]);

  // ── Tasks ──────────────────────────────────────────────────────────────
  const handleToggle = useCallback(
    async (task) => {
      try {
        await week.toggleDone(task);
      } catch {
        notify(isDone(task) ? 'Couldn’t reopen that task. Nothing was changed.' : 'Couldn’t tick that off. Nothing was changed.', {
          tone: 'error',
        });
      }
    },
    [week, notify]
  );

  /** Every move, dragged or picked from the menu, ends here: one mutation, one toast with Undo (W4). */
  const handleMove = useCallback(
    async (task, targetKey) => {
      if (!isDayKey(targetKey) || dueDayKey(task) === targetKey) return;
      try {
        const moved = await week.moveTo(task, targetKey);
        let toastId = null;
        const undo = async () => {
          dismiss(toastId);
          try {
            await week.restoreDue(moved, task);
          } catch {
            notify('Couldn’t move it back.', { tone: 'error' });
          }
        };
        toastId = notify(`Moved to ${dayName(targetKey, now)}.`, {
          action: (
            <Button color="inherit" size="small" onClick={undo} data-testid="week-undo" sx={{ minHeight: 44 }}>
              Undo
            </Button>
          ),
        });
      } catch {
        notify('Couldn’t move that task. Nothing was changed.', { tone: 'error' });
      }
    },
    [week, notify, dismiss, now]
  );

  const [menu, setMenu] = useState({ task: null, anchor: null });
  const openMenu = useCallback((task, anchor) => setMenu({ task, anchor }), []);
  const closeMenu = useCallback(() => setMenu((m) => ({ ...m, anchor: null })), []);

  // Dropping on "Not scheduled" is not a move: a task is never dragged to "no day".
  const { drag, rowProps } = useWeekDrag({
    onDrop: (task, cellKey) => {
      if (cellKey !== UNSCHEDULED_CELL) handleMove(task, cellKey);
    },
    enabled: fit && ready,
  });
  const dropKey = drag && drag.over !== UNSCHEDULED_CELL && drag.over !== dueDayKey(drag.task) ? drag.over : '';

  // ── Moving between weeks ───────────────────────────────────────────────
  const pageRef = useRef(null);
  useSwipe(pageRef, {
    onLeft: goNext,
    onRight: goPrev,
    // A finger that starts on a task is dragging it, not turning the page.
    ignore: (target) => isTyping(target) || (fit && Boolean(target?.closest?.('[data-testid="week-task"]'))),
    enabled: !menu.anchor,
  });

  useEffect(() => {
    const onKey = (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTyping(event.target) || event.target?.closest?.('[role="dialog"], [role="menu"]')) return;
      if (event.key === 'ArrowLeft') goPrev();
      else if (event.key === 'ArrowRight') goNext();
      else if (event.key === 't' || event.key === 'T') goThisWeek();
      else if (event.key === 'd' || event.key === 'D') goDay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext, goThisWeek, goDay]);

  useEffect(() => {
    document.title = isThisWeek ? 'This week · GeekDay' : `${weekRangeLabel(monday, now)} · GeekDay`;
  }, [isThisWeek, monday, now]);

  if (!validRoute) return <Navigate to="/week" replace />;

  const cellProps = { ready, fit, liftedId: drag?.task.id, rowDragProps: rowProps, onToggle: handleToggle, onMenu: openMenu };

  return (
    <>
      <Box
        ref={pageRef}
        data-testid="week-page"
        data-week={monday}
        data-status={status}
        sx={{
          height: '100vh',
          '@supports (height: 100dvh)': { height: '100dvh' },
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.default',
          overflow: 'hidden',
        }}
      >
        <WeekHeader monday={monday} isThisWeek={isThisWeek} now={now} onPrev={goPrev} onNext={goNext} onThisWeek={goThisWeek} dayHref={dayHref} />

        {stale ? (
          <Box
            role="status"
            data-testid="week-stale"
            sx={{ mx: { xs: 1.5, sm: 2.5 }, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', fontSize: '0.8125rem' }}
          >
            <Box sx={{ flex: 1 }}>Couldn’t refresh. This week may be out of date.</Box>
            <IconButton onClick={retry} aria-label="Refresh this week" sx={{ width: 44, height: 44 }}>
              <ReplayRounded sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>
        ) : null}

        {status === 'error' ? (
          // A failed load is said, with a way to try again: never drawn as seven empty days (W9).
          <Box component="main" data-testid="week-error" sx={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', px: 2, pb: 4 }}>
            <GeekLoadError what="this week" onRetry={retry} />
          </Box>
        ) : (
          <Box
            component="main"
            aria-busy={status === 'loading'}
            sx={{
              position: 'relative',
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gap: { xs: 1, sm: 1.5 },
              px: { xs: 1, sm: 2 },
              pb: 'max(12px, env(safe-area-inset-bottom))',
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
              ...(fit
                ? // The planner spread (W2): two columns of four boxes, Monday to Thursday down the left.
                  {
                    gridAutoFlow: { sm: 'column', lg: 'row' },
                    gridTemplateRows: { sm: 'repeat(4, minmax(0, 1fr))', lg: 'repeat(2, minmax(0, 1fr))' },
                  }
                : // No room for the spread: the boxes take the height they need and the page scrolls.
                  { gridAutoRows: 'min-content', alignContent: 'start', overflowY: 'auto', overscrollBehavior: 'contain' }),
            }}
          >
            {keys.map((key) => (
              <DayCell key={key} dayKey={key} today={today} group={groups.days[key]} thumb={thumbs[key]} dropOver={dropKey === key} {...cellProps} />
            ))}
            <UnscheduledCell group={groups.unscheduled} today={today} now={now} {...cellProps} />
            {status === 'loading' ? (
              <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                <CircularProgress size={22} aria-label="Loading this week" />
              </Box>
            ) : null}
          </Box>
        )}

        <MoveMenu task={menu.task} anchor={menu.anchor} keys={keys} today={today} now={now} onClose={closeMenu} onPick={handleMove} />
      </Box>

      {drag
        ? createPortal(
            <Box
              aria-hidden
              data-testid="week-drag-ghost"
              sx={(theme) => ({
                position: 'fixed',
                left: 0,
                top: 0,
                zIndex: theme.zIndex.tooltip,
                width: drag.width,
                transform: `translate(${Math.round(drag.x)}px, ${Math.round(drag.y)}px)`,
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                px: 1.5,
                py: 0.5,
                borderRadius: 2,
                bgcolor: 'background.paper',
                color: 'text.primary',
                border: `1px solid ${theme.palette.day.border}`,
                boxShadow: theme.shadows[6],
                fontSize: '0.875rem',
                lineHeight: 1.25,
                pointerEvents: 'none',
                userSelect: 'none',
              })}
            >
              {drag.task.content}
            </Box>,
            document.body
          )
        : null}
    </>
  );
}
