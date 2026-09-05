/**
 * The three destructive confirmations, which differ only in wording and tone.
 *
 * They were three near-identical `<Dialog>` blocks at the bottom of the page.
 * One component, three call sites: the thing that actually varies — what is
 * about to be lost and whether it can be recovered — is the copy.
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

export function ResetFreeTiersDialog({ open, busy, onCancel, onConfirm }) {
  return (
    <ConfirmDialog
      open={open}
      title="Reset all free tiers?"
      color="error"
      confirmLabel="Reset all"
      busy={busy}
      body="This unticks every model's free-tier flag. The limits themselves are kept and can be re-applied afterwards."
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

export function RestoreDefaultsDialog({ open, busy, onCancel, onConfirm }) {
  return (
    <ConfirmDialog
      open={open}
      title="Restore hardcoded defaults?"
      color="warning"
      confirmLabel="Restore defaults"
      busy={busy}
      warning="This overwrites your manual free-tier selections for every known model with the defaults baked into the seed data."
      body="Useful for recovering from an accidental bulk change. It cannot be undone."
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
