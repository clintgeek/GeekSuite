import React, { useEffect, useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Alert
} from '@mui/material';
import { MonitorWeight as WeightIcon } from '@mui/icons-material';
import { useGeekDialogFullScreen } from '@geeksuite/ui';
import { localDateString, utcDateString } from '@geeksuite/utils';
import PremiumDialog from '../primitives/PremiumDialog.jsx';
import DateField from '../primitives/DateField.jsx';
import { errorMessage } from '../../utils/errorMessage.js';
import { thumbSaveProps } from '../BloodPressure/thumbSave.jsx';
import Surface from '../primitives/Surface.jsx';

const SAVE_FAILED = "Couldn’t save that weight. Check your connection and try again.";
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "today", "yesterday", "Oct 13" — for "You already have 218.7 for today". */
function dayWords(ymd, todayYmd) {
  if (ymd === todayYmd) return 'today';
  const [y, m, d] = ymd.split('-').map(Number);
  const [ty, tm, td] = todayYmd.split('-').map(Number);
  const diff = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86400000);
  if (diff === 1) return 'yesterday';
  return `${MONTHS[m - 1]} ${d}${y !== ty ? `, ${y}` : ''}`;
}

/**
 * One weight per day (the gateway keeps one row per day), so saving on a day
 * that already has one REPLACES it. That used to happen without a word — an
 * evening weigh-in, or a backfill with the date left on today, silently
 * overwrote the morning's (review L5). `existingLogs` is the page's weight
 * log; when the chosen day has a weight, the field says so and the button
 * reads "Replace".
 */
function weightOnDay(logs, ymd) {
  if (!ymd) return null;
  const hit = (Array.isArray(logs) ? logs : []).find((l) => l?.log_date && utcDateString(l.log_date) === ymd);
  return hit && Number.isFinite(Number(hit.weight_value)) ? Number(hit.weight_value) : null;
}

const QuickAddWeight = ({ onAdd, unit = 'lbs', autoOpen = false, onAutoOpened, existingLogs = [] }) => {
  const unitWord = unit === 'lbs' ? 'lb' : unit;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  // The dialog's day. Seeded when the dialog OPENS, not when the page
  // mounted: an installed PWA kept alive overnight used to open this on
  // yesterday, and since there is one weight per day, the morning weigh-in
  // overwrote yesterday's (review B3).
  const [date, setDate] = useState(() => localDateString());
  const [loading, setLoading] = useState(false);
  // This dialog had no error state at all, unlike AddBPDialog. Combined with
  // closing on failure, a failed weight save gave the user nothing to look at.
  const [error, setError] = useState('');
  const fullScreen = useGeekDialogFullScreen();

  const openDialog = () => {
    setDate(localDateString());
    setError('');
    setOpen(true);
  };

  // `/weight?add=1` (the Today strip's "Weigh in") opens the dialog directly.
  useEffect(() => {
    if (!autoOpen) return;
    openDialog();
    onAutoOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once per request; the callback identity is the caller's.
  }, [autoOpen]);

  // `fromCard`: the desktop card has no date field — it always means today,
  // read at the moment of saving.
  const handleSubmit = async ({ fromCard = false } = {}) => {
    if (loading) return;
    const day = fromCard ? localDateString() : date;
    const amount = parseFloat(value);
    if (!day || !Number.isFinite(amount) || amount <= 0 || amount >= 1000) return;

    setLoading(true);
    setError('');
    try {
      // `addWeightLog` RESOLVES with false on failure rather than rejecting,
      // so awaiting it and then closing unconditionally — which is what this
      // did — cleared the form and dismissed the dialog exactly as if the
      // weight had been saved. The only trace was a toast that fired while
      // the dialog was already closing. Same shape as FoodLog's
      // `handleUpdateLog`, which checks the boolean and is the pattern this
      // should have followed.
      const saved = await onAdd({
        value: amount,
        date: day
      });

      if (saved === false) {
        setError(SAVE_FAILED);
        return;
      }

      setValue('');
      setError('');
      setOpen(false);
    } catch (err) {
      // A caller that throws instead of returning false is handled too, so
      // this does not depend on which convention the hook uses. Plain words
      // only — never the raw `err.message`.
      setError(errorMessage(err, SAVE_FAILED));
    } finally {
      setLoading(false);
    }
  };

  const todayYmd = localDateString();
  const replaceNote = (ymd) => {
    const had = weightOnDay(existingLogs, ymd);
    return had === null ? null : `You already have ${had.toFixed(1)} for ${dayWords(ymd, todayYmd)}. Saving replaces it.`;
  };
  const dialogNote = replaceNote(date);
  // The card always means today; it says so once a weight is typed.
  const cardNote = value ? replaceNote(todayYmd) : null;

  // A typo guard, the same one the edit dialog has: "0", "-3" and "21999"
  // used to go to the server and come back as a failed save.
  const parsed = parseFloat(value);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed < 1000;
  const invalidNote = value !== '' && !valid ? 'Enter a weight between 0 and 1,000.' : null;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && valid) {
      handleSubmit();
    }
  };
  const handleCardKeyDown = (e) => {
    if (e.key === 'Enter' && valid) {
      handleSubmit({ fromCard: true });
    }
  };

  const closeDialog = () => { setError(''); setOpen(false); };

  return (
    <>
      {/* The weigh-in, first on the page at every width: one number and Log.
          It used to be a floating button on phones, which sat on top of the
          page's own text; a card in the flow covers nothing. */}
      <Surface
        component="section"
        aria-label="Weigh in"
        data-testid="weight-quick-add"
        sx={{ width: '100%' }}
      >
        {/* The card submits WITHOUT opening the dialog, so it needs its own
            error surface — the dialog's Alert is not mounted on this path,
            and a failure here would otherwise be as silent as the bug this
            fixes. While the dialog is open the error shows there instead. */}
        {error && !open && (
          <Alert severity="error" role="alert" sx={{ mb: 4 }}>
            {error}
          </Alert>
        )}
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
          <TextField
            label="Today’s weight"
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleCardKeyDown}
            sx={{ flex: 1, minWidth: 0 }}
            inputProps={{
              inputMode: 'decimal',
              step: "0.1",
              min: "0",
              max: "1000"
            }}
            InputProps={{
              endAdornment: unitWord
            }}
            error={Boolean(invalidNote) && !open}
            helperText={open ? undefined : (invalidNote || cardNote || undefined)}
            FormHelperTextProps={{ 'data-testid': 'weight-replace-note-card' }}
          />
          <Button
            variant="contained"
            onClick={() => handleSubmit({ fromCard: true })}
            disabled={!valid || loading}
            sx={{ minHeight: 56, minWidth: 96, flexShrink: 0 }}
          >
            {loading && !open ? 'Saving…' : cardNote ? 'Replace' : 'Log'}
          </Button>
        </Box>
        {/* Backfilling a missed day is the rare case: one quiet line. The test
            id is the old floating button's, kept for the scenes and tests
            that open the dialog with it. */}
        <Button
          variant="text"
          onClick={openDialog}
          data-testid="log-weight-fab"
          sx={{ minHeight: 44, px: 0, mt: 1, mb: -2, fontWeight: 600, justifyContent: 'flex-start', '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}
        >
          Log weight for another day
        </Button>
      </Surface>

      {/* Add Dialog */}
      <PremiumDialog
        open={open}
        onClose={closeDialog}
        title="Log weight"
        icon={WeightIcon}
        maxWidth="sm"
        {...thumbSaveProps({
          fullScreen,
          save: (
            <Button
              onClick={() => handleSubmit()}
              variant="contained"
              disabled={!valid || !date || loading}
            >
              {loading ? 'Saving…' : dialogNote ? 'Replace' : 'Save'}
            </Button>
          ),
          cancel: <Button onClick={closeDialog}>Cancel</Button>,
        })}
      >
        {/* 16px between fields: the suite's spacing unit is 4px. */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, pt: 1 }}>
          {error && (
            <Alert severity="error" role="alert">
              {error}
            </Alert>
          )}
          <TextField
            fullWidth
            label="Weight"
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            inputProps={{
              inputMode: 'decimal',
              step: "0.1",
              min: "0",
              max: "1000"
            }}
            InputProps={{
              endAdornment: unitWord
            }}
            error={Boolean(invalidNote)}
            helperText={invalidNote || dialogNote || 'For example, 150.4'}
            FormHelperTextProps={dialogNote && !invalidNote ? { 'data-testid': 'weight-replace-note' } : undefined}
            autoFocus
          />
          <DateField fullWidth value={date} onChange={setDate} max={todayYmd} />
        </Box>
      </PremiumDialog>
    </>
  );
};

export default QuickAddWeight;
