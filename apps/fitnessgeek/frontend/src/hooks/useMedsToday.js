import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { medsService } from '../services/medsService.js';
import { medsChecklist } from '../utils/checkIns.js';
import { errorMessage } from '../utils/errorMessage.js';
import { useToday } from './useToday.js';

/**
 * Today's doses: "Did you take your meds?" (SIMPLE_AND_FULL_PLAN.md item 6).
 *
 * The dose log has existed on the backend all along (`POST /meds/:id/logs`,
 * `GET /meds/logs/by-date`) with no UI calling it, so "did I take my pills?"
 * was unanswerable (the 2026-09-20 accuracy sweep). This is that UI's data.
 *
 * A tick writes `taken: true`; an untick writes `taken: false`. The latest
 * answer for a dose is the answer — see `medsChecklist`.
 *
 * With no `date`, the hook follows `useToday()`, so a PWA resumed the next
 * morning ticks today's dose, not yesterday's (REVIEW_2026-10 B3).
 *
 * Any screen that adds, edits or removes a medication calls
 * `announceMedsChanged()`; every mounted checklist reloads (B15). Before, a
 * deleted med stayed in Home's checklist and 404'd on tick.
 */
export const MEDS_CHANGED_EVENT = 'fg:meds-changed';

export function announceMedsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(MEDS_CHANGED_EVENT));
}

const asArray = (value) => (Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : []);

export function useMedsToday(dateArg) {
  const today = useToday();
  const date = dateArg || today;
  const [meds, setMeds] = useState([]);
  const [logs, setLogs] = useState([]);
  // The day the held dose logs were READ for (null: no good read yet). A
  // failed dose-log read is not "nothing taken": with no good read for this
  // day the ticks are unknown, never "0 of 3" — she could take a dose twice
  // (SUITE_REVIEW_2026-11 FitnessGeek #3).
  const [logsFor, setLogsFor] = useState(null);
  const logsForRef = useRef(null);
  const [ticksError, setTicksError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    window.addEventListener(MEDS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(MEDS_CHANGED_EVENT, reload);
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([medsService.list(), medsService.getLogsByDate(date)]).then(([m, l]) => {
      if (cancelled) return;
      // A failed list read keeps what was there and says so, rather than
      // looking like "no medicines".
      if (m.status === 'fulfilled') {
        setMeds(asArray(m.value));
        setLoadError(null);
      } else {
        setLoadError(errorMessage(m.reason, 'Couldn’t load your meds. Try again.'));
      }
      if (l.status === 'fulfilled') {
        setLogs(asArray(l.value));
        logsForRef.current = date;
        setLogsFor(date);
        setTicksError(null);
      } else {
        // Same day: keep the ticks last read and say the refresh failed.
        // Another day (or never read): drop them — they are unknown.
        if (logsForRef.current !== date) {
          setLogs([]);
          logsForRef.current = null;
          setLogsFor(null);
        }
        setTicksError(errorMessage(l.reason, 'Couldn’t check which doses are ticked. Try again.'));
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [date, version]);

  const checklist = useMemo(() => medsChecklist(meds, logs), [meds, logs]);

  const toggle = useCallback(async (item) => {
    if (!item) return false;
    const taken = !item.taken;
    const optimistic = {
      medication_id: item.medId,
      time_of_day: item.slot,
      taken,
      // Sorts after everything already loaded, so it is "the latest answer".
      created_at: new Date().toISOString(),
      _optimistic: true,
    };
    setLogs((prev) => [...prev, optimistic]);
    setSaving(item.key);
    setError(null);
    try {
      const saved = await medsService.log(item.medId, { date, time_of_day: item.slot, taken });
      setLogs((prev) => prev.map((log) => (log === optimistic ? { ...optimistic, ...(saved || {}), _optimistic: false } : log)));
      return true;
    } catch (err) {
      setLogs((prev) => prev.filter((log) => log !== optimistic));
      setError(errorMessage(err, `Couldn’t save ${item.name}. Try again.`));
      return false;
    } finally {
      setSaving(null);
    }
  }, [date]);

  // Unknown = no good dose-log read for THIS day. Callers show "couldn't
  // check" with a retry, never the count.
  const ticksUnknown = !loading && logsFor !== date;

  return { ...checklist, date, loading, loadError, ticksUnknown, ticksError, saving, error, toggle, reload };
}

export default useMedsToday;
