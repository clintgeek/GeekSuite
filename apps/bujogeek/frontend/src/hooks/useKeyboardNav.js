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
 *
 * @param {Object} opts
 * @param {Array}  opts.tasks     — flat ordered array of tasks
 * @param {Function} opts.onToggle  — (task) => toggle complete
 * @param {Function} opts.onEdit    — (task) => open editor
 * @param {Function} opts.onDelete  — (task) => delete (should confirm)
 * @param {boolean}  opts.enabled   — false to suppress all shortcuts
 *
 * @returns {{ focusedIndex, focusedTaskId, setFocusedIndex, clearFocus }}
 */
const useKeyboardNav = ({ tasks = [], onToggle, onEdit, onDelete, enabled = true }) => {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  // Clamp focused index when task list shrinks (e.g. after delete/complete)
  useEffect(() => {
    setFocusedIndex((prev) => {
      if (prev < 0) return prev;
      if (tasks.length === 0) return -1;
      if (prev >= tasks.length) return tasks.length - 1;
      return prev;
    });
  }, [tasks.length]);

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

  const clearFocus = useCallback(() => setFocusedIndex(-1), []);

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

      switch (e.key) {
        case 'j': {
          e.preventDefault();
          setFocusedIndex((prev) => {
            if (list.length === 0) return -1;
            if (prev < 0) return 0; // first press enters the list
            return Math.min(prev + 1, list.length - 1);
          });
          break;
        }
        case 'k': {
          e.preventDefault();
          setFocusedIndex((prev) => {
            if (list.length === 0) return -1;
            if (prev < 0) return 0;
            return Math.max(prev - 1, 0);
          });
          break;
        }
        case 'x': {
          setFocusedIndex((prev) => {
            if (prev >= 0 && prev < list.length) {
              e.preventDefault();
              onToggle?.(list[prev]);
            }
            return prev;
          });
          break;
        }
        case 'e': {
          setFocusedIndex((prev) => {
            if (prev >= 0 && prev < list.length) {
              e.preventDefault();
              onEdit?.(list[prev]);
            }
            return prev;
          });
          break;
        }
        case 'd': {
          setFocusedIndex((prev) => {
            if (prev >= 0 && prev < list.length) {
              e.preventDefault();
              onDelete?.(list[prev]);
            }
            return prev;
          });
          break;
        }
        case 'Escape': {
          setFocusedIndex(-1);
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onToggle, onEdit, onDelete]);

  const focusedTask = focusedIndex >= 0 ? tasks[focusedIndex] : null;
  const focusedTaskId = focusedTask ? (focusedTask.id || focusedTask._id) : null;

  return { focusedIndex, focusedTaskId, setFocusedIndex, clearFocus };
};

export default useKeyboardNav;
