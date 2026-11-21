/**
 * ConfirmDelete — FlockGeek's one delete confirmation, in the ledger's own
 * dialog instead of the browser's `window.confirm` (UX review 2026-11-18,
 * FlockGeek 8).
 *
 * Suite rule: an action that can be undone acts at once and offers Undo; one
 * that cannot asks first, in a themed dialog. FlockGeek records are
 * soft-deleted on the gateway, but nothing in the API can bring one back
 * (`deleteFlockEntity` sets `deletedAt` and there is no restore), so from the
 * app a delete is final and it asks. When the gateway grows a restore, these
 * call sites become "delete at once, Undo in the toast".
 *
 * Usage:
 *   const [confirmDelete, confirmDialog] = useConfirmDelete();
 *   confirmDelete({
 *     title: "Delete this bird?", body: "…",
 *     onConfirm: () => deleteEntity(…),   // return the mutation's result
 *     onDeleted: () => …,                 // optional: only after it worked
 *   });
 *   …
 *   {confirmDialog}
 *
 * A failed delete is not a delete (review 2026-11-20). The pages' delete
 * mutations carry an `onError` toast, and with one Apollo resolves the call
 * with `errors` instead of throwing; so `onConfirm`'s result is read, and
 * `onDeleted` (the page's tidy-up: collapse the row, close the editor) runs
 * only when the gateway said yes. On failure the dialog closes, the toast
 * says why, and the row and any edits in it stay as they were.
 *
 * Focus: the button that asked is part of the record being deleted, so after
 * a delete it is gone, and the dialog's focus return would land on the page
 * body. After a delete focus goes to the page title in the top bar
 * (`[data-geek-topbar="title"]`), the heading of the list the record left.
 * After Keep it or a failure the dialog returns focus to the button as usual.
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Typography } from "@mui/material";
import LedgerDialog from "./LedgerDialog";

/** Where focus goes once a delete has removed its own trigger. */
export function focusListHeading() {
  if (typeof document === "undefined") return;
  const el = document.querySelector('[data-geek-topbar="title"]') || document.querySelector("main h1, h1");
  if (!el) return;
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}

const failed = (result) => Boolean(result?.errors?.length);

export function useConfirmDelete() {
  const [request, setRequest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refocus, setRefocus] = useState(false);

  const confirmDelete = useCallback((next) => setRequest(next), []);
  const close = useCallback(() => { if (!busy) setRequest(null); }, [busy]);

  // Runs after the commit that closed the dialog, so after the dialog's own
  // focus return to the (doomed) trigger.
  useEffect(() => {
    if (!refocus || request) return;
    setRefocus(false);
    focusListHeading();
  }, [refocus, request]);

  const confirm = async () => {
    if (!request || busy) return;
    const { onConfirm, onDeleted } = request;
    setBusy(true);
    let ok = false;
    try {
      ok = !failed(await onConfirm());
    } catch {
      ok = false; // the mutation's own onError has already said why
    }
    try {
      if (ok) onDeleted?.();
    } finally {
      setBusy(false);
      setRequest(null);
      if (ok) setRefocus(true);
    }
  };

  const dialog = (
    <LedgerDialog
      open={Boolean(request)}
      onClose={close}
      mode="window"
      maxWidth="xs"
      title={request?.title ?? "Delete?"}
      secondaryAction={
        <Button onClick={close} disabled={busy} sx={{ minHeight: 44, color: "text.secondary" }}>
          Keep it
        </Button>
      }
      primaryAction={
        <Button variant="contained" color="error" onClick={confirm} disabled={busy} sx={{ minHeight: 44 }}>
          {busy ? "Deleting…" : request?.confirmLabel ?? "Delete"}
        </Button>
      }
    >
      <Typography variant="body1" sx={{ lineHeight: 1.6 }}>
        {request?.body}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
        This can't be undone from FlockGeek.
      </Typography>
    </LedgerDialog>
  );

  return [confirmDelete, dialog];
}
