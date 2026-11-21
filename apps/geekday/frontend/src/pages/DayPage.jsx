/**
 * The daily page: one day, its tasks beside its ink, and nothing else
 * (DOCS/GEEKDAY_SPEC.md). `/` is today and follows the calendar; `/day/<key>`
 * is a fixed day.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Box, Button } from '@mui/material';
import { useThemeMode } from '@geeksuite/user';
import { useToast } from '@geeksuite/ui';
import Agenda from '../components/Agenda.jsx';
import ConfirmTaskDialog from '../components/ConfirmTaskDialog.jsx';
import DayHeader from '../components/DayHeader.jsx';
import DockedView from '../components/DockedView.jsx';
import InkPane from '../components/InkPane.jsx';
import { useDayNote, useUnsavedInkGuard } from '../hooks/useDayNote.js';
import { landsOn, useDayTasks } from '../hooks/useDayTasks.js';
import { useIdle, useMinuteClock, useSwipe, useToday, useWakeLock } from '../hooks/useDevice.js';
import { newClientId } from '../lib/capture.js';
import { addDays, isDayKey, monthDay, relativeName, shortDay, weekdayName } from '../lib/days.js';
import { isDone, nextDayKey } from '../lib/tasks.js';

/** Spec req 14, confirmed 2026-11-20. */
export const DOCK_AFTER_MS = 2 * 60 * 1000;

const isTyping = (target) => Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));

const dayName = (key, now) => relativeName(key, now).toLowerCase() || shortDay(key, now);

export default function DayPage({ onSignOut }) {
  const params = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const now = useMinuteClock(true);
  const { notify, dismiss } = useToast();
  const { theme: mode, toggleTheme } = useThemeMode();

  const routeKey = params.dayKey;
  const validRoute = !routeKey || isDayKey(routeKey);
  const dayKey = routeKey && validRoute ? routeKey : today;

  const go = useCallback((key) => navigate(key === today ? '/' : `/day/${key}`), [navigate, today]);
  const goPrev = useCallback(() => go(addDays(dayKey, -1)), [go, dayKey]);
  const goNext = useCallback(() => go(addDays(dayKey, 1)), [go, dayKey]);
  const goToday = useCallback(() => go(today), [go, today]);

  const tasks = useDayTasks(dayKey, today);
  const { state: noteState, store: noteStore } = useDayNote(dayKey);
  useUnsavedInkGuard();
  useWakeLock(true);

  const inkRef = useRef(null);
  const [crop, setCrop] = useState(null);
  const [touchDraws, setTouchDraws] = useState(true);
  const [idle, wake] = useIdle(DOCK_AFTER_MS);

  // ── Tasks ──────────────────────────────────────────────────────────────
  const handleToggle = useCallback(
    async (task) => {
      try {
        await tasks.toggleDone(task);
      } catch {
        notify(isDone(task) ? 'Couldn’t reopen that task. Nothing was changed.' : 'Couldn’t tick that off. Nothing was changed.', {
          tone: 'error',
        });
      }
    },
    [tasks, notify]
  );

  const handleMove = useCallback(
    async (task) => {
      const target = nextDayKey(dayKey);
      try {
        const moved = await tasks.moveTo(task, target);
        let toastId = null;
        const undo = async () => {
          dismiss(toastId);
          try {
            await tasks.restoreDue(moved, task);
          } catch {
            notify('Couldn’t move it back.', { tone: 'error' });
          }
        };
        toastId = notify(`Moved to ${dayName(target, now)}.`, {
          action: (
            <Button color="inherit" size="small" onClick={undo} sx={{ minHeight: 44 }}>
              Undo
            </Button>
          ),
        });
      } catch {
        notify('Couldn’t move that task. Nothing was changed.', { tone: 'error' });
      }
    },
    [tasks, dayKey, notify, dismiss, now]
  );

  /** Create from a reading (typed or circled). Returns true when the task exists. */
  const createFrom = useCallback(
    async (reading, clientId) => {
      const created = await tasks.addTask(reading.input, clientId);
      if (!landsOn(created, dayKey)) notify(`Added for ${dayName(reading.dayKey, now)}.`, { tone: 'success' });
      return created;
    },
    [tasks, dayKey, notify, now]
  );

  // One idempotency key per typed line, kept across a failed attempt so a retry cannot make two.
  const typed = useRef({ text: '', clientId: '' });
  const handleAdd = useCallback(
    async (reading, text) => {
      if (typed.current.text !== text) typed.current = { text, clientId: newClientId() };
      try {
        await createFrom(reading, typed.current.clientId);
        typed.current = { text: '', clientId: '' };
        return true;
      } catch {
        notify('The task wasn’t added. Check the connection and try again.', { tone: 'error' });
        return false;
      }
    },
    [createFrom, notify]
  );

  // ── Circle to task ─────────────────────────────────────────────────────
  const closeCrop = useCallback(() => {
    setCrop(null);
    inkRef.current?.clearLasso?.();
  }, []);

  const handleCreateFromInk = useCallback(
    async (reading, clientId) => {
      const created = await createFrom(reading, clientId); // a failure is shown by the dialog, which stays open
      closeCrop();
      if (landsOn(created, dayKey)) notify('Task created.', { tone: 'success' });
    },
    [createFrom, closeCrop, dayKey, notify]
  );

  const handleLassoError = useCallback((message) => notify(message, { tone: 'warning' }), [notify]);

  // A circled crop belongs to the day it was circled on.
  useEffect(() => {
    setCrop(null);
  }, [dayKey]);

  // ── Moving between days ────────────────────────────────────────────────
  const pageRef = useRef(null);
  useSwipe(pageRef, {
    onLeft: goNext,
    onRight: goPrev,
    // A finger that draws is writing, not turning the page; so is one in a text field.
    ignore: (target) => isTyping(target) || (touchDraws && Boolean(target?.closest?.('[data-testid="ink-canvas"]'))),
    enabled: !idle && !crop,
  });

  useEffect(() => {
    const onKey = (event) => {
      if (idle || crop || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTyping(event.target) || event.target?.closest?.('[role="dialog"], [role="menu"]')) return;
      if (event.key === 'ArrowLeft') goPrev();
      else if (event.key === 'ArrowRight') goNext();
      else if (event.key === 't' || event.key === 'T') goToday();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idle, crop, goPrev, goNext, goToday]);

  useEffect(() => {
    document.title = dayKey === today ? 'GeekDay' : `${shortDay(dayKey, now)} · GeekDay`;
  }, [dayKey, today, now]);

  if (!validRoute) return <Navigate to="/" replace />;

  const dayLabel = `${weekdayName(dayKey)}, ${monthDay(dayKey)}`;

  return (
    <Box
      ref={pageRef}
      data-testid="day-page"
      data-day={dayKey}
      // While docked the page is inert: nothing under the clock face can be focused or announced.
      inert={idle ? '' : undefined}
      sx={{
        height: '100vh',
        '@supports (height: 100dvh)': { height: '100dvh' },
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
        overflow: 'hidden',
      }}
    >
      <DayHeader
        dayKey={dayKey}
        today={today}
        now={now}
        onPrev={goPrev}
        onNext={goNext}
        onToday={goToday}
        noteId={noteState.noteId}
        mode={mode}
        onToggleMode={toggleTheme}
        onSignOut={onSignOut}
      />

      <Box
        component="main"
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gap: { xs: 1, sm: 1.5 },
          px: { xs: 1, sm: 2 },
          pb: 'max(12px, env(safe-area-inset-bottom))',
          // Side by side from a portrait tablet up (the designed size); stacked below that so a phone is not broken.
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(248px, 34%) minmax(0, 1fr)', lg: '360px minmax(0, 1fr)' },
          gridTemplateRows: { xs: 'minmax(0, 42%) minmax(0, 1fr)', sm: 'minmax(0, 1fr)' },
        }}
      >
        <Agenda dayKey={dayKey} today={today} tasks={tasks} onToggle={handleToggle} onMove={handleMove} onAdd={handleAdd} now={now} />
        <InkPane
          key={dayKey}
          dayLabel={dayLabel}
          state={noteState}
          store={noteStore}
          inkRef={inkRef}
          onLasso={setCrop}
          onLassoError={handleLassoError}
          onTouchDrawsChange={setTouchDraws}
        />
      </Box>

      <ConfirmTaskDialog crop={crop} dayKey={dayKey} now={now} onClose={closeCrop} onCreate={handleCreateFromInk} />
      {/* Outside the inert page, or the clock face could not be touched either. */}
      {idle ? createPortal(<DockedView today={today} onWake={wake} />, document.body) : null}
    </Box>
  );
}
