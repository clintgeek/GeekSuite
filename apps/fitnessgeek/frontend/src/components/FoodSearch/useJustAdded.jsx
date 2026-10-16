import React, { useCallback, useMemo, useState } from 'react';
import JustAddedStrip from './JustAdded.jsx';
import FixSheet from './FixSheet.jsx';
import { useEntryFixes } from './useEntryFixes.js';
import { applyItemChange } from './entries.js';
import { runUndo, useUndoToast } from './undoToast.jsx';

/**
 * "Just added", on the meal it landed in (REVIEW_2026-10 Phase 2.11).
 *
 * In Full, a clean describe closes the add sheet, as Chef asked for ("the
 * one-tap … should close to show it completed successfully"). The toast says
 * what landed, but a toast is gone in ten seconds and was the only place to
 * see what was guessed or to undo it. So the meal card it landed on carries a
 * strip — each entry with its calories and Fix, plus Undo and Done — that
 * stays until the next thing she does: another add, leaving the page, or Done.
 * Never on a timer.
 *
 * `useJustAdded` is what a page holds; `show(entry)` comes from the add sheet
 * (FoodComposer's `onJustAdded`), and `renderFor(mealType, date)` goes on each
 * meal card.
 */

/**
 * @param {{setLogCalories, describeMeal, undoLogs}} logging useFoodLogging's functions
 */
export function useJustAdded({ setLogCalories, describeMeal, undoLogs } = {}) {
  const [entry, setEntry] = useState(null);
  const [fixing, setFixing] = useState(null);
  const [busy, setBusy] = useState(false);
  const { sayUndoOutcome } = useUndoToast(undoLogs);

  const onChanged = useCallback((item, change) => {
    setEntry((prev) => {
      if (!prev) return prev;
      const items = applyItemChange(prev.items, item, change);
      return items.length ? { ...prev, items } : null;
    });
  }, []);
  const fixes = useEntryFixes({ setLogCalories, describeMeal, undoLogs, onChanged });

  const clear = useCallback(() => { setEntry(null); setFixing(null); }, []);
  const show = useCallback((next) => { setEntry(next && next.items?.length ? next : null); }, []);

  const undoItems = useCallback(async (items) => {
    const ids = items.map((i) => i.logId).filter(Boolean);
    if (!ids.length || !undoLogs || busy) return;
    setBusy(true);
    try {
      const { deleted, failed } = await runUndo(undoLogs, ids);
      setEntry((prev) => {
        if (!prev) return prev;
        const left = prev.items.filter((i) => !deleted.includes(i.logId));
        return left.length ? { ...prev, items: left } : null;
      });
      sayUndoOutcome(failed, (retry) => undoItems(items.filter((i) => retry.includes(i.logId))));
    } finally {
      setBusy(false);
    }
  }, [undoLogs, busy, sayUndoOutcome]);

  const renderFor = useCallback((mealType, date) => {
    if (!entry || (date && entry.date && entry.date !== date)) return null;
    const items = entry.items.filter((i) => (i.mealType || entry.mealType) === mealType);
    if (!items.length) return null;
    return (
      <>
        <JustAddedStrip
          items={items}
          heard={entry.heard}
          busy={busy}
          onUndo={() => undoItems(items)}
          onDone={clear}
          onFix={setFixing}
        />
        <FixSheet item={fixing && items.some((i) => i.logId === fixing.logId) ? fixing : null} onClose={() => setFixing(null)} fixes={fixes} />
      </>
    );
  }, [entry, busy, fixing, fixes, undoItems, clear]);

  return useMemo(() => ({ entry, show, clear, renderFor }), [entry, show, clear, renderFor]);
}

export default useJustAdded;
