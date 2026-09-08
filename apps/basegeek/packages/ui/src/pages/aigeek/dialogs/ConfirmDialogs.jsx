/**
 * The destructive confirmations, which differ only in wording and tone.
 *
 * They were near-identical `<Dialog>` blocks at the bottom of the page. One
 * component, two call sites: the thing that actually varies — what is about
 * to be lost and whether it can be recovered — is the copy.
 *
 * There were four. `RestoreDefaultsDialog` went with the seed mutations and
 * the hand-typed catalog tables (Phase 1, 2026-09-07). `ResetFreeTiersDialog`
 * went with the "Reset all free tiers" button in Phase 3: the catalog job
 * revives the rows it unticked, so the button's only lasting effect was to
 * make the next probe do its work twice.
 */
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';

function ConfirmDialog({ open, title, warning, body, confirmLabel, color, busy, onCancel, onConfirm }) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {warning && <Alert severity="warning" sx={{ mb: 2 }}>{warning}</Alert>}
        <Typography variant="body2">{body}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} sx={{ minHeight: 44 }}>Cancel</Button>
        <Button
          variant="contained"
          color={color}
          onClick={onConfirm}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
          sx={{ minHeight: 44 }}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function ResetStatsDialog({ open, onCancel, onConfirm }) {
  return (
    <ConfirmDialog
      open={open}
      title="Reset usage statistics?"
      color="error"
      confirmLabel="Reset stats"
      body="This clears every recorded call count, token total and cost, for every provider and every app. The history cannot be recovered."
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}


/**
 * Revoking a key. `deleteAPIKey` flips `isActive` false rather than deleting
 * the document, but the key itself stops working immediately and the plaintext
 * cannot be re-minted — so from the caller's side this is destruction, and the
 * copy says so rather than hiding behind "deactivate".
 */
export function RevokeKeyDialog({ apiKey, busy, onCancel, onConfirm }) {
  return (
    <ConfirmDialog
      open={!!apiKey}
      title={apiKey ? `Revoke “${apiKey.name}”?` : 'Revoke key?'}
      color="error"
      confirmLabel="Revoke key"
      busy={busy}
      warning={apiKey ? `Anything calling aiGeek as ${apiKey.appName} with this key starts failing immediately.` : undefined}
      body="The key stops working the moment you confirm, and it cannot be shown or restored. Mint a replacement first if something is live on it."
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
