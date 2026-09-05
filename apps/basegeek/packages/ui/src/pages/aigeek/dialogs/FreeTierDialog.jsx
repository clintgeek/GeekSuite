/**
 * FreeTierDialog — the long form for one model's free tier.
 *
 * The Catalog rows carry the four limits anyone edits day to day. This dialog
 * exists for the two that have no column — the audio budgets, which only
 * transcription models have — and for the free-text note recording *why* a
 * limit is what it is.
 *
 * It saves on its own, through `UPDATE_MODEL_FREE_TIER` rather than the row
 * batch, and the hook drops that model's pending row edit when it does. Two
 * writers for one field is how the old two-tab arrangement lost work.
 */
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  Switch,
  TextField,
  Typography,
} from '@mui/material';

const RATE_FIELDS = [
  { key: 'requestsPerMinute', label: 'Requests / minute' },
  { key: 'requestsPerDay', label: 'Requests / day' },
  { key: 'tokensPerMinute', label: 'Tokens / minute' },
  { key: 'tokensPerDay', label: 'Tokens / day' },
];

const AUDIO_FIELDS = [
  { key: 'audioSecondsPerHour', label: 'Audio seconds / hour', wide: true },
  { key: 'audioSecondsPerDay', label: 'Audio seconds / day', wide: true },
];

export default function FreeTierDialog({ editing, onPatch, onPatchLimit, onCancel, onSave }) {
  // `wide` fields take the whole row below sm: "Audio seconds / hour" does not
  // survive a half-width label at 390px, it just becomes "Audio second…".
  const numberField = ({ key, label, wide }) => (
    <Grid item xs={wide ? 12 : 6} sm={6} key={key}>
      <TextField
        fullWidth
        label={label}
        type="number"
        value={editing?.freeLimits?.[key] ?? ''}
        onChange={(e) => onPatchLimit(key, parseInt(e.target.value) || 0)}
        size="small"
      />
    </Grid>
  );

  return (
    <Dialog open={!!editing} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Edit free tier — {editing?.modelName}</DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2, fontSize: 12 }}>
          {editing?.provider} / {editing?.modelId}
        </Typography>

        <FormControlLabel
          control={(
            <Switch
              checked={editing?.isFree || false}
              onChange={(e) => onPatch({ isFree: e.target.checked })}
            />
          )}
          label="Free tier available"
        />

        {editing?.isFree && (
          <>
            <Grid container spacing={2} sx={{ mt: 0 }}>
              {RATE_FIELDS.map(numberField)}
            </Grid>

            <Divider sx={{ my: 2 }} />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontSize: 12 }}>
              Audio limits (optional — transcription models only)
            </Typography>
            <Grid container spacing={2}>
              {AUDIO_FIELDS.map(numberField)}
            </Grid>

            <TextField
              fullWidth
              label="Notes"
              value={editing?.notes ?? ''}
              onChange={(e) => onPatch({ notes: e.target.value })}
              margin="normal"
              multiline
              rows={2}
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} sx={{ minHeight: 44 }}>Cancel</Button>
        <Button variant="contained" onClick={onSave} sx={{ minHeight: 44 }}>Save free tier</Button>
      </DialogActions>
    </Dialog>
  );
}
