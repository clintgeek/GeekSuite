import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, TextField, Typography } from '@mui/material';
import { Edit as EditIcon } from '@mui/icons-material';
import { utcDateString } from '@geeksuite/utils';
import { useGeekDialogFullScreen } from '@geeksuite/ui';
import { errorMessage } from '../../utils/errorMessage.js';
import { thumbSaveProps } from '../BloodPressure/thumbSave.jsx';
import { FieldUnit, unitFieldSx } from '../BloodPressure/fieldUnit.jsx';

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
 *
 * DELETE LIVES HERE (review, round three): the log's rows used to carry a
 * pencil and a bin each; now the row opens this dialog and "Delete this
 * weigh-in" is its quiet last line, in the error colour. `onDelete(id)` is
 * the page's own delete, so the "Removed … · Undo" toast is unchanged; the
 * dialog closes first so the toast is not behind it.
 */
const EditWeightDialog = ({ log, open, onClose, onSave, onDelete, unit = 'lbs' }) => {
  const unitWord = unit === 'lbs' ? 'lb' : unit;
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fullScreen = useGeekDialogFullScreen();

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
    if (!valid || !log || saving || !onSave) return;
    setSaving(true);
    setError('');
    try {
      const saved = await onSave(log.id, {
        weight_value: Math.round(parsed * 10) / 10,
        notes: notes.trim(),
      });
      if (saved !== true) {
        setError('Couldn’t save that change. Check your connection and try again.');
        return;
      }
      onClose?.();
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t save that change. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (saving || !log) return;
    setError('');
    onClose?.();
    onDelete(log.id);
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
      {...thumbSaveProps({
        fullScreen,
        save: (
          <Button onClick={handleSave} variant="contained" disabled={!valid || saving || !onSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        ),
        cancel: <Button onClick={close} disabled={saving}>Cancel</Button>,
      })}
    >
      {/* 16px between the parts: the suite's spacing unit is 4px. */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, pt: 1 }}>
      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}
      {fromScale && (
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', lineHeight: 1.5 }}>
          This came from the scale. A later scale import for this day will replace your edit.
        </Typography>
      )}
      <TextField
        fullWidth
        label="Weight"
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
        inputProps={{ inputMode: 'decimal', step: '0.1', min: '0', max: '1000' }}
        InputProps={{ endAdornment: <FieldUnit>{unitWord}</FieldUnit> }}
        sx={unitFieldSx}
        error={value !== '' && !valid}
        helperText={value !== '' && !valid ? 'Enter a weight between 0 and 1,000.' : undefined}
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
      {onDelete && log && (
        <Box>
          <Button
            variant="text"
            color="error"
            onClick={handleDelete}
            disabled={saving}
            data-testid="weight-delete"
            sx={{ minHeight: 44, px: 0, fontWeight: 600, justifyContent: 'flex-start', '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}
          >
            Delete this weigh-in
          </Button>
        </Box>
      )}
      </Box>
    </PremiumDialog>
  );
};

export default EditWeightDialog;
