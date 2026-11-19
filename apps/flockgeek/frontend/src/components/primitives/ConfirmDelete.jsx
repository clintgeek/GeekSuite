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
 *   confirmDelete({ title: "Delete this bird?", body: "…", onConfirm: () => … });
 *   …
 *   {confirmDialog}
 */
import { useCallback, useState } from "react";
import { Button, Typography } from "@mui/material";
import LedgerDialog from "./LedgerDialog";

export function useConfirmDelete() {
  const [request, setRequest] = useState(null);
  const [busy, setBusy] = useState(false);

  const confirmDelete = useCallback((next) => setRequest(next), []);
  const close = useCallback(() => { if (!busy) setRequest(null); }, [busy]);

  const confirm = async () => {
    if (!request) return;
    setBusy(true);
    try {
      await request.onConfirm();
    } finally {
      setBusy(false);
      setRequest(null);
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
