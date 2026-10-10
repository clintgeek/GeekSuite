/**
 * PenContext — the one task list behind Today, Upcoming, Done and Search, and
 * every change a row can make, each with an Undo.
 *
 * (DOCS/SIMPLE_PLAN.md, Phase 1 + "Red Pen".)
 *
 * ## One corpus
 * The four views are slices of the gateway's `allTasks`, loaded once through
 * `TaskContext.fetchTasks('year')` and kept current by TaskContext's own
 * optimistic patches (status, edits, creates, deletes). See
 * `utils/penViews.js` for why it is not `dailyTasks`. It is re-read when the
 * tab comes back after a minute away — TodoGeek is used in bursts.
 *
 * ## Undo, not "are you sure?"
 * Done, un-done, moved, moved-all, deleted and added all offer an Undo toast
 * for UNDO_MS. The inverse is recorded at the moment of the change (the
 * previous status, the previous due date), so Undo restores exactly what was
 * there. A delete is the one that cannot be inverted on the server, so it is
 * DEFERRED instead: the row is hidden at once and the mutation is sent when the
 * toast expires. Undo cancels it; a tab closed inside the window keeps the
 * task. Nothing is lost by hesitating.
 *
 * ## The cross-off
 * Ticking a task sends the status change immediately (optimistic, as before),
 * but the row stays where it was, drawn done, for SETTLE_MS — long enough for
 * the red strike to draw and the row to grey — and then leaves for Done. Under
 * `prefers-reduced-motion` the settle time is zero: no strike animation, the
 * row goes at once.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@mui/material';
import { useMutation } from '@apollo/client';
import { addDays } from 'date-fns';
import { localDateString } from '@geeksuite/utils';
import { useReducedMotion, useToast } from '@geeksuite/ui';
import { useTaskContext } from './TaskContext.jsx';
import { useAuth } from './AuthContext';
import { PrivacyProvider } from './PrivacyContext.jsx';
import { CREATE_NOTE } from '../graphql/notegeekMutations';
import { dueDateOn, filterByTag, isDone, taskId } from '../utils/penViews';

export const UNDO_MS = 6000;
export const SETTLE_MS = 700;
const REFRESH_AFTER_MS = 60 * 1000;

const PenContext = createContext(null);

export function usePen() {
  const ctx = useContext(PenContext);
  if (!ctx) throw new Error('usePen must be used within a PenProvider');
  return ctx;
}

export function PenProvider({ children }) {
  const {
    tasks, fetchTasks, createTask, updateTask, updateTaskStatus, deleteTask,
  } = useTaskContext();
  const { user } = useAuth();
  const { notify, dismiss } = useToast();
  const reducedMotion = useReducedMotion();
  const [createNote] = useMutation(CREATE_NOTE);

  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [hidden, setHidden] = useState(() => new Set());
  const [settling, setSettling] = useState(() => new Set());
  const [tagFilter, setTagFilter] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const lastFetch = useRef(0);
  const deleteTimers = useRef(new Map());

  const refresh = useCallback(async () => {
    lastFetch.current = Date.now();
    await fetchTasks('year');
    setNow(new Date());
    setLoaded(true);
  }, [fetchTasks]);

  // Keyed on WHO, not on the user object, which a provider may rebuild.
  const signedIn = user ? String(user.id ?? user._id ?? user.username ?? 'yes') : null;
  useEffect(() => {
    if (signedIn) refresh();
  }, [signedIn, refresh]);

  // Coming back to the tab: the day may have turned, and the list may have
  // changed on another device.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setNow(new Date());
      if (signedIn && Date.now() - lastFetch.current > REFRESH_AFTER_MS) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [signedIn, refresh]);

  // A pending delete is sent when its window closes, or now if we unmount.
  useEffect(() => () => {
    deleteTimers.current.forEach(({ timer, commit }) => { clearTimeout(timer); commit(); });
    deleteTimers.current.clear();
  }, []);

  /* ---------- the toast ---------- */

  const offerUndo = useCallback((message, undo) => {
    let toastId = null;
    const onUndo = () => {
      if (toastId !== null) dismiss(toastId);
      undo();
    };
    toastId = notify(message, {
      tone: 'info',
      duration: UNDO_MS,
      action: (
        <Button
          onClick={onUndo}
          color="inherit"
          sx={{ minHeight: 44, minWidth: 64, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: '3px' }}
        >
          Undo
        </Button>
      ),
    });
    return toastId;
  }, [notify, dismiss]);

  /* ---------- the list ---------- */

  const corpus = useMemo(() => {
    const list = Array.isArray(tasks) ? tasks : [];
    return hidden.size ? list.filter((t) => !hidden.has(taskId(t))) : list;
  }, [tasks, hidden]);

  const visible = useMemo(() => filterByTag(corpus, tagFilter), [corpus, tagFilter]);

  /* ---------- actions ---------- */

  const settle = useCallback((ids) => {
    if (reducedMotion) return;
    setSettling((prev) => new Set([...prev, ...ids]));
    setTimeout(() => {
      setSettling((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }, SETTLE_MS);
  }, [reducedMotion]);

  const setStatus = useCallback(async (task, status) => {
    const id = taskId(task);
    const server = await updateTaskStatus(id, status);
    if (!server) return null;
    return taskId(server) || id;
  }, [updateTaskStatus]);

  /** Tick or un-tick. Returns the id the task now has (a repeat's occurrence gets a real one). */
  const toggleDone = useCallback(async (task) => {
    const id = taskId(task);
    const previous = task.status || 'pending';
    const completing = !isDone(task);
    if (completing) settle([id]);
    const newId = await setStatus(task, completing ? 'completed' : 'pending');
    if (!newId) return null;
    if (completing && newId !== id) settle([newId]);
    offerUndo(completing ? 'Done.' : 'Back on the list.', () => {
      updateTaskStatus(newId, previous);
    });
    return newId;
  }, [setStatus, settle, offerUndo, updateTaskStatus]);

  const moveTo = useCallback(async (task, targetKey, { label } = {}) => {
    const id = taskId(task);
    const before = task.dueDate ?? null;
    const dueDate = targetKey ? dueDateOn(task, targetKey) : null;
    let updated;
    try {
      updated = await updateTask(id, { dueDate });
    } catch {
      return null; // TaskContext has already said so
    }
    const newId = taskId(updated) || id;
    offerUndo(label || (targetKey ? 'Moved.' : 'Moved to Anytime.'), () => {
      updateTask(newId, { dueDate: before }).catch(() => {});
    });
    return newId;
  }, [updateTask, offerUndo]);

  const moveToTomorrow = useCallback(
    (task) => moveTo(task, localDateString(addDays(new Date(), 1)), { label: 'Moved to tomorrow.' }),
    [moveTo],
  );

  const moveAllToToday = useCallback(async (list) => {
    const todayKey = localDateString(new Date());
    const moved = [];
    for (const task of list) {
      const before = task.dueDate ?? null;
      try {
        const updated = await updateTask(taskId(task), { dueDate: dueDateOn(task, todayKey) });
        moved.push({ id: taskId(updated) || taskId(task), before });
      } catch {
        /* surfaced by TaskContext; keep going */
      }
    }
    if (!moved.length) return 0;
    offerUndo(moved.length === 1 ? 'Moved 1 to today.' : `Moved ${moved.length} to today.`, () => {
      moved.forEach(({ id, before }) => updateTask(id, { dueDate: before }).catch(() => {}));
    });
    return moved.length;
  }, [updateTask, offerUndo]);

  const remove = useCallback((task) => {
    const id = taskId(task);
    setHidden((prev) => new Set(prev).add(id));
    const unhide = () => setHidden((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    const repeat = task.seriesId || task.recurrenceRule || id.startsWith('virtual_');
    const commit = async () => {
      deleteTimers.current.delete(id);
      const ok = await deleteTask(id, repeat ? 'THIS_INSTANCE' : null);
      if (!ok) unhide();
    };
    const timer = setTimeout(commit, UNDO_MS);
    deleteTimers.current.set(id, { timer, commit });
    offerUndo('Deleted.', () => {
      const pending = deleteTimers.current.get(id);
      if (pending) clearTimeout(pending.timer);
      deleteTimers.current.delete(id);
      unhide();
    });
  }, [deleteTask, offerUndo]);

  /** Save an inline edit. `fields` is what changed; `editScope` for repeats. */
  const save = useCallback(async (task, fields, editScope = 'THIS_INSTANCE') => {
    try {
      const updated = await updateTask(taskId(task), fields, editScope);
      return updated || null;
    } catch {
      return null;
    }
  }, [updateTask]);

  /**
   * Add from the add box. Offers Undo only when the new task lands somewhere
   * other than the page you are looking at, so the toast also says where.
   */
  const add = useCallback(async (input, { noteGeekNote, where } = {}) => {
    let created;
    try {
      created = await createTask(input);
    } catch {
      return null;
    }
    if (noteGeekNote) {
      createNote({ variables: { title: input.content, content: noteGeekNote, type: 'text', tags: input.tags || [] } })
        .then(() => notify('Note saved to NoteGeek.', { tone: 'info' }))
        .catch(() => notify('Could not save the note to NoteGeek.', { tone: 'error' }));
    }
    if (where) {
      const id = taskId(created);
      offerUndo(`Added for ${where}.`, () => { deleteTask(id, 'THIS_INSTANCE'); });
    }
    return created;
  }, [createTask, createNote, notify, offerUndo, deleteTask]);

  const value = useMemo(() => ({
    loaded,
    now,
    corpus,
    visible,
    settling,
    tagFilter,
    setTagFilter,
    helpOpen,
    setHelpOpen,
    refresh,
    toggleDone,
    moveTo,
    moveToTomorrow,
    moveAllToToday,
    remove,
    save,
    add,
    offerUndo,
  }), [loaded, now, corpus, visible, settling, tagFilter, helpOpen, refresh, toggleDone, moveTo, moveToTomorrow,
    moveAllToToday, remove, save, add, offerUndo]);

  return (
    <PenContext.Provider value={value}>
      <PrivacyProvider>{children}</PrivacyProvider>
    </PenContext.Provider>
  );
}

export default PenProvider;
