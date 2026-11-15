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
 * ## Loading, and when it fails (plan 1.12, 5.14)
 * `loaded` turns true only after a read that worked; a failed read sets
 * `loadError` instead (the page says "Couldn't reach your list · Retry", with
 * `refresh` as the retry) and never empties a list that was showing. The list
 * is re-read on focus, on return to the tab, when the connection comes back
 * and every few minutes while visible — throttled, so a burst of those events
 * is one read.
 *
 * ## Adding under a tag filter (plan 1.15)
 * With a tag filter on, a new task gets that tag (`pendingTag`), so it does
 * not vanish from the list it was typed into. The add box shows it as a
 * removable `#tag`; `dismissPendingTag()` leaves it off for the next add.
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
import { normalizeTag } from '@geeksuite/tags';
import { useReducedMotion, useToast } from '@geeksuite/ui';
import { useTaskContext } from './TaskContext.jsx';
import { newClientId } from '../utils/clientId.js';
import { useAuth } from './AuthContext';
import { PrivacyProvider } from './PrivacyContext.jsx';
import { CREATE_NOTE } from '../graphql/notegeekMutations';
import { dueDateOn, filterByTag, isDone, taskId } from '../utils/penViews';
import { hasDueTime as isTimed } from '../utils/dueDate';

export const UNDO_MS = 6000;
export const SETTLE_MS = 700;
/** Return to the tab / window focus: re-read if the last read is older than this. */
export const REFRESH_AFTER_MS = 30 * 1000;
/** A visible tab re-reads this often by itself, so another device's change shows. */
export const POLL_VISIBLE_MS = 5 * 60 * 1000;
/** Back online: re-read, but not more than once in this window. */
const ONLINE_THROTTLE_MS = 5 * 1000;
/** A read dropped because writes kept overlapping it is tried again after this. */
const STALE_RETRY_MS = 1500;

/** A network failure or timeout, as opposed to the server saying no. */
const isTransient = (err) => {
  if (!err) return false;
  if (err.name === 'TimeoutError' || err.timeout) return true;
  const net = err.networkError;
  if (!net) return false;
  if (net.name === 'TimeoutError' || net.timeout) return true;
  const code = net.statusCode;
  return code === undefined || code === 0 || code >= 500;
};

const PenContext = createContext(null);

export function usePen() {
  const ctx = useContext(PenContext);
  if (!ctx) throw new Error('usePen must be used within a PenProvider');
  return ctx;
}

export function PenProvider({ children }) {
  const {
    tasks, fetchTasks, createTask, updateTask, updateTaskStatus, deleteTask,
    error: taskError, clearError, skipEarlierOccurrences,
  } = useTaskContext();
  const { user } = useAuth();
  const { notify, dismiss } = useToast();
  const reducedMotion = useReducedMotion();
  const [createNote] = useMutation(CREATE_NOTE);

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [pendingTagDismissed, setPendingTagDismissed] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [hidden, setHidden] = useState(() => new Set());
  const [settling, setSettling] = useState(() => new Set());
  const [tagFilter, setTagFilter] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const lastFetch = useRef(0);
  const deleteTimers = useRef(new Map());
  const staleTimer = useRef(null);
  // The clientId of an add that failed, keyed by what was typed, so sending
  // the same line again is a RETRY of that create, not a second task (C1).
  const failedAdd = useRef(null);

  /**
   * Re-read the list. Resolves true when it was read. A failure leaves the
   * list as it was and sets `loadError`; a read that kept overlapping local
   * writes (TaskContext drops those, plan 1.9) is tried again shortly.
   */
  const refresh = useCallback(async () => {
    lastFetch.current = Date.now();
    clearTimeout(staleTimer.current);
    const result = await fetchTasks('year');
    const status = result?.status ?? 'ok';
    if (status === 'ok') {
      setNow(new Date());
      setLoadError(null);
      setLoaded(true);
      return true;
    }
    if (status === 'error') {
      setLoadError({ message: "Couldn't reach your list.", error: result.error ?? null });
      return false;
    }
    if (status === 'stale') {
      staleTimer.current = setTimeout(() => { refresh(); }, STALE_RETRY_MS);
    }
    return false;
  }, [fetchTasks]);

  useEffect(() => () => clearTimeout(staleTimer.current), []);

  // TaskContext renders nothing of its own (it sits outside the toast
  // provider); its errors are said here, once each.
  useEffect(() => {
    if (!taskError) return;
    notify(typeof taskError === 'string' ? taskError : taskError.message, { tone: 'error' });
    clearError?.();
  }, [taskError, notify, clearError]);

  // Keyed on WHO, not on the user object, which a provider may rebuild.
  const signedIn = user ? String(user.id ?? user._id ?? user.username ?? 'yes') : null;
  useEffect(() => {
    if (signedIn) refresh();
  }, [signedIn, refresh]);

  // Another device may have changed the list (plan 5.14). Re-read on return
  // to the tab, on window focus (a desktop tab that never hid), when the
  // connection comes back, and every POLL_VISIBLE_MS while visible —
  // throttled, so one return that fires focus AND visibilitychange is one read.
  useEffect(() => {
    if (!signedIn) return undefined;
    const since = () => Date.now() - lastFetch.current;
    const onBack = () => {
      if (document.visibilityState === 'hidden') return;
      setNow(new Date());
      if (since() > REFRESH_AFTER_MS) refresh();
    };
    const onOnline = () => {
      if (since() > ONLINE_THROTTLE_MS) refresh();
    };
    const poll = setInterval(() => {
      if (document.visibilityState !== 'hidden' && since() >= POLL_VISIBLE_MS - 1000) refresh();
    }, POLL_VISIBLE_MS);
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('focus', onBack);
      window.removeEventListener('online', onOnline);
    };
  }, [signedIn, refresh]);

  // Midnight: a page left open (a desktop tab, a PWA in the foreground) moves
  // to the new day by itself — Today's sections, and the day its manual
  // order is read and saved under (hooks/useDailyOrder.js). Re-armed from
  // each new `now`, so it also corrects itself after a sleep.
  useEffect(() => {
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const timer = setTimeout(() => setNow(new Date()), Math.max(1000, next.getTime() - Date.now()));
    return () => clearTimeout(timer);
  }, [now]);

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

  // 1.15: the tag a new task will get — the active filter's, unless the add
  // box took it off. A new filter brings it back.
  useEffect(() => { setPendingTagDismissed(false); }, [tagFilter]);
  const pendingTag = tagFilter && !pendingTagDismissed ? normalizeTag(String(tagFilter)) || null : null;
  const dismissPendingTag = useCallback(() => setPendingTagDismissed(true), []);
  const restorePendingTag = useCallback(() => setPendingTagDismissed(false), []);

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
    // D3: ticking a repeat's late (or today's, already-come-round) row skips
    // the misses behind it — the gateway stops expanding them, and this
    // takes the ones on screen away now rather than at the next read.
    const due = task.dueDate ? new Date(task.dueDate).getTime() : NaN;
    if (completing && task.seriesId && due <= Date.now()) skipEarlierOccurrences?.(task.seriesId, task.dueDate);
    offerUndo(completing ? 'Done.' : 'Back on the list.', () => {
      updateTaskStatus(newId, previous);
    });
    return newId;
  }, [setStatus, settle, offerUndo, updateTaskStatus, skipEarlierOccurrences]);

  const moveTo = useCallback(async (task, targetKey, { label } = {}) => {
    const id = taskId(task);
    const before = task.dueDate ?? null;
    const dueDate = targetKey ? dueDateOn(task, targetKey) : null;
    let updated;
    try {
      // Optimistic (3.18): the row goes to its new day at once and comes back
      // only if the server says no.
      updated = await updateTask(id, { dueDate }, 'THIS_INSTANCE', { optimistic: true });
    } catch {
      return null; // TaskContext has already said so
    }
    const newId = taskId(updated) || id;
    offerUndo(label || (targetKey ? 'Moved.' : 'Moved to Anytime.'), () => {
      // The stored value goes back with the flag it had (a legacy date-only
      // value is an ISO midnight, which by its shape would read as timed).
      updateTask(newId, { dueDate: before, hasDueTime: isTimed(task) }, 'THIS_INSTANCE', { optimistic: true }).catch(() => {});
    });
    return newId;
  }, [updateTask, offerUndo]);

  const moveToTomorrow = useCallback(
    (task) => moveTo(task, localDateString(addDays(new Date(), 1)), { label: 'Moved to tomorrow.' }),
    [moveTo],
  );

  /**
   * "Move all to today": every row moves at once (optimistic) and the writes
   * go out together, not one round trip after another (3.18). A row the
   * server refuses goes back by itself; the rest stay moved.
   */
  const moveAllToToday = useCallback(async (list) => {
    const todayKey = localDateString(new Date());
    const results = await Promise.allSettled(list.map((task) => (
      updateTask(taskId(task), { dueDate: dueDateOn(task, todayKey) }, 'THIS_INSTANCE', { optimistic: true })
        .then((updated) => ({ id: taskId(updated) || taskId(task), before: task.dueDate ?? null, hasDueTime: isTimed(task) }))
    )));
    const moved = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    if (!moved.length) return 0;
    offerUndo(moved.length === 1 ? 'Moved 1 to today.' : `Moved ${moved.length} to today.`, () => {
      moved.forEach(({ id, before, hasDueTime }) => (
        updateTask(id, { dueDate: before, hasDueTime }, 'THIS_INSTANCE', { optimistic: true }).catch(() => {})
      ));
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
  const add = useCallback(async (rawInput, { noteGeekNote, where, applyTag = true } = {}) => {
    // 1.15: the active filter's tag goes on, unless the add box took it off.
    let input = rawInput;
    const tagged = (tags, tag) => (tags || []).some((t) => normalizeTag(String(t)) === tag);
    if (applyTag && pendingTag && !tagged(input.tags, pendingTag)) {
      input = { ...input, tags: [...(input.tags || []), pendingTag] };
    }

    // C1: one clientId per thing typed. Sending the same line again after a
    // failure reuses it, so a create that did land is not made twice.
    const signature = JSON.stringify({ ...input, clientId: undefined });
    const clientId = input.clientId
      || (failedAdd.current?.signature === signature ? failedAdd.current.clientId : newClientId());
    input = { ...input, clientId };

    let created;
    try {
      try {
        created = await createTask(input);
      } catch (err) {
        // A timeout or a dropped connection may have landed: ask again with
        // the SAME clientId; the gateway answers with the task it made.
        if (!isTransient(err)) throw err;
        created = await createTask(input);
      }
    } catch {
      failedAdd.current = { signature, clientId };
      return null;
    }
    failedAdd.current = null;
    setPendingTagDismissed(false);

    // A repeating task comes back as its series master, which no list shows;
    // its rows are occurrences, so read them (plan 1.6).
    if (created?.isSeriesMaster) refresh();

    if (tagFilter && !tagged(input.tags, normalizeTag(String(tagFilter)))) {
      // Added without the filter's tag (it was taken off): say where it went.
      notify(`Added, not tagged #${normalizeTag(String(tagFilter))}.`, {
        tone: 'info',
        action: (
          <Button
            onClick={() => setTagFilter(null)}
            color="inherit"
            sx={{ minHeight: 44, minWidth: 64, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: '3px' }}
          >
            Show
          </Button>
        ),
      });
    }
    if (noteGeekNote) {
      createNote({ variables: { title: input.content, content: noteGeekNote, type: 'text', tags: input.tags || [] } })
        .then(() => notify('Note saved to NoteGeek.', { tone: 'info' }))
        .catch(() => notify('Could not save the note to NoteGeek.', { tone: 'error' }));
    }
    if (where) {
      const id = taskId(created);
      // Undoing a repeat's add takes the whole series it made.
      const scope = created?.isSeriesMaster ? 'ALL_INSTANCES' : 'THIS_INSTANCE';
      offerUndo(`Added for ${where}.`, () => { deleteTask(id, scope); });
    }
    return created;
  }, [createTask, createNote, notify, offerUndo, deleteTask, pendingTag, tagFilter, refresh]);

  const value = useMemo(() => ({
    loaded,
    loadError,
    pendingTag,
    dismissPendingTag,
    restorePendingTag,
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
  }), [loaded, loadError, pendingTag, dismissPendingTag, restorePendingTag, now, corpus, visible, settling, tagFilter, helpOpen, refresh, toggleDone, moveTo, moveToTomorrow,
    moveAllToToday, remove, save, add, offerUndo]);

  return (
    <PenContext.Provider value={value}>
      <PrivacyProvider>{children}</PrivacyProvider>
    </PenContext.Provider>
  );
}

export default PenProvider;
