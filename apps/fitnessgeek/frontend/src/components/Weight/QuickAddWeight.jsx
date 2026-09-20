import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Alert
} from '@mui/material';
import {
  Add as AddIcon,
  MonitorWeight as WeightIcon
} from '@mui/icons-material';
import { useGeekPrimaryAction } from '@geeksuite/ui';
import { localDateString } from '@geeksuite/utils';
import PremiumDialog from '../primitives/PremiumDialog.jsx';
import DateField from '../primitives/DateField.jsx';

const QuickAddWeight = ({ onAdd, unit = 'lbs' }) => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [date, setDate] = useState(localDateString());
  const [loading, setLoading] = useState(false);
  // This dialog had no error state at all, unlike AddBPDialog. Combined with
  // closing on failure, a failed weight save gave the user nothing to look at.
  const [error, setError] = useState('');

  // The page's thumb-zone action. `GeekFab` (mounted by the shell) reads the
  // bottom-nav inset and the safe area, so the old hardcoded `bottom: 80` —
  // which also rendered on desktop, beside the Quick Add card — is gone.
  useGeekPrimaryAction({
    label: 'Log weight',
    icon: <AddIcon />,
    onClick: () => setOpen(true)
  });

  const handleSubmit = async () => {
    if (!value || !date) return;

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
        date: date
      });

      if (saved === false) {
        setError('Could not save that weight. Check your connection and try again.');
        return;
      }

      setValue('');
      setDate(localDateString());
      setError('');
      setOpen(false);
    } catch (err) {
      // A caller that throws instead of returning false is handled too, so
      // this does not depend on which convention the hook uses.
      setError(err?.message || 'Could not save that weight. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
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
              onKeyPress={handleKeyPress}
              size="small"
              sx={{ flexGrow: 1 }}
              inputProps={{
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
              onClick={handleSubmit}
              disabled={!value || loading}
            >
              Add
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <PremiumDialog
        open={open}
        onClose={() => { setError(''); setOpen(false); }}
        eyebrow="Tracking"
        title="Log Weight"
        icon={WeightIcon}
        maxWidth="sm"
        primaryAction={
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={!value || loading}
          >
            Save
          </Button>
        }
        secondaryAction={<Button onClick={() => { setError(''); setOpen(false); }}>Cancel</Button>}
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
              step: "0.1",
              min: "0",
              max: "1000"
            }}
            InputProps={{
              endAdornment: unit
            }}
            helperText="Enter weight to one decimal place (e.g., 150.4)"
            autoFocus
          />
          <DateField fullWidth value={date} onChange={setDate} />
      </PremiumDialog>
    </>
  );
};

export default QuickAddWeight;