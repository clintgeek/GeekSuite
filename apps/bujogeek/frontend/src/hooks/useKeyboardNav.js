import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * useKeyboardNav — vim-style keyboard navigation for task lists.
 *
 * j/k    move focus up/down through the list
 * x      toggle complete on the focused task
 * e      open edit on the focused task
 * d      delete the focused task (caller should confirm)
 * Escape clear focus
 *
 * Automatically suppresses when the user is typing in an input, textarea,
 * contentEditable, or when the hook is disabled (e.g. a modal is open).
 * Scrolls the focused row into view.
 */
const useKeyboardNav = ({ tasks = [], onToggle, onEdit, onDelete, enabled = true }) => {
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // Refs keep the handler's closure always-current without re-registering the listener
  const focusedIndexRef = useRef(-1);
  const tasksRef = useRef(tasks);
  const callbacksRef = useRef({ onToggle, onEdit, onDelete });

  tasksRef.current = tasks;
  callbacksRef.current = { onToggle, onEdit, onDelete };

  // Sync ref when state changes
  const setFocus = useCallback((valueOrFn) => {
    setFocusedIndex((prev) => {
      const next = typeof valueOrFn === 'function' ? valueOrFn(prev) : valueOrFn;
      focusedIndexRef.current = next;
      return next;
    });
  }, []);

  // Clamp focused index when task list shrinks (e.g. after delete/complete)
  useEffect(() => {
    setFocus((prev) => {
      if (prev < 0) return prev;
      if (tasks.length === 0) return -1;
      if (prev >= tasks.length) return tasks.length - 1;
      return prev;
    });
  }, [tasks.length, setFocus]);

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

  const clearFocus = useCallback(() => setFocus(-1), [setFocus]);

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
      const idx = focusedIndexRef.current;
      const { onToggle: toggle, onEdit: edit, onDelete: del } = callbacksRef.current;

      switch (e.key) {
        case 'j': {
          e.preventDefault();
          setFocus((prev) => {
            if (list.length === 0) return -1;
            if (prev < 0) return 0;
            return Math.min(prev + 1, list.length - 1);
          });
          break;
        }
        case 'k': {
          e.preventDefault();
          setFocus((prev) => {
            if (list.length === 0) return -1;
            if (prev < 0) return 0;
            return Math.max(prev - 1, 0);
          });
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
        case 'Escape': {
          setFocus(-1);
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, setFocus]);

  const focusedTask = focusedIndex >= 0 ? tasks[focusedIndex] : null;
  const focusedTaskId = focusedTask ? (focusedTask.id || focusedTask._id) : null;

  return { focusedIndex, focusedTaskId, setFocusedIndex: setFocus, clearFocus };
};

export default useKeyboardNav;
