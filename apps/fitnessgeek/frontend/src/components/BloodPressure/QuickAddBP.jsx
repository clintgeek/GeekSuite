import React, { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Box,
  useTheme,
  Grid,
  alpha
} from '@mui/material';
import {
  Add as AddIcon,
  MonitorHeart as BPIcon
} from '@mui/icons-material';
import ThumbFab from '../primitives/ThumbFab.jsx';
import AddBPDialog from './AddBPDialog.jsx';
import DateField from '../primitives/DateField.jsx';
import { categorizeBP } from '../../utils/bpUtils.js';
import { bpStageWords } from '../../utils/plainWords.js';
import { errorMessage } from '../../utils/errorMessage.js';
import { useToday } from '../../hooks/useToday.js';
import {
  nowLocalTime,
  measuredAtForSave,
  oneMinuteLater,
  localDayOf,
  splitInstantToLocal,
  isBPDuplicate,
} from './bpTimeUtils.js';
import { validateBPForm, DUPLICATE_MESSAGE } from './bpForm.js';
import BPSaveError from './BPSaveError.jsx';

/**
 * QuickAddBP — the desktop inline "add" card, plus the mobile FAB → dialog.
 *
 * `existingTodayBP` is gone. It warned about a restriction — one reading per
 * calendar day — that the backend no longer enforces (see AddBPDialog.jsx's
 * header): a home cuff is read morning and evening, and the old warning
 * would fire on exactly that normal second entry.
 */
const QuickAddBP = ({ onAdd, unit = "mmHg", autoOpen = false, onAutoOpened }) => {
  const theme = useTheme();
  const [showDialog, setShowDialog] = useState(false);
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [pulse, setPulse] = useState('');
  // Date and time default to right now, same as the mobile dialog — see
  // AddBPDialog.jsx's `blankForm`. The common case (log a reading just
  // taken) never touches either. Until the person edits one, the card shows
  // TODAY as `useToday()` sees it: a tab left open overnight used to keep
  // yesterday in the field and save the morning reading on the wrong day
  // (review B3).
  const today = useToday();
  const [pickedDate, setPickedDate] = useState(null);
  const [time, setTime] = useState(nowLocalTime());
  const [whenTouched, setWhenTouched] = useState(false);
  const date = pickedDate ?? today;
  const [error, setError] = useState('');
  const [duplicate, setDuplicate] = useState(null);
  const [loading, setLoading] = useState(false);

  // Keep the shown clock current while untouched (a new day, or coming back
  // to the tab); the instant actually saved is taken at Save either way.
  useEffect(() => {
    if (!whenTouched) setTime(nowLocalTime());
  }, [today, whenTouched]);

  // `/blood-pressure?add=1` (the Today strip's "Add BP") opens the add
  // dialog straight away.
  useEffect(() => {
    if (!autoOpen) return;
    setShowDialog(true);
    onAutoOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once per request; the callback identity is the caller's.
  }, [autoOpen]);


  const save = async (payload) => {
    setLoading(true);
    setError('');
    setDuplicate(null);
    try {
      await onAdd(payload);

      // Reset form
      setSystolic('');
      setDiastolic('');
      setPulse('');
      setPickedDate(null);
      setWhenTouched(false);
      setTime(nowLocalTime());
    } catch (err) {
      if (isBPDuplicate(err)) {
        setDuplicate(payload);
        setError(DUPLICATE_MESSAGE);
      } else {
        setError(errorMessage(err, 'Couldn’t save that reading. Try again.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');

    const checked = validateBPForm({ systolic, diastolic, pulse });
    if (checked.error) {
      setError(checked.error);
      return;
    }

    await save({
      systolic: checked.systolic,
      diastolic: checked.diastolic,
      pulse: checked.pulse,
      date,
      measured_at: measuredAtForSave(date, time, { timeTouched: whenTouched }),
    });
  };

  const saveOneMinuteLater = async () => {
    if (!duplicate) return;
    const later = oneMinuteLater(duplicate.measured_at);
    const day = localDayOf(later) || duplicate.date;
    const { time: t } = splitInstantToLocal(later);
    if (t) setTime(t);
    setPickedDate(day);
    setWhenTouched(true);
    await save({ ...duplicate, measured_at: later, date: day });
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
    <>
      {/* Phones: the thumb-zone "Log BP" button, with its words. */}
      <ThumbFab label="Log BP" testId="add-bp-fab" onClick={() => setShowDialog(true)} />

      {/* Desktop version */}
      <Card sx={{
        width: '100%',
        display: { xs: 'none', md: 'block' }
      }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <BPIcon sx={{ mr: 1, color: theme.palette.primary.main }} />
            <Typography variant="h6" sx={{ color: theme.palette.text.primary }}>
              Log blood pressure
            </Typography>
          </Box>

          <form onSubmit={handleSubmit}>
            <Grid container spacing={2} alignItems="center">
              <Grid xs={12} sm={2}>
                <TextField
                  fullWidth
                  label="Top number (systolic)"
                  type="number"
                  value={systolic}
                  onChange={(e) => setSystolic(e.target.value)}
                  inputProps={{ inputMode: 'numeric' }}
                  InputProps={{
                    endAdornment: <Typography variant="caption">{unit}</Typography>
                  }}
                  size="small"
                />
              </Grid>

              <Grid xs={12} sm={2}>
                <TextField
                  fullWidth
                  label="Bottom number (diastolic)"
                  type="number"
                  value={diastolic}
                  onChange={(e) => setDiastolic(e.target.value)}
                  inputProps={{ inputMode: 'numeric' }}
                  InputProps={{
                    endAdornment: <Typography variant="caption">{unit}</Typography>
                  }}
                  size="small"
                />
              </Grid>

              <Grid xs={12} sm={2}>
                <TextField
                  fullWidth
                  label="Pulse"
                  type="number"
                  value={pulse}
                  onChange={(e) => setPulse(e.target.value)}
                  inputProps={{ inputMode: 'numeric' }}
                  InputProps={{
                    endAdornment: <Typography variant="caption">bpm</Typography>
                  }}
                  size="small"
                />
              </Grid>

              <Grid xs={12} sm={2}>
                <DateField
                  fullWidth
                  value={date}
                  onChange={setPickedDate}
                  size="small"
                />
              </Grid>

              <Grid xs={12} sm={2}>
                <TextField
                  fullWidth
                  label="Time"
                  type="time"
                  value={time}
                  onChange={(e) => { setTime(e.target.value); setWhenTouched(true); }}
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ step: 60 }}
                />
              </Grid>

              <Grid xs={12} sm={2}>
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={loading}
                  startIcon={<AddIcon />}
                >
                  {loading ? 'Saving…' : 'Log'}
                </Button>
              </Grid>
            </Grid>

            {/* BP Status indicator */}
            {bpStatus && (
              <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
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
              sx={{ mt: 2 }}
            />
          </form>
        </CardContent>
      </Card>

      {/* Mobile Dialog */}
      <AddBPDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onAdd={onAdd}
      />
    </>
  );
};

export default QuickAddBP;
