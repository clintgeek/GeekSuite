import React, { useEffect, useState } from 'react';
import {
  Typography,
  TextField,
  Button,
  Box,
  useTheme
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { LabelPanel, Tag } from '../primitives';
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
 * QuickAddBP — the entry at the top of the Blood pressure page: one filled
 * button that opens the dialog on phones, an inline card from md.
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
  // As in the dialog (A8): Save waits for a reading it can save, and a
  // finished-looking reading that can't be saved says why.
  const check = validateBPForm({ systolic, diastolic, pulse });
  const looksFinished = String(systolic).length >= 2 && String(diastolic).length >= 2;
  const liveError = check.error && looksFinished ? check.error : '';

  const numberField = { inputMode: 'numeric' };

  return (
    <>
      {/* Phones and portrait tablets: the page's one filled button, first on
          the page and in the flow, like "What did you eat?" on Today. It was
          a floating button, which sat on top of the page's own text. The test
          id is the old one, kept for the scenes that open the dialog with it. */}
      <Button
        variant="contained"
        size="large"
        fullWidth
        startIcon={<AddIcon />}
        data-testid="add-bp-fab"
        onClick={() => setShowDialog(true)}
        sx={{ display: { xs: 'inline-flex', md: 'none' }, minHeight: 56, fontSize: '1rem' }}
      >
        Log blood pressure
      </Button>

      {/* From md: the same entry as a card, at the top of the left column. */}
      <LabelPanel
        title="Log a reading"
        titleComponent="h2"
        sx={{ width: '100%', display: { xs: 'none', md: 'block' } }}
      >
        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 4, pt: 1 }}>
          {/* Three short fields in a 400px card: the short names fit, and the
              full ones ("Top number (systolic)") are what a screen reader
              hears and what the line under them says. */}
          <Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 3 }}>
              <TextField
                label="Top"
                type="number"
                value={systolic}
                onChange={(e) => setSystolic(e.target.value)}
                inputProps={{ ...numberField, 'aria-label': 'Top number (systolic)' }}
              />
              <TextField
                label="Bottom"
                type="number"
                value={diastolic}
                onChange={(e) => setDiastolic(e.target.value)}
                inputProps={{ ...numberField, 'aria-label': 'Bottom number (diastolic)' }}
              />
              <TextField
                label="Pulse"
                type="number"
                value={pulse}
                onChange={(e) => setPulse(e.target.value)}
                inputProps={{ ...numberField, 'aria-label': 'Pulse (optional)' }}
              />
            </Box>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem', lineHeight: 1.5, mt: 1.5 }}>
              The two numbers on your cuff, for example 120 over 80, in {unit}. Pulse is optional.
            </Typography>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 3 }}>
            <DateField
              fullWidth
              value={date}
              onChange={setPickedDate}
              size="medium"
              max={today}
              sx={{ minWidth: 0 }}
            />
            <TextField
              fullWidth
              label="Time"
              type="time"
              value={time}
              onChange={(e) => { setTime(e.target.value); setWhenTouched(true); }}
              InputLabelProps={{ shrink: true }}
              inputProps={{ step: 60 }}
            />
          </Box>

          {/* BP Status indicator */}
          {bpStatus && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body2">
                This reading is
              </Typography>
              <Tag fill={bpStatus.color}>{bpStatus.status}</Tag>
            </Box>
          )}

          {/* While the dialog is open it shows its own errors. */}
          <BPSaveError
            error={error || liveError}
            duplicate={Boolean(duplicate)}
            onSaveLater={saveOneMinuteLater}
            busy={loading}
          />

          <Button
            type="submit"
            variant="contained"
            fullWidth
            // Not until the reading can be saved (UX review 2026-11, A8).
            disabled={loading || Boolean(check.error)}
            sx={{ minHeight: 48 }}
          >
            {loading ? 'Saving…' : 'Log'}
          </Button>
        </Box>
      </LabelPanel>

      {/* The dialog: phones, and `?add=1` from Today. */}
      <AddBPDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onAdd={onAdd}
      />
    </>
  );
};

export default QuickAddBP;
