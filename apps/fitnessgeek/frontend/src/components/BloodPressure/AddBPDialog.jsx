import React, { useState, useEffect } from 'react';
import {
  Button,
  TextField,
  Box,
  Typography,
  useTheme,
  alpha
} from '@mui/material';
import {
  MonitorHeart as BPIcon,
  Add as AddIcon,
  Edit as EditIcon
} from '@mui/icons-material';
import { localDateString } from '@geeksuite/utils';
import { useGeekDialogFullScreen } from '@geeksuite/ui';
import PremiumDialog from '../primitives/PremiumDialog.jsx';
import DateField from '../primitives/DateField.jsx';
import { categorizeBP } from '../../utils/bpUtils.js';
import { bpStageWords } from '../../utils/plainWords.js';
import { errorMessage } from '../../utils/errorMessage.js';
import {
  nowLocalTime,
  combineDateTimeToISO,
  splitInstantToLocal,
  measuredAtForSave,
  oneMinuteLater,
  localDayOf,
  isBPDuplicate,
} from './bpTimeUtils.js';
import { thumbSaveProps } from './thumbSave.jsx';
import BPSaveError from './BPSaveError.jsx';
import { validateBPForm, DUPLICATE_MESSAGE } from './bpForm.js';

// The bounds and their messages live in `bpForm.js`, shared with QuickAddBP.

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
  const theme = useTheme();
  const isEdit = mode === 'edit';

  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [pulse, setPulse] = useState('');
  const [date, setDate] = useState(localDateString());
  const [time, setTime] = useState(nowLocalTime());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Did the person touch the date or time? Untouched, a new reading was taken
  // just now and is sent to the second (B13); an untouched edit keeps the
  // row's own instant rather than a minute-rounded copy of it.
  const [whenTouched, setWhenTouched] = useState(false);
  const [timeTouched, setTimeTouched] = useState(false);
  // The payload that hit `BP_DUPLICATE`, kept so "Save it one minute later"
  // is one tap.
  const [duplicate, setDuplicate] = useState(null);
  const fullScreen = useGeekDialogFullScreen();

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
    setWhenTouched(false);
    setTimeTouched(false);
    setDuplicate(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seed on open/mode/row change only; the setters are stable.
  }, [open, isEdit, initialValues]);

  const resetForm = () => {
    const blank = blankForm();
    setSystolic(blank.systolic);
    setDiastolic(blank.diastolic);
    setPulse(blank.pulse);
    setDate(blank.date);
    setTime(blank.time);
    setError('');
    setWhenTouched(false);
    setTimeTouched(false);
    setDuplicate(null);
  };

  const save = async (payload) => {
    setLoading(true);
    setError('');
    setDuplicate(null);
    try {
      await onAdd(payload);
      // Reset form and close dialog. Only meaningful for "add" — "edit"
      // closes over its own row and the next open re-seeds from `useEffect`
      // above — but resetting here too costs nothing.
      resetForm();
      onClose();
    } catch (err) {
      if (isBPDuplicate(err)) {
        setDuplicate(payload);
        setError(DUPLICATE_MESSAGE);
      } else {
        setError(errorMessage(err, isEdit ? 'Couldn’t save that change. Try again.' : 'Couldn’t save that reading. Try again.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (loading) return;
    setError('');

    const checked = validateBPForm({ systolic, diastolic, pulse });
    if (checked.error) {
      setError(checked.error);
      return;
    }

    let measuredAt;
    if (isEdit) {
      // An edit of the numbers only sends the row's own instant back, so it
      // neither moves the reading nor loses its seconds.
      const hadTime = Boolean(splitInstantToLocal(initialValues?.measured_at).time);
      measuredAt = !whenTouched && hadTime ? initialValues.measured_at : combineDateTimeToISO(date, time);
    } else {
      measuredAt = measuredAtForSave(date, time, { timeTouched });
    }

    await save({
      systolic: checked.systolic,
      diastolic: checked.diastolic,
      pulse: checked.pulse,
      date,
      measured_at: measuredAt,
    });
  };

  const saveOneMinuteLater = async () => {
    if (!duplicate) return;
    const later = oneMinuteLater(duplicate.measured_at);
    const day = localDayOf(later);
    // Show what is being saved, in case it fails again.
    const { time: t } = splitInstantToLocal(later);
    if (t) setTime(t);
    if (day) setDate(day);
    setWhenTouched(true);
    setTimeTouched(true);
    await save({ ...duplicate, measured_at: later, date: day || duplicate.date });
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
    const category = categorizeBP(sys, dia, theme.palette.mode);
    return { status: bpStageWords(category.stage).label, color: category.color };
  };

  const bpStatus = getBPStatus();

  return (
    <PremiumDialog
      open={open}
      onClose={handleClose}
      title={isEdit ? 'Edit blood pressure' : 'Log blood pressure'}
      icon={BPIcon}
      maxWidth="sm"
      {...thumbSaveProps({
        fullScreen,
        save: (
          <Button
            onClick={handleSubmit}
            variant="contained"
            startIcon={isEdit ? <EditIcon /> : <AddIcon />}
            disabled={loading}
          >
            {loading ? 'Saving…' : 'Save'}
          </Button>
        ),
        cancel: (
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
        ),
      })}
    >
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="Top number (systolic)"
              type="number"
              value={systolic}
              onChange={(e) => setSystolic(e.target.value)}
              inputProps={{ inputMode: 'numeric' }}
              InputProps={{
                endAdornment: <Typography variant="caption">mmHg</Typography>
              }}
              size="medium"
            />

            <TextField
              fullWidth
              label="Bottom number (diastolic)"
              type="number"
              value={diastolic}
              onChange={(e) => setDiastolic(e.target.value)}
              inputProps={{ inputMode: 'numeric' }}
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
              inputProps={{ inputMode: 'numeric' }}
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
                onChange={(v) => { setDate(v); setWhenTouched(true); }}
                size="medium"
                sx={{ flex: '1 1 160px', minWidth: 0 }}
              />
              <TextField
                label="Time"
                type="time"
                value={time}
                onChange={(e) => { setTime(e.target.value); setWhenTouched(true); setTimeTouched(true); }}
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
                  This reading is
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 700,
                    // Ink on the stage's wash: the tone alone on its tint
                    // dipped under AA (success 4.35:1).
                    color: 'text.primary',
                    backgroundColor: alpha(bpStatus.color, 0.14),
                    px: 1.5,
                    py: 0.5,
                    borderRadius: 999
                  }}
                >
                  {bpStatus.status}
                </Typography>
              </Box>
            )}

            <BPSaveError
              error={error}
              duplicate={Boolean(duplicate)}
              onSaveLater={saveOneMinuteLater}
              busy={loading}
            />
          </Box>
        </Box>
    </PremiumDialog>
  );
};

export default AddBPDialog;
