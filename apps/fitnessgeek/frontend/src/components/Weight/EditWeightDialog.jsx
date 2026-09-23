import React, { useEffect, useState } from 'react';
import { Alert, Button, TextField, Typography } from '@mui/material';
import { Edit as EditIcon } from '@mui/icons-material';
import { utcDateString } from '@geeksuite/utils';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
import PremiumDialog from '../primitives/PremiumDialog.jsx';

/**
 * Edit a past weight: the value and its note. The date is shown, not edited —
 * the day IS the row (one weight per day, BODY_DATA_PLAN D8), so moving a
 * weight to another day is a delete and a new entry.
 *
 * `onSave(id, { weight_value, notes })` resolves `true` on success. Anything
 * else — `false`, a rejection — keeps the dialog open with the error in it:
 * this app's worst bugs were failures that closed the form exactly as a
 * success does (QuickAddWeight's own header has the story).
 */
const EditWeightDialog = ({ log, open, onClose, onSave, unit = 'lbs' }) => {
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !log) return;
    setValue(log.weight_value != null ? String(log.weight_value) : '');
    setNotes(log.notes || '');
    setError('');
    setSaving(false);
  }, [open, log]);

  const parsed = parseFloat(value);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed < 1000;

  const close = () => {
    if (saving) return;
    setError('');
    onClose?.();
  };

  const handleSave = async () => {
    if (!valid || !log) return;
    setSaving(true);
    setError('');
    try {
      const saved = await onSave(log.id, {
        weight_value: Math.round(parsed * 10) / 10,
        notes: notes.trim(),
      });
      if (saved !== true) {
        setError('That change was not saved. Check your connection and try again.');
        return;
      }
      onClose?.();
    } catch (err) {
      setError(err?.message ? `That change was not saved: ${err.message}` : 'That change was not saved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  // Built from the calendar-day string, not `toLocaleDateString()`:
  // newer ICU says "Sept", and the stored value is UTC midnight.
  const ymd = log ? utcDateString(log.log_date) : '';
  const day = ymd
    ? `${WEEKDAYS[new Date(`${ymd}T00:00:00Z`).getUTCDay()]}, ${MONTHS[Number(ymd.slice(5, 7)) - 1]} ${Number(ymd.slice(8))}, ${ymd.slice(0, 4)}`
    : '';
  const fromScale = log?.source === 'arboleaf_xlsx';

  return (
    <PremiumDialog
      open={open}
      onClose={close}
      eyebrow={day}
      title="Edit weight"
      icon={EditIcon}
      maxWidth="xs"
      primaryAction={
        <Button onClick={handleSave} variant="contained" disabled={!valid || saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      }
      secondaryAction={<Button onClick={close} disabled={saving}>Cancel</Button>}
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} role="alert">
          {error}
        </Alert>
      )}
      {fromScale && (
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', mb: 2, lineHeight: 1.5 }}>
          This weight came from the scale. If you import an export that includes this day again,
          the scale&rsquo;s value replaces your edit.
        </Typography>
      )}
      <TextField
        fullWidth
        label={`Weight (${unit})`}
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
        sx={{ mb: 2, mt: 1 }}
        inputProps={{ step: '0.1', min: '0', max: '1000' }}
        InputProps={{ endAdornment: unit }}
        error={value !== '' && !valid}
        helperText={value !== '' && !valid ? 'Enter a weight between 0 and 1000.' : ' '}
        autoFocus
      />
      <TextField
        fullWidth
        label="Note"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        multiline
        minRows={2}
        inputProps={{ maxLength: 500 }}
      />
    </PremiumDialog>
  );
};

export default EditWeightDialog;
