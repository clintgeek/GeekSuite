import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { GET_HABITS, GET_HABIT_LOGS } from '../graphql/queries';
import {
  CREATE_HABIT,
  UPDATE_HABIT,
  DELETE_HABIT,
  TOGGLE_HABIT_LOG,
} from '../graphql/mutations';

/**
 * useHabits — the user's habits plus the log window the tracker grid renders.
 *
 * Deliberately separate from TaskContext: a habit is not a task. It never
 * enters the daily log, is never completed once, and its state for a day is
 * simply whether a log exists.
 *
 * The grid needs toggling to feel instant, so `toggle` is optimistic: the cell
 * flips locally first, then reconciles against what the server says the day now
 * is. A failure rolls the cell back and rethrows so the page can toast.
 * Overrides survive until the log window changes, which keeps a week's worth of
 * taps stable without a refetch per tap.
 */

/** `yyyy-MM-dd` from a Date, read in the local calendar (what the user sees). */
export const toDateKey = (date) => {
  const d = new Date(date);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

const cellKey = (habitId, dateKey) => `${habitId}|${dateKey}`;

const useHabits = ({ startDate, endDate, skip = false } = {}) => {
  const {
    data: habitData,
    loading: habitsLoading,
    error,
    refetch: refetchHabits,
  } = useQuery(GET_HABITS, {
    variables: { includeArchived: true },
    fetchPolicy: 'cache-and-network',
    skip,
  });

  const windowReady = Boolean(startDate && endDate);
  const { data: logData, loading: logsLoading } = useQuery(GET_HABIT_LOGS, {
    variables: { startDate, endDate },
    fetchPolicy: 'cache-and-network',
    skip: skip || !windowReady,
  });

  const [createMutation] = useMutation(CREATE_HABIT);
  const [updateMutation] = useMutation(UPDATE_HABIT);
  const [deleteMutation] = useMutation(DELETE_HABIT);
  const [toggleMutation] = useMutation(TOGGLE_HABIT_LOG);

  // Optimistic cell state, layered over whatever the server last told us.
  const [overrides, setOverrides] = useState({});
  useEffect(() => {
    setOverrides({});
  }, [startDate, endDate]);

  const habits = useMemo(() => habitData?.habits ?? [], [habitData]);
  const active = useMemo(() => habits.filter((h) => !h.archived), [habits]);
  const archived = useMemo(() => habits.filter((h) => h.archived), [habits]);

  const serverDone = useMemo(() => {
    const set = new Set();
    for (const log of logData?.habitLogs ?? []) {
      set.add(cellKey(log.habitId, String(log.date).slice(0, 10)));
    }
    return set;
  }, [logData]);

  const isDone = useCallback(
    (habitId, dateKey) => {
      const key = cellKey(habitId, dateKey);
      if (key in overrides) return overrides[key];
      return serverDone.has(key);
    },
    [overrides, serverDone]
  );

  const toggle = useCallback(
    async (habitId, dateKey) => {
      const key = cellKey(habitId, dateKey);
      const previous = key in overrides ? overrides[key] : serverDone.has(key);
      setOverrides((prev) => ({ ...prev, [key]: !previous }));
      try {
        const res = await toggleMutation({ variables: { habitId, date: dateKey } });
        // Trust the server's answer over our guess — they agree in every
        // ordinary case, and disagree only if the day was already toggled
        // somewhere else. The habit's new streak rides along in the payload and
        // lands in the normalised cache on its own.
        const done = res.data?.toggleHabitLog?.done;
        if (typeof done === 'boolean') {
          setOverrides((prev) => ({ ...prev, [key]: done }));
        }
        return done;
      } catch (err) {
        setOverrides((prev) => ({ ...prev, [key]: previous }));
        throw err;
      }
    },
    [overrides, serverDone, toggleMutation]
  );

  const createHabit = useCallback(
    async ({ name, daysOfWeek, color }) => {
      const res = await createMutation({
        variables: { name, daysOfWeek: daysOfWeek ?? [], color: color ?? null },
      });
      await refetchHabits();
      return res.data?.createHabit;
    },
    [createMutation, refetchHabits]
  );

  const updateHabit = useCallback(
    async (id, updates) => {
      const res = await updateMutation({ variables: { id, ...updates } });
      await refetchHabits();
      return res.data?.updateHabit;
    },
    [updateMutation, refetchHabits]
  );

  const deleteHabit = useCallback(
    async (id) => {
      const res = await deleteMutation({ variables: { id } });
      await refetchHabits();
      return res.data?.deleteHabit;
    },
    [deleteMutation, refetchHabits]
  );

  return {
    habits,
    active,
    archived,
    loading: habitsLoading || logsLoading,
    error,
    isDone,
    toggle,
    createHabit,
    updateHabit,
    deleteHabit,
    refetch: refetchHabits,
  };
};

export default useHabits;
