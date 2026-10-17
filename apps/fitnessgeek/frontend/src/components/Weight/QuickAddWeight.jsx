import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
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
import ThumbFab from '../primitives/ThumbFab.jsx';

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
    if (!value || !day) return;

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
        value: parseFloat(value),
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
  // The desktop card always means today; it says so once a weight is typed.
  const cardNote = value ? replaceNote(todayYmd) : null;

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };
  const handleCardKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit({ fromCard: true });
    }
  };

  return (
    <>
      {/* Quick Add Card for desktop */}
      <Card sx={{
        width: '100%',
        display: { xs: 'none', md: 'block' }
      }}>
        <CardContent sx={{ p: 3 }}>
          {/* The card submits WITHOUT opening the dialog, so it needs its own
              error surface — the dialog's Alert is not mounted on this path,
              and a failure here would otherwise be as silent as the bug this
              fixes. */}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <TextField
              label="Weight"
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyPress={handleCardKeyPress}
              size="small"
              sx={{ flexGrow: 1 }}
              inputProps={{
                inputMode: 'decimal',
                step: "0.1",
                min: "0",
                max: "1000"
              }}
              InputProps={{
                endAdornment: unitWord
              }}
              helperText={cardNote || undefined}
              FormHelperTextProps={{ 'data-testid': 'weight-replace-note-card' }}
            />
            <Button
              variant="contained"
              onClick={() => handleSubmit({ fromCard: true })}
              disabled={!value || loading}
            >
              {cardNote ? 'Replace' : 'Log'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Phones: the thumb-zone "Log weight" button opens the dialog. */}
      <ThumbFab label="Log weight" testId="log-weight-fab" onClick={openDialog} />

      {/* Add Dialog */}
      <PremiumDialog
        open={open}
        onClose={() => { setError(''); setOpen(false); }}
        title="Log weight"
        icon={WeightIcon}
        maxWidth="sm"
        {...thumbSaveProps({
          fullScreen,
          save: (
            <Button
              onClick={() => handleSubmit()}
              variant="contained"
              disabled={!value || loading}
            >
              {loading ? 'Saving…' : dialogNote ? 'Replace' : 'Save'}
            </Button>
          ),
          cancel: <Button onClick={() => { setError(''); setOpen(false); }}>Cancel</Button>,
        })}
      >
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            fullWidth
            label="Weight"
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyPress={handleKeyPress}
            sx={{ mb: 2, mt: 1 }}
            inputProps={{
              inputMode: 'decimal',
              step: "0.1",
              min: "0",
              max: "1000"
            }}
            InputProps={{
              endAdornment: unitWord
            }}
            helperText={dialogNote || 'For example, 150.4'}
            FormHelperTextProps={dialogNote ? { 'data-testid': 'weight-replace-note' } : undefined}
            autoFocus
          />
          <DateField fullWidth value={date} onChange={setDate} />
      </PremiumDialog>
    </>
  );
};

export default QuickAddWeight;