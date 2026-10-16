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
import { localDateString } from '@geeksuite/utils';
import PremiumDialog from '../primitives/PremiumDialog.jsx';
import DateField from '../primitives/DateField.jsx';
import { errorMessage } from '../../utils/errorMessage.js';
import { thumbSaveProps } from '../BloodPressure/thumbSave.jsx';
import LogWeightFab from './LogWeightFab.jsx';

const SAVE_FAILED = "That weight didn't save. Check your connection and try again.";

const QuickAddWeight = ({ onAdd, unit = 'lbs', autoOpen = false, onAutoOpened }) => {
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
        display: { xs: 'none', md: 'block' },
        backgroundColor: 'background.paper',
        borderRadius: 2,
        boxShadow: 1,
        border: 'none'
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
              label={`Weight (${unit})`}
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
                endAdornment: unit
              }}
            />
            <Button
              variant="contained"
              onClick={() => handleSubmit({ fromCard: true })}
              disabled={!value || loading}
            >
              Add
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Phones: the thumb-zone "Log weight" button opens the dialog. */}
      <LogWeightFab onClick={openDialog} />

      {/* Add Dialog */}
      <PremiumDialog
        open={open}
        onClose={() => { setError(''); setOpen(false); }}
        eyebrow="Tracking"
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
              {loading ? 'Saving…' : 'Save'}
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
            label={`Weight (${unit})`}
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
              endAdornment: unit
            }}
            helperText="For example, 150.4"
            autoFocus
          />
          <DateField fullWidth value={date} onChange={setDate} />
      </PremiumDialog>
    </>
  );
};

export default QuickAddWeight;