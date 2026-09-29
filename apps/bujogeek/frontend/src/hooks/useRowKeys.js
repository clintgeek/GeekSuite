import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useRowKeys — the desktop one-key actions on a list of task rows
 * (DOCS/SIMPLE_PLAN.md § "A task row"):
 *
 *   j / k   move focus down / up
 *   x       done (or not done)
 *   t       move to tomorrow
 *   d       pick a date
 *   e       edit inline (Enter does the same)
 *   Escape  clear focus
 *
 * Focus is tracked by TASK ID, never by position (DOCS/BUJOGEEK_REVIEW_2026-09
 * §4.3). Moving a task to tomorrow, or changing its priority, re-sorts the
 * list; an index would then point at whichever task slid into that slot and
 * the next `x` would tick the wrong one. The index is derived fresh from the id
 * on every key press. When the focused task leaves the list (done, moved off
 * the page) focus passes to whatever took its place, so `x x x` works down a
 * list.
 *
 * Ignored while typing, inside a dialog, with a modifier held, and for the
 * second key of a `g` chord (`g t` is "go to Today", not "move to tomorrow").
 */
const CHORD_WINDOW_MS = 800;

const ACTION_KEYS = { x: 'onDone', t: 'onTomorrow', d: 'onPickDate', e: 'onEdit', Enter: 'onEdit' };

const isTyping = (target) => {
  const tag = target?.tagName;
  return (
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
    Boolean(target?.isContentEditable) ||
    Boolean(target?.closest?.('[role="dialog"]'))
  );
};

export default function useRowKeys({ tasks = [], enabled = true, getId, ...actions }) {
  const idFor = useCallback((task) => (getId ? getId(task) : String(task?.id ?? task?._id ?? '')), [getId]);
  const [focusedId, setFocusedId] = useState(null);

  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const focusedRef = useRef(focusedId);
  focusedRef.current = focusedId;
  const lastIndexRef = useRef(-1);
  const lastGRef = useRef(0);

  const index = focusedId === null ? -1 : tasks.findIndex((t) => idFor(t) === focusedId);
  if (index >= 0) lastIndexRef.current = index;

  // The focused task left the list: hand focus to whatever took its place.
  useEffect(() => {
    if (focusedId === null) return;
    if (tasks.some((t) => idFor(t) === focusedId)) return;
    if (!tasks.length) { setFocusedId(null); return; }
    const at = Math.min(Math.max(lastIndexRef.current, 0), tasks.length - 1);
    setFocusedId(idFor(tasks[at]));
  }, [tasks, focusedId, idFor]);

  // Keep the focused row on screen. jsdom has no scrollIntoView.
  useEffect(() => {
    if (focusedId === null || typeof document === 'undefined') return;
    const el = document.querySelector(`[data-row-id="${CSS.escape(focusedId)}"]`);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [focusedId]);

  useEffect(() => {
    if (!enabled) return undefined;
    const handler = (e) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const list = tasksRef.current;
      const idx = focusedRef.current === null ? -1 : list.findIndex((t) => idFor(t) === focusedRef.current);

      if (e.key === 'g') { lastGRef.current = e.timeStamp || Date.now(); return; }
      const afterG = lastGRef.current && ((e.timeStamp || Date.now()) - lastGRef.current) < CHORD_WINDOW_MS;
      lastGRef.current = 0;
      if (afterG) return;

      if (e.key === 'j' || e.key === 'k') {
        if (!list.length) return;
        e.preventDefault();
        const next = idx < 0 ? 0 : Math.min(Math.max(idx + (e.key === 'j' ? 1 : -1), 0), list.length - 1);
        setFocusedId(idFor(list[next]));
        return;
      }
      if (e.key === 'Escape') { setFocusedId(null); return; }

      const action = ACTION_KEYS[e.key];
      if (!action || idx < 0) return;
      // Enter on a focused button inside a row is that button's, not ours.
      if (e.key === 'Enter' && e.target?.closest?.('button, a, [role="button"]')) return;
      e.preventDefault();
      actionsRef.current[action]?.(list[idx]);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, idFor]);

  const clearFocus = useCallback(() => setFocusedId(null), []);
  const focusedTaskId = index >= 0 ? focusedId : null;

  return { focusedTaskId, setFocusedTaskId: setFocusedId, clearFocus };
}
