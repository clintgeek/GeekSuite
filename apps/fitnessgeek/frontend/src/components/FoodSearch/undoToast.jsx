import React, { useCallback, useState } from 'react';
import { Button } from '@mui/material';
import { useToast } from '@geeksuite/ui';

/**
 * The Undo in an "Added to lunch ✓" toast, and what it says after.
 *
 * It used to be a button that awaited the delete and said nothing: the toast
 * stayed as it was, a failed delete was swallowed, and four seconds was often
 * gone before a thumb got there. "Undo doesn't work" (REVIEW_2026-10 B8).
 *
 * Now a tap replaces the toast with "Undone ✓" — or, when any delete failed,
 * "Couldn't undo — try again" with a button that retries just the ones that
 * didn't go. Undo toasts stay up for ten seconds.
 */
export const UNDO_TOAST_MS = 10000;
export const UNDONE_MESSAGE = 'Undone ✓';
export const UNDO_FAILED_MESSAGE = "Couldn’t undo — try again";

/** One tap only: the button disables itself while its delete is in flight. */
export function UndoAction({ label = 'Undo', onUndo }) {
  const [working, setWorking] = useState(false);
  return (
    <Button
      size="small"
      disabled={working}
      sx={{ color: 'inherit', fontWeight: 700 }}
      onClick={async () => {
        if (working) return;
        setWorking(true);
        try {
          await onUndo?.();
        } finally {
          setWorking(false);
        }
      }}
    >
      {working ? 'Undoing…' : label}
    </Button>
  );
}

/**
 * `undo(logIds)` resolves `{deleted, failed}` (useFoodLogging's `undoLogs`).
 * A caller that resolves nothing is taken at its word; one that throws failed
 * all of them.
 */
export async function runUndo(undo, logIds) {
  try {
    const result = await undo(logIds);
    const failed = Array.isArray(result?.failed) ? result.failed : [];
    const deleted = Array.isArray(result?.deleted)
      ? result.deleted
      : logIds.filter((id) => !failed.includes(id));
    return { deleted, failed };
  } catch {
    return { deleted: [], failed: [...logIds] };
  }
}

/**
 * `offerUndo(message, logIds, { tone, onDeleted })` shows the toast.
 * `onDeleted(ids)` hears about every id that really went, including on a
 * retry, so a caller (the session ribbon) only forgets what was deleted.
 */
export function useUndoToast(undo) {
  const { notify, dismiss } = useToast();

  const undoAndSay = useCallback(async (logIds, toastId, onDeleted) => {
    const { deleted, failed } = await runUndo(undo, logIds);
    if (deleted.length > 0) onDeleted?.(deleted);
    dismiss?.(toastId);
    if (failed.length === 0) {
      notify(UNDONE_MESSAGE, { tone: 'info' });
      return;
    }
    let retryId = null;
    retryId = notify(UNDO_FAILED_MESSAGE, {
      tone: 'error',
      duration: UNDO_TOAST_MS,
      action: <UndoAction label="Try again" onUndo={() => undoAndSay(failed, retryId, onDeleted)} />,
    });
  }, [undo, notify, dismiss]);

  const offerUndo = useCallback((message, logIds, { tone = 'success', onDeleted } = {}) => {
    const ids = (logIds || []).filter(Boolean);
    if (!undo || ids.length === 0) return notify(message, { tone });
    let toastId = null;
    toastId = notify(message, {
      tone,
      duration: UNDO_TOAST_MS,
      action: <UndoAction onUndo={() => undoAndSay(ids, toastId, onDeleted)} />,
    });
    return toastId;
  }, [undo, notify, undoAndSay]);

  /** For an undo started somewhere else (the ribbon): just the outcome. */
  const sayUndoOutcome = useCallback((failed, retry) => {
    if (!failed?.length) {
      notify(UNDONE_MESSAGE, { tone: 'info' });
      return;
    }
    let retryId = null;
    retryId = notify(UNDO_FAILED_MESSAGE, {
      tone: 'error',
      duration: UNDO_TOAST_MS,
      action: <UndoAction label="Try again" onUndo={async () => { dismiss?.(retryId); await retry?.(failed); }} />,
    });
  }, [notify, dismiss]);

  return { offerUndo, sayUndoOutcome, undoAndSay };
}
