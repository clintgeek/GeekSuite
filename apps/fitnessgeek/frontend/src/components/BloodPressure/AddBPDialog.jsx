import React, { useState, useEffect } from 'react';
import {
  Button,
  TextField,
  Box,
  Typography,
  Alert
} from '@mui/material';
import {
  MonitorHeart as BPIcon,
  Add as AddIcon,
  Edit as EditIcon
} from '@mui/icons-material';
import { localDateString } from '@geeksuite/utils';
import PremiumDialog from '../primitives/PremiumDialog.jsx';
import DateField from '../primitives/DateField.jsx';
import { categorizeBP } from '../../utils/bpUtils.js';
import { nowLocalTime, combineDateTimeToISO, splitInstantToLocal } from './bpTimeUtils.js';

// Mirrors `bloodPressureBounds` in `@geeksuite/schemas/fitnessgeek/bloodPressure.js`
// (the actual source of truth, shared by the backend model and its zod request
// validator). That package is CJS and mongoose-oriented, built for the two
// Node backends that write this collection — it is not a frontend dependency
// and pulling it into this bundle isn't the fix. These are typo guards, not a
// clinical range (a genuine hypertensive-crisis reading must be storable), so
// keeping this copy in sync is a matter of updating four numbers, not logic;
// if the backend's bounds ever move, update these to match.
const SYS_BOUNDS = { min: 60, max: 300 };
const DIA_BOUNDS = { min: 30, max: 200 };
const PULSE_BOUNDS = { min: 30, max: 250 };

/**
 * The blank-form defaults — date/time default to "now" so the common case
 * (log a reading you just took) is three numbers and Save, no extra step.
 * Pulled into a function, not a module constant, so "now" is actually now
 * each time the dialog opens rather than the moment this module first loaded.
 */
const blankForm = () => ({
  systolic: '',
  diastolic: '',
  pulse: '',
  date: localDateString(),
  time: nowLocalTime(),
});

/**
 * AddBPDialog — also the EDIT dialog.
 *
 * `mode="edit"` + `initialValues` (a log row) pre-fills the four fields from
 * that row and saves through the same `onAdd` callback; the caller (a
 * `BPLogList` row action, wired up in `BloodPressure.jsx`) is the one that
 * knows whether that means `createBPLog` or `updateBPLog` — this component
 * doesn't need to, it just reports what the user typed.
 *
 * `existingTodayBP` is gone. It existed to warn about a restriction — one
 * reading per calendar day — that no longer exists: the backend's `findOne`
 * rejection on `(userId, log_date)` was removed in favor of the
 * `(userId, measured_at)` unique index (see the shared schema's header),
 * specifically BECAUSE a home cuff is read morning and evening. Keeping the
 * banner would mean nagging the user on exactly the workflow this feature
 * exists to support.
 */
const AddBPDialog = ({ open, onClose, onAdd, mode = 'add', initialValues = null }) => {
  const isEdit = mode === 'edit';

  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [pulse, setPulse] = useState('');
  const [date, setDate] = useState(localDateString());
  const [time, setTime] = useState(nowLocalTime());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Re-seed the form every time the dialog opens. For "add" that's fresh
  // blanks with the clock reset to now; for "edit" it's the row being
  // edited, split back into the two native inputs. Keyed on `open` (not just
  // mount) because the dialog is kept in the tree and toggled, not
  // remounted, so a stale edit's values would otherwise still be sitting in
  // state the next time it opens.
  useEffect(() => {
    if (!open) return;
    if (isEdit && initialValues) {
      const { date: d, time: t } = splitInstantToLocal(initialValues.measured_at);
      setSystolic(String(initialValues.systolic ?? ''));
      setDiastolic(String(initialValues.diastolic ?? ''));
      setPulse(initialValues.pulse != null ? String(initialValues.pulse) : '');
      // A row saved before `measured_at` existed (or one the GraphQL layer
      // hasn't started returning it) has nothing to split — fall back to the
      // reading's calendar day and leave the time for the user to set,
      // rather than silently guessing midnight.
      //
      // A BACKFILLED row lands here too, via the same blank `time`:
      // `splitInstantToLocal` recognises a day-resolution instant and returns
      // the right calendar day with no time (see its header). Without that,
      // the UTC-midnight instant would convert to the PREVIOUS local day and
      // a plain edit of the numbers would quietly move the reading's date.
      setDate(d || localDateString(initialValues.log_date));
      setTime(t || nowLocalTime());
    } else {
      const blank = blankForm();
      setSystolic(blank.systolic);
      setDiastolic(blank.diastolic);
      setPulse(blank.pulse);
      setDate(blank.date);
      setTime(blank.time);
    }
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seed on open/mode/row change only; the setters are stable.
  }, [open, isEdit, initialValues]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!systolic || !diastolic) {
      setError('Please enter both systolic and diastolic values');
      return;
    }

    const systolicNum = parseInt(systolic);
    const diastolicNum = parseInt(diastolic);
    const pulseNum = pulse ? parseInt(pulse) : null;

    if (isNaN(systolicNum) || isNaN(diastolicNum)) {
      setError('Please enter valid numbers');
      return;
    }

    // Bounds are typo guards, not a clinical ceiling — a genuine hypertensive
    // crisis reading must be storable. See `bloodPressureBounds`'s header in
    // the shared schema; these numbers come from there, not a local guess,
    // so the form and the backend can't disagree about what's legal.
    if (systolicNum < SYS_BOUNDS.min || systolicNum > SYS_BOUNDS.max) {
      setError(`Systolic should be between ${SYS_BOUNDS.min}-${SYS_BOUNDS.max} mmHg`);
      return;
    }

    if (diastolicNum < DIA_BOUNDS.min || diastolicNum > DIA_BOUNDS.max) {
      setError(`Diastolic should be between ${DIA_BOUNDS.min}-${DIA_BOUNDS.max} mmHg`);
      return;
    }

    if (systolicNum <= diastolicNum) {
      setError('Systolic should be higher than diastolic');
      return;
    }

    if (pulse && (pulseNum < PULSE_BOUNDS.min || pulseNum > PULSE_BOUNDS.max)) {
      setError(`Pulse should be between ${PULSE_BOUNDS.min}-${PULSE_BOUNDS.max} bpm`);
      return;
    }

    setLoading(true);
    try {
      await onAdd({
        systolic: systolicNum,
        diastolic: diastolicNum,
        pulse: pulseNum,
        date,
        measured_at: combineDateTimeToISO(date, time),
      });

      // Reset form and close dialog. Only meaningful for "add" — "edit"
      // closes over its own row and the next open re-seeds from `useEffect`
      // above — but resetting here too costs nothing and keeps this branch
      // correct if a future caller reuses the same open dialog for a second
      // add without unmounting it.
      const blank = blankForm();
      setSystolic(blank.systolic);
      setDiastolic(blank.diastolic);
      setPulse(blank.pulse);
      setDate(blank.date);
      setTime(blank.time);
      setError('');
      onClose();
    } catch (error) {
      setError(error.message || `Failed to ${isEdit ? 'save' : 'add'} blood pressure reading`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  const getBPStatus = () => {
    if (!systolic || !diastolic) return null;

    const sys = parseInt(systolic);
    const dia = parseInt(diastolic);

    if (isNaN(sys) || isNaN(dia)) return null;

    // The one shared categoriser — same bands, same order, as the saved row
    // will get once it lands in BPLogList/BPInsights/BPReport. No local
    // "High Normal" band here; that band never existed in the AHA guidelines
    // and let the live-typing category disagree with what got saved.
    const category = categorizeBP(sys, dia);
    return { status: category.stage, color: category.color };
  };

  const bpStatus = getBPStatus();

  return (
    <PremiumDialog
      open={open}
      onClose={handleClose}
      eyebrow="Health"
      title={isEdit ? 'Edit Reading' : 'Add Reading'}
      icon={BPIcon}
      maxWidth="sm"
      primaryAction={
        <Button
          onClick={handleSubmit}
          variant="contained"
          startIcon={isEdit ? <EditIcon /> : <AddIcon />}
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Save'}
        </Button>
      }
      secondaryAction={
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
      }
    >
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="Systolic"
              type="number"
              value={systolic}
              onChange={(e) => setSystolic(e.target.value)}
              InputProps={{
                endAdornment: <Typography variant="caption">mmHg</Typography>
              }}
              size="medium"
            />

            <TextField
              fullWidth
              label="Diastolic"
              type="number"
              value={diastolic}
              onChange={(e) => setDiastolic(e.target.value)}
              InputProps={{
                endAdornment: <Typography variant="caption">mmHg</Typography>
              }}
              size="medium"
            />

            <TextField
              fullWidth
              label="Pulse (optional)"
              type="number"
              value={pulse}
              onChange={(e) => setPulse(e.target.value)}
              InputProps={{
                endAdornment: <Typography variant="caption">bpm</Typography>
              }}
              size="medium"
            />

            {/* Date + time of the reading. Both default to now (see
                `blankForm`), so the common case never touches them — they
                exist so a backdated or edited reading can say what time it
                actually was.
                `flexWrap: 'wrap'` is a deliberate safety net, not decoration:
                `DateField`'s own default forces `minWidth: '100%'` below the
                `sm` breakpoint (it's normally the only field in its row), and
                a hard px `minWidth` override here would just move the
                overflow to a smaller screen instead of removing it. Letting
                the pair wrap onto two lines on a narrow phone keeps this
                dialog inside the "no horizontal scroll" rule for every width,
                not just the ones tested. */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              <DateField
                value={date}
                onChange={setDate}
                size="medium"
                sx={{ flex: '1 1 160px', minWidth: 0 }}
              />
              <TextField
                label="Time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                size="medium"
                InputLabelProps={{ shrink: true }}
                inputProps={{ step: 60 }}
                sx={{ flex: '1 1 140px' }}
              />
            </Box>

            {/* BP Status indicator */}
            {bpStatus && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2">
                  Status:
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    color: bpStatus.color,
                    backgroundColor: `${bpStatus.color}20`,
                    px: 1,
                    py: 0.5,
                    borderRadius: 1
                  }}
                >
                  {bpStatus.status}
                </Typography>
              </Box>
            )}

            {error && (
              <Alert severity="error">
                {error}
              </Alert>
            )}
          </Box>
        </Box>
    </PremiumDialog>
  );
};

export default AddBPDialog;
