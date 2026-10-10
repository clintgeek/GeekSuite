import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * useKeyboardNav — vim-style keyboard navigation for task lists.
 *
 * j/k    move focus up/down through the list
 * x      toggle complete on the focused task
 * e      open edit on the focused task
 * c      toggle cancelled on the focused task (strike as irrelevant)
 * d      delete the focused task (caller should confirm)
 * Escape clear focus
 *
 * Automatically suppresses when the user is typing in an input, textarea,
 * contentEditable, or when the hook is disabled (e.g. a modal is open).
 * Scrolls the focused row into view.
 */
const taskKey = (task) => (task ? task.id || task._id : null);

/**
 * FOCUS IS TRACKED BY TASK ID, NOT BY ARRAY INDEX.
 *
 * It used to be an index, re-clamped only when the list's LENGTH changed —
 * and the list is re-sorted whenever a task is edited (DOCS/SORTING_RULES.md:
 * priority and due date both move a row). Same length, different order, so
 * the index survived and pointed at a DIFFERENT task. Change a focused task's
 * priority and the next `x`, `d` or `c` acted on whichever row had slid into
 * that position: the wrong task completed, or deleted.
 *
 * Tracking identity makes focus follow the entry it is on, wherever the sort
 * puts it. The index is derived for j/k movement and for the
 * "the focused task disappeared" fallback, never stored as the source of
 * truth.
 */
const useKeyboardNav = ({ tasks = [], onToggle, onEdit, onDelete, onCancel, enabled = true }) => {
  const [focusedId, setFocusedId] = useState(null);

  // Refs keep the handler's closure always-current without re-registering the listener
  const tasksRef = useRef(tasks);
  const callbacksRef = useRef({ onToggle, onEdit, onDelete, onCancel });

  tasksRef.current = tasks;
  callbacksRef.current = { onToggle, onEdit, onDelete, onCancel };

  const focusedIndex = focusedId === null
    ? -1
    : tasks.findIndex((t) => taskKey(t) === focusedId);

  // Where focus WAS, so that a task leaving the list can hand focus to
  // whatever now occupies its place rather than dropping it entirely.
  // Mirrors `focusedId` for the keydown listener, which is registered once.
  const focusedIdRef = useRef(null);
  focusedIdRef.current = focusedId;

  const lastIndexRef = useRef(-1);
  if (focusedIndex >= 0) lastIndexRef.current = focusedIndex;

  const focusTaskAt = useCallback((index) => {
    const list = tasksRef.current;
    if (!list.length || index < 0) {
      setFocusedId(null);
      return;
    }
    const clamped = Math.min(index, list.length - 1);
    lastIndexRef.current = clamped;
    setFocusedId(taskKey(list[clamped]));
  }, []);

  // The focused task left the list — completed out of a filtered view,
  // deleted, migrated away. Hand focus to whatever took its place, which is
  // what the old index-clamping did by accident and is still the behaviour
  // worth keeping.
  useEffect(() => {
    if (focusedId === null) return;
    const stillHere = tasks.some((t) => taskKey(t) === focusedId);
    if (stillHere) return;
    if (tasks.length === 0) {
      setFocusedId(null);
      return;
    }
    const fallback = Math.min(lastIndexRef.current, tasks.length - 1);
    setFocusedId(taskKey(tasks[Math.max(fallback, 0)]));
  }, [tasks, focusedId]);

  // Scroll focused row into view
  useEffect(() => {
    if (focusedIndex < 0) return;
    const task = tasks[focusedIndex];
    if (!task) return;
    const id = task.id || task._id;
    const el = document.querySelector(`[data-task-id="${id}"]`);
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedIndex, tasks]);

  const clearFocus = useCallback(() => setFocusedId(null), []);

  useEffect(() => {
    if (!enabled) return;

    const handler = (e) => {
      // Don't intercept when typing
      const tag = e.target.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        e.target.isContentEditable ||
        e.target.closest('[role="dialog"]')
      ) {
        return;
      }

      // Don't intercept if a modifier key is held (let Cmd+K etc. pass through)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const list = tasksRef.current;
      // Derived fresh from the id every keystroke: the list may have been
      // re-sorted since the last one, and a remembered index would now point
      // somewhere else.
      const idx = focusedIdRef.current === null
        ? -1
        : list.findIndex((t) => taskKey(t) === focusedIdRef.current);
      const { onToggle: toggle, onEdit: edit, onDelete: del, onCancel: cancel } = callbacksRef.current;

      switch (e.key) {
        case 'j': {
          e.preventDefault();
          focusTaskAt(idx < 0 ? 0 : Math.min(idx + 1, list.length - 1));
          break;
        }
        case 'k': {
          e.preventDefault();
          focusTaskAt(idx < 0 ? 0 : Math.max(idx - 1, 0));
          break;
        }
        case 'x': {
          if (idx >= 0 && idx < list.length) {
            e.preventDefault();
            toggle?.(list[idx]);
          }
          break;
        }
        case 'e': {
          if (idx >= 0 && idx < list.length) {
            e.preventDefault();
            edit?.(list[idx]);
          }
          break;
        }
        case 'd': {
          if (idx >= 0 && idx < list.length) {
            e.preventDefault();
            del?.(list[idx]);
          }
          break;
        }
        case 'c': {
          if (idx >= 0 && idx < list.length) {
            e.preventDefault();
            cancel?.(list[idx]);
          }
          break;
        }
        case 'Escape': {
          setFocusedId(null);
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, focusTaskAt]);

  const focusedTask = focusedIndex >= 0 ? tasks[focusedIndex] : null;
  const focusedTaskId = focusedTask ? (focusedTask.id || focusedTask._id) : null;

  // Return shape unchanged — callers destructure `focusedTaskId` and
  // `clearFocus` only, but `setFocusedIndex` stays available and still takes
  // an index.
  return { focusedIndex, focusedTaskId, setFocusedIndex: focusTaskAt, clearFocus };
};

export default useKeyboardNav;
