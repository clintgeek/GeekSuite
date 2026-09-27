import { useCallback, useEffect, useMemo, useState } from 'react';
import { medsService } from '../services/medsService.js';
import { medsChecklist } from '../utils/checkIns.js';

/**
 * Today's doses: "Did you take your meds?" (SIMPLE_AND_FULL_PLAN.md item 6).
 *
 * The dose log has existed on the backend all along (`POST /meds/:id/logs`,
 * `GET /meds/logs/by-date`) with no UI calling it, so "did I take my pills?"
 * was unanswerable (the 2026-09-20 accuracy sweep). This is that UI's data.
 *
 * A tick writes `taken: true`; an untick writes `taken: false`. The latest
 * answer for a dose is the answer — see `medsChecklist`.
 */
const asArray = (value) => (Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : []);

export function useMedsToday(date) {
  const [meds, setMeds] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([medsService.list(), medsService.getLogsByDate(date)]).then(([m, l]) => {
      if (cancelled) return;
      setMeds(m.status === 'fulfilled' ? asArray(m.value) : []);
      setLogs(l.status === 'fulfilled' ? asArray(l.value) : []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [date]);

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
    } catch {
      setLogs((prev) => prev.filter((log) => log !== optimistic));
      setError(`Couldn't save ${item.name}. Try again.`);
      return false;
    } finally {
      setSaving(null);
    }
  }, [date]);

  return { ...checklist, loading, saving, error, toggle };
}

export default useMedsToday;
